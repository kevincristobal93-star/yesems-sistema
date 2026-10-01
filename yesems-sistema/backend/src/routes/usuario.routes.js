const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');
const verificarToken = require('../middlewares/auth.middleware');
const verificarAdministrador = require('../middlewares/admin.middleware');
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
router.use(verificarAdministrador);
router.get('/', usuarioController.listarUsuarios);
router.get('/:id', usuarioController.obtenerUsuario);
router.put('/:id/ascender', usuarioController.ascenderAAlumno);
router.put('/:id', usuarioController.actualizarUsuario);
router.delete('/:id', usuarioController.eliminarUsuario);

module.exports = router;
