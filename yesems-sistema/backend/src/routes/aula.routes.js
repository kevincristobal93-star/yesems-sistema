const router = require('express').Router();
const model = require('../models/aula.model');
const validate = require('../utils/aula');
const { positiveId, httpError, sendError } = require('../utils/http-error');
const auth = require('../middlewares/auth.middleware');
const admin = require('../middlewares/admin.middleware');
const files = require('../services/aula-files.service');
const multer = require('multer');
const parseDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, parts: 6, fieldSize: 2000 } }).single('archivo');
const wrap = fn => async (req, res) => {
  try { await fn(req, res); } catch (error) { sendError(res, error); }
};
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/mia/:inscripcion', auth, wrap(async (req, res) => {
  if (!['cliente', 'alumno'].includes(req.usuario.rol)) throw httpError(403, 'Se requiere una cuenta de alumno.');
  res.json({ ok: true, ...await model.obtenerAulaPropia(positiveId(req.params.inscripcion), req.usuario.id_usuario) });
}));
router.patch('/mia/:inscripcion/modulos/:modulo/progreso', auth, wrap(async (req, res) => {
  if (!['cliente', 'alumno'].includes(req.usuario.rol)) throw httpError(403, 'Se requiere una cuenta de alumno.');
  if (typeof req.body?.completado !== 'boolean') throw httpError(400, 'Indica si el modulo esta completado.');
  const data = await model.actualizarProgreso(positiveId(req.params.inscripcion), req.usuario.id_usuario, positiveId(req.params.modulo), req.body.completado);
  res.json({ ok: true, ...data });
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
router.post('/admin/cursos/:curso/modulos/:modulo/documentos', (req, res, next) => parseDocument(req, res, error => {
  if (error) return res.status(400).json({ ok: false, mensaje: 'Sube un solo documento de hasta 5 MB, con título y revisión.' });
  next();
}), wrap(async (req, res) => {
  if (!/^\d+$/.test(req.body.revision || '')) throw httpError(400, 'Revisión inválida.');
  const { buffer, extension } = files.validarDocumento(req.file);
  const document = validate.documento(req.body);
  const tipo = !req.body.tipo_material ? (extension === 'pdf' ? 'pdf' : ['jpg','jpeg','png','webp'].includes(extension) ? 'imagen' : 'documento') : document.tipo;
  const data = await model.agregarDocumento(positiveId(req.params.curso), positiveId(req.params.modulo), validate.revision(Number(req.body.revision)), document.titulo, document.descripcion, buffer, req.admin.id_administrador, extension, tipo, document.principal);
  res.status(201).json({ ok: true, ...data });
}));
router.put('/admin/cursos/:curso/documentos/:documento', (req, res, next) => parseDocument(req, res, error => {
  if (error) return res.status(400).json({ ok: false, mensaje: 'Sube un solo documento de hasta 5 MB, con título y revisión.' });
  next();
}), wrap(async (req, res) => {
  if (!/^\d+$/.test(req.body.revision || '')) throw httpError(400, 'Revisión inválida.');
  const document = validate.documento(req.body);
  const { buffer, extension } = files.validarDocumento(req.file);
  const tipo = !req.body.tipo_material ? (extension === 'pdf' ? 'pdf' : ['jpg','jpeg','png','webp'].includes(extension) ? 'imagen' : 'documento') : document.tipo;
  const data = await model.reemplazarDocumento(positiveId(req.params.curso), positiveId(req.params.documento), validate.revision(Number(req.body.revision)), document.titulo, document.descripcion, buffer, req.admin.id_administrador, extension, tipo, document.principal);
  res.json({ ok: true, ...data });
}));
router.get('/admin/cursos/:curso/historial-pdf', wrap(async (req, res) => {
  res.json({ ok: true, documentos: await model.historialCurso(positiveId(req.params.curso)) });
}));
router.delete('/admin/cursos/:curso/documentos/:documento', wrap(async (req, res) => {
  res.json({ ok: true, ...await model.retirarDocumento(positiveId(req.params.curso), positiveId(req.params.documento), validate.revision(req.body?.revision), req.admin.id_administrador) });
}));
router.patch('/admin/cursos/:curso/documentos/:documento/organizacion', wrap(async (req, res) => {
  const data = await model.organizarDocumento(positiveId(req.params.curso), positiveId(req.params.documento), validate.revision(req.body?.revision), validate.documento(req.body));
  res.json({ ok: true, ...data });
}));
router.put('/admin/cursos/:curso/modulos/:modulo/orden-documentos', wrap(async (req, res) => {
  const data = await model.ordenarDocumentos(positiveId(req.params.curso), positiveId(req.params.modulo), validate.revision(req.body?.revision), validate.ordenDocumentos(req.body?.documentos));
  res.json({ ok: true, ...data });
}));
router.post('/admin/cursos/:curso/modulos/:modulo/videos', wrap(async (req, res) => {
  const data = await model.agregarVideo(positiveId(req.params.curso), positiveId(req.params.modulo), validate.revision(req.body?.revision), validate.video(req.body), req.admin.id_administrador);
  res.status(201).json({ ok: true, ...data });
}));
router.put('/admin/cursos/:curso/videos/:video', wrap(async (req, res) => {
  const data = await model.editarVideo(positiveId(req.params.curso), positiveId(req.params.video), validate.revision(req.body?.revision), validate.video(req.body));
  res.json({ ok: true, ...data });
}));
router.delete('/admin/cursos/:curso/videos/:video', wrap(async (req, res) => {
  const data = await model.retirarVideo(positiveId(req.params.curso), positiveId(req.params.video), validate.revision(req.body?.revision));
  res.json({ ok: true, ...data });
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
router.patch('/admin/cursos/:curso/modulos/:modulo/archivo', wrap(async (req, res) => {
  if (typeof req.body?.archivado !== 'boolean') throw httpError(400, 'Indica si el modulo debe archivarse o restaurarse.');
  const data = await model.archivarModulo(positiveId(req.params.curso), positiveId(req.params.modulo), validate.revision(req.body.revision), req.body.archivado, req.admin.id_administrador);
  res.json({ ok: true, ...data });
}));
router.delete('/admin/cursos/:curso/modulos/:modulo', wrap(async (req, res) => {
  if (typeof req.body?.titulo_confirmado !== 'string' || !req.body.titulo_confirmado) throw httpError(400, 'Escribe el título del módulo para confirmar.');
  const data = await model.eliminarModulo(positiveId(req.params.curso), positiveId(req.params.modulo), validate.revision(req.body.revision), req.body.titulo_confirmado);
  res.json({ ok: true, ...data });
}));
router.put('/admin/cursos/:curso/orden', wrap(async (req, res) => {
  const data = await model.ordenarModulos(positiveId(req.params.curso), validate.revision(req.body?.revision), validate.orden(req.body?.modulos), req.admin.id_administrador);
  res.json({ ok: true, ...data });
}));
module.exports = router;
