const express = require('express');
const router = express.Router();
const cursoController = require('../controllers/curso.controller');
const verificarAdministrador = require('../middlewares/admin.middleware');
const galeria = require('../models/curso-galeria.model');
const files = require('../services/aula-files.service');
const { positiveId, httpError, sendError } = require('../utils/http-error');
const multer = require('multer');
const imagen = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2 } }).single('archivo');
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { sendError(res, error); } };

// Catálogo público: permite mostrar los cursos antes del registro.
router.get('/', cursoController.listarCursos);
router.get('/:id/imagenes/:imagen', wrap(async (req, res) => {
  const doc = await galeria.obtenerPublica(positiveId(req.params.id), positiveId(req.params.imagen));
  await files.descargar(res, doc, { inline: true });
}));
router.get('/:id/disponibilidades', cursoController.listarDisponibilidadesPublicas);
router.get('/:id', cursoController.obtenerCurso);

// Operaciones de administración: requieren sesión autenticada.
router.use(verificarAdministrador);
router.post('/:id/imagenes', (req, res, next) => imagen(req, res, error => {
  if (error) return res.status(400).json({ ok: false, mensaje: 'Selecciona una imagen JPG, PNG o WebP de hasta 5 MB.' });
  next();
}), wrap(async (req, res) => {
  const titulo = String(req.body?.titulo || '').trim();
  if (!titulo || titulo.length > 150) throw httpError(400, 'Escribe un título de hasta 150 caracteres.');
  const { buffer, extension } = files.validarDocumento(req.file);
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension)) throw httpError(400, 'La galería pública solo acepta JPG, PNG y WebP.');
  res.status(201).json({ ok: true, imagenes: await galeria.agregar(positiveId(req.params.id), titulo, buffer, extension, req.admin.id_administrador) });
}));
router.delete('/:id/imagenes/:imagen', wrap(async (req, res) => {
  res.json({ ok: true, imagenes: await galeria.ocultar(positiveId(req.params.id), positiveId(req.params.imagen)) });
}));
router.post('/', cursoController.crearCurso);
router.put('/:id', cursoController.actualizarCurso);
router.delete('/:id', cursoController.eliminarCurso);

module.exports = router;
