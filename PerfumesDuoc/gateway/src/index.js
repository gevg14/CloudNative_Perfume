// Docker Desktop (Windows/WSL2) con frecuencia no tiene salida IPv6 real
// hacia internet, aunque el contenedor "cree" que sí, y Node puede intentar
// conectar a login.microsoftonline.com por IPv6 y fallar con ENETUNREACH al
// validar el JWT contra Azure AD. Forzamos IPv4 SOLO para ese dominio —
// nunca para los nombres internos de Docker (products-service, rabbitmq,
// postgres, etc.), para no romper la resolución de la red interna.
const dns = require('dns');
const dnsLookupOriginal = dns.lookup;
const DOMINIOS_SOLO_IPV4 = ['login.microsoftonline.com'];
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (DOMINIOS_SOLO_IPV4.includes(hostname)) {
    return dnsLookupOriginal(hostname, { ...options, family: 4 }, callback);
  }
  return dnsLookupOriginal(hostname, options, callback);
};

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwtAuthorizer = require('./jwtAuthorizer');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

// IMPORTANTE: express.json() NUNCA debe aplicarse de forma global (app.use)
// en un gateway que reenvía peticiones con http-proxy-middleware. Si se
// aplica antes de las rutas proxeadas, Express consume el body de CADA
// petición (incluidas las que van a /api/*), dejando el stream vacío justo
// cuando el proxy intenta reenviarlo —pero el header Content-Length original
// sigue indicando el tamaño real, así que el microservicio destino se queda
// esperando para siempre bytes que nunca llegan (petición "pendiente"
// indefinidamente). Por eso express.json() se aplica SOLO a esta ruta de
// desarrollo puntual, nunca de forma global.
app.post('/dev/login-local', express.json(), (req, res) => {
  if ((process.env.JWT_MODE || 'local') !== 'local') {
    return res.status(404).json({ error: 'No disponible en modo azure' });
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email es requerido' });
  const token = jwt.sign(
    { sub: email, preferred_username: email, name: email.split('@')[0], roles: ['cliente'] },
    process.env.LOCAL_JWT_SECRET || 'perfumesduoc_dev_secret',
    { expiresIn: '2h' }
  );
  res.json({ token });
});

// Punto de entrada único: todo pasa por /api/* y aquí se valida el JWT
// (JWT Authorizer) antes de enrutar hacia el microservicio correspondiente.
app.use('/api', jwtAuthorizer);

const routes = [
  { path: '/api/productos', target: process.env.PRODUCTS_URL, rewrite: '/productos' },
  { path: '/api/carrito', target: process.env.CART_URL, rewrite: '/carrito' },
  { path: '/api/ordenes', target: process.env.ORDERS_URL, rewrite: '/ordenes' },
  { path: '/api/notificaciones', target: process.env.NOTIFICATIONS_URL, rewrite: '/notificaciones' },
  { path: '/api/cupones', target: process.env.COUPONS_URL, rewrite: '/cupones' },
];

routes.forEach(({ path, target, rewrite }) => {
  app.use(
    path,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      proxyTimeout: 5000,
      timeout: 5000,
      pathRewrite: { [`^${path}`]: rewrite },
      onError: (err, req, res) => {
        console.error(`[api-gateway] Error al enrutar ${path}:`, err.message);
        res.status(502).json({ error: 'Servicio backend no disponible' });
      },
    })
  );
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[api-gateway] Single Entrypoint escuchando en :${PORT}`));
