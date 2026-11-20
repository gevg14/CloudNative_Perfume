const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const mode = process.env.JWT_MODE || 'local';
let client;
if (mode === 'azure') {
  client = jwksClient({ jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys` });
}
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => callback(err, key && key.getPublicKey()));
}
module.exports = function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });
  if (mode === 'azure') {
    jwt.verify(token, getKey, { audience: `api://${process.env.AZURE_CLIENT_ID}` }, (err, decoded) => {
      if (err) return res.status(403).json({ error: 'Token inválido' });
      req.user = decoded; next();
    });
  } else {
    jwt.verify(token, process.env.LOCAL_JWT_SECRET || 'perfumesduoc_dev_secret', (err, decoded) => {
      if (err) return res.status(403).json({ error: 'Token inválido' });
      req.user = decoded; next();
    });
  }
};
