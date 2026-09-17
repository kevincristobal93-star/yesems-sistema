const pool = require('../config/db');

const obtenerHorarios = async () => {
  const resultado = await pool.query(`
    SELECT h.*, c.nombre AS curso_nombre
    FROM horarios h
    JOIN cursos c ON h.id_curso = c.id_curso
    ORDER BY h.id_curso, h.dia_semana, h.hora_inicio
  `);
  return resultado.rows;
};

const obtenerHorariosPorCurso = async (idCurso) => {
  const resultado = await pool.query(
    'SELECT * FROM horarios WHERE id_curso = $1 ORDER BY dia_semana, hora_inicio',
    [idCurso]
  );
  return resultado.rows;
};

const obtenerHorarioPorId = async (id) => {
  const resultado = await pool.query(
    'SELECT * FROM horarios WHERE id_horario = $1',
    [id]
  );
  return resultado.rows[0];
};

const crearHorario = async (datos) => {
  const { id_curso, modalidad, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, enlace, notas, informacion_adicional } = datos;
  const resultado = await pool.query(
    `INSERT INTO horarios (id_curso, modalidad, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, enlace, notas, informacion_adicional)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [id_curso, modalidad, dia_semana ?? null, hora_inicio ?? null, hora_fin ?? null, fecha_inicio ?? null, fecha_fin ?? null, enlace ?? null, notas ?? null, informacion_adicional ?? null]
  );
  return resultado.rows[0];
};

const actualizarHorario = async (id, datos) => {
  const { id_curso, modalidad, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, enlace, notas, informacion_adicional } = datos;
  const resultado = await pool.query(
    `UPDATE horarios SET id_curso = $1, modalidad = $2, dia_semana = $3, hora_inicio = $4,
     hora_fin = $5, fecha_inicio = $6, fecha_fin = $7, enlace = $8, notas = $9, informacion_adicional = $10
     WHERE id_horario = $11 RETURNING *`,
    [id_curso, modalidad, dia_semana ?? null, hora_inicio ?? null, hora_fin ?? null, fecha_inicio ?? null, fecha_fin ?? null, enlace ?? null, notas ?? null, informacion_adicional ?? null, id]
  );
  return resultado.rows[0];
};

// Esta tabla no tiene columna activo, así que aquí sí se borra físicamente
const eliminarHorario = async (id) => {
  const resultado = await pool.query(
    'DELETE FROM horarios WHERE id_horario = $1 RETURNING *',
    [id]
  );
  return resultado.rows[0];
};

module.exports = {
  obtenerHorarios,
  obtenerHorariosPorCurso,
  obtenerHorarioPorId,
  crearHorario,
  actualizarHorario,
  eliminarHorario,
};
