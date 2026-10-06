const pool = require('../config/db');
const { withEnrollmentLock, withCourseLock } = require('./seguimiento.model');
const { httpError, positiveId } = require('../utils/http-error');

// Trae inscripciones con datos legibles del usuario (alumno) y el curso
const obtenerInscripciones = async () => {
  const resultado = await pool.query(`
    SELECT i.*,
           u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.folio AS alumno_folio, u.email AS alumno_email,
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
  positiveId(id_usuario);
  positiveId(id_curso);
  if (id_horario != null) positiveId(id_horario);
  if (monto_total != null) validarMontoInscripcion(monto_total);
  return withCourseLock(id_curso, async (client, curso) => {
    if (!curso.activo) throw httpError(409, 'El curso no está disponible');
    if (curso.oferta_provisional) throw httpError(409, 'Oferta provisional: YES EMS debe confirmar los datos y el precio antes de abrir inscripciones.');
    const usuario = await client.query('SELECT 1 FROM usuarios WHERE id_usuario = $1 AND activo = true', [id_usuario]);
    if (!usuario.rowCount) throw httpError(404, 'Alumno no encontrado o inactivo');
    if (id_horario != null) {
      const horario = await client.query('SELECT 1 FROM horarios WHERE id_horario = $1 AND id_curso = $2', [id_horario, id_curso]);
      if (!horario.rowCount) throw httpError(400, 'La disponibilidad no pertenece a este curso');
    }
    const existente = await client.query("SELECT 1 FROM inscripciones WHERE id_usuario = $1 AND id_curso = $2 AND estado <> 'cancelada'", [id_usuario, id_curso]);
    if (existente.rowCount) throw httpError(409, 'Ya existe una inscripción activa para este alumno y curso');
    // Omitir el monto no debe convertir accidentalmente un curso de pago en gratuito.
    return (await client.query(
      'INSERT INTO inscripciones (id_usuario, id_curso, id_horario, monto_total) VALUES ($1, $2, $3, $4) RETURNING *',
      [id_usuario, id_curso, id_horario ?? null, monto_total ?? curso.precio]
    )).rows[0];
  });
};

function validarMontoInscripcion(monto) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(monto)) || Number(monto) >= 100000000) {
    throw httpError(400, 'El monto debe ser mayor o igual a cero y tener hasta dos decimales');
  }
}

const actualizarEstado = async (id, estado) => {
  if (estado === 'cancelada') return cancelarInscripcion(id);
  throw httpError(409, 'Usa la validación de pago o la conclusión de seguimiento para cambiar este estado');
};

const actualizarInscripcion = async (id, datos) => {
  const { id_horario, monto_total } = datos;
  positiveId(id);
  validarMontoInscripcion(monto_total);
  return withEnrollmentLock(id, async (client) => {
    const inscripcion = (await client.query('SELECT * FROM inscripciones WHERE id_inscripcion = $1', [id])).rows[0];
    if (inscripcion.concluida_at || ['completada', 'cancelada'].includes(inscripcion.estado)) throw httpError(409, 'No puedes modificar una inscripción concluida o cancelada');
    if (id_horario != null) {
      positiveId(id_horario);
      const horario = await client.query('SELECT 1 FROM horarios WHERE id_horario = $1 AND id_curso = $2', [id_horario, inscripcion.id_curso]);
      if (!horario.rowCount) throw httpError(400, 'La disponibilidad no pertenece a este curso');
    }
    return (await client.query('UPDATE inscripciones SET id_horario = $1, monto_total = $2 WHERE id_inscripcion = $3 RETURNING *', [id_horario ?? null, monto_total, id])).rows[0];
  });
};

// "Eliminar" = cancelar (baja lógica vía estado, no hay columna activo aquí)
const cancelarInscripcion = async (id) => {
  positiveId(id);
  return withEnrollmentLock(id, async (client) => {
    const row = (await client.query('SELECT * FROM inscripciones WHERE id_inscripcion = $1', [id])).rows[0];
    const emitida = await client.query("SELECT 1 FROM constancias WHERE id_inscripcion = $1 AND estado = 'autorizada'", [id]);
    if (row.concluida_at || row.estado === 'completada' || emitida.rowCount) throw httpError(409, 'No puedes cancelar una inscripción concluida o con constancia emitida');
    if (row.estado === 'cancelada') return row;
    await client.query("UPDATE pagos SET estado = 'cancelado' WHERE id_inscripcion = $1 AND estado = 'pendiente'", [id]);
    return (await client.query("UPDATE inscripciones SET estado = 'cancelada' WHERE id_inscripcion = $1 RETURNING *", [id])).rows[0];
  });
};

module.exports = {
  obtenerInscripciones,
  obtenerInscripcionPorId,
  crearInscripcion,
  actualizarEstado,
  actualizarInscripcion,
  cancelarInscripcion,
};
