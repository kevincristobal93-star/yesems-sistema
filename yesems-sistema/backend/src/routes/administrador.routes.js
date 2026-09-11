const express = require('express');
const router = express.Router();
const adminController = require('../controllers/administrador.controller');
const verificarToken = require('../middlewares/auth.middleware');
const verificarAdministrador = require('../middlewares/admin.middleware');

// Rutas públicas (no requieren token)
router.post('/registrar', adminController.registrarAdmin);
router.post('/login', adminController.login);
router.get('/resumen', verificarAdministrador, adminController.obtenerResumen);
router.get('/pagos-pendientes', verificarAdministrador, adminController.listarPagosPendientes);
router.patch('/pagos/:id/validar', verificarAdministrador, adminController.validarPago);
router.patch('/inscripciones/:id/cancelar', verificarAdministrador, adminController.cancelarInscripcionAdmin);

// Rutas protegidas (requieren token)
router.get('/', verificarToken, adminController.listarAdministradores);
router.delete('/:id', verificarToken, adminController.desactivarAdmin);

module.exports = router;
