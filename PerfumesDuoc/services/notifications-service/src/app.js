require('dotenv').config();
const express = require('express');
const { enviarCorreo } = require('./mailer');
const { consumeOrdenConfirmada } = require('./rabbitmq');
const { consumirAlertasFraude } = require('./kafka');

const app = express();
// Sin CORS aquí: el navegador solo habla con el API Gateway.
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notifications-service' }));

// Endpoint solicitado en el enunciado: permite disparar una notificación
// de correo directamente desde Postman, sin pasar por RabbitMQ, para
// evidenciar el funcionamiento del servicio de forma aislada.
app.post('/notificaciones/correo', async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !subject) return res.status(400).json({ error: 'to y subject son requeridos' });
  const resultado = await enviarCorreo({ to, subject, text: text || '(sin cuerpo)' });
  res.status(202).json({ mensaje: 'Notificación procesada', resultado });
});

const PORT = process.env.PORT || 4004;

consumeOrdenConfirmada(async (evento) => {
  await enviarCorreo({
    to: evento.email,
    subject: `PerfumesDuoc - Confirmación de tu orden #${evento.ordenId}`,
    text: `¡Gracias por tu compra! Total: $${evento.total}. Te avisaremos cuando sea despachada.`,
  });
})
  .then(() => consumirAlertasFraude(async (alerta) => {
    await enviarCorreo({
      to: process.env.ALERTAS_EMAIL || 'seguridad@perfumesduoc.cl',
      subject: `PerfumesDuoc - ALERTA DE FRAUDE: cliente ${alerta.idCliente} bloqueado`,
      text: `Motivo: ${alerta.motivo}. Bloqueado hasta: ${alerta.bloqueadoHasta}.`,
    });
  }))
  .then(() => app.listen(PORT, () => console.log(`[notifications-service] escuchando en :${PORT}`)))
  .catch((err) => { console.error('[notifications-service] Error al iniciar:', err); process.exit(1); });
