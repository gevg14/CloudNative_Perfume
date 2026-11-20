require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const pool = require('./db');
const jwt = require('jsonwebtoken');
const requireAuth = require('./auth');

const app = express();
// Sin CORS aquí: el navegador solo habla con el API Gateway.
app.use(express.json());

const CATEGORIAS = ['hombre', 'mujer', 'unisex'];
const CAMPOS = ['nombre', 'telefono', 'direccion', 'comuna', 'ciudad', 'categoria_preferida'];

const usuarioDe = (req) => req.user.sub || req.user.oid;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'profile-service' }));

// SOLO desarrollo (JWT_MODE=local): simula el login corporativo firmando un
// JWT con la misma forma que el de Azure AD, para probar sin un tenant real.
// En modo azure este endpoint no existe (404).
app.post('/dev/login-local', (req, res) => {
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

// Devuelve el perfil del usuario autenticado. La primera vez lo crea con
// los datos que vienen en el token (nombre y correo de Azure AD).
app.get('/perfil', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO perfiles (usuario_id, email, nombre) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, perfiles.email)
       RETURNING *`,
      [usuarioDe(req), req.user.preferred_username || req.user.email || null, req.user.name || null]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[profile-service] Error al leer el perfil:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el perfil' });
  }
});

// Actualiza solo el perfil propio: el usuario_id sale del token, nunca del body.
app.put('/perfil', requireAuth, async (req, res) => {
  const datos = {};
  for (const campo of CAMPOS) {
    const valor = req.body[campo];
    if (valor === undefined) continue;
    if (valor !== null && typeof valor !== 'string') {
      return res.status(400).json({ error: `${campo} debe ser texto` });
    }
    datos[campo] = valor === null || valor.trim() === '' ? null : valor.trim().slice(0, 200);
  }
  if (datos.categoria_preferida && !CATEGORIAS.includes(datos.categoria_preferida)) {
    return res.status(400).json({ error: 'categoria_preferida debe ser hombre, mujer o unisex' });
  }
  if (datos.telefono && !/^\+?[0-9 ]{8,15}$/.test(datos.telefono)) {
    return res.status(400).json({ error: 'Teléfono inválido' });
  }

  try {
    const usuarioId = usuarioDe(req);
    await pool.query(
      `INSERT INTO perfiles (usuario_id, email, nombre) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id) DO NOTHING`,
      [usuarioId, req.user.preferred_username || req.user.email || null, req.user.name || null]
    );
    const columnas = Object.keys(datos);
    const sets = columnas.map((c, i) => `${c} = $${i + 2}`).concat('updated_at = NOW()');
    const { rows } = await pool.query(
      `UPDATE perfiles SET ${sets.join(', ')} WHERE usuario_id = $1 RETURNING *`,
      [usuarioId, ...columnas.map((c) => datos[c])]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[profile-service] Error al actualizar el perfil:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el perfil' });
  }
});

const PORT = process.env.PORT || 4006;

async function iniciar(intentos = 10) {
  for (let i = 1; i <= intentos; i++) {
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'init.sql'), 'utf8'));
      return app.listen(PORT, () => console.log(`[profile-service] escuchando en :${PORT}`));
    } catch (err) {
      console.warn(`[profile-service] BD no disponible (intento ${i}/${intentos}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  process.exit(1);
}
iniciar();
