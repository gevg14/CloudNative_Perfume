// Lambda Authorizer (type: token) para AWS API Gateway.
// Valida la firma y vigencia del JWT emitido por Azure AD / Microsoft Entra ID
// (OAuth 2.0 / OIDC). Si el token es inválido o expiró, deniega el acceso
// (API Gateway traduce el "Deny" en 403; la ausencia de header produce 401).
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => callback(err, key && key.getPublicKey()));
}

function generatePolicy(principalId, effect, resource, context = {}) {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
    },
    context,
  };
}

exports.handler = (event, context, callback) => {
  const token = (event.authorizationToken || '').replace('Bearer ', '');
  if (!token) return callback('Unauthorized'); // -> 401

  jwt.verify(token, getKey, { audience: `api://${process.env.AZURE_CLIENT_ID}` }, (err, decoded) => {
    if (err) {
      console.warn('Token rechazado por el Lambda Authorizer:', err.message);
      return callback(null, generatePolicy('anonymous', 'Deny', event.methodArn)); // -> 403
    }
    callback(null, generatePolicy(decoded.sub || decoded.oid, 'Allow', event.methodArn, {
      email: decoded.preferred_username || '',
    }));
  });
};
