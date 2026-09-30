const path = require('path');
const fs = require('fs/promises');
const { httpError } = require('../utils/http-error');
const uploadRoot = require('../config/upload-path');
const { obtenerUrlDescarga, isRemoteFile } = require('./storage.service');

// Descarga a través de la API para conservar autorización y evitar CORS del proveedor.
async function descargarArchivo(res, fileUrl, { folder, filename, pdfOnly = false }) {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (isRemoteFile(fileUrl)) {
    const url = obtenerUrlDescarga(fileUrl);
    let bytes;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!response.ok) throw httpError(502, 'No se pudo recuperar el documento almacenado. Intenta nuevamente.');
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 10 * 1024 * 1024) throw httpError(502, 'El documento excede el tamaño de descarga permitido');
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    } catch (error) {
      // No registrar errores fetch que puedan contener una URL firmada.
      if (error.statusCode) throw error;
      throw httpError(502, 'No se pudo recuperar el documento almacenado. Intenta nuevamente.');
    }
    const isPdf = bytes.subarray(0, 5).toString() === '%PDF-';
    if (pdfOnly && !isPdf) throw httpError(502, 'El archivo almacenado no es un PDF válido');
    let type = 'application/octet-stream';
    let extension = '.bin';
    if (isPdf) { type = 'application/pdf'; extension = '.pdf'; }
    else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { type = 'image/png'; extension = '.png'; }
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) { type = 'image/jpeg'; extension = '.jpg'; }
    return res.attachment(filename || `comprobante${extension}`).type(type).send(bytes);
  }
  const directory = path.resolve(uploadRoot, folder);
  const relative = String(fileUrl).replace(/^[/\\]+/, '');
  if (!relative.startsWith('uploads/')) throw httpError(404, 'Documento no encontrado');
  const file = path.resolve(uploadRoot, relative.slice('uploads/'.length));
  const allowedExtensions = pdfOnly ? ['.pdf'] : ['.pdf', '.jpg', '.jpeg', '.png'];
  if (!file.startsWith(directory + path.sep) || !allowedExtensions.includes(path.extname(file).toLowerCase())) {
    throw httpError(404, 'Documento no encontrado');
  }
  try { await fs.access(file); }
  catch { throw httpError(404, 'El documento no está disponible en el almacenamiento. Solicita ayuda al administrador.'); }
  return new Promise((resolve, reject) => res.download(file, filename || path.basename(file), (error) => error ? reject(error) : resolve()));
}

const descargarPdf = (res, constancia) => descargarArchivo(res, constancia.archivo_url, {
  folder: 'constancias', pdfOnly: true,
  filename: `constancia_${String(constancia.folio).replace(/[^\w-]/g, '_')}.pdf`,
});

const descargarComprobante = (res, fileUrl) => descargarArchivo(res, fileUrl, { folder: 'comprobantes' });

module.exports = { descargarPdf, descargarComprobante };
