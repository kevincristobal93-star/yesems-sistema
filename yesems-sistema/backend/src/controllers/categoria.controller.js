const categoriaModel = require('../models/categoria.model');

const listarCategorias = async (req, res) => {
  try {
    const categorias = await categoriaModel.obtenerCategorias();
    res.json({ ok: true, categorias });
  } catch (error) {
    console.error('Error al listar categorías:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const categoria = await categoriaModel.obtenerCategoriaPorId(id);
    if (!categoria) {
      return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada' });
    }
    res.json({ ok: true, categoria });
  } catch (error) {
    console.error('Error al obtener categoría:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearCategoria = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) {
      return res.status(400).json({ ok: false, mensaje: 'El nombre es obligatorio' });
    }
    const nueva = await categoriaModel.crearCategoria({ nombre, descripcion });
    res.status(201).json({ ok: true, categoria: nueva });
  } catch (error) {
    console.error('Error al crear categoría:', error);
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe una categoría con ese nombre' });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

const actualizarCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;
    const existente = await categoriaModel.obtenerCategoriaPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada' });
    }
    const actualizada = await categoriaModel.actualizarCategoria(id, { nombre, descripcion });
    res.json({ ok: true, categoria: actualizada });
  } catch (error) {
    console.error('Error al actualizar categoría:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const eliminarCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const existente = await categoriaModel.obtenerCategoriaPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada' });
    }
    const desactivada = await categoriaModel.eliminarCategoria(id);
    res.json({ ok: true, mensaje: 'Categoría desactivada', categoria: desactivada });
  } catch (error) {
    console.error('Error al desactivar categoría:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  listarCategorias,
  obtenerCategoria,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
};