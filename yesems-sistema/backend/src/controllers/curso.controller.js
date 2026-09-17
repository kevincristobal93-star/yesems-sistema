const cursoModel = require('../models/curso.model');

// GET /api/cursos
const listarCursos = async (req, res) => {
  try {
    const cursos = await cursoModel.obtenerCursos();
    res.json({ ok: true, cursos });
  } catch (error) {
    console.error('Error al listar cursos:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// GET /api/cursos/:id
const obtenerCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const curso = await cursoModel.obtenerCursoPorId(id);
    if (!curso) {
      return res.status(404).json({ ok: false, mensaje: 'Curso no encontrado' });
    }
    res.json({ ok: true, curso });
  } catch (error) {
    console.error('Error al obtener curso:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// GET /api/cursos/:id/disponibilidades
// No expone enlaces internos; solo permite al alumno elegir la opción adecuada.
const listarDisponibilidadesPublicas = async (req, res) => {
  try {
    const curso = await cursoModel.obtenerCursoPorId(req.params.id);
    if (!curso || !curso.activo) {
      return res.status(404).json({ ok: false, mensaje: 'Curso no encontrado' });
    }
    const horarioModel = require('../models/horario.model');
    const horarios = await horarioModel.obtenerHorariosPorCurso(req.params.id);
    const disponibilidades = horarios.map(({ enlace, ...horario }) => horario);
    res.json({ ok: true, disponibilidades });
  } catch (error) {
    console.error('Error al listar disponibilidades públicas:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// POST /api/cursos
const crearCurso = async (req, res) => {
  try {
    const { id_categoria, nombre, descripcion, duracion_horas, precio, cupo } = req.body;

    if (!id_categoria || !nombre || !duracion_horas || !cupo) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan campos obligatorios' });
    }

    const nuevoCurso = await cursoModel.crearCurso({
      id_categoria, nombre, descripcion, duracion_horas, precio, cupo,
    });
    res.status(201).json({ ok: true, curso: nuevoCurso });
  } catch (error) {
    console.error('Error al crear curso:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// PUT /api/cursos/:id
const actualizarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_categoria, nombre, descripcion, duracion_horas, precio, cupo } = req.body;

    const cursoExistente = await cursoModel.obtenerCursoPorId(id);
    if (!cursoExistente) {
      return res.status(404).json({ ok: false, mensaje: 'Curso no encontrado' });
    }

    const cursoActualizado = await cursoModel.actualizarCurso(id, {
      id_categoria, nombre, descripcion, duracion_horas, precio, cupo,
    });
    res.json({ ok: true, curso: cursoActualizado });
  } catch (error) {
    console.error('Error al actualizar curso:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// DELETE /api/cursos/:id (baja lógica)
const eliminarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const cursoExistente = await cursoModel.obtenerCursoPorId(id);
    if (!cursoExistente) {
      return res.status(404).json({ ok: false, mensaje: 'Curso no encontrado' });
    }

    const cursoDesactivado = await cursoModel.eliminarCurso(id);
    res.json({ ok: true, mensaje: 'Curso desactivado', curso: cursoDesactivado });
  } catch (error) {
    console.error('Error al desactivar curso:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  listarCursos,
  obtenerCurso,
  listarDisponibilidadesPublicas,
  crearCurso,
  actualizarCurso,
  eliminarCurso,
};
