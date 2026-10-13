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
  const tipos = ['pdf', 'organizador', 'ejercicio', 'imagen', 'documento'];
  const tipo = body.tipo_material || 'documento';
  if (!tipos.includes(tipo)) throw httpError(400, 'Selecciona un tipo de material valido.');
  const principal = body.principal_id === undefined || body.principal_id === '' || body.principal_id === null
    ? null : positiveId(Number(body.principal_id));
  return { titulo: body.titulo.trim(), descripcion: (body.descripcion || '').trim(), tipo, principal };
}
function orden(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw httpError(400, 'Envía el orden completo de los módulos.');
  const normalized = ids.map(positiveId);
  if (new Set(normalized).size !== normalized.length) throw httpError(400, 'El orden contiene módulos repetidos.');
  return normalized;
}
function ordenDocumentos(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 20) throw httpError(400, 'Envia el orden completo de los materiales.');
  const normalized = ids.map(positiveId);
  if (new Set(normalized).size !== normalized.length) throw httpError(400, 'Hay materiales repetidos.');
  return normalized;
}
function video(body) {
  if (!body || typeof body.titulo !== 'string' || !body.titulo.trim() || body.titulo.trim().length > 150) throw httpError(400, 'Escribe un titulo para el video.');
  if (body.descripcion !== undefined && (typeof body.descripcion !== 'string' || body.descripcion.trim().length > 1000)) throw httpError(400, 'La descripcion del video es demasiado larga.');
  if (typeof body.url !== 'string' || body.url.length > 1000) throw httpError(400, 'Indica un enlace de video valido.');
  let parsed;
  try { parsed = new URL(body.url); } catch { throw httpError(400, 'Indica un enlace de video valido.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
    !['youtube.com','www.youtube.com','youtu.be','vimeo.com','www.vimeo.com','player.vimeo.com'].includes(parsed.hostname)) {
    throw httpError(400, 'Usa un enlace HTTPS de YouTube o Vimeo.');
  }
  const principal = body.principal_id === undefined || body.principal_id === '' || body.principal_id === null ? null : positiveId(Number(body.principal_id));
  return { titulo: body.titulo.trim(), descripcion: (body.descripcion || '').trim(), url: parsed.href, principal };
}
module.exports = { revision, modulo, documento, orden, ordenDocumentos, video };
