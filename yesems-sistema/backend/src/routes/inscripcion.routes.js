const express = require('express');
const router = express.Router();
const inscripcionController = require('../controllers/inscripcion.controller');
const verificarToken = require('../middlewares/auth.middleware');

router.use(verificarToken);

router.post('/mia', inscripcionController.crearInscripcionPropia);
router.get('/mias', inscripcionController.listarInscripcionesPropias);
router.get('/', inscripcionController.listarInscripciones);
router.get('/:id', inscripcionController.obtenerInscripcion);
router.post('/', inscripcionController.crearInscripcion);
router.put('/:id', inscripcionController.actualizarInscripcion);
router.delete('/:id', inscripcionController.cancelarInscripcion);

module.exports = router;
