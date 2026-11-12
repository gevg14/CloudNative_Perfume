const amqp = require('amqplib');

const EXCHANGE = 'perfumesduoc.events';
let channel;

// RabbitMQ puede tardar unos segundos más en aceptar conexiones que en
// arrancar el contenedor (el healthcheck de docker-compose ayuda, pero no
// elimina del todo la carrera al iniciar). Reintenta varias veces con
// espera creciente en vez de morir al primer ECONNREFUSED.
async function connectRabbit(retries = 10, delayMs = 3000) {
  for (let intento = 1; intento <= retries; intento++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      console.log('[products-service] Conectado a RabbitMQ');
      return channel;
    } catch (err) {
      console.warn(`[products-service] RabbitMQ no disponible (intento ${intento}/${retries}): ${err.message}`);
      if (intento === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// Se suscribe a "orden.creada" para descontar stock de forma asíncrona.
async function consumeOrdenCreada(onOrdenCreada) {
  const ch = channel || (await connectRabbit());
  const q = await ch.assertQueue('products.orden-creada', { durable: true });
  await ch.bindQueue(q.queue, EXCHANGE, 'orden.creada');
  ch.consume(q.queue, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await onOrdenCreada(payload);
      ch.ack(msg);
    } catch (err) {
      console.error('[products-service] Error procesando orden.creada:', err.message);
      ch.nack(msg, false, false);
    }
  });
  console.log('[products-service] Escuchando cola products.orden-creada (RabbitMQ)');
}

function publish(routingKey, payload) {
  if (!channel) throw new Error('Canal RabbitMQ no inicializado');
  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), { persistent: true });
}

module.exports = { connectRabbit, consumeOrdenCreada, publish, EXCHANGE };
