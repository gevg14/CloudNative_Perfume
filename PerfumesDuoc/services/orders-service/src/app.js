// Docker Desktop (Windows/WSL2) con frecuencia no tiene salida IPv6 real
// hacia internet, aunque el contenedor "cree" que sí, y Node puede intentar
// conectar a login.microsoftonline.com por IPv6 y fallar con ENETUNREACH al
// validar el JWT contra Azure AD. Forzamos IPv4 SOLO para ese dominio —
// nunca para los nombres internos de Docker (products-service, rabbitmq,
// postgres, etc.), para no romper la resolución de la red interna.
const dns = require('dns');
const dnsLookupOriginal = dns.lookup;
const DOMINIOS_SOLO_IPV4 = ['login.microsoftonline.com'];
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (DOMINIOS_SOLO_IPV4.includes(hostname)) {
    return dnsLookupOriginal(hostname, { ...options, family: 4 }, callback);
  }
  return dnsLookupOriginal(hostname, options, callback);
};

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const pool = require('./db');
const requireAuth = require('./auth');
const { connectRabbit, publish } = require('./rabbitmq');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'orders-service' }));

// Crea una orden de compra formal a partir del carrito del cliente.
app.post('/ordenes', requireAuth, async (req, res) => {
  const { items, cuponCodigo } = req.body;
  const usuarioId = req.user.sub || req.user.oid || 'anonimo';
  const usuarioEmail = req.user.preferred_username || req.user.email || null;

  if (!items || !items.length) return res.status(400).json({ error: 'La orden no tiene items' });

  const subtotal = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  let descuento = 0;
  let cuponValido = null;
  // Estado del cupón que se informa al cliente:
  //  sin_cupon | aplicado | invalido | servicio_no_disponible
  let cuponEstado = 'sin_cupon';
  let cuponMensaje = null;

  // El cupón es OPCIONAL: la compra NUNCA debe depender de que el
  // microservicio de Cupones esté disponible (tolerancia a fallos).
  // Si está caído, tarda demasiado o responde mal, la orden se confirma
  // igual, sin descuento. El timeout evita que la compra quede colgada.
  if (cuponCodigo) {
    try {
      const { data } = await axios.post(
        `${process.env.COUPONS_URL}/cupones/validar`,
        { codigo: cuponCodigo, subtotal },
        { timeout: 3000 }
      );
      if (data.valido) {
        descuento = data.descuento;
        cuponValido = cuponCodigo;
        cuponEstado = 'aplicado';
      } else {
        cuponEstado = 'invalido';
        cuponMensaje = data.motivo || 'El cupón no es válido';
      }
    } catch (err) {
      cuponEstado = 'servicio_no_disponible';
      cuponMensaje =
        'El servicio de cupones no está disponible. Tu compra se confirmó sin descuento.';
      console.warn('[orders-service] Cupones no disponible, se continúa sin cupón:', err.code || err.message);
    }
  }

  const total = Math.max(subtotal - descuento, 0);

  const { rows } = await pool.query(
    `INSERT INTO ordenes (usuario_id, usuario_email, items, subtotal, descuento, total, cupon_codigo)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [usuarioId, usuarioEmail, JSON.stringify(items), subtotal, descuento, total, cuponValido]
  );
  const orden = rows[0];

  // Evento 1: descuento de stock asíncrono en Products (RabbitMQ)
  publish('orden.creada', {
    ordenId: orden.id,
    items: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
  });

  // Evento 2: notificación por correo asíncrona (RabbitMQ)
  publish('orden.confirmada', {
    ordenId: orden.id,
    email: usuarioEmail,
    total,
    items,
  });

  // Evento 3: si se usó cupón, se notifica al servicio de Cupones para
  // que registre el uso (auditoría / control de canje único).
  if (cuponValido) publish('cupon.usado', { codigo: cuponValido, ordenId: orden.id });

  res.status(201).json({ ...orden, cupon_estado: cuponEstado, cupon_mensaje: cuponMensaje });
});

app.get('/ordenes', requireAuth, async (req, res) => {
  const usuarioId = req.user.sub || req.user.oid || 'anonimo';
  const { rows } = await pool.query(
    'SELECT * FROM ordenes WHERE usuario_id = $1 ORDER BY created_at DESC',
    [usuarioId]
  );
  res.json(rows);
});

app.get('/ordenes/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ordenes WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(rows[0]);
});

const PORT = process.env.PORT || 4003;
connectRabbit()
  .then(() => app.listen(PORT, () => console.log(`[orders-service] escuchando en :${PORT}`)))
  .catch((err) => { console.error('[orders-service] Error al iniciar:', err); process.exit(1); });
