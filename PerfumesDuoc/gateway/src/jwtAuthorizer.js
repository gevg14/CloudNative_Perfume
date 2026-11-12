// JWT Authorizer del API Gateway.
// Valida firma y vigencia del token ANTES de reenviar la petición a
// cualquier microservicio backend. Rechaza con 401 (sin token) o
// 403 (token inválido/expirado), tal como pide el enunciado.
//
// mode=azure  -> valida contra las llaves públicas (JWKS) del tenant de
//                Azure AD / Microsoft Entra ID configurado.
// mode=local  -> valida contra un secreto compartido, para poder simular
//                el flujo completo sin depender de un tenant real.
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const mode = process.env.JWT_MODE || 'local';
let client;
if (mode === 'azure') {
  client = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
  });
}

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// Rutas públicas que no requieren token (vitrina del catálogo).
// Ojo: este middleware se monta con app.use('/api', jwtAuthorizer), así que
// Express ya recorta el prefijo "/api" de req.path dentro de aquí. Por eso
// el patrón NO lleva "/api" — si lo lleva, nunca hace match.
const PUBLIC_ROUTES = [{ method: 'GET', pattern: /^\/productos(\/.*)?$/ }];

function isPublic(req) {
  return PUBLIC_ROUTES.some((r) => r.method === req.method && r.pattern.test(req.path));
}

module.exports = function jwtAuthorizer(req, res, next) {
  if (isPublic(req)) return next();

  const header = req.headers['authorization'];
  const token = header && header.startsWith('Bearer ') && header.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No autorizado: falta el token JWT' });
  }

  const onVerified = (err, decoded) => {
    if (err) {
      console.warn('[api-gateway] Token rechazado:', err.message);
      return res.status(403).json({ error: 'Prohibido: token inválido o expirado' });
    }
    req.user = decoded;
    next();
  };

  if (mode === 'azure') {
    jwt.verify(token, getKey, { audience: `api://${process.env.AZURE_CLIENT_ID}` }, onVerified);
  } else {
    jwt.verify(token, process.env.LOCAL_JWT_SECRET || 'perfumesduoc_dev_secret', onVerified);
  }
};
