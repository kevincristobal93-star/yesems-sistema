const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pago.controller');
const verificarToken = require('../middlewares/auth.middleware');
const verificarAdministrador = require('../middlewares/admin.middleware');
const uploadPaymentReceipt = require('../middlewares/payment-upload.middleware');
const { validateIdParam } = require('../utils/http-error');
router.param('id', validateIdParam);
router.param('id_inscripcion', validateIdParam);

router.post('/mercado-pago/webhook', pagoController.webhookMercadoPago);
router.get('/mio/:id_inscripcion', verificarToken, pagoController.obtenerPagoPropio);
router.get('/mio/:id/comprobante', verificarToken, pagoController.descargarComprobantePropio);
router.post('/mio/mercado-pago', verificarToken, pagoController.crearCheckoutMercadoPago);
router.post('/mio', verificarToken, uploadPaymentReceipt, pagoController.crearPagoPropio);
router.use(verificarAdministrador);
router.get('/', pagoController.listarPagos);
router.get('/resumen/:id_inscripcion', pagoController.resumenPorInscripcion);
router.get('/:id', pagoController.obtenerPago);
router.post('/', pagoController.crearPago);
router.put('/:id', pagoController.actualizarPago);
router.patch('/:id/estado', pagoController.cambiarEstado);

module.exports = router;
