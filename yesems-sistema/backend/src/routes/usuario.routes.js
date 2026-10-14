const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');
const verificarToken = require('../middlewares/auth.middleware');
const verificarAdministrador = require('../middlewares/admin.middleware');
const multer = require('multer');
const subirFoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }).single('foto');
router.param('id', require('../utils/http-error').validateIdParam);

// Públicas
// No permitir saltar la verificación usando el formulario/API anterior.
router.post('/registrar', (_req,res) => res.status(403).json({ok:false,mensaje:'Verifica tu correo desde el nuevo formulario de registro.',codigo:'VERIFICACION_REQUERIDA'}));
router.post('/login', async (req,res,next) => {
  try {
    const access = require('../services/acceso.service');
    await access.limit('password:' + access.digest(req.ip), 30, 900);
    next();
  } catch(error) {
    res.status(error.statusCode || 503).json({ok:false,mensaje:error.statusCode ? error.message : 'No fue posible iniciar sesión. Intenta más tarde.'});
  }
}, usuarioController.login);

// Protegidas
router.get('/mio', verificarToken, usuarioController.obtenerPerfilPropio);
router.put('/mio', verificarToken, usuarioController.actualizarPerfilPropio);
router.get('/mio/foto', verificarToken, usuarioController.obtenerFotoPropia);
router.put('/mio/foto', verificarToken, (req, res, next) => subirFoto(req, res, (error) => {
  if (error) return res.status(400).json({ ok: false, mensaje: error.code === 'LIMIT_FILE_SIZE' ? 'La foto no puede superar 2 MB.' : 'Selecciona una sola foto JPG, PNG o WebP.' });
  next();
}), usuarioController.guardarFotoPropia);
router.delete('/mio/foto', verificarToken, usuarioController.eliminarFotoPropia);
router.use(verificarAdministrador);
router.get('/', usuarioController.listarUsuarios);
router.get('/:id', usuarioController.obtenerUsuario);
router.put('/:id/ascender', usuarioController.ascenderAAlumno);
router.put('/:id', usuarioController.actualizarUsuario);
router.delete('/:id', usuarioController.eliminarUsuario);

module.exports = router;
