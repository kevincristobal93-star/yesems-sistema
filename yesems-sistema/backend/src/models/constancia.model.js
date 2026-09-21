const pool = require('../config/db');

const obtenerConstancias = async () => {
  const resultado = await pool.query(`
    SELECT co.*, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, c.nombre AS curso_nombre
    FROM constancias co
    JOIN inscripciones i ON co.id_inscripcion = i.id_inscripcion
    JOIN usuarios u ON i.id_usuario = u.id_usuario
    JOIN cursos c ON i.id_curso = c.id_curso
    ORDER BY co.fecha_emision DESC
  `);
  return resultado.rows;
};

const obtenerConstanciaPorId = async (id) => {
  const resultado = await pool.query(
    'SELECT * FROM constancias WHERE id_constancia = $1',
    [id]
  );
  return resultado.rows[0];
};

const obtenerConstanciaPorInscripcion = async (idInscripcion) => {
  const resultado = await pool.query(
    'SELECT * FROM constancias WHERE id_inscripcion = $1',
    [idInscripcion]
  );
  return resultado.rows[0];
};

// Trae los datos completos (usuario/alumno, curso) necesarios para generar el PDF
const obtenerDatosParaPdf = async (idInscripcion) => {
  const resultado = await pool.query(`
    SELECT u.nombre AS alumno_nombre, u.apellido AS alumno_apellido,
           c.nombre AS curso_nombre, c.duracion_horas,
           i.fecha_inscripcion, i.estado AS estado_inscripcion
    FROM inscripciones i
    JOIN usuarios u ON i.id_usuario = u.id_usuario
    JOIN cursos c ON i.id_curso = c.id_curso
    WHERE i.id_inscripcion = $1
  `, [idInscripcion]);
  return resultado.rows[0];
};

// Crear la "solicitud" en estado pendiente (folio temporal, se finaliza al autorizar)
const crearSolicitud = async (idInscripcion) => {
  const folioTemporal = `SOL-${idInscripcion}-${Date.now()}`;
  const resultado = await pool.query(
    `INSERT INTO constancias (id_inscripcion, folio, estado)
     VALUES ($1, $2, 'pendiente') RETURNING *`,
    [idInscripcion, folioTemporal]
  );
  return resultado.rows[0];
};

// Autorizar: asigna folio definitivo, guarda la ruta del PDF y cambia el estado
const autorizarConstancia = async (id, folioFinal, archivoUrl) => {
  const resultado = await pool.query(
    `UPDATE constancias SET estado = 'autorizada', folio = $1, archivo_url = $2
     WHERE id_constancia = $3 RETURNING *`,
    [folioFinal, archivoUrl, id]
  );
  return resultado.rows[0];
};

const rechazarConstancia = async (id) => {
  const resultado = await pool.query(
    `UPDATE constancias SET estado = 'rechazada' WHERE id_constancia = $1 RETURNING *`,
    [id]
  );
  return resultado.rows[0];
};

module.exports = {
  obtenerConstancias,
  obtenerConstanciaPorId,
  obtenerConstanciaPorInscripcion,
  obtenerDatosParaPdf,
  crearSolicitud,
  autorizarConstancia,
  rechazarConstancia,
};
