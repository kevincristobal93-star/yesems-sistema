const { httpError, positiveId } = require('./http-error');

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2147483647) {
    throw httpError(400, 'Falta una revisión válida del aula. Actualiza antes de guardar.');
  }
  return value;
}
function modulo(body) {
  if (!body || typeof body.titulo !== 'string' || !body.titulo.trim() || body.titulo.trim().length > 150) {
    throw httpError(400, 'Escribe un título de entre 1 y 150 caracteres.');
  }
  if (body.descripcion !== undefined && (typeof body.descripcion !== 'string' || body.descripcion.trim().length > 2000)) {
    throw httpError(400, 'La descripción admite hasta 2000 caracteres.');
  }
  return { titulo: body.titulo.trim(), descripcion: (body.descripcion || '').trim() };
}
function documento(body) {
  if (!body || typeof body.titulo !== 'string' || !body.titulo.trim() || body.titulo.trim().length > 150) {
    throw httpError(400, 'Escribe un titulo para el documento de hasta 150 caracteres.');
  }
  if (body.descripcion !== undefined && (typeof body.descripcion !== 'string' || body.descripcion.trim().length > 1000)) {
    throw httpError(400, 'La descripcion del documento admite hasta 1000 caracteres.');
  }
  return { titulo: body.titulo.trim(), descripcion: (body.descripcion || '').trim() };
}
function orden(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw httpError(400, 'Envía el orden completo de los módulos.');
  const normalized = ids.map(positiveId);
  if (new Set(normalized).size !== normalized.length) throw httpError(400, 'El orden contiene módulos repetidos.');
  return normalized;
}
module.exports = { revision, modulo, documento, orden };
