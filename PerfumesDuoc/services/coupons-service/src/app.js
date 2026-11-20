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
const pool = require('./db');
const requireAuth = require('./auth');
const { connectRabbit, publish, consumeCuponUsado, consumeCuponSolicitado } = require('./rabbitmq');

const app = express();
// Sin CORS aquí: el navegador solo habla con el API Gateway.
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'coupons-service' }));

// Lógica de validación única, usada tanto por el endpoint HTTP como por
// el consumidor de la cola "cupon.solicitado".
async function validarCupon(codigo, subtotal) {
  const { rows } = await pool.query('SELECT * FROM cupones WHERE codigo = $1', [codigo]);
  const cupon = rows[0];

  if (!cupon || !cupon.activo) return { valido: false, motivo: 'Cupón no existe o inactivo' };
  if (cupon.usos_actuales >= cupon.usos_maximos) return { valido: false, motivo: 'Cupón agotado' };
  if (subtotal < Number(cupon.minimo_compra)) return { valido: false, motivo: 'No cumple compra mínima' };

  const descuento = cupon.tipo === 'porcentaje' ? (subtotal * Number(cupon.valor)) / 100 : Number(cupon.valor);
  return { valido: true, descuento: Math.min(descuento, subtotal) };
}

// Validación síncrona (la usa orders-service como verificación final al comprar)
app.post('/cupones/validar', async (req, res) => {
  const { codigo, subtotal } = req.body;
  res.json(await validarCupon(codigo, subtotal));
});

// CRUD administrativo de cupones (protegido)
app.get('/cupones', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM cupones ORDER BY id');
  res.json(rows);
});

app.post('/cupones', requireAuth, async (req, res) => {
  const { codigo, tipo, valor, minimo_compra, usos_maximos } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO cupones (codigo, tipo, valor, minimo_compra, usos_maximos)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [codigo, tipo, valor, minimo_compra || 0, usos_maximos || 1]
  );
  res.status(201).json(rows[0]);
});

const PORT = process.env.PORT || 4005;

connectRabbit()
  .then(() =>
    consumeCuponUsado(async ({ codigo, ordenId }) => {
      await pool.query('UPDATE cupones SET usos_actuales = usos_actuales + 1 WHERE codigo = $1', [codigo]);
      await pool.query('INSERT INTO cupones_uso_log (codigo, orden_id) VALUES ($1, $2)', [codigo, ordenId]);
      console.log(`[coupons-service] Cupón ${codigo} marcado como usado en orden ${ordenId}`);
    })
  )
  .then(() =>
    // Flujo asíncrono: cart-service -> (cupon.solicitado) -> aquí -> (cupon.resultado) -> cart-service
    consumeCuponSolicitado(async ({ userId, codigo, subtotal }) => {
      const resultado = await validarCupon(codigo, subtotal);
      publish('cupon.resultado', { userId, codigo, subtotal, ...resultado });
      console.log(`[coupons-service] Cupón ${codigo} solicitado por ${userId}: ${resultado.valido ? 'válido' : 'inválido'}`);
    })
  )
  .then(() => app.listen(PORT, () => console.log(`[coupons-service] escuchando en :${PORT}`)))
  .catch((err) => { console.error('[coupons-service] Error al iniciar:', err); process.exit(1); });
