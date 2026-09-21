const express = require('express');
const router = express.Router();
const constanciaController = require('../controllers/constancia.controller');
const verificarToken = require('../middlewares/auth.middleware');
const verificarAdministrador = require('../middlewares/admin.middleware');

router.post('/mia', verificarToken, constanciaController.solicitarConstanciaPropia);
router.get('/mia/:id/descargar', verificarToken, constanciaController.descargarConstanciaPropia);

router.use(verificarAdministrador);
router.get('/', constanciaController.listarConstancias);
router.post('/', constanciaController.solicitarConstancia);
router.patch('/:id/autorizar', constanciaController.autorizarConstancia);
router.patch('/:id/rechazar', constanciaController.rechazarConstancia);
router.get('/:id/descargar', constanciaController.descargarConstancia);
router.get('/:id', constanciaController.obtenerConstancia);

module.exports = router;
