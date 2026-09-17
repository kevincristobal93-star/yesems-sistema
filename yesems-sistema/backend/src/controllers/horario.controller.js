const horarioModel = require('../models/horario.model');

const MODALIDADES_VALIDAS = ['en_linea', 'presencial', 'hibrida', 'por_definir'];

function datosDisponibilidad(body) {
  const { id_curso, modalidad, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin, enlace, notas, informacion_adicional } = body;
  return {
    id_curso,
    modalidad,
    dia_semana: dia_semana || null,
    hora_inicio: hora_inicio || null,
    hora_fin: hora_fin || null,
    fecha_inicio: fecha_inicio || null,
    fecha_fin: fecha_fin || null,
    enlace: enlace || null,
    notas: notas || null,
    informacion_adicional: informacion_adicional || null,
  };
}

function validarDisponibilidad(datos) {
  if (!datos.id_curso || !datos.modalidad) return 'Curso y modalidad son obligatorios';
  if (!MODALIDADES_VALIDAS.includes(datos.modalidad)) return 'La modalidad seleccionada no es válida';
  if ((datos.hora_inicio && !datos.hora_fin) || (!datos.hora_inicio && datos.hora_fin)) {
    return 'Indica ambas horas o deja el horario por confirmar';
  }
  return null;
}

const listarHorarios = async (req, res) => {
  try {
    const { id_curso } = req.query;
    const horarios = id_curso ? await horarioModel.obtenerHorariosPorCurso(id_curso) : await horarioModel.obtenerHorarios();
    res.json({ ok: true, horarios });
  } catch (error) {
    console.error('Error al listar disponibilidades:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerHorario = async (req, res) => {
  try {
    const horario = await horarioModel.obtenerHorarioPorId(req.params.id);
    if (!horario) return res.status(404).json({ ok: false, mensaje: 'Disponibilidad no encontrada' });
    res.json({ ok: true, horario });
  } catch (error) {
    console.error('Error al obtener disponibilidad:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearHorario = async (req, res) => {
  try {
    const datos = datosDisponibilidad(req.body);
    const errorValidacion = validarDisponibilidad(datos);
    if (errorValidacion) return res.status(400).json({ ok: false, mensaje: errorValidacion });
    const nuevo = await horarioModel.crearHorario(datos);
    res.status(201).json({ ok: true, horario: nuevo });
  } catch (error) {
    console.error('Error al crear disponibilidad:', error);
    if (error.code === '23503') return res.status(400).json({ ok: false, mensaje: 'El curso seleccionado no existe' });
    if (error.code === '23514') return res.status(400).json({ ok: false, mensaje: 'Revisa que las fechas y horas sean válidas' });
    res.status(500).json({ ok: false, error: error.message });
  }
};

const actualizarHorario = async (req, res) => {
  try {
    const existente = await horarioModel.obtenerHorarioPorId(req.params.id);
    if (!existente) return res.status(404).json({ ok: false, mensaje: 'Disponibilidad no encontrada' });
    const datos = datosDisponibilidad(req.body);
    const errorValidacion = validarDisponibilidad(datos);
    if (errorValidacion) return res.status(400).json({ ok: false, mensaje: errorValidacion });
    const actualizado = await horarioModel.actualizarHorario(req.params.id, datos);
    res.json({ ok: true, horario: actualizado });
  } catch (error) {
    console.error('Error al actualizar disponibilidad:', error);
    if (error.code === '23514') return res.status(400).json({ ok: false, mensaje: 'Revisa que las fechas y horas sean válidas' });
    res.status(500).json({ ok: false, error: error.message });
  }
};

const eliminarHorario = async (req, res) => {
  try {
    const existente = await horarioModel.obtenerHorarioPorId(req.params.id);
    if (!existente) return res.status(404).json({ ok: false, mensaje: 'Disponibilidad no encontrada' });
    await horarioModel.eliminarHorario(req.params.id);
    res.json({ ok: true, mensaje: 'Disponibilidad eliminada' });
  } catch (error) {
    console.error('Error al eliminar disponibilidad:', error);
    if (error.code === '23503') return res.status(409).json({ ok: false, mensaje: 'No se puede eliminar porque hay inscripciones asociadas' });
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = { listarHorarios, obtenerHorario, crearHorario, actualizarHorario, eliminarHorario };
