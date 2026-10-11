const router = require('express').Router();
const model = require('../models/aula.model');
const validate = require('../utils/aula');
const { positiveId, httpError, sendError } = require('../utils/http-error');
const auth = require('../middlewares/auth.middleware');
const admin = require('../middlewares/admin.middleware');
const files = require('../services/aula-files.service');
const multer = require('multer');
const parsePdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, parts: 3, fieldSize: 1000 } }).single('archivo');
const wrap = fn => async (req, res) => {
  try { await fn(req, res); } catch (error) { sendError(res, error); }
};
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/mia/:inscripcion', auth, wrap(async (req, res) => {
  if (!['cliente', 'alumno'].includes(req.usuario.rol)) throw httpError(403, 'Se requiere una cuenta de alumno.');
  res.json({ ok: true, ...await model.obtenerAulaPropia(positiveId(req.params.inscripcion), req.usuario.id_usuario) });
}));
router.use('/admin', admin);
router.get('/mia/:inscripcion/documentos/:documento', auth, wrap(async (req, res) => {
  if (!['cliente', 'alumno'].includes(req.usuario.rol)) throw httpError(403, 'Se requiere una cuenta de alumno.');
  const doc = await model.documentoAlumno(positiveId(req.params.inscripcion), req.usuario.id_usuario, positiveId(req.params.documento));
  await files.descargar(res, doc);
}));
router.get('/admin/cursos/:curso/documentos/:documento', wrap(async (req, res) => {
  await files.descargar(res, await model.documentoAdmin(positiveId(req.params.curso), positiveId(req.params.documento)));
}));
router.post('/admin/cursos/:curso/modulos/:modulo/documentos', (req, res, next) => parsePdf(req, res, error => {
  if (error) return res.status(400).json({ ok: false, mensaje: 'Sube un solo PDF de hasta 5 MB, con título y revisión.' });
  next();
}), wrap(async (req, res) => {
  if (!/^\d+$/.test(req.body.revision || '')) throw httpError(400, 'Revisión inválida.');
  const buffer = files.validarPdf(req.file);
  const data = await model.agregarDocumento(positiveId(req.params.curso), positiveId(req.params.modulo), validate.revision(Number(req.body.revision)), validate.modulo(req.body).titulo, buffer, req.admin.id_administrador);
  res.status(201).json({ ok: true, ...data });
}));
router.put('/admin/cursos/:curso/documentos/:documento', (req, res, next) => parsePdf(req, res, error => {
  if (error) return res.status(400).json({ ok: false, mensaje: 'Sube un solo PDF de hasta 5 MB, con título y revisión.' });
  next();
}), wrap(async (req, res) => {
  if (!/^\d+$/.test(req.body.revision || '')) throw httpError(400, 'Revisión inválida.');
  const data = await model.reemplazarDocumento(positiveId(req.params.curso), positiveId(req.params.documento), validate.revision(Number(req.body.revision)), validate.modulo(req.body).titulo, files.validarPdf(req.file), req.admin.id_administrador);
  res.json({ ok: true, ...data });
}));
router.get('/admin/cursos/:curso/historial-pdf', wrap(async (req, res) => {
  res.json({ ok: true, documentos: await model.historialCurso(positiveId(req.params.curso)) });
}));
router.delete('/admin/cursos/:curso/documentos/:documento', wrap(async (req, res) => {
  res.json({ ok: true, ...await model.retirarDocumento(positiveId(req.params.curso), positiveId(req.params.documento), validate.revision(req.body?.revision)) });
}));
router.get('/admin/cursos', wrap(async (_req, res) => res.json({ ok: true, cursos: await model.listarCursos() })));
router.get('/admin/cursos/:curso', wrap(async (req, res) => res.json({ ok: true, ...await model.obtenerCurso(positiveId(req.params.curso)) })));
router.post('/admin/cursos/:curso/modulos', wrap(async (req, res) => {
  const data = await model.crearModulo(positiveId(req.params.curso), validate.revision(req.body?.revision), validate.modulo(req.body), req.admin.id_administrador);
  res.status(201).json({ ok: true, ...data });
}));
router.put('/admin/cursos/:curso/modulos/:modulo', wrap(async (req, res) => {
  const data = await model.editarModulo(positiveId(req.params.curso), positiveId(req.params.modulo), validate.revision(req.body?.revision), validate.modulo(req.body), req.admin.id_administrador);
  res.json({ ok: true, ...data });
}));
router.patch('/admin/cursos/:curso/modulos/:modulo/publicacion', wrap(async (req, res) => {
  if (typeof req.body?.publicado !== 'boolean') throw httpError(400, 'Indica si el módulo debe publicarse u ocultarse.');
  const data = await model.publicarModulo(positiveId(req.params.curso), positiveId(req.params.modulo), validate.revision(req.body.revision), req.body.publicado, req.admin.id_administrador);
  res.json({ ok: true, ...data });
}));
router.put('/admin/cursos/:curso/orden', wrap(async (req, res) => {
  const data = await model.ordenarModulos(positiveId(req.params.curso), validate.revision(req.body?.revision), validate.orden(req.body?.modulos), req.admin.id_administrador);
  res.json({ ok: true, ...data });
}));
module.exports = router;
