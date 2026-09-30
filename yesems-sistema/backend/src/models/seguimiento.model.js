const pool = require('../config/db');

function errorEstado(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

async function inTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function lockCourse(client, idCurso) {
  const result = await client.query('SELECT * FROM cursos WHERE id_curso = $1 FOR UPDATE', [idCurso]);
  if (!result.rows[0]) throw errorEstado(404, 'Curso no encontrado');
  return result.rows[0];
}

// Todos los cambios relacionados con plan, cumplimiento, pagos y constancias
// deben tomar bloqueos en este orden: curso -> inscripción. Evita validar con
// un denominador o saldo que cambia durante la conclusión/autorización.
async function withEnrollmentLock(idInscripcion, callback) {
  return inTransaction(async (client) => {
    const found = await client.query('SELECT id_curso FROM inscripciones WHERE id_inscripcion = $1', [idInscripcion]);
    if (!found.rows[0]) throw errorEstado(404, 'Inscripción no encontrada');
    const idCurso = found.rows[0].id_curso;
    await lockCourse(client, idCurso);
    const locked = await client.query(
      'SELECT * FROM inscripciones WHERE id_inscripcion = $1 AND id_curso = $2 FOR UPDATE',
      [idInscripcion, idCurso]
    );
    if (!locked.rows[0]) throw errorEstado(409, 'La inscripción cambió. Vuelve a intentarlo.');
    return callback(client);
  });
}

async function withCourseLock(idCurso, callback) {
  return inTransaction(async (client) => {
    const curso = await lockCourse(client, idCurso);
    return callback(client, curso);
  });
}

async function planBloqueado(idCurso, client) {
  const result = await client.query(
    'SELECT EXISTS (SELECT 1 FROM inscripciones WHERE id_curso = $1 AND concluida_at IS NOT NULL) AS bloqueado',
    [idCurso]
  );
  return result.rows[0].bloqueado;
}

async function requireDraft(idCurso, curso, client) {
  if (await planBloqueado(idCurso, client)) {
    throw errorEstado(409, 'El plan ya tiene conclusiones validadas y no puede modificarse. Crea un nuevo curso para otro plan.');
  }
  if (curso.plan_publicado) throw errorEstado(409, 'Reabre el plan como borrador antes de modificarlo.');
}

function calcularProgreso(row) {
  const actividades = row.actividades || [];
  const total = actividades.length;
  const cumplidas = actividades.filter((actividad) => actividad.cumplida).length;
  const porcentajeMinimo = row.porcentaje_minimo === null ? null : Number(row.porcentaje_minimo);
  const totalPagado = Number(row.total_pagado || 0);
  const montoTotal = Number(row.monto_total);
  const pagoCompleto = Math.round(totalPagado * 100) >= Math.round(montoTotal * 100);
  // Comparar productos enteros evita que redondear 66.666... a 67 apruebe un 67%.
  const avanceSuficiente = total > 0 && porcentajeMinimo !== null && cumplidas * 100 >= total * porcentajeMinimo;
  const conclusionValidada = Boolean(row.concluida_at && row.concluida_por && row.estado === 'completada');
  const bloqueos = [];
  if (row.estado === 'cancelada') bloqueos.push('La inscripción está cancelada.');
  if (!row.plan_publicado) bloqueos.push('El administrador debe publicar el plan del curso.');
  if (porcentajeMinimo === null) bloqueos.push('Falta definir el porcentaje mínimo del curso.');
  if (total === 0) bloqueos.push('El curso todavía no tiene sesiones o actividades.');
  if (total > 0 && porcentajeMinimo !== null && !avanceSuficiente) {
    bloqueos.push(`Debes cumplir al menos el ${porcentajeMinimo}% de las sesiones o actividades.`);
  }
  if (!pagoCompleto) bloqueos.push('Falta cubrir el pago completo con pagos confirmados.');
  const requisitosCumplidos = bloqueos.length === 0;
  if (!conclusionValidada) bloqueos.push('Falta la validación final de conclusión del administrador.');
  return {
    id_inscripcion: row.id_inscripcion,
    id_curso: row.id_curso,
    estado: row.estado,
    total,
    cumplidas,
    pendientes: total - cumplidas,
    porcentaje: total > 0 ? Math.round(cumplidas * 10000 / total) / 100 : 0,
    porcentaje_minimo: porcentajeMinimo,
    plan_publicado: row.plan_publicado,
    pago_completo: pagoCompleto,
    total_pagado: totalPagado,
    monto_total: montoTotal,
    conclusion_validada: conclusionValidada,
    puede_concluir: requisitosCumplidos && !conclusionValidada,
    puede_solicitar_constancia: requisitosCumplidos && conclusionValidada,
    bloqueos,
    actividades,
  };
}

async function obtenerProgreso(idInscripcion, client = pool) {
  // Una sola sentencia obtiene un snapshot consistente de plan, saldo y avance.
  const result = await client.query(`
    SELECT i.id_inscripcion, i.id_curso, i.estado, i.monto_total,
           i.concluida_at, i.concluida_por, c.porcentaje_minimo, c.plan_publicado,
           COALESCE((SELECT SUM(p.monto) FROM pagos p
                     WHERE p.id_inscripcion = i.id_inscripcion AND p.estado = 'completado'), 0) AS total_pagado,
           COALESCE((SELECT json_agg(json_build_object(
             'id_actividad', a.id_actividad, 'titulo', a.titulo, 'tipo', a.tipo,
             'modalidad', a.modalidad, 'fecha', a.fecha,
             'cumplida', COALESCE(ac.cumplida, false), 'observaciones', ac.observaciones
           ) ORDER BY a.orden, a.id_actividad)
           FROM curso_actividades a
           LEFT JOIN actividad_cumplimientos ac
             ON ac.id_actividad = a.id_actividad AND ac.id_inscripcion = i.id_inscripcion
           WHERE a.id_curso = i.id_curso AND a.activa = true), '[]'::json) AS actividades
    FROM inscripciones i JOIN cursos c ON c.id_curso = i.id_curso
    WHERE i.id_inscripcion = $1`, [idInscripcion]);
  return result.rows[0] ? calcularProgreso(result.rows[0]) : null;
}

async function obtenerProgresoPropio(idInscripcion, idUsuario) {
  const result = await pool.query(
    'SELECT id_inscripcion FROM inscripciones WHERE id_inscripcion = $1 AND id_usuario = $2',
    [idInscripcion, idUsuario]
  );
  return result.rows[0] ? obtenerProgreso(idInscripcion) : null;
}

async function listarCursos() {
  const result = await pool.query('SELECT id_curso, nombre, activo FROM cursos ORDER BY nombre, id_curso');
  return result.rows;
}

async function obtenerCurso(idCurso) {
  const result = await pool.query(`
    SELECT c.id_curso, c.nombre, c.porcentaje_minimo, c.plan_publicado,
           EXISTS (SELECT 1 FROM inscripciones i WHERE i.id_curso = c.id_curso
                   AND i.concluida_at IS NOT NULL) AS plan_bloqueado
    FROM cursos c WHERE c.id_curso = $1`, [idCurso]);
  if (!result.rows[0]) return null;
  const [actividades, inscripciones] = await Promise.all([
    pool.query(`SELECT id_actividad, titulo, tipo, modalidad, fecha::text, orden
                FROM curso_actividades WHERE id_curso = $1 AND activa = true
                ORDER BY orden, id_actividad`, [idCurso]),
    pool.query(`SELECT i.id_inscripcion, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, i.estado
                FROM inscripciones i JOIN usuarios u ON u.id_usuario = i.id_usuario
                WHERE i.id_curso = $1 ORDER BY u.nombre, u.apellido, i.id_inscripcion`, [idCurso]),
  ]);
  // Consultas secuenciales evitan ocupar todas las conexiones con un curso grande.
  const alumnos = [];
  for (const inscripcion of inscripciones.rows) {
    alumnos.push({ ...inscripcion, progreso: await obtenerProgreso(inscripcion.id_inscripcion) });
  }
  return { curso: result.rows[0], actividades: actividades.rows, inscripciones: alumnos };
}

async function actualizarRegla(idCurso, porcentajeMinimo) {
  return withCourseLock(idCurso, async (client, curso) => {
    await requireDraft(idCurso, curso, client);
    await client.query('UPDATE cursos SET porcentaje_minimo = $2 WHERE id_curso = $1', [idCurso, porcentajeMinimo]);
  });
}

async function crearActividad(idCurso, datos) {
  return withCourseLock(idCurso, async (client, curso) => {
    await requireDraft(idCurso, curso, client);
    const result = await client.query(`
      INSERT INTO curso_actividades (id_curso, titulo, tipo, modalidad, fecha, orden)
      SELECT $1, $2, $3, $4, $5, COALESCE(MAX(orden), 0) + 1
      FROM curso_actividades WHERE id_curso = $1
      RETURNING id_actividad, titulo, tipo, modalidad, fecha::text, orden`,
    [idCurso, datos.titulo, datos.tipo, datos.modalidad, datos.fecha]);
    return result.rows[0];
  });
}

async function modificarActividad(idActividad, datos) {
  const found = await pool.query('SELECT id_curso FROM curso_actividades WHERE id_actividad = $1 AND activa = true', [idActividad]);
  if (!found.rows[0]) throw errorEstado(404, 'Actividad no encontrada');
  const idCurso = found.rows[0].id_curso;
  return withCourseLock(idCurso, async (client, curso) => {
    await requireDraft(idCurso, curso, client);
    if (datos?.fecha) {
      const conflict = await client.query(`
        SELECT $2::date > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date AND EXISTS (
          SELECT 1 FROM actividad_cumplimientos WHERE id_actividad = $1 AND cumplida = true
        ) AS conflicto`, [idActividad, datos.fecha]);
      if (conflict.rows[0].conflicto) {
        throw errorEstado(409, 'Esta actividad ya tiene cumplimientos registrados y no puede moverse a una fecha futura.');
      }
    }
    const result = datos === null
      ? await client.query(`UPDATE curso_actividades SET activa = false
                            WHERE id_actividad = $1 AND activa = true RETURNING id_actividad`, [idActividad])
      : await client.query(`UPDATE curso_actividades SET titulo = $2, tipo = $3, modalidad = $4, fecha = $5
                            WHERE id_actividad = $1 AND activa = true
                            RETURNING id_actividad, titulo, tipo, modalidad, fecha::text, orden`,
      [idActividad, datos.titulo, datos.tipo, datos.modalidad, datos.fecha]);
    if (!result.rows[0]) throw errorEstado(404, 'Actividad no encontrada');
    return result.rows[0];
  });
}

async function publicarPlan(idCurso) {
  return withCourseLock(idCurso, async (client, curso) => {
    if (curso.plan_publicado) return;
    if (!curso.porcentaje_minimo) throw errorEstado(400, 'Define el porcentaje mínimo antes de publicar el plan.');
    const result = await client.query('SELECT COUNT(*)::int AS total FROM curso_actividades WHERE id_curso = $1 AND activa = true', [idCurso]);
    if (result.rows[0].total === 0) throw errorEstado(400, 'Agrega al menos una sesión o actividad antes de publicar el plan.');
    await client.query('UPDATE cursos SET plan_publicado = true WHERE id_curso = $1', [idCurso]);
  });
}

async function reabrirPlan(idCurso) {
  return withCourseLock(idCurso, async (client) => {
    if (await planBloqueado(idCurso, client)) {
      throw errorEstado(409, 'El plan ya tiene conclusiones validadas y no puede reabrirse. Crea un nuevo curso para otro plan.');
    }
    await client.query('UPDATE cursos SET plan_publicado = false WHERE id_curso = $1', [idCurso]);
  });
}

async function registrarCumplimiento(idInscripcion, idActividad, datos, idAdministrador) {
  return withEnrollmentLock(idInscripcion, async (client) => {
    const progreso = await obtenerProgreso(idInscripcion, client);
    if (progreso.estado === 'cancelada') throw errorEstado(409, 'La inscripción está cancelada.');
    if (progreso.conclusion_validada) throw errorEstado(409, 'La conclusión ya fue validada; el cumplimiento está cerrado.');
    if (!progreso.plan_publicado) throw errorEstado(409, 'Publica el plan del curso antes de registrar cumplimiento.');
    const result = await client.query(`
      SELECT id_actividad, fecha > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date AS futura FROM curso_actividades
      WHERE id_actividad = $1 AND id_curso = $2 AND activa = true`, [idActividad, progreso.id_curso]);
    if (!result.rows[0]) throw errorEstado(404, 'Actividad no encontrada en este curso.');
    if (datos.cumplida && result.rows[0].futura) {
      throw errorEstado(400, 'No puedes marcar como cumplida una sesión o actividad con fecha futura.');
    }
    await client.query(`
      INSERT INTO actividad_cumplimientos (id_inscripcion, id_actividad, cumplida, observaciones, registrado_por)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id_inscripcion, id_actividad) DO UPDATE
      SET cumplida = EXCLUDED.cumplida, observaciones = EXCLUDED.observaciones,
          registrado_por = EXCLUDED.registrado_por, updated_at = CURRENT_TIMESTAMP`,
    [idInscripcion, idActividad, datos.cumplida, datos.observaciones, idAdministrador]);
    return obtenerProgreso(idInscripcion, client);
  });
}

async function concluirInscripcion(idInscripcion, idAdministrador) {
  return withEnrollmentLock(idInscripcion, async (client) => {
    const progreso = await obtenerProgreso(idInscripcion, client);
    if (progreso.conclusion_validada) return progreso;
    if (!progreso.puede_concluir) throw errorEstado(400, progreso.bloqueos.join(' '));
    await client.query(`
      UPDATE inscripciones SET estado = 'completada', concluida_por = $2, concluida_at = CURRENT_TIMESTAMP
      WHERE id_inscripcion = $1`, [idInscripcion, idAdministrador]);
    return obtenerProgreso(idInscripcion, client);
  });
}

module.exports = {
  obtenerProgreso,
  obtenerProgresoPropio,
  listarCursos,
  obtenerCurso,
  actualizarRegla,
  crearActividad,
  modificarActividad,
  publicarPlan,
  reabrirPlan,
  registrarCumplimiento,
  concluirInscripcion,
  withEnrollmentLock,
  withCourseLock,
  calcularProgreso,
};
