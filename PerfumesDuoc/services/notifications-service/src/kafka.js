// Kafka (Evaluación 3): notifications-service CONSUME "fraud-alerts", las
// alertas que publica mspago cuando bloquea a un cliente por intentos de
// pago repetidos. Usa su propio consumer group.
const { Kafka, logLevel } = require('kafkajs');

const TOPIC_ALERTAS_FRAUDE = 'fraud-alerts';

const kafka = new Kafka({
  clientId: 'notifications-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  logLevel: logLevel.WARN,
  retry: { initialRetryTime: 1000, retries: 20 },
});

async function consumirAlertasFraude(handler) {
  const consumer = kafka.consumer({ groupId: 'notifications-fraude-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_ALERTAS_FRAUDE, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => handler(JSON.parse(message.value.toString())),
  });
  console.log(`[notifications-service] Conectado a Kafka (consume ${TOPIC_ALERTAS_FRAUDE})`);
}

module.exports = { consumirAlertasFraude };
