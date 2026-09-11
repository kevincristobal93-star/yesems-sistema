const express = require('express');
const router = express.Router();
const horarioController = require('../controllers/horario.controller');
const verificarToken = require('../middlewares/auth.middleware');

router.use(verificarToken);

router.get('/', horarioController.listarHorarios);
router.get('/:id', horarioController.obtenerHorario);
router.post('/', horarioController.crearHorario);
router.put('/:id', horarioController.actualizarHorario);
router.delete('/:id', horarioController.eliminarHorario);

module.exports = router;