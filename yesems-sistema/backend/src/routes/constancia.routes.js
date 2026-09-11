const express = require('express');
const router = express.Router();
const constanciaController = require('../controllers/constancia.controller');
const verificarToken = require('../middlewares/auth.middleware');

router.use(verificarToken);

router.post('/mia', constanciaController.solicitarConstanciaPropia);
router.get('/mia/:id/descargar', constanciaController.descargarConstanciaPropia);
router.get('/', constanciaController.listarConstancias);
router.post('/', constanciaController.solicitarConstancia);
router.patch('/:id/autorizar', constanciaController.autorizarConstancia);
router.patch('/:id/rechazar', constanciaController.rechazarConstancia);
router.get('/:id/descargar', constanciaController.descargarConstancia);
router.get('/:id', constanciaController.obtenerConstancia);

module.exports = router;
