const express = require('express');
const router = express.Router();
const adminController = require('../controllers/administrador.controller');
const verificarAdministrador = require('../middlewares/admin.middleware');

// Rutas públicas (no requieren token)
router.post('/login', adminController.login);
router.post('/registrar', verificarAdministrador, adminController.registrarAdmin);
router.get('/resumen', verificarAdministrador, adminController.obtenerResumen);
router.get('/reportes', verificarAdministrador, adminController.obtenerReportes);
router.get('/pagos-pendientes', verificarAdministrador, adminController.listarPagosPendientes);
router.get('/pagos/:id/comprobante', verificarAdministrador, adminController.descargarComprobantePago);
router.patch('/pagos/:id/validar', verificarAdministrador, adminController.validarPago);
router.patch('/inscripciones/:id/cancelar', verificarAdministrador, adminController.cancelarInscripcionAdmin);

// Rutas protegidas (requieren token)
router.get('/', verificarAdministrador, adminController.listarAdministradores);
router.delete('/:id', verificarAdministrador, adminController.desactivarAdmin);

module.exports = router;
