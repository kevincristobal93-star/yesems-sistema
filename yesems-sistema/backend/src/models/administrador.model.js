const pool = require('../config/db');

const obtenerAdministradores = async () => (await pool.query('SELECT id_administrador, nombre, apellido, email, activo, created_at FROM administradores WHERE activo = true ORDER BY nombre ASC')).rows;
const obtenerAdminPorEmail = async (email) => (await pool.query('SELECT * FROM administradores WHERE email = $1', [email])).rows[0];
const obtenerAdminPorId = async (id) => (await pool.query('SELECT id_administrador, nombre, apellido, email, activo, created_at FROM administradores WHERE id_administrador = $1', [id])).rows[0];

const crearAdmin = async ({ nombre, apellido, email, password_hash }) => {
  const resultado = await pool.query(
    `INSERT INTO administradores (nombre, apellido, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id_administrador, nombre, apellido, email, activo, created_at`,
    [nombre, apellido, email, password_hash]
  );
  return resultado.rows[0];
};

const desactivarAdmin = async (id) => {
  const resultado = await pool.query(
    'UPDATE administradores SET activo = false WHERE id_administrador = $1 AND activo = true RETURNING id_administrador, nombre, apellido, email, activo, created_at',
    [id]
  );
  return resultado.rows[0];
};

const contarAdministradoresActivos = async () => (await pool.query('SELECT COUNT(*)::int AS total FROM administradores WHERE activo = true')).rows[0].total;

const obtenerResumenPanel = async () => {
  const [cursos, alumnos, pagosPendientes, constanciasPendientes, ultimasInscripciones] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM cursos WHERE activo = true'),
    pool.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE activo = true AND rol = 'alumno'"),
    pool.query("SELECT COUNT(*)::int AS total FROM pagos WHERE estado = 'pendiente'"),
    pool.query("SELECT COUNT(*)::int AS total FROM constancias WHERE estado = 'pendiente'"),
    pool.query(`SELECT i.id_inscripcion, i.fecha_inscripcion, i.estado, i.monto_total, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, c.nombre AS curso_nombre
      FROM inscripciones i JOIN usuarios u ON u.id_usuario = i.id_usuario JOIN cursos c ON c.id_curso = i.id_curso ORDER BY i.fecha_inscripcion DESC LIMIT 6`),
  ]);
  return { metricas: { cursos: cursos.rows[0].total, alumnos: alumnos.rows[0].total, pagos_pendientes: pagosPendientes.rows[0].total, constancias_pendientes: constanciasPendientes.rows[0].total }, ultimas_inscripciones: ultimasInscripciones.rows };
};

const obtenerPagosPendientes = async () => (await pool.query(`
  SELECT p.id_pago, p.monto, p.metodo_pago, p.referencia, p.fecha_pago, i.id_inscripcion,
         c.nombre AS curso_nombre, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.folio
  FROM pagos p JOIN inscripciones i ON i.id_inscripcion = p.id_inscripcion
  JOIN usuarios u ON u.id_usuario = i.id_usuario JOIN cursos c ON c.id_curso = i.id_curso
  WHERE p.estado = 'pendiente' ORDER BY p.fecha_pago ASC
`)).rows;

const validarPago = async (idPago, estado) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pago = (await client.query("UPDATE pagos SET estado = $1 WHERE id_pago = $2 AND estado = 'pendiente' RETURNING *", [estado, idPago])).rows[0];
    if (!pago) { await client.query('ROLLBACK'); return null; }
    if (estado === 'completado') await client.query("UPDATE inscripciones SET estado = 'confirmada' WHERE id_inscripcion = $1 AND estado = 'pendiente'", [pago.id_inscripcion]);
    await client.query('COMMIT');
    return pago;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};

const cancelarInscripcionAdmin = async (idInscripcion) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inscripcion = (await client.query("UPDATE inscripciones SET estado = 'cancelada' WHERE id_inscripcion = $1 AND estado <> 'cancelada' RETURNING *", [idInscripcion])).rows[0];
    if (!inscripcion) { await client.query('ROLLBACK'); return null; }
    await client.query("UPDATE pagos SET estado = 'cancelado' WHERE id_inscripcion = $1 AND estado = 'pendiente'", [idInscripcion]);
    await client.query('COMMIT');
    return inscripcion;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};

const obtenerReportesIniciales = async () => {
  const [generales, porCurso, porMes] = await Promise.all([
    pool.query(`SELECT COUNT(i.id_inscripcion)::int AS inscripciones_totales, COUNT(i.id_inscripcion) FILTER (WHERE i.estado <> 'cancelada')::int AS inscripciones_activas, COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'completado'), 0) AS ingresos_confirmados, COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'pendiente'), 0) AS ingresos_pendientes FROM inscripciones i LEFT JOIN pagos p ON p.id_inscripcion = i.id_inscripcion`),
    pool.query(`SELECT c.nombre, COUNT(i.id_inscripcion)::int AS inscripciones, COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'completado'), 0) AS ingresos FROM cursos c LEFT JOIN inscripciones i ON i.id_curso = c.id_curso AND i.estado <> 'cancelada' LEFT JOIN pagos p ON p.id_inscripcion = i.id_inscripcion WHERE c.activo = true GROUP BY c.id_curso, c.nombre ORDER BY inscripciones DESC, c.nombre ASC`),
    pool.query(`SELECT TO_CHAR(DATE_TRUNC('month', fecha_inscripcion), 'YYYY-MM') AS periodo, COUNT(*)::int AS inscripciones FROM inscripciones WHERE estado <> 'cancelada' GROUP BY DATE_TRUNC('month', fecha_inscripcion) ORDER BY periodo DESC LIMIT 6`),
  ]);
  return { generales: generales.rows[0], por_curso: porCurso.rows, por_mes: porMes.rows.reverse() };
};

module.exports = { obtenerAdministradores, obtenerAdminPorEmail, obtenerAdminPorId, crearAdmin, desactivarAdmin, contarAdministradoresActivos, obtenerResumenPanel, obtenerPagosPendientes, validarPago, cancelarInscripcionAdmin, obtenerReportesIniciales };
