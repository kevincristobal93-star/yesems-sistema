const express = require('express');
const router = express.Router();
const horarioController = require('../controllers/horario.controller');
const verificarAdministrador = require('../middlewares/admin.middleware');

router.use(verificarAdministrador);

router.get('/', horarioController.listarHorarios);
router.get('/:id', horarioController.obtenerHorario);
router.post('/', horarioController.crearHorario);
router.put('/:id', horarioController.actualizarHorario);
router.delete('/:id', horarioController.eliminarHorario);

module.exports = router;
