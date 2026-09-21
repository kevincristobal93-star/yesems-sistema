const pagoModel = require('../models/pago.model');
const pool = require('../config/db');
const path = require('path');
const { guardarArchivoPermanente, isRemoteFile } = require('../services/storage.service');

const METODOS_VALIDOS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];
const ESTADOS_VALIDOS = ['pendiente', 'completado', 'cancelado'];

const obtenerPagoPropio = async (req, res) => {
  try {
    const { id_inscripcion } = req.params;
    const comprobanteUrl = req.file
      ? (await guardarArchivoPermanente(req.file.path, 'yesems/comprobantes')) || `/uploads/comprobantes/${req.file.filename}`
      : null;
    const resultado = await pool.query(
      `SELECT i.id_inscripcion, i.monto_total, i.estado AS estado_inscripcion,
              c.nombre AS curso_nombre, c.descripcion AS curso_descripcion,
              h.modalidad AS disponibilidad_modalidad, h.dia_semana AS disponibilidad_dia,
              h.hora_inicio AS disponibilidad_hora_inicio, h.hora_fin AS disponibilidad_hora_fin,
              h.informacion_adicional AS disponibilidad_informacion, h.notas AS disponibilidad_notas,
              u.folio,
              COALESCE(json_agg(json_build_object(
                'id_pago', p.id_pago, 'monto', p.monto, 'metodo_pago', p.metodo_pago,
                'referencia', p.referencia, 'comprobante_url', p.comprobante_url, 'estado', p.estado, 'fecha_pago', p.fecha_pago
              ) ORDER BY p.fecha_pago) FILTER (WHERE p.id_pago IS NOT NULL), '[]') AS pagos
       FROM inscripciones i
       JOIN cursos c ON c.id_curso = i.id_curso
       JOIN usuarios u ON u.id_usuario = i.id_usuario
       LEFT JOIN horarios h ON h.id_horario = i.id_horario
       LEFT JOIN pagos p ON p.id_inscripcion = i.id_inscripcion
       WHERE i.id_inscripcion = $1 AND i.id_usuario = $2
       GROUP BY i.id_inscripcion, c.nombre, c.descripcion, h.modalidad, h.dia_semana, h.hora_inicio,
                h.hora_fin, h.informacion_adicional, h.notas, u.folio`,
      [id_inscripcion, req.admin.id_usuario]
    );
    if (!resultado.rows[0]) return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada' });
    res.json({ ok: true, inscripcion: resultado.rows[0] });
  } catch (error) {
    console.error('Error al obtener pago propio:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearPagoPropio = async (req, res) => {
  try {
    const { id_inscripcion, metodo_pago, referencia } = req.body;
    if (!id_inscripcion || !metodo_pago) {
      return res.status(400).json({ ok: false, mensaje: 'id_inscripcion y metodo_pago son obligatorios' });
    }
    if (!METODOS_VALIDOS.includes(metodo_pago)) {
      return res.status(400).json({ ok: false, mensaje: `metodo_pago debe ser uno de: ${METODOS_VALIDOS.join(', ')}` });
    }
    if (metodo_pago !== 'efectivo' && !req.file) {
      return res.status(400).json({ ok: false, mensaje: 'Adjunta el comprobante de pago en PDF, JPG o PNG.' });
    }
    const inscripcionResult = await pool.query(
      "SELECT id_inscripcion, monto_total, estado FROM inscripciones WHERE id_inscripcion = $1 AND id_usuario = $2",
      [id_inscripcion, req.admin.id_usuario]
    );
    const inscripcion = inscripcionResult.rows[0];
    if (!inscripcion) return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada' });
    if (inscripcion.estado === 'cancelada') return res.status(409).json({ ok: false, mensaje: 'No se puede registrar un pago para una inscripción cancelada' });

    const pendiente = await pool.query(
      "SELECT id_pago FROM pagos WHERE id_inscripcion = $1 AND estado = 'pendiente'",
      [id_inscripcion]
    );
    if (pendiente.rows[0]) {
      return res.status(409).json({ ok: false, mensaje: 'Ya tienes un pago pendiente de validación para esta inscripción' });
    }

    const resultado = await pool.query(
      `INSERT INTO pagos (id_inscripcion, monto, metodo_pago, referencia, comprobante_url, estado)
       VALUES ($1, $2, $3, $4, $5, 'pendiente') RETURNING *`,
      [id_inscripcion, inscripcion.monto_total, metodo_pago, referencia?.trim() || null, comprobanteUrl]
    );
    res.status(201).json({ ok: true, pago: resultado.rows[0] });
  } catch (error) {
    console.error('Error al crear pago propio:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const descargarComprobantePropio = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT p.comprobante_url FROM pagos p
       JOIN inscripciones i ON i.id_inscripcion = p.id_inscripcion
       WHERE p.id_pago = $1 AND i.id_usuario = $2`,
      [req.params.id, req.admin.id_usuario]
    );
    const pago = resultado.rows[0];
    if (!pago) return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    if (!pago.comprobante_url) return res.status(404).json({ ok: false, mensaje: 'Este pago no tiene comprobante adjunto' });
    if (isRemoteFile(pago.comprobante_url)) return res.redirect(pago.comprobante_url);
    res.download(path.join(__dirname, '../..', pago.comprobante_url), path.basename(pago.comprobante_url));
  } catch (error) {
    console.error('Error al descargar comprobante propio:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const listarPagos = async (req, res) => {
  try {
    const { id_inscripcion } = req.query;
    const pagos = id_inscripcion
      ? await pagoModel.obtenerPagosPorInscripcion(id_inscripcion)
      : await pagoModel.obtenerPagos();
    res.json({ ok: true, pagos });
  } catch (error) {
    console.error('Error al listar pagos:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerPago = async (req, res) => {
  try {
    const { id } = req.params;
    const pago = await pagoModel.obtenerPagoPorId(id);
    if (!pago) {
      return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    }
    res.json({ ok: true, pago });
  } catch (error) {
    console.error('Error al obtener pago:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearPago = async (req, res) => {
  try {
    const { id_inscripcion, monto, metodo_pago, referencia, estado } = req.body;

    if (!id_inscripcion || !monto || !metodo_pago) {
      return res.status(400).json({ ok: false, mensaje: 'id_inscripcion, monto y metodo_pago son obligatorios' });
    }
    if (!METODOS_VALIDOS.includes(metodo_pago)) {
      return res.status(400).json({ ok: false, mensaje: `metodo_pago debe ser uno de: ${METODOS_VALIDOS.join(', ')}` });
    }
    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ ok: false, mensaje: `estado debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}` });
    }

    const nuevo = await pagoModel.crearPago({ id_inscripcion, monto, metodo_pago, referencia, estado });
    res.status(201).json({ ok: true, pago: nuevo });
  } catch (error) {
    console.error('Error al crear pago:', error);
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, mensaje: 'id_inscripcion no existe' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ ok: false, mensaje: 'monto debe ser mayor a 0' });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

const actualizarPago = async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, metodo_pago, referencia } = req.body;

    const existente = await pagoModel.obtenerPagoPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    }
    if (metodo_pago && !METODOS_VALIDOS.includes(metodo_pago)) {
      return res.status(400).json({ ok: false, mensaje: `metodo_pago debe ser uno de: ${METODOS_VALIDOS.join(', ')}` });
    }

    const actualizado = await pagoModel.actualizarPago(id, { monto, metodo_pago, referencia });
    res.json({ ok: true, pago: actualizado });
  } catch (error) {
    console.error('Error al actualizar pago:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// PATCH /api/pagos/:id/estado  { "estado": "completado" }
const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ ok: false, mensaje: `estado debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}` });
    }

    const existente = await pagoModel.obtenerPagoPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    }

    const actualizado = await pagoModel.actualizarEstadoPago(id, estado);
    res.json({ ok: true, pago: actualizado });
  } catch (error) {
    console.error('Error al cambiar estado del pago:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// GET /api/pagos/resumen/:id_inscripcion
const resumenPorInscripcion = async (req, res) => {
  try {
    const { id_inscripcion } = req.params;
    const resumen = await pagoModel.obtenerResumenPago(id_inscripcion);
    if (!resumen) {
      return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada' });
    }
    res.json({ ok: true, resumen });
  } catch (error) {
    console.error('Error al obtener resumen de pago:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  obtenerPagoPropio,
  crearPagoPropio,
  descargarComprobantePropio,
  listarPagos,
  obtenerPago,
  crearPago,
  actualizarPago,
  cambiarEstado,
  resumenPorInscripcion,
};
