const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const cloudinary = require('cloudinary').v2;
const { cloudinaryEnabled, obtenerUrlDescarga } = require('./storage.service');
const { httpError } = require('../utils/http-error');
const root = path.join(require('../config/upload-path'), 'aula');
const localTest = process.env.NODE_ENV === 'test' && process.env.YES_EMS_ISOLATED_TEST === '1' && Boolean(process.env.TEST_UPLOADS_DIR);
const MAX = 5 * 1024 * 1024;
function diagnosticoCloudinary(error) {
  let message = String(error?.message || 'Error sin mensaje del proveedor');
  for (const secret of [process.env.CLOUDINARY_API_SECRET, process.env.CLOUDINARY_API_KEY]) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  message = message.replace(/(api[_ -]?(?:key|secret)|authorization|signature)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').slice(0, 300);
  const httpCode = Number(error?.http_code || error?.error?.http_code);
  return { http_code: Number.isInteger(httpCode) ? httpCode : null, name: String(error?.name || 'Error').slice(0, 60), message };
}
function validarPdf(file) {
  if (!file || file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(file.originalname || '')) throw httpError(400, 'Selecciona un archivo PDF.');
  const b = file.buffer;
  // Validación de formato básica; no sustituye un antivirus ni un analizador completo de PDF.
  if (!Buffer.isBuffer(b) || b.length > MAX || !/^%PDF-\d\.\d/.test(b.subarray(0, 8).toString()) || !/%%EOF\s*$/.test(b.subarray(-1024).toString('latin1'))) throw httpError(400, 'El archivo no tiene un formato PDF reconocido o supera 5 MB.');
  return b;
}
async function guardar(buffer) {
  const id = `yesems/aula/${randomUUID()}.pdf`;
  if (localTest) { await fs.mkdir(root, { recursive: true }); const name = path.basename(id); await fs.writeFile(path.join(root, name), buffer, { flag: 'wx' }); return `test-aula:${name}`; }
  if (!cloudinaryEnabled) throw httpError(503, 'Configura el almacenamiento privado antes de subir materiales.');
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ resource_type: 'raw', type: 'authenticated', public_id: id, overwrite: false, timeout: 30000 }, (error, result) => error ? reject(error) : resolve(result));
      stream.on('error', reject); stream.end(buffer);
    });
    return result.secure_url;
  } catch (error) {
    console.error('[aula-cloudinary-upload]', diagnosticoCloudinary(error));
    throw httpError(502, 'No se pudo guardar el PDF en el almacenamiento privado.');
  }
}
function localName(url) {
  const name = String(url).slice('test-aula:'.length);
  if (!localTest || !/^[a-f0-9-]{36}\.pdf$/.test(name)) throw httpError(404, 'Documento no disponible.');
  return path.join(root, name);
}
async function descartar(url) {
  if (url.startsWith('test-aula:')) return fs.unlink(localName(url));
  const match = String(url).match(new RegExp(`^https://res\\.cloudinary\\.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/authenticated/(?:v\\d+/)?(yesems/aula/[a-f0-9-]{36}\\.pdf)$`));
  if (!match) throw Error('Ubicación no permitida');
  await cloudinary.uploader.destroy(match[1], { resource_type: 'raw', type: 'authenticated', invalidate: true });
}
async function descargar(res, doc) {
  let bytes;
  if (doc.archivo_url.startsWith('test-aula:')) bytes = await fs.readFile(localName(doc.archivo_url));
  else {
    const match = String(doc.archivo_url).match(new RegExp(`^https://res\\.cloudinary\\.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/authenticated/(?:v\\d+/)?yesems/aula/[a-f0-9-]{36}\\.pdf$`));
    if (!match) throw httpError(502, 'Ubicación privada no válida.');
    try {
      const response = await fetch(obtenerUrlDescarga(doc.archivo_url), { redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('Storage');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > MAX) throw Error('Size'); chunks.push(chunk); }
      bytes = Buffer.concat(chunks);
    } catch { throw httpError(502, 'No se pudo recuperar el PDF. Intenta nuevamente.'); }
  }
  if (bytes.length !== doc.bytes || bytes.subarray(0, 5).toString() !== '%PDF-') throw httpError(502, 'El documento almacenado no coincide con el original.');
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  return res.attachment(`material-${doc.id_documento}.pdf`).type('application/pdf').send(bytes);
}
module.exports = { validarPdf, guardar, descartar, descargar };
