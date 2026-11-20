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
const morgan = require('morgan');
const pool = require('./db');
const { connectRabbit, consumeOrdenCreada } = require('./rabbitmq');
const productsRouter = require('./routes/products.routes');

const app = express();
// Sin CORS aquí: el navegador solo habla con el API Gateway.
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'products-service' }));
app.use('/productos', productsRouter);

const PORT = process.env.PORT || 4001;

async function start() {
  await connectRabbit();

  // Descuento de stock asíncrono: al recibir "orden.creada" resta el stock
  // de cada ítem comprado. Esto satisface el requerimiento de comunicación
  // vía RabbitMQ entre Órdenes y Productos.
  await consumeOrdenCreada(async (orden) => {
    for (const item of orden.items) {
      await pool.query(
        'UPDATE productos SET stock = GREATEST(stock - $1, 0) WHERE id = $2',
        [item.cantidad, item.productoId]
      );
      console.log(`[products-service] Stock descontado: producto ${item.productoId} -${item.cantidad}`);
    }
  });

  app.listen(PORT, () => console.log(`[products-service] escuchando en :${PORT}`));
}

start().catch((err) => {
  console.error('[products-service] Error al iniciar:', err);
  process.exit(1);
});
