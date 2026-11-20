// Kafka (Evaluación 3): recommendations-service CONSUME "orders-paid".
// Usa su propio consumer group, así lee el mismo flujo de compras que
// cualquier otro servicio sin quitarle mensajes a nadie.
const { Kafka, logLevel } = require('kafkajs');

const TOPIC_ORDENES_PAGADAS = 'orders-paid';

const kafka = new Kafka({
  clientId: 'recommendations-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  logLevel: logLevel.WARN,
  retry: { initialRetryTime: 1000, retries: 20 },
});

async function consumirOrdenesPagadas(handler) {
  const consumer = kafka.consumer({ groupId: 'recommendations-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_ORDENES_PAGADAS, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => handler(JSON.parse(message.value.toString())),
  });
  console.log(`[recommendations-service] Conectado a Kafka (consume ${TOPIC_ORDENES_PAGADAS})`);
}

module.exports = { consumirOrdenesPagadas };
