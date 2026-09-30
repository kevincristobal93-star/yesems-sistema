const express = require('express');
const controller = require('../controllers/seguimiento.controller');
const verificarToken = require('../middlewares/auth.middleware');
const verificarAdministrador = require('../middlewares/admin.middleware');

const router = express.Router();

router.get('/mio/:id', verificarToken, controller.obtenerPropio);

router.use(verificarAdministrador);
router.get('/cursos', controller.listarCursos);
router.get('/cursos/:id', controller.obtenerCurso);
router.patch('/cursos/:id/regla', controller.actualizarRegla);
router.post('/cursos/:id/actividades', controller.crearActividad);
router.put('/actividades/:id', controller.editarActividad);
router.delete('/actividades/:id', controller.eliminarActividad);
router.post('/cursos/:id/publicar', controller.publicarPlan);
router.post('/cursos/:id/reabrir', controller.reabrirPlan);
router.get('/inscripciones/:id', controller.obtenerInscripcion);
router.put('/inscripciones/:id/actividades/:actividad', controller.registrarCumplimiento);
router.post('/inscripciones/:id/concluir', controller.concluirInscripcion);

module.exports = router;
