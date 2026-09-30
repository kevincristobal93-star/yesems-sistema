const model = require('../models/seguimiento.model');

const TIPOS = ['sesion', 'actividad'];
const MODALIDADES = ['presencial', 'en_linea', 'hibrida', 'por_definir'];

function invalid(message = 'ID inválido') {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function parseId(value) {
  if (!/^\d+$/.test(String(value))) throw invalid();
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw invalid();
  return id;
}

function actividadPayload(body = {}) {
  const { titulo, tipo, modalidad, fecha } = body;
  if (typeof titulo !== 'string' || !titulo.trim() || titulo.trim().length > 180) {
    throw invalid('El título es obligatorio y debe tener hasta 180 caracteres.');
  }
  if (!TIPOS.includes(tipo)) throw invalid('Tipo inválido: usa sesion o actividad.');
  if (!MODALIDADES.includes(modalidad)) throw invalid('Modalidad inválida.');
  let date = null;
  if (fecha !== undefined && fecha !== null && fecha !== '') {
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw invalid('Fecha inválida. Usa AAAA-MM-DD.');
    const parsed = new Date(`${fecha}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha || fecha < '1900-01-01') {
      throw invalid('Fecha inválida.');
    }
    date = fecha;
  }
  return { titulo: titulo.trim(), tipo, modalidad, fecha: date };
}

function handle(action) {
  return async (req, res) => {
    try {
      await action(req, res);
    } catch (error) {
      console.error(error);
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.statusCode ? error.message : 'No fue posible procesar el seguimiento del curso.',
      });
    }
  };
}

const listarCursos = handle(async (_req, res) => {
  return res.json({ ok: true, cursos: await model.listarCursos() });
});

const obtenerCurso = handle(async (req, res) => {
  const datos = await model.obtenerCurso(parseId(req.params.id));
  if (!datos) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });
  return res.json({ ok: true, ...datos });
});

const actualizarRegla = handle(async (req, res) => {
  const id = parseId(req.params.id);
  const porcentaje = req.body?.porcentaje_minimo;
  if (!Number.isInteger(porcentaje) || porcentaje < 1 || porcentaje > 100) {
    throw invalid('El porcentaje mínimo debe ser un entero entre 1 y 100.');
  }
  await model.actualizarRegla(id, porcentaje);
  return res.json({ ok: true });
});

const crearActividad = handle(async (req, res) => {
  const actividad = await model.crearActividad(parseId(req.params.id), actividadPayload(req.body));
  return res.status(201).json({ ok: true, actividad });
});

const editarActividad = handle(async (req, res) => {
  const actividad = await model.modificarActividad(parseId(req.params.id), actividadPayload(req.body));
  return res.json({ ok: true, actividad });
});

const eliminarActividad = handle(async (req, res) => {
  await model.modificarActividad(parseId(req.params.id), null);
  return res.json({ ok: true });
});

const publicarPlan = handle(async (req, res) => {
  await model.publicarPlan(parseId(req.params.id));
  return res.json({ ok: true });
});

const reabrirPlan = handle(async (req, res) => {
  await model.reabrirPlan(parseId(req.params.id));
  return res.json({ ok: true });
});

const obtenerInscripcion = handle(async (req, res) => {
  const progreso = await model.obtenerProgreso(parseId(req.params.id));
  if (!progreso) return res.status(404).json({ ok: false, error: 'Inscripción no encontrada' });
  return res.json({ ok: true, progreso });
});

const obtenerPropio = handle(async (req, res) => {
  const id = parseId(req.params.id);
  if (!req.admin?.id_usuario || req.admin.id_administrador) {
    return res.status(403).json({ ok: false, error: 'Acceso exclusivo para alumnos' });
  }
  const progreso = await model.obtenerProgresoPropio(id, Number(req.admin.id_usuario));
  if (!progreso) return res.status(404).json({ ok: false, error: 'Inscripción no encontrada' });
  return res.json({ ok: true, progreso });
});

const registrarCumplimiento = handle(async (req, res) => {
  const id = parseId(req.params.id);
  const actividad = parseId(req.params.actividad);
  const { cumplida, observaciones } = req.body || {};
  if (typeof cumplida !== 'boolean') throw invalid('cumplida debe ser true o false.');
  if (observaciones !== undefined && observaciones !== null &&
      (typeof observaciones !== 'string' || observaciones.trim().length > 1000)) {
    throw invalid('Las observaciones deben tener hasta 1000 caracteres.');
  }
  const progreso = await model.registrarCumplimiento(id, actividad, {
    cumplida, observaciones: typeof observaciones === 'string' ? observaciones.trim() || null : null,
  }, Number(req.admin.id_administrador));
  return res.json({ ok: true, progreso });
});

const concluirInscripcion = handle(async (req, res) => {
  const progreso = await model.concluirInscripcion(parseId(req.params.id), Number(req.admin.id_administrador));
  return res.json({ ok: true, progreso });
});

module.exports = {
  listarCursos, obtenerCurso, actualizarRegla, crearActividad, editarActividad, eliminarActividad,
  publicarPlan, reabrirPlan, obtenerInscripcion, obtenerPropio, registrarCumplimiento, concluirInscripcion,
};
