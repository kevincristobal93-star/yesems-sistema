const pool = require('../config/db');

const obtenerCursos = async () => {
  const resultado = await pool.query(`
    SELECT c.*, cat.nombre AS categoria
    FROM cursos c
    JOIN categorias cat ON c.id_categoria = cat.id_categoria
    WHERE c.activo = true
    ORDER BY c.id_curso DESC
  `);
  return resultado.rows;
};

const obtenerCursoPorId = async (id) => {
  const resultado = await pool.query(
    'SELECT * FROM cursos WHERE id_curso = $1',
    [id]
  );
  return resultado.rows[0];
};

const crearCurso = async (datos) => {
  const { id_categoria, nombre, descripcion, duracion_horas, precio, cupo } = datos;
  const resultado = await pool.query(
    `INSERT INTO cursos (id_categoria, nombre, descripcion, duracion_horas, precio, cupo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id_categoria, nombre, descripcion, duracion_horas, precio, cupo]
  );
  return resultado.rows[0];
};

const actualizarCurso = async (id, datos) => {
  const { id_categoria, nombre, descripcion, duracion_horas, precio, cupo } = datos;
  const resultado = await pool.query(
    `UPDATE cursos SET id_categoria = $1, nombre = $2, descripcion = $3,
     duracion_horas = $4, precio = $5, cupo = $6
     WHERE id_curso = $7 RETURNING *`,
    [id_categoria, nombre, descripcion, duracion_horas, precio, cupo, id]
  );
  return resultado.rows[0];
};

const eliminarCurso = async (id) => {
  const resultado = await pool.query(
    'UPDATE cursos SET activo = false WHERE id_curso = $1 RETURNING *',
    [id]
  );
  return resultado.rows[0];
};

module.exports = {
  obtenerCursos,
  obtenerCursoPorId,
  crearCurso,
  actualizarCurso,
  eliminarCurso,
};