const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');
const verificarToken = require('../middlewares/auth.middleware');

// Públicas
router.post('/registrar', usuarioController.registrarCliente);
router.post('/login', usuarioController.login);

// Protegidas
router.get('/', verificarToken, usuarioController.listarUsuarios);
router.get('/:id', verificarToken, usuarioController.obtenerUsuario);
router.put('/:id/ascender', verificarToken, usuarioController.ascenderAAlumno);
router.put('/:id', verificarToken, usuarioController.actualizarUsuario);
router.delete('/:id', verificarToken, usuarioController.eliminarUsuario);

module.exports = router;