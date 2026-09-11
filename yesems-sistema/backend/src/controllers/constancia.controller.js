const constanciaModel = require('../models/constancia.model');
const generarPdfConstancia = require('../utils/generarPdfConstancia');
const path = require('path');
const pool = require('../config/db');

const solicitarConstanciaPropia = async (req, res) => {
  try {
    const { id_inscripcion } = req.body;
    if (!id_inscripcion) return res.status(400).json({ ok: false, mensaje: 'id_inscripcion es obligatorio' });
    const inscripcionResult = await pool.query(
      'SELECT id_inscripcion, estado FROM inscripciones WHERE id_inscripcion = $1 AND id_usuario = $2',
      [id_inscripcion, req.admin.id_usuario]
    );
    const inscripcion = inscripcionResult.rows[0];
    if (!inscripcion) return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada' });
    if (inscripcion.estado !== 'completada') {
      return res.status(409).json({ ok: false, mensaje: 'La constancia solo puede solicitarse al completar el curso' });
    }
    const existente = await constanciaModel.obtenerConstanciaPorInscripcion(id_inscripcion);
    if (existente) return res.status(409).json({ ok: false, mensaje: 'Ya existe una constancia para esta inscripción', constancia: existente });
    const constancia = await constanciaModel.crearSolicitud(id_inscripcion);
    res.status(201).json({ ok: true, constancia });
  } catch (error) {
    console.error('Error al solicitar constancia propia:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const descargarConstanciaPropia = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT co.folio, co.estado, co.archivo_url
       FROM constancias co
       JOIN inscripciones i ON i.id_inscripcion = co.id_inscripcion
       WHERE co.id_constancia = $1 AND i.id_usuario = $2`,
      [req.params.id, req.admin.id_usuario]
    );
    const constancia = resultado.rows[0];
    if (!constancia) return res.status(404).json({ ok: false, mensaje: 'Constancia no encontrada' });
    if (constancia.estado !== 'autorizada' || !constancia.archivo_url) {
      return res.status(403).json({ ok: false, mensaje: 'Esta constancia aún no está autorizada' });
    }
    const rutaArchivo = path.join(__dirname, '../..', constancia.archivo_url);
    res.download(rutaArchivo, `constancia_${constancia.folio}.pdf`);
  } catch (error) {
    console.error('Error al descargar constancia propia:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const listarConstancias = async (req, res) => {
  try {
    const constancias = await constanciaModel.obtenerConstancias();
    res.json({ ok: true, constancias });
  } catch (error) {
    console.error('Error al listar constancias:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerConstancia = async (req, res) => {
  try {
    const { id } = req.params;
    const constancia = await constanciaModel.obtenerConstanciaPorId(id);
    if (!constancia) {
      return res.status(404).json({ ok: false, mensaje: 'Constancia no encontrada' });
    }
    res.json({ ok: true, constancia });
  } catch (error) {
    console.error('Error al obtener constancia:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// POST /api/constancias  { "id_inscripcion": 5 }
// Crea la solicitud en estado pendiente (normalmente se llama cuando la inscripción llega a "completada")
const solicitarConstancia = async (req, res) => {
  try {
    const { id_inscripcion } = req.body;
    if (!id_inscripcion) {
      return res.status(400).json({ ok: false, mensaje: 'id_inscripcion es obligatorio' });
    }

    const existente = await constanciaModel.obtenerConstanciaPorInscripcion(id_inscripcion);
    if (existente) {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe una constancia para esta inscripción', constancia: existente });
    }

    const nueva = await constanciaModel.crearSolicitud(id_inscripcion);
    res.status(201).json({ ok: true, constancia: nueva });
  } catch (error) {
    console.error('Error al solicitar constancia:', error);
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, mensaje: 'id_inscripcion no existe' });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

// PATCH /api/constancias/:id/autorizar
// El admin autoriza: genera folio final y el PDF real
const autorizarConstancia = async (req, res) => {
  try {
    const { id } = req.params;
    const constancia = await constanciaModel.obtenerConstanciaPorId(id);
    if (!constancia) {
      return res.status(404).json({ ok: false, mensaje: 'Constancia no encontrada' });
    }
    if (constancia.estado === 'autorizada') {
      return res.status(409).json({ ok: false, mensaje: 'Esta constancia ya fue autorizada' });
    }

    const datos = await constanciaModel.obtenerDatosParaPdf(constancia.id_inscripcion);
    if (!datos) {
      return res.status(404).json({ ok: false, mensaje: 'No se encontraron datos de la inscripción' });
    }

    const anio = new Date().getFullYear();
    const folioFinal = `YESEMS-${anio}-${String(constancia.id_constancia).padStart(4, '0')}`;

    const archivoUrl = await generarPdfConstancia(datos, folioFinal);

    const actualizada = await constanciaModel.autorizarConstancia(id, folioFinal, archivoUrl);
    res.json({ ok: true, mensaje: 'Constancia autorizada y generada', constancia: actualizada });
  } catch (error) {
    console.error('Error al autorizar constancia:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// PATCH /api/constancias/:id/rechazar
const rechazarConstancia = async (req, res) => {
  try {
    const { id } = req.params;
    const constancia = await constanciaModel.obtenerConstanciaPorId(id);
    if (!constancia) {
      return res.status(404).json({ ok: false, mensaje: 'Constancia no encontrada' });
    }
    const actualizada = await constanciaModel.rechazarConstancia(id);
    res.json({ ok: true, mensaje: 'Constancia rechazada', constancia: actualizada });
  } catch (error) {
    console.error('Error al rechazar constancia:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// GET /api/constancias/:id/descargar
const descargarConstancia = async (req, res) => {
  try {
    const { id } = req.params;
    const constancia = await constanciaModel.obtenerConstanciaPorId(id);
    if (!constancia) {
      return res.status(404).json({ ok: false, mensaje: 'Constancia no encontrada' });
    }
    if (constancia.estado !== 'autorizada' || !constancia.archivo_url) {
      return res.status(403).json({ ok: false, mensaje: 'Esta constancia aún no está autorizada' });
    }

    const rutaArchivo = path.join(__dirname, '../..', constancia.archivo_url);
    res.download(rutaArchivo, `constancia_${constancia.folio}.pdf`);
  } catch (error) {
    console.error('Error al descargar constancia:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  solicitarConstanciaPropia,
  descargarConstanciaPropia,
  listarConstancias,
  obtenerConstancia,
  solicitarConstancia,
  autorizarConstancia,
  rechazarConstancia,
  descargarConstancia,
};
