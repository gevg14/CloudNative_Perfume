// Kafka (Evaluación 3). orders-service:
//  - CONSUME "payment-results": resultado de cada pago emitido por mspago.
//  - PRODUCE "orders-paid": flujo de compras que alimenta a
//    recommendations-service (y a cualquier consumidor futuro).
const { Kafka, logLevel } = require('kafkajs');

const TOPIC_PAGOS_RESULTADOS = 'payment-results';
const TOPIC_ORDENES_PAGADAS = 'orders-paid';

const kafka = new Kafka({
  clientId: 'orders-service',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  logLevel: logLevel.WARN,
  retry: { initialRetryTime: 1000, retries: 20 },
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'orders-pagos-group' });

async function connectKafka(onPagoResultado) {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_PAGOS_RESULTADOS, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => {
      // Si el handler lanza un error, kafkajs no confirma el offset y
      // reintenta el mismo mensaje: el resultado de un pago nunca se pierde.
      await onPagoResultado(JSON.parse(message.value.toString()));
    },
  });
  console.log(`[orders-service] Conectado a Kafka (consume ${TOPIC_PAGOS_RESULTADOS})`);
}

function publicarOrdenPagada(evento) {
  return producer.send({
    topic: TOPIC_ORDENES_PAGADAS,
    messages: [{ key: String(evento.usuarioId), value: JSON.stringify(evento) }],
  });
}

module.exports = { connectKafka, publicarOrdenPagada };
