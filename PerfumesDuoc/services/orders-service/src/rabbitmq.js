const amqp = require('amqplib');
const EXCHANGE = 'perfumesduoc.events';
let channel;

async function connectRabbit(retries = 10, delayMs = 3000) {
  for (let intento = 1; intento <= retries; intento++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      console.log('[orders-service] Conectado a RabbitMQ');
      return channel;
    } catch (err) {
      console.warn(`[orders-service] RabbitMQ no disponible (intento ${intento}/${retries}): ${err.message}`);
      if (intento === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function publish(routingKey, payload) {
  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), { persistent: true });
}

module.exports = { connectRabbit, publish };
