const nodemailer = require('nodemailer');

const isSimulated = (process.env.EMAIL_SIMULATION || 'true') === 'true';

let transporter;
if (!isSimulated) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function enviarCorreo({ to, subject, text }) {
  if (isSimulated || !to) {
    // Modo simulado: no requiere credenciales SMTP reales. Deja evidencia
    // clara en consola/log para la sustentación (screenshot del log sirve
    // como evidencia si no se cuenta con un SMTP real).
    console.log('----------------------------------------------------');
    console.log('[notifications-service] EMAIL SIMULADO');
    console.log('Para:', to || '(sin correo en el token, revisar Azure AD claims)');
    console.log('Asunto:', subject);
    console.log('Cuerpo:', text);
    console.log('----------------------------------------------------');
    return { simulated: true, to, subject };
  }

  const info = await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  return { simulated: false, messageId: info.messageId };
}

module.exports = { enviarCorreo };
