const express = require('express');
const pool = require('../db');
const requireAuth = require('../auth');

const router = express.Router();

// Público: catálogo visible sin login (vitrina de la tienda)
router.get('/', async (req, res) => {
  const { categoria } = req.query;
  const params = [];
  let sql = 'SELECT * FROM productos';
  if (categoria) {
    params.push(categoria);
    sql += ' WHERE categoria = $1';
  }
  sql += ' ORDER BY id';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(rows[0]);
});

// Protegido: administración de catálogo (rol admin, viene en el JWT de Azure AD)
router.post('/', requireAuth, async (req, res) => {
  const { nombre, marca, descripcion, categoria, precio, stock, imagen_url, ml } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO productos (nombre, marca, descripcion, categoria, precio, stock, imagen_url, ml)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [nombre, marca, descripcion, categoria, precio, stock, imagen_url, ml]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { nombre, marca, descripcion, categoria, precio, stock, imagen_url, ml } = req.body;
  const { rows } = await pool.query(
    `UPDATE productos SET nombre=$1, marca=$2, descripcion=$3, categoria=$4, precio=$5,
     stock=$6, imagen_url=$7, ml=$8 WHERE id=$9 RETURNING *`,
    [nombre, marca, descripcion, categoria, precio, stock, imagen_url, ml, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(rows[0]);
});

router.delete('/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
