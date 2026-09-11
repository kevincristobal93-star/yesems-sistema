const pool = require('../config/db');

const obtenerModalidades = async () => {
  const resultado = await pool.query(
    'SELECT * FROM modalidades WHERE activo = true ORDER BY nombre ASC'
  );
  return resultado.rows;
};

const obtenerModalidadPorId = async (id) => {
  const resultado = await pool.query(
    'SELECT * FROM modalidades WHERE id_modalidad = $1',
    [id]
  );
  return resultado.rows[0];
};

const crearModalidad = async (datos) => {
  const { nombre, descripcion } = datos;
  const resultado = await pool.query(
    `INSERT INTO modalidades (nombre, descripcion) VALUES ($1, $2) RETURNING *`,
    [nombre, descripcion]
  );
  return resultado.rows[0];
};

const actualizarModalidad = async (id, datos) => {
  const { nombre, descripcion } = datos;
  const resultado = await pool.query(
    `UPDATE modalidades SET nombre = $1, descripcion = $2 WHERE id_modalidad = $3 RETURNING *`,
    [nombre, descripcion, id]
  );
  return resultado.rows[0];
};

const eliminarModalidad = async (id) => {
  const resultado = await pool.query(
    'UPDATE modalidades SET activo = false WHERE id_modalidad = $1 RETURNING *',
    [id]
  );
  return resultado.rows[0];
};

module.exports = {
  obtenerModalidades,
  obtenerModalidadPorId,
  crearModalidad,
  actualizarModalidad,
  eliminarModalidad,
};