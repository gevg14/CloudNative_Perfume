const amqp = require('amqplib');
const EXCHANGE = 'perfumesduoc.events';
let channel;

async function connectRabbit(retries = 10, delayMs = 3000) {
  for (let intento = 1; intento <= retries; intento++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      console.log('[coupons-service] Conectado a RabbitMQ');
      return channel;
    } catch (err) {
      console.warn(`[coupons-service] RabbitMQ no disponible (intento ${intento}/${retries}): ${err.message}`);
      if (intento === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function publish(routingKey, payload) {
  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), { persistent: true });
}

// Se suscribe a "cupon.usado" (publicado por orders-service) para
// registrar el consumo del cupón de forma asíncrona vía RabbitMQ,
// cumpliendo el requisito de integrar colas para una funcionalidad
// de valor propia (auditoría de uso de cupones).
async function consumeCuponUsado(handler) {
  const ch = channel || (await connectRabbit());
  const q = await ch.assertQueue('coupons.cupon-usado', { durable: true });
  await ch.bindQueue(q.queue, EXCHANGE, 'cupon.usado');
  ch.consume(q.queue, async (msg) => {
    if (!msg) return;
    try {
      await handler(JSON.parse(msg.content.toString()));
      ch.ack(msg);
    } catch (err) {
      console.error('[coupons-service] Error procesando cupon.usado:', err.message);
      ch.nack(msg, false, false);
    }
  });
  console.log('[coupons-service] Escuchando cola coupons.cupon-usado (RabbitMQ)');
}

// El carrito publica "cupon.solicitado" cuando el cliente aplica un cupón.
// La cola es durable: si este microservicio está apagado, los mensajes
// quedan guardados en RabbitMQ y se procesan apenas vuelva a levantarse.
async function consumeCuponSolicitado(handler) {
  const ch = channel || (await connectRabbit());
  const q = await ch.assertQueue('coupons.cupon-solicitado', { durable: true });
  await ch.bindQueue(q.queue, EXCHANGE, 'cupon.solicitado');
  ch.consume(q.queue, async (msg) => {
    if (!msg) return;
    try {
      await handler(JSON.parse(msg.content.toString()));
      ch.ack(msg);
    } catch (err) {
      console.error('[coupons-service] Error procesando cupon.solicitado:', err.message);
      // Reencola una vez por si fue un fallo transitorio (ej. BD reiniciándose)
      ch.nack(msg, false, !msg.fields.redelivered);
    }
  });
  console.log('[coupons-service] Escuchando cola coupons.cupon-solicitado (RabbitMQ)');
}

module.exports = { connectRabbit, publish, consumeCuponUsado, consumeCuponSolicitado };
