const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const cloudinary = require('cloudinary').v2;
const { cloudinaryEnabled, obtenerUrlDescarga } = require('./storage.service');
const { httpError } = require('../utils/http-error');
const root = path.join(require('../config/upload-path'), 'aula');
const localTest = process.env.NODE_ENV === 'test' && process.env.YES_EMS_ISOLATED_TEST === '1' && Boolean(process.env.TEST_UPLOADS_DIR);
const { formats, MAX, contentMatches } = require('../utils/document-formats');
function validarDocumento(file) {
  const extension = path.extname(file?.originalname || '').slice(1).toLowerCase();
  if (!Object.hasOwn(formats, extension)) throw httpError(400, 'Formato no permitido. Usa PDF, Office, OpenDocument, texto, EPUB, ZIP o imágenes JPG, PNG y WebP.');
  if (!contentMatches(file?.buffer, extension)) throw httpError(400, 'El contenido no coincide con el formato indicado, está vacío o supera 5 MB.');
  return { buffer: file.buffer, extension };
}
function diagnosticoCloudinary(error) {
  let message = String(error?.message || 'Error sin mensaje del proveedor');
  for (const secret of [process.env.CLOUDINARY_API_SECRET, process.env.CLOUDINARY_API_KEY]) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  message = message.replace(/(api[_ -]?(?:key|secret)|authorization|signature)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').slice(0, 300);
  const httpCode = Number(error?.http_code || error?.error?.http_code);
  return { http_code: Number.isInteger(httpCode) ? httpCode : null, name: String(error?.name || 'Error').slice(0, 60), message };
}
async function guardar(buffer, extension = 'pdf') {
  if (!Object.hasOwn(formats, extension)) throw httpError(400, 'Formato no permitido.');
  const id = `yesems/aula/${randomUUID()}.${extension}`;
  if (localTest) { await fs.mkdir(root, { recursive: true }); const name = path.basename(id); await fs.writeFile(path.join(root, name), buffer, { flag: 'wx' }); return `test-aula:${name}`; }
  if (!cloudinaryEnabled) throw httpError(503, 'Configura el almacenamiento privado antes de subir materiales.');
  try {
    // El SDK descarta el cuerpo de errores HTTP 403 en upload_stream.
    // La API oficial admite Basic Auth por HTTPS y devuelve el motivo en JSON.
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: formats[extension] }), `material.${extension}`);
    form.append('public_id', id);
    form.append('type', 'authenticated');
    form.append('overwrite', 'false');
    const credentials = Buffer.from(`${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`).toString('base64');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(process.env.CLOUDINARY_CLOUD_NAME)}/raw/upload`, {
      method: 'POST', headers: { Authorization: `Basic ${credentials}` }, body: form, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = result?.error?.message || response.headers.get('x-cld-error') || `Cloudinary HTTP ${response.status}`;
      throw Object.assign(new Error(String(reason)), { http_code: response.status });
    }
    if (!result.secure_url || result.public_id !== id || result.resource_type !== 'raw' || result.type !== 'authenticated') {
      throw new Error('Cloudinary devolvio una respuesta de carga inesperada');
    }
    return result.secure_url;
  } catch (error) {
    console.error('[aula-cloudinary-upload]', diagnosticoCloudinary(error));
    throw httpError(502, 'No se pudo guardar el documento en el almacenamiento privado.');
  }
}
function localName(url) {
  const name = String(url).slice('test-aula:'.length);
  if (!localTest || !new RegExp(`^[a-f0-9-]{36}\\.(${Object.keys(formats).join('|')})$`).test(name)) throw httpError(404, 'Documento no disponible.');
  return path.join(root, name);
}
async function descartar(url) {
  if (url.startsWith('test-aula:')) return fs.unlink(localName(url));
  const match = cloudLocation(url);
  if (!match) throw Error('Ubicación no permitida');
  await cloudinary.uploader.destroy(match[1], { resource_type: 'raw', type: 'authenticated', invalidate: true });
}
async function descargar(res, doc) {
  const extension = path.extname(doc.archivo_url).slice(1);
  if (!Object.hasOwn(formats, extension)) throw httpError(502, 'Formato almacenado no permitido.');
  let bytes;
  if (doc.archivo_url.startsWith('test-aula:')) bytes = await fs.readFile(localName(doc.archivo_url));
  else {
    const match = cloudLocation(doc.archivo_url);
    if (!match) throw httpError(502, 'Ubicación privada no válida.');
    try {
      const response = await fetch(obtenerUrlDescarga(doc.archivo_url), { redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('Storage');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > MAX) throw Error('Size'); chunks.push(chunk); }
      bytes = Buffer.concat(chunks);
    } catch { throw httpError(502, 'No se pudo recuperar el documento. Intenta nuevamente.'); }
  }
  if (bytes.length !== doc.bytes || !contentMatches(bytes, extension)) throw httpError(502, 'El documento almacenado no coincide con el original.');
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  return res.attachment(`material-${doc.id_documento}.${extension}`).type(formats[extension]).send(bytes);
}
function cloudLocation(url) {
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(url).match(new RegExp(`^https://res\\.cloudinary\\.com/${cloud}/raw/authenticated/(?:v\\d+/)?(yesems/aula/[a-f0-9-]{36}\\.(${Object.keys(formats).join('|')}))$`));
}
module.exports = { validarDocumento, guardar, descartar, descargar };
