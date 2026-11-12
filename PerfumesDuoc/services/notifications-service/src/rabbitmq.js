const amqp = require('amqplib');
const EXCHANGE = 'perfumesduoc.events';

async function connectRabbit(retries = 10, delayMs = 3000) {
  for (let intento = 1; intento <= retries; intento++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      console.log('[notifications-service] Conectado a RabbitMQ');
      return conn;
    } catch (err) {
      console.warn(`[notifications-service] RabbitMQ no disponible (intento ${intento}/${retries}): ${err.message}`);
      if (intento === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function consumeOrdenConfirmada(handler) {
  const conn = await connectRabbit();
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  const q = await ch.assertQueue('notifications.orden-confirmada', { durable: true });
  await ch.bindQueue(q.queue, EXCHANGE, 'orden.confirmada');
  ch.consume(q.queue, async (msg) => {
    if (!msg) return;
    try {
      await handler(JSON.parse(msg.content.toString()));
      ch.ack(msg);
    } catch (err) {
      console.error('[notifications-service] Error procesando evento:', err.message);
      ch.nack(msg, false, false);
    }
  });
  console.log('[notifications-service] Escuchando cola notifications.orden-confirmada (RabbitMQ)');
}

module.exports = { consumeOrdenConfirmada };
