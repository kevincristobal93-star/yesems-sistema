const modalidadModel = require('../models/modalidad.model');

const listarModalidades = async (req, res) => {
  try {
    const modalidades = await modalidadModel.obtenerModalidades();
    res.json({ ok: true, modalidades });
  } catch (error) {
    console.error('Error al listar modalidades:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerModalidad = async (req, res) => {
  try {
    const { id } = req.params;
    const modalidad = await modalidadModel.obtenerModalidadPorId(id);
    if (!modalidad) {
      return res.status(404).json({ ok: false, mensaje: 'Modalidad no encontrada' });
    }
    res.json({ ok: true, modalidad });
  } catch (error) {
    console.error('Error al obtener modalidad:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearModalidad = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) {
      return res.status(400).json({ ok: false, mensaje: 'El nombre es obligatorio' });
    }
    const nueva = await modalidadModel.crearModalidad({ nombre, descripcion });
    res.status(201).json({ ok: true, modalidad: nueva });
  } catch (error) {
    console.error('Error al crear modalidad:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const actualizarModalidad = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;
    const existente = await modalidadModel.obtenerModalidadPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Modalidad no encontrada' });
    }
    const actualizada = await modalidadModel.actualizarModalidad(id, { nombre, descripcion });
    res.json({ ok: true, modalidad: actualizada });
  } catch (error) {
    console.error('Error al actualizar modalidad:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const eliminarModalidad = async (req, res) => {
  try {
    const { id } = req.params;
    const existente = await modalidadModel.obtenerModalidadPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Modalidad no encontrada' });
    }
    const desactivada = await modalidadModel.eliminarModalidad(id);
    res.json({ ok: true, mensaje: 'Modalidad desactivada', modalidad: desactivada });
  } catch (error) {
    console.error('Error al desactivar modalidad:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  listarModalidades,
  obtenerModalidad,
  crearModalidad,
  actualizarModalidad,
  eliminarModalidad,
};