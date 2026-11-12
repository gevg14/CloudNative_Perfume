// Utilidad de desarrollo: genera un JWT firmado localmente (HS256) para
// simular el token que en producción emitiría Azure AD. Solo para
// JWT_MODE=local. Uso: node tools/generar-token-local.js correo@duoc.cl admin
const jwt = require('jsonwebtoken');
const [, , email = 'cliente@duoc.cl', rol = 'cliente'] = process.argv;

const token = jwt.sign(
  { sub: email, preferred_username: email, roles: [rol], name: email.split('@')[0] },
  process.env.LOCAL_JWT_SECRET || 'perfumesduoc_dev_secret',
  { expiresIn: '2h' }
);

console.log(token);
