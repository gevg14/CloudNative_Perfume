require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const pool = require('./db');
const requireAuth = require('./auth');
const { consumirOrdenesPagadas } = require('./kafka');

const app = express();
// Sin CORS aquí: el navegador solo habla con el API Gateway.
app.use(express.json());

const usuarioDe = (req) => req.user.sub || req.user.oid;
const limiteDe = (req) => Math.min(Math.max(parseInt(req.query.limite, 10) || 4, 1), 12);

// Catálogo leído de products-service (HTTP síncrono) con caché corta.
let catalogoCache = { productos: [], vence: 0 };
async function obtenerCatalogo() {
  if (Date.now() < catalogoCache.vence) return catalogoCache.productos;
  try {
    const { data } = await axios.get(`${process.env.PRODUCTS_URL}/productos`, { timeout: 5000 });
    catalogoCache = { productos: data, vence: Date.now() + 30000 };
  } catch (err) {
    console.warn('[recommendations-service] Catálogo no disponible, se usa la caché:', err.message);
  }
  return catalogoCache.productos;
}

// Unidades vendidas por producto (popularidad global).
async function obtenerPopularidad() {
  const { rows } = await pool.query(
    'SELECT producto_id, SUM(cantidad)::int AS vendidos FROM rec_compras GROUP BY producto_id'
  );
  return new Map(rows.map((r) => [Number(r.producto_id), r.vendidos]));
}

function masVendidos(catalogo, popularidad, limite, excluir = new Set()) {
  return catalogo
    .filter((p) => p.stock > 0 && !excluir.has(Number(p.id)))
    .sort((a, b) => (popularidad.get(Number(b.id)) || 0) - (popularidad.get(Number(a.id)) || 0) || a.id - b.id)
    .slice(0, limite)
    .map((producto) => ({
      producto,
      motivo: popularidad.get(Number(producto.id)) ? 'Entre los más vendidos' : 'Destacado del catálogo',
    }));
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'recommendations-service' }));

// Público: los más vendidos (para visitantes sin sesión).
app.get('/recomendaciones/populares', async (req, res) => {
  try {
    const [catalogo, popularidad] = await Promise.all([obtenerCatalogo(), obtenerPopularidad()]);
    res.json(masVendidos(catalogo, popularidad, limiteDe(req)));
  } catch (err) {
    console.error('[recommendations-service] Error en populares:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las recomendaciones' });
  }
});

// Protegido: recomendaciones personalizadas. Reglas simples, en orden de peso:
//  1. Misma marca que algo que el cliente ya compró.
//  2. Misma categoría que sus compras (o su categoría preferida del perfil).
//  3. Lo compraron otros clientes que comparten compras con él.
//  4. Popularidad general como desempate.
// No se recomienda lo que ya compró ni lo que no tiene stock.
app.get('/recomendaciones', requireAuth, async (req, res) => {
  try {
    const usuarioId = usuarioDe(req);
    const limite = limiteDe(req);
    const [catalogo, popularidad, propias, relacionadas] = await Promise.all([
      obtenerCatalogo(),
      obtenerPopularidad(),
      pool.query('SELECT producto_id FROM rec_compras WHERE usuario_id = $1', [usuarioId]),
      pool.query(
        `SELECT otros.producto_id, COUNT(DISTINCT otros.usuario_id)::int AS clientes
         FROM rec_compras mias
         JOIN rec_compras iguales ON iguales.producto_id = mias.producto_id AND iguales.usuario_id <> mias.usuario_id
         JOIN rec_compras otros ON otros.usuario_id = iguales.usuario_id
         WHERE mias.usuario_id = $1
         GROUP BY otros.producto_id`,
        [usuarioId]
      ),
    ]);

    const comprados = new Set(propias.rows.map((r) => Number(r.producto_id)));
    const tambienComprado = new Map(relacionadas.rows.map((r) => [Number(r.producto_id), r.clientes]));
    const misProductos = catalogo.filter((p) => comprados.has(Number(p.id)));
    const marcas = new Set(misProductos.map((p) => p.marca));
    const categorias = new Set(misProductos.map((p) => p.categoria));
    const preferida = req.query.categoria;

    const candidatos = catalogo
      .filter((p) => p.stock > 0 && !comprados.has(Number(p.id)))
      .map((producto) => {
        const id = Number(producto.id);
        let puntaje = 0;
        let motivo = null;
        if (categorias.has(producto.categoria)) {
          puntaje += 2;
          motivo = `Porque compraste perfumes de ${producto.categoria}`;
        } else if (preferida && producto.categoria === preferida) {
          puntaje += 2;
          motivo = `Según tu preferencia: ${preferida}`;
        }
        if (tambienComprado.has(id)) {
          puntaje += Math.min(tambienComprado.get(id), 3);
          motivo = 'Otros clientes con compras como las tuyas lo llevaron';
        }
        if (marcas.has(producto.marca)) {
          puntaje += 3;
          motivo = `Porque compraste ${producto.marca}`;
        }
        return { producto, motivo, puntaje, vendidos: popularidad.get(id) || 0 };
      })
      .filter((c) => c.puntaje > 0)
      .sort((a, b) => b.puntaje - a.puntaje || b.vendidos - a.vendidos || a.producto.id - b.producto.id)
      .slice(0, limite)
      .map(({ producto, motivo }) => ({ producto, motivo }));

    // Si no alcanza (cliente nuevo), se completa con los más vendidos.
    const excluir = new Set([...comprados, ...candidatos.map((c) => Number(c.producto.id))]);
    const relleno = masVendidos(catalogo, popularidad, limite - candidatos.length, excluir);
    res.json([...candidatos, ...relleno]);
  } catch (err) {
    console.error('[recommendations-service] Error en recomendaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las recomendaciones' });
  }
});

// Kafka -> "orders-paid": acumula qué compró cada cliente.
async function onOrdenPagada({ ordenId, usuarioId, items }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      'INSERT INTO rec_ordenes_procesadas (orden_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [ordenId]
    );
    if (rowCount) {
      for (const item of items) {
        await client.query(
          `INSERT INTO rec_compras (usuario_id, producto_id, cantidad) VALUES ($1, $2, $3)
           ON CONFLICT (usuario_id, producto_id) DO UPDATE SET cantidad = rec_compras.cantidad + EXCLUDED.cantidad`,
          [usuarioId, item.productoId, item.cantidad]
        );
      }
      console.log(`[recommendations-service] Orden ${ordenId} registrada para recomendaciones`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const PORT = process.env.PORT || 4007;

async function iniciar(intentos = 10) {
  for (let i = 1; i <= intentos; i++) {
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'init.sql'), 'utf8'));
      break;
    } catch (err) {
      console.warn(`[recommendations-service] BD no disponible (intento ${i}/${intentos}): ${err.message}`);
      if (i === intentos) process.exit(1);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  // El servidor arranca aunque Kafka tarde: las recomendaciones ya guardadas siguen disponibles.
  app.listen(PORT, () => console.log(`[recommendations-service] escuchando en :${PORT}`));
  consumirOrdenesPagadas(onOrdenPagada).catch((err) => {
    console.error('[recommendations-service] No se pudo conectar a Kafka:', err.message);
    process.exit(1);
  });
}
iniciar();
