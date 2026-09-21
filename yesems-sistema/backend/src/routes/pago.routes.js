const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pago.controller');
const verificarToken = require('../middlewares/auth.middleware');
const uploadPaymentReceipt = require('../middlewares/payment-upload.middleware');

router.use(verificarToken);

router.get('/mio/:id_inscripcion', pagoController.obtenerPagoPropio);
router.get('/mio/:id/comprobante', pagoController.descargarComprobantePropio);
router.post('/mio', uploadPaymentReceipt, pagoController.crearPagoPropio);
router.get('/', pagoController.listarPagos);
router.get('/resumen/:id_inscripcion', pagoController.resumenPorInscripcion);
router.get('/:id', pagoController.obtenerPago);
router.post('/', pagoController.crearPago);
router.put('/:id', pagoController.actualizarPago);
router.patch('/:id/estado', pagoController.cambiarEstado);

module.exports = router;
