const express = require('express');
const router = express.Router();
const modalidadController = require('../controllers/modalidad.controller');

router.get('/', modalidadController.listarModalidades);
router.get('/:id', modalidadController.obtenerModalidad);
router.post('/', modalidadController.crearModalidad);
router.put('/:id', modalidadController.actualizarModalidad);
router.delete('/:id', modalidadController.eliminarModalidad);

module.exports = router;