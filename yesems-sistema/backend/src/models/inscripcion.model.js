const pool = require('../config/db');

// Trae inscripciones con datos legibles del usuario (alumno) y el curso
const obtenerInscripciones = async () => {
  const resultado = await pool.query(`
    SELECT i.*,
           u.nombre AS usuario_nombre, u.apellido AS usuario_apellido,
           c.nombre AS curso_nombre
    FROM inscripciones i
    JOIN usuarios u ON i.id_usuario = u.id_usuario
    JOIN cursos c ON i.id_curso = c.id_curso
    ORDER BY i.fecha_inscripcion DESC
  `);
  return resultado.rows;
};

const obtenerInscripcionPorId = async (id) => {
  const resultado = await pool.query(
    'SELECT * FROM inscripciones WHERE id_inscripcion = $1',
    [id]
  );
  return resultado.rows[0];
};

const crearInscripcion = async (datos) => {
  const { id_usuario, id_curso, id_horario, monto_total } = datos;
  const resultado = await pool.query(
    `INSERT INTO inscripciones (id_usuario, id_curso, id_horario, monto_total)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id_usuario, id_curso, id_horario ?? null, monto_total ?? 0]
  );
  return resultado.rows[0];
};

const actualizarEstado = async (id, estado) => {
  const resultado = await pool.query(
    `UPDATE inscripciones SET estado = $1 WHERE id_inscripcion = $2 RETURNING *`,
    [estado, id]
  );
  return resultado.rows[0];
};

const actualizarInscripcion = async (id, datos) => {
  const { id_horario, monto_total } = datos;
  const resultado = await pool.query(
    `UPDATE inscripciones SET id_horario = $1, monto_total = $2
     WHERE id_inscripcion = $3 RETURNING *`,
    [id_horario ?? null, monto_total, id]
  );
  return resultado.rows[0];
};

// "Eliminar" = cancelar (baja lógica vía estado, no hay columna activo aquí)
const cancelarInscripcion = async (id) => {
  const resultado = await pool.query(
    `UPDATE inscripciones SET estado = 'cancelada' WHERE id_inscripcion = $1 RETURNING *`,
    [id]
  );
  return resultado.rows[0];
};

module.exports = {
  obtenerInscripciones,
  obtenerInscripcionPorId,
  crearInscripcion,
  actualizarEstado,
  actualizarInscripcion,
  cancelarInscripcion,
};