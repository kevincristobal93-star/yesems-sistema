const express = require('express');
const router = express.Router();
const cursoController = require('../controllers/curso.controller');
const verificarAdministrador = require('../middlewares/admin.middleware');

// Catálogo público: permite mostrar los cursos antes del registro.
router.get('/', cursoController.listarCursos);
router.get('/:id/disponibilidades', cursoController.listarDisponibilidadesPublicas);
router.get('/:id', cursoController.obtenerCurso);

// Operaciones de administración: requieren sesión autenticada.
router.use(verificarAdministrador);
router.post('/', cursoController.crearCurso);
router.put('/:id', cursoController.actualizarCurso);
router.delete('/:id', cursoController.eliminarCurso);

module.exports = router;
