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
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const pool = require('./db');
const requireAuth = require('./auth');
const { connectRabbit, publish } = require('./rabbitmq');
const { connectKafka, publicarOrdenPagada } = require('./kafka');

const app = express();
// Sin CORS aquí: el navegador solo habla con el API Gateway, que es quien
// responde las cabeceras CORS. Este servicio no se expone al frontend.
app.use(express.json());

const usuarioDe = (req) => req.user.sub || req.user.oid || 'anonimo';

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'orders-service' }));

// Crea una orden de compra a partir del carrito. Queda "pendiente_pago"
// hasta que mspago informe (por Kafka) que el pago fue aprobado.
app.post('/ordenes', requireAuth, async (req, res) => {
  try {
    const { items, cuponCodigo } = req.body;
    const usuarioId = usuarioDe(req);
    const usuarioEmail = req.user.preferred_username || req.user.email || null;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'La orden no tiene items' });
    }

    // Seguridad: el precio NUNCA se toma de lo que envía el navegador.
    // Se vuelve a leer del catálogo para que nadie pueda alterar el monto.
    const itemsOrden = [];
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1) {
        return res.status(400).json({ error: 'Cantidad inválida' });
      }
      let producto;
      try {
        ({ data: producto } = await axios.get(
          `${process.env.PRODUCTS_URL}/productos/${encodeURIComponent(item.productoId)}`,
          { timeout: 5000 }
        ));
      } catch (err) {
        if (err.response?.status === 404) {
          return res.status(400).json({ error: `Producto ${item.productoId} no existe` });
        }
        return res.status(503).json({ error: 'Catálogo no disponible, intenta nuevamente' });
      }
      if (producto.stock < cantidad) {
        return res.status(409).json({ error: `Stock insuficiente para ${producto.nombre}` });
      }
      itemsOrden.push({
        productoId: producto.id,
        nombre: producto.nombre,
        marca: producto.marca,
        categoria: producto.categoria,
        precio: Number(producto.precio),
        cantidad,
      });
    }

    const subtotal = itemsOrden.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    let descuento = 0;
    let cuponValido = null;
    // Estado del cupón que se informa al cliente:
    //  sin_cupon | aplicado | invalido | servicio_no_disponible
    let cuponEstado = 'sin_cupon';
    let cuponMensaje = null;

    // El cupón es OPCIONAL: la compra NUNCA debe depender de que el
    // microservicio de Cupones esté disponible (tolerancia a fallos).
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
        cuponMensaje = 'El servicio de cupones no está disponible. Tu orden se creó sin descuento.';
        console.warn('[orders-service] Cupones no disponible, se continúa sin cupón:', err.code || err.message);
      }
    }

    const total = Math.max(subtotal - descuento, 0);

    const { rows } = await pool.query(
      `INSERT INTO ordenes (usuario_id, usuario_email, items, subtotal, descuento, total, cupon_codigo, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente_pago') RETURNING *`,
      [usuarioId, usuarioEmail, JSON.stringify(itemsOrden), subtotal, descuento, total, cuponValido]
    );

    res.status(201).json({ ...rows[0], cupon_estado: cuponEstado, cupon_mensaje: cuponMensaje });
  } catch (err) {
    console.error('[orders-service] Error al crear la orden:', err.message);
    res.status(500).json({ error: 'No se pudo crear la orden' });
  }
});

app.get('/ordenes', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM ordenes WHERE usuario_id = $1 ORDER BY created_at DESC',
    [usuarioDe(req)]
  );
  res.json(rows);
});

// Solo el dueño puede ver su orden (mspago la consulta con el token del cliente).
app.get('/ordenes/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Orden no encontrada' });
  const { rows } = await pool.query(
    'SELECT * FROM ordenes WHERE id = $1 AND usuario_id = $2',
    [req.params.id, usuarioDe(req)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(rows[0]);
});

// Kafka -> "payment-results". Solo un pago APROBADO cambia la orden. El
// UPDATE condicionado a estado = 'pendiente_pago' hace el proceso idempotente:
// si Kafka reentrega el mensaje, la orden no se paga ni descuenta stock dos veces.
async function onPagoResultado(resultado) {
  if (resultado.estado !== 'APROBADO') return;

  const { rows } = await pool.query(
    `UPDATE ordenes SET estado = 'pagada', pago_id = $1, pagada_en = NOW()
     WHERE id = $2 AND estado = 'pendiente_pago' RETURNING *`,
    [String(resultado.pagoId), resultado.ordenId]
  );
  const orden = rows[0];
  if (!orden) return;

  // Colas RabbitMQ (se mantienen de la Evaluación 2): son tareas puntuales
  // que deben ejecutarse una sola vez por un único consumidor.
  publish('orden.creada', {
    ordenId: orden.id,
    items: orden.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
  });
  publish('orden.confirmada', {
    ordenId: orden.id,
    email: orden.usuario_email,
    total: Number(orden.total),
    items: orden.items,
  });
  if (orden.cupon_codigo) publish('cupon.usado', { codigo: orden.cupon_codigo, ordenId: orden.id });

  // Kafka: flujo de compras para recomendaciones.
  await publicarOrdenPagada({
    ordenId: orden.id,
    usuarioId: orden.usuario_id,
    total: Number(orden.total),
    items: orden.items.map(({ productoId, cantidad, categoria, marca }) => ({ productoId, cantidad, categoria, marca })),
    pagadaEn: orden.pagada_en,
  });
  console.log(`[orders-service] Orden ${orden.id} pagada (pago ${resultado.pagoId})`);
}

const PORT = process.env.PORT || 4003;
pool
  .query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'init.sql'), 'utf8'))
  .then(() => connectRabbit())
  .then(() => connectKafka(onPagoResultado))
  .then(() => app.listen(PORT, () => console.log(`[orders-service] escuchando en :${PORT}`)))
  .catch((err) => { console.error('[orders-service] Error al iniciar:', err); process.exit(1); });
