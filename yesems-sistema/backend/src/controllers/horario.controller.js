const horarioModel = require('../models/horario.model');

const DIAS_VALIDOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const listarHorarios = async (req, res) => {
  try {
    const { id_curso } = req.query;
    const horarios = id_curso
      ? await horarioModel.obtenerHorariosPorCurso(id_curso)
      : await horarioModel.obtenerHorarios();
    res.json({ ok: true, horarios });
  } catch (error) {
    console.error('Error al listar horarios:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerHorario = async (req, res) => {
  try {
    const { id } = req.params;
    const horario = await horarioModel.obtenerHorarioPorId(id);
    if (!horario) {
      return res.status(404).json({ ok: false, mensaje: 'Horario no encontrado' });
    }
    res.json({ ok: true, horario });
  } catch (error) {
    console.error('Error al obtener horario:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearHorario = async (req, res) => {
  try {
    const { id_curso, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, aula } = req.body;

    if (!id_curso || !dia_semana || !hora_inicio || !hora_fin) {
      return res.status(400).json({ ok: false, mensaje: 'id_curso, dia_semana, hora_inicio y hora_fin son obligatorios' });
    }

    const nuevo = await horarioModel.crearHorario({ id_curso, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, aula });
    res.status(201).json({ ok: true, horario: nuevo });
  } catch (error) {
    console.error('Error al crear horario:', error);
    if (error.code === '23503') {
      return res.status(400).json({ ok: false, mensaje: 'id_curso no existe' });
    }
    if (error.code === '23514') {
      return res.status(400).json({ ok: false, mensaje: 'hora_fin debe ser mayor a hora_inicio, o fecha_fin >= fecha_inicio' });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

const actualizarHorario = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_curso, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, aula } = req.body;

    const existente = await horarioModel.obtenerHorarioPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Horario no encontrado' });
    }

    const actualizado = await horarioModel.actualizarHorario(id, { id_curso, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, aula });
    res.json({ ok: true, horario: actualizado });
  } catch (error) {
    console.error('Error al actualizar horario:', error);
    if (error.code === '23514') {
      return res.status(400).json({ ok: false, mensaje: 'hora_fin debe ser mayor a hora_inicio, o fecha_fin >= fecha_inicio' });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

const eliminarHorario = async (req, res) => {
  try {
    const { id } = req.params;
    const existente = await horarioModel.obtenerHorarioPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Horario no encontrado' });
    }

    await horarioModel.eliminarHorario(id);
    res.json({ ok: true, mensaje: 'Horario eliminado' });
  } catch (error) {
    console.error('Error al eliminar horario:', error);
    if (error.code === '23503') {
      return res.status(409).json({ ok: false, mensaje: 'No se puede eliminar: hay inscripciones usando este horario' });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  listarHorarios,
  obtenerHorario,
  crearHorario,
  actualizarHorario,
  eliminarHorario,
};