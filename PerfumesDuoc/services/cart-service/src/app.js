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
const axios = require('axios');
const amqp = require('amqplib');
const requireAuth = require('./auth');

const EXCHANGE = 'perfumesduoc.events';

const app = express();
// Sin CORS aquí: el navegador solo habla con el API Gateway.
app.use(express.json());

// Carrito en memoria por usuario (userId = "sub" del JWT ya validado).
// Estructura: { items: [...], cupon: null | { codigo, estado, descuento, mensaje } }
// estado del cupón: 'pendiente' | 'aplicado' | 'invalido'
const carritos = new Map();
let channel = null; // canal RabbitMQ (null mientras RabbitMQ no esté disponible)

function getUserId(req) {
  return req.user.sub || req.user.oid || req.user.preferred_username || 'anonimo';
}

function getCarrito(userId) {
  return carritos.get(userId) || { items: [], cupon: null };
}

function subtotalDe(carrito) {
  return carrito.items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
}

// ---------------------------------------------------------------------------
// Cupón por cola (RabbitMQ). El carrito NO llama por HTTP a cupones:
// publica "cupon.solicitado" y sigue funcionando. Si coupons-service está
// apagado, el mensaje queda en la cola durable y el cupón queda 'pendiente'
// hasta que el servicio vuelva y responda con "cupon.resultado".
// ---------------------------------------------------------------------------
function solicitarCupon(userId, carrito) {
  if (!carrito.cupon) return;
  carrito.cupon = {
    codigo: carrito.cupon.codigo,
    estado: 'pendiente',
    descuento: 0,
    mensaje: 'Validando cupón… Si el servicio de cupones está apagado, quedará en cola y se aplicará cuando vuelva. Puedes confirmar tu compra sin cupón.',
  };
  try {
    if (!channel) throw new Error('RabbitMQ no disponible');
    channel.publish(
      EXCHANGE,
      'cupon.solicitado',
      Buffer.from(JSON.stringify({ userId, codigo: carrito.cupon.codigo, subtotal: subtotalDe(carrito) })),
      { persistent: true }
    );
  } catch (err) {
    console.warn('[cart-service] No se pudo encolar la solicitud de cupón:', err.message);
  }
}

// Llega la respuesta de coupons-service: se actualiza el carrito del usuario.
function aplicarResultadoCupon({ userId, codigo, subtotal, valido, descuento, motivo }) {
  const carrito = carritos.get(userId);
  // Se ignora si el carrito ya no existe (ej. la compra se confirmó sin cupón),
  // si el cupón cambió, o si el subtotal cambió (llegará una respuesta más nueva).
  if (!carrito || !carrito.cupon || carrito.cupon.codigo !== codigo) return;
  if (subtotal !== subtotalDe(carrito)) return;

  carrito.cupon = valido
    ? { codigo, estado: 'aplicado', descuento, mensaje: 'Cupón aplicado ✅' }
    : { codigo, estado: 'invalido', descuento: 0, mensaje: motivo || 'Cupón no válido' };
}

async function conectarRabbit(intentos = 15, esperaMs = 3000) {
  for (let i = 1; i <= intentos; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      conn.on('close', () => { channel = null; console.warn('[cart-service] Conexión RabbitMQ cerrada'); });
      conn.on('error', () => {});
      const ch = await conn.createChannel();
      await ch.assertExchange(EXCHANGE, 'topic', { durable: true });

      // Se declara también la cola de cupones (idempotente) para que las
      // solicitudes nunca se pierdan aunque coupons-service no haya arrancado.
      const qSolicitudes = await ch.assertQueue('coupons.cupon-solicitado', { durable: true });
      await ch.bindQueue(qSolicitudes.queue, EXCHANGE, 'cupon.solicitado');

      // Cola donde llegan las respuestas de cupones destinadas al carrito.
      const qResultados = await ch.assertQueue('cart.cupon-resultado', { durable: true });
      await ch.bindQueue(qResultados.queue, EXCHANGE, 'cupon.resultado');
      ch.consume(qResultados.queue, (msg) => {
        if (!msg) return;
        try {
          aplicarResultadoCupon(JSON.parse(msg.content.toString()));
        } catch (err) {
          console.error('[cart-service] Error procesando cupon.resultado:', err.message);
        }
        ch.ack(msg);
      });

      channel = ch;
      console.log('[cart-service] Conectado a RabbitMQ (cola cart.cupon-resultado)');
      return;
    } catch (err) {
      console.warn(`[cart-service] RabbitMQ no disponible (intento ${i}/${intentos}): ${err.message}`);
      await new Promise((r) => setTimeout(r, esperaMs));
    }
  }
}

// ---------------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'cart-service' }));

app.get('/carrito', requireAuth, (req, res) => {
  res.json(getCarrito(getUserId(req)));
});

app.post('/carrito/items', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const { productoId, cantidad } = req.body;

  // Valida contra el catálogo real (comunicación síncrona HTTP entre servicios)
  const { data: producto } = await axios.get(`${process.env.PRODUCTS_URL}/productos/${productoId}`, { timeout: 5000 });
  if (producto.stock < cantidad) {
    return res.status(409).json({ error: 'Stock insuficiente' });
  }

  const carrito = getCarrito(userId);
  const existente = carrito.items.find((i) => i.productoId === productoId);
  if (existente) existente.cantidad += cantidad;
  else carrito.items.push({ productoId, cantidad, nombre: producto.nombre, precio: producto.precio });
  carritos.set(userId, carrito);

  solicitarCupon(userId, carrito); // el subtotal cambió: se revalida el cupón (si hay)
  res.status(201).json(carrito);
});

app.delete('/carrito/items/:productoId', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const carrito = getCarrito(userId);
  carrito.items = carrito.items.filter((i) => i.productoId != req.params.productoId);
  carritos.set(userId, carrito);

  solicitarCupon(userId, carrito);
  res.json(carrito);
});

// El cupón pertenece al carrito: se aplica sobre su subtotal, vía cola.
app.post('/carrito/cupon', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const codigo = String(req.body.codigo || '').trim();
  if (!codigo) return res.status(400).json({ error: 'Código de cupón requerido' });

  const carrito = getCarrito(userId);
  if (carrito.items.length === 0) return res.status(409).json({ error: 'El carrito está vacío' });

  carrito.cupon = { codigo };
  carritos.set(userId, carrito);
  solicitarCupon(userId, carrito);
  res.status(202).json(carrito); // 202: aceptado, validación en curso (asíncrona)
});

app.delete('/carrito/cupon', requireAuth, (req, res) => {
  const userId = getUserId(req);
  const carrito = getCarrito(userId);
  carrito.cupon = null;
  carritos.set(userId, carrito);
  res.json(carrito);
});

app.delete('/carrito', requireAuth, (req, res) => {
  carritos.delete(getUserId(req));
  res.status(204).end();
});

const PORT = process.env.PORT || 4002;
// El servidor arranca sin esperar a RabbitMQ: el carrito funciona igual.
app.listen(PORT, () => console.log(`[cart-service] escuchando en :${PORT}`));
conectarRabbit();
