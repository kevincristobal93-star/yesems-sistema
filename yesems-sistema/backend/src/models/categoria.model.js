const pool = require('../config/db');

const obtenerCategorias = async () => {
  const resultado = await pool.query(
    'SELECT * FROM categorias WHERE activo = true ORDER BY nombre ASC'
  );
  return resultado.rows;
};

const obtenerCategoriaPorId = async (id) => {
  const resultado = await pool.query(
    'SELECT * FROM categorias WHERE id_categoria = $1',
    [id]
  );
  return resultado.rows[0];
};

const crearCategoria = async (datos) => {
  const { nombre, descripcion } = datos;
  const resultado = await pool.query(
    `INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING *`,
    [nombre, descripcion]
  );
  return resultado.rows[0];
};

const actualizarCategoria = async (id, datos) => {
  const { nombre, descripcion } = datos;
  const resultado = await pool.query(
    `UPDATE categorias SET nombre = $1, descripcion = $2 WHERE id_categoria = $3 RETURNING *`,
    [nombre, descripcion, id]
  );
  return resultado.rows[0];
};

const eliminarCategoria = async (id) => {
  const resultado = await pool.query(
    'UPDATE categorias SET activo = false WHERE id_categoria = $1 RETURNING *',
    [id]
  );
  return resultado.rows[0];
};

module.exports = {
  obtenerCategorias,
  obtenerCategoriaPorId,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
};