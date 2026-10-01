// Validación REAL opt-in. No importa la BD ni usa alumnos/documentos existentes.
// Sin --run sólo comprueba configuración. No imprime claves ni URLs firmadas.
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function cleanupId(fileUrl, folder, cloudName) {
  const url = new URL(fileUrl);
  const prefix = `/${cloudName}/raw/authenticated/`;
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password ||
      url.port || url.search || url.hash || !url.pathname.startsWith(prefix)) throw new Error('Ubicación de prueba inesperada');
  const id = decodeURIComponent(url.pathname.slice(prefix.length).replace(/^v\d+\//, ''));
  if (!/^yesems\/pruebas\/[a-f0-9-]{36}$/.test(folder) || !id.startsWith(`${folder}/`) ||
      !/^[a-f0-9-]{36}\.pdf$/.test(id.slice(folder.length + 1))) throw new Error('El recurso no pertenece a esta prueba');
  return id;
}

async function createPdf(file) {
  const PDFDocument = require('pdfkit');
  const { createWriteStream } = require('fs');
  const { pipeline } = require('stream/promises');
  const doc = new PDFDocument();
  const finished = pipeline(doc, createWriteStream(file));
  doc.fontSize(20).text('YES EMS - PRUEBA DE ALMACENAMIENTO');
  doc.moveDown().fontSize(12).text('Documento ficticio. No es una constancia ni un comprobante real.');
  doc.text('Se utiliza exclusivamente para comprobar carga, privacidad y descarga.');
  doc.end();
  await finished;
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const keys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = keys.filter((key) => !process.env[key] || /^(your_|tu_|change|example|xxx|<)/i.test(process.env[key]));
  if (!process.argv.includes('--run')) {
    console.log(missing.length ? `Falta configurar: ${missing.join(', ')}` : 'Cloudinary configurado. Ejecuta npm run test:cloudinary -- --run para probarlo.');
    console.log('Comprobación local: no se subió ningún archivo.');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const evidenceDir = path.resolve(__dirname, `../../docs/evidencias/${stamp}`);
  const runId = crypto.randomUUID();
  const folder = `yesems/pruebas/${runId}`;
  const report = { fecha: new Date().toISOString(), id_prueba: runId, estado: 'pendiente', datos: 'PDF ficticio; sin conexión a PostgreSQL', pasos: [] };
  let workspace;
  let resourceId;
  let cloudinary;
  let stage = 'Configuración';
  let failure = false;
  async function step(name, action) {
    stage = name;
    const start = Date.now();
    const detail = await action();
    report.pasos.push({ prueba: name, resultado: 'aprobada', duracion_ms: Date.now() - start, ...detail });
  }
  try {
    if (missing.length) {
      report.faltan_variables = missing;
      report.estado = 'bloqueada_por_configuracion';
      process.exitCode = 2;
      return;
    }
    const storage = require('../src/services/storage.service');
    cloudinary = require('cloudinary').v2;
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'yesems-cloudinary-test-'));
    const file = path.join(workspace, 'prueba.pdf');
    await createPdf(file);
    const original = await fs.readFile(file);
    const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
    let fileUrl;
    await step('Carga real de PDF con almacenamiento autenticado', async () => {
      fileUrl = await storage.guardarArchivoPermanente(file, folder);
      if (!fileUrl) throw new Error('Almacenamiento no habilitado');
      resourceId = cleanupId(fileUrl, folder, process.env.CLOUDINARY_CLOUD_NAME);
      return { bytes: original.length };
    });
    await step('Descarga firmada con contenido íntegro', async () => {
      const signedUrl = storage.obtenerUrlDescarga(fileUrl);
      const response = await fetch(signedUrl, { signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (!response.ok) throw Object.assign(new Error('Descarga rechazada'), { http_code: response.status });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.equals(original)) throw new Error('El contenido descargado no coincide');
      return { http: response.status, sha256: hash(bytes), bytes: bytes.length };
    });
    await step('Acceso directo sin firma bloqueado', async () => {
      const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30000), redirect: 'manual' });
      await response.body?.cancel();
      if (![401, 403, 404].includes(response.status)) throw Object.assign(new Error('El archivo no está protegido'), { http_code: response.status });
      return { http: response.status };
    });
    await step('Descarga a través del servicio de documentos de YES EMS', async () => {
      let output;
      const res = { set() { return this; }, attachment() { return this; }, type() { return this; }, send(bytes) { output = bytes; return this; } };
      await require('../src/services/constancia-download.service').descargarPdf(res, { archivo_url: fileUrl, folio: 'PRUEBA-NO-VALIDA' });
      if (!output?.equals(original)) throw new Error('El servicio no entregó el PDF correcto');
      return { bytes: output.length };
    });
  } catch (error) {
    failure = true;
    report.pasos.push({ prueba: stage, resultado: 'fallida', ...(Number.isInteger(error.http_code) ? { http: error.http_code } : {}) });
    // Las excepciones del SDK pueden contener parámetros de autenticación.
    console.error(`Falló: ${stage}. Revisa el resultado y la configuración; no se imprimen credenciales.`);
    process.exitCode = 1;
  } finally {
    if (resourceId && cloudinary) {
      try {
        // Sólo borrar el identificador retornado por nuestra propia carga.
        if (!resourceId.startsWith(`${folder}/`)) throw new Error('Recurso ajeno a la prueba');
        const result = await cloudinary.uploader.destroy(resourceId, { resource_type: 'raw', type: 'authenticated', invalidate: true });
        if (result.result !== 'ok') throw new Error('Eliminación no confirmada');
        report.pasos.push({ prueba: 'Eliminar exclusivamente el PDF ficticio creado', resultado: 'aprobada' });
      } catch {
        failure = true;
        process.exitCode = 1;
        report.pasos.push({ prueba: 'Eliminar exclusivamente el PDF ficticio creado', resultado: 'fallida' });
        report.recurso_prueba_por_revisar = resourceId;
      }
    }
    if (workspace) {
      const resolved = path.resolve(workspace);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('yesems-cloudinary-test-')) throw new Error('Directorio temporal inesperado');
      await fs.rm(resolved, { recursive: true, force: true });
    }
    if (report.estado !== 'bloqueada_por_configuracion') report.estado = failure ? 'fallida' : 'aprobada';
    await fs.mkdir(evidenceDir, { recursive: true });
    const filename = path.join(evidenceDir, `cloudinary-${runId}.json`);
    await fs.writeFile(filename, JSON.stringify(report, null, 2) + '\n');
    console.log(`Estado Cloudinary: ${report.estado}. Evidencia: ${filename}`);
    if (report.estado === 'aprobada') console.log('El PDF ficticio fue eliminado; los archivos existentes no se modificaron.');
  }
}

if (require.main === module) main().catch(() => { console.error('No se pudo finalizar la validación. Revisa permisos y configuración local.'); process.exitCode = 1; });
module.exports = { cleanupId };
