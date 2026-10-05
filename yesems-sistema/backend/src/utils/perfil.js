const { httpError } = require('./http-error');
const { normalizarCurp } = require('./identidad');

function validarPerfil(datos) {
  const perfil = {};
  for (const key of ['nombre', 'apellido']) {
    if (typeof datos[key] !== 'string' || !datos[key].trim() || datos[key].trim().length > 100) throw httpError(400, 'Completa nombre y apellidos (máximo 100 caracteres cada uno).');
    perfil[key] = datos[key].trim();
  }
  if (datos.telefono !== undefined) {
    if (typeof datos.telefono !== 'string' && datos.telefono !== null) throw httpError(400, 'Teléfono inválido.');
    perfil.telefono = (datos.telefono || '').replace(/[\s()-]/g, '') || null;
    if (perfil.telefono && !/^\+?[0-9]{10,15}$/.test(perfil.telefono)) throw httpError(400, 'El teléfono debe contener entre 10 y 15 dígitos.');
  }
  if (datos.fecha_nacimiento !== undefined) {
    const fecha = datos.fecha_nacimiento;
    if (fecha !== null && fecha !== '') {
      const date = new Date(typeof fecha === 'string' ? fecha : NaN);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== fecha || date > new Date()) throw httpError(400, 'Fecha de nacimiento inválida.');
    }
    perfil.fecha_nacimiento = fecha || null;
  }
  if (datos.curp !== undefined) perfil.curp = datos.curp === '' || datos.curp === null ? null : normalizarCurp(datos.curp);
  return perfil;
}
module.exports = { validarPerfil };
