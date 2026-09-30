const constanciaModel = require('../models/constancia.model');
const seguimiento = require('../models/seguimiento.model');
const generarPdfConstancia = require('../utils/generarPdfConstancia');
const { descargarPdf } = require('../services/constancia-download.service');
const { httpError, positiveId, sendError } = require('../utils/http-error');
const pool = require('../config/db');

async function comprobarRequisitos(client, idInscripcion, idUsuario) {
  if (idUsuario) {
    const propia = await client.query('SELECT id_inscripcion FROM inscripciones WHERE id_inscripcion = $1 AND id_usuario = $2', [idInscripcion, idUsuario]);
    if (!propia.rowCount) throw httpError(404, 'Inscripción no encontrada');
  }
  const progreso = await seguimiento.obtenerProgreso(idInscripcion, client);
  if (!progreso) throw httpError(404, 'Inscripción no encontrada');
  if (!progreso.puede_solicitar_constancia) {
    throw httpError(409, `Aún no puedes recibir la constancia: ${progreso.bloqueos.join('. ') || 'se requiere conclusión validada y pago completo'}.`);
  }
  return progreso;
}

async function crearSolicitud(req, res, propia) {
  try {
    const id = positiveId(req.body?.id_inscripcion);
    const constancia = await seguimiento.withEnrollmentLock(id, async (client) => {
      await comprobarRequisitos(client, id, propia ? req.admin.id_usuario : null);
      const existente = await client.query('SELECT id_constancia FROM constancias WHERE id_inscripcion = $1', [id]);
      if (existente.rowCount) throw httpError(409, 'Ya existe una constancia para esta inscripción');
      return (await client.query("INSERT INTO constancias (id_inscripcion, folio, estado) VALUES ($1, $2, 'pendiente') RETURNING *", [id, `SOL-${id}-${Date.now()}`])).rows[0];
    });
    res.status(201).json({ ok: true, constancia });
  } catch (error) { sendError(res, error); }
}

const solicitarConstanciaPropia = (req, res) => crearSolicitud(req, res, true);
const solicitarConstancia = (req, res) => crearSolicitud(req, res, false);

async function descargar(req, res, propia) {
  try {
    const id = positiveId(req.params.id);
    const result = await pool.query(
      `SELECT co.* FROM constancias co JOIN inscripciones i ON i.id_inscripcion = co.id_inscripcion
       WHERE co.id_constancia = $1 ${propia ? 'AND i.id_usuario = $2' : ''}`,
      propia ? [id, req.admin.id_usuario] : [id]
    );
    const constancia = result.rows[0];
    if (!constancia) throw httpError(404, 'Constancia no encontrada');
    if (constancia.estado !== 'autorizada' || !constancia.archivo_url) throw httpError(403, 'Esta constancia aún no está autorizada');
    // Los documentos históricos autorizados conservan su descarga.
    await descargarPdf(res, constancia);
  } catch (error) { sendError(res, error); }
}

const descargarConstanciaPropia = (req, res) => descargar(req, res, true);
const descargarConstancia = (req, res) => descargar(req, res, false);

const listarConstancias = async (req, res) => {
  try { res.json({ ok: true, constancias: await constanciaModel.obtenerConstancias() }); }
  catch (error) { sendError(res, error); }
};

const obtenerConstancia = async (req, res) => {
  try {
    const constancia = await constanciaModel.obtenerConstanciaPorId(positiveId(req.params.id));
    if (!constancia) throw httpError(404, 'Constancia no encontrada');
    res.json({ ok: true, constancia });
  } catch (error) { sendError(res, error); }
};

const autorizarConstancia = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    const original = await constanciaModel.obtenerConstanciaPorId(id);
    if (!original) throw httpError(404, 'Constancia no encontrada');
    const constancia = await seguimiento.withEnrollmentLock(original.id_inscripcion, async (client) => {
      const row = (await client.query('SELECT * FROM constancias WHERE id_constancia = $1 FOR UPDATE', [id])).rows[0];
      if (!row || row.estado !== 'pendiente') throw httpError(409, 'Solo se puede autorizar una solicitud pendiente');
      // Se vuelven a comprobar al autorizar, no solo cuando se solicitó.
      await comprobarRequisitos(client, row.id_inscripcion);
      const datos = (await client.query(`SELECT u.nombre AS alumno_nombre, u.apellido AS alumno_apellido,
        c.nombre AS curso_nombre, c.duracion_horas, i.fecha_inscripcion, i.estado AS estado_inscripcion,
        i.concluida_at AS fecha_conclusion FROM inscripciones i
        JOIN usuarios u ON u.id_usuario = i.id_usuario JOIN cursos c ON c.id_curso = i.id_curso
        WHERE i.id_inscripcion = $1`, [row.id_inscripcion])).rows[0];
      const folio = `YESEMS-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
      const archivo = await generarPdfConstancia(datos, folio);
      return (await client.query("UPDATE constancias SET estado = 'autorizada', folio = $2, archivo_url = $3, fecha_emision = CURRENT_DATE WHERE id_constancia = $1 RETURNING *", [id, folio, archivo])).rows[0];
    });
    res.json({ ok: true, mensaje: 'Constancia autorizada y generada', constancia });
  } catch (error) { sendError(res, error); }
};

const rechazarConstancia = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    const original = await constanciaModel.obtenerConstanciaPorId(id);
    if (!original) throw httpError(404, 'Constancia no encontrada');
    const constancia = await seguimiento.withEnrollmentLock(original.id_inscripcion, async (client) => {
      const result = await client.query("UPDATE constancias SET estado = 'rechazada' WHERE id_constancia = $1 AND estado = 'pendiente' RETURNING *", [id]);
      if (!result.rowCount) throw httpError(409, 'Solo se puede rechazar una solicitud pendiente');
      return result.rows[0];
    });
    res.json({ ok: true, mensaje: 'Constancia rechazada', constancia });
  } catch (error) { sendError(res, error); }
};

module.exports = { solicitarConstanciaPropia, descargarConstanciaPropia, listarConstancias, obtenerConstancia, solicitarConstancia, autorizarConstancia, rechazarConstancia, descargarConstancia };
