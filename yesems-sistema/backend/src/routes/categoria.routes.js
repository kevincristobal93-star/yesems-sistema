const express = require('express');
const router = express.Router();
const categoriaController = require('../controllers/categoria.controller');
const verificarToken = require('../middlewares/auth.middleware');

router.use(verificarToken);

router.get('/', categoriaController.listarCategorias);
router.get('/:id', categoriaController.obtenerCategoria);
router.post('/', categoriaController.crearCategoria);
router.put('/:id', categoriaController.actualizarCategoria);
router.delete('/:id', categoriaController.eliminarCategoria);

module.exports = router;