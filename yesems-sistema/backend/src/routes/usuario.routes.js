const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');
const verificarToken = require('../middlewares/auth.middleware');
const verificarAdministrador = require('../middlewares/admin.middleware');
router.param('id', require('../utils/http-error').validateIdParam);

// Públicas
router.post('/registrar', usuarioController.registrarCliente);
router.post('/login', usuarioController.login);

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
