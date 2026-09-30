jest.mock('fs/promises', () => ({ access: jest.fn(), readFile: jest.fn(), stat: jest.fn(), realpath: jest.fn(), open: jest.fn() }));
jest.mock('../src/config/upload-path', () => '/unit-test-only/uploads');
jest.mock('../src/services/storage.service', () => ({ obtenerUrlDescarga: jest.fn(), isRemoteFile: (value) => /^https:\/\//i.test(value || '') }));

const path = require('path');
const fs = require('fs/promises');
const storage = require('../src/services/storage.service');
const { descargarPdf, descargarComprobante } = require('../src/services/constancia-download.service');

const TEST_URL = 'https://res.cloudinary.com/yesems-unit-tests-only/raw/authenticated/v1/yesems/constancias/fake-document.pdf';
const SIGNED_URL = 'https://api.cloudinary.com/v1_1/yesems-unit-tests-only/raw/download?signature=fake-test-signature';
const PDF = Buffer.from('%PDF-1.7\n% unit test only\n%%EOF');
const originalFetch = global.fetch;

function response() {
  const res = {};
  ['set', 'type', 'attachment', 'send'].forEach((method) => { res[method] = jest.fn().mockReturnValue(res); });
  res.download = jest.fn((_file, _name, callback) => { callback(); return res; });
  return res;
}

function remoteResponse(chunks = [PDF], contentType = 'application/pdf') {
  return {
    ok: true,
    headers: new Headers({ 'content-type': contentType }),
    body: (async function* () { for (const chunk of chunks) yield chunk; })(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue(remoteResponse());
  storage.obtenerUrlDescarga.mockReturnValue(SIGNED_URL);
  fs.access.mockResolvedValue(undefined);
  fs.readFile.mockResolvedValue(PDF);
  fs.stat.mockResolvedValue({ size: PDF.length, isFile: () => true });
  fs.realpath.mockImplementation(async (file) => file);
});

afterAll(() => { global.fetch = originalFetch; });

describe('Descarga protegida de constancias', () => {
  test('obtiene el PDF mediante la URL resuelta y lo entrega como adjunto privado, sin redirección', async () => {
    const res = response();
    await descargarPdf(res, { folio: 'TEST-0001', archivo_url: TEST_URL });
    expect(storage.obtenerUrlDescarga).toHaveBeenCalledWith(TEST_URL);
    expect(global.fetch).toHaveBeenCalledWith(SIGNED_URL, expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }));
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.type).toHaveBeenCalledWith('application/pdf');
    expect(res.attachment).toHaveBeenCalledWith('constancia_TEST-0001.pdf');
    expect(res.send).toHaveBeenCalledWith(PDF);
  });

  test('una URL rechazada por el validador no inicia ninguna conexión', async () => {
    storage.obtenerUrlDescarga.mockImplementation(() => { throw Object.assign(new Error('invalid storage location'), { statusCode: 502 }); });
    const res = response();
    await expect(descargarPdf(res, { folio: 'TEST', archivo_url: 'https://127.0.0.1/private.pdf' })).rejects.toMatchObject({ statusCode: 502 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  test('el servidor de almacenamiento debe responder correctamente', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    const res = response();
    await expect(descargarPdf(res, { folio: 'TEST', archivo_url: TEST_URL })).rejects.toMatchObject({ statusCode: 502 });
    expect(res.send).not.toHaveBeenCalled();
  });

  test('no sirve HTML disfrazado de PDF', async () => {
    global.fetch.mockResolvedValue(remoteResponse([Buffer.from('<html>not a PDF</html>')]));
    const res = response();
    await expect(descargarPdf(res, { folio: 'TEST', archivo_url: TEST_URL })).rejects.toMatchObject({ statusCode: 502 });
    expect(res.send).not.toHaveBeenCalled();
  });

  test('limita el cuerpo remoto a 10 MB aunque no exista Content-Length', async () => {
    global.fetch.mockResolvedValue(remoteResponse([PDF, Buffer.alloc(10 * 1024 * 1024)]));
    const res = response();
    await expect(descargarPdf(res, { folio: 'TEST', archivo_url: TEST_URL })).rejects.toMatchObject({ statusCode: 502 });
    expect(res.send).not.toHaveBeenCalled();
  });

  test('no oculta errores o timeout del proveedor ni envía un adjunto incompleto', async () => {
    global.fetch.mockRejectedValue(new Error('simulated network timeout'));
    const res = response();
    await expect(descargarPdf(res, { folio: 'TEST', archivo_url: TEST_URL })).rejects.toThrow();
    expect(res.send).not.toHaveBeenCalled();
  });

  test('conserva la descarga de un PDF histórico dentro del directorio de constancias', async () => {
    const res = response();
    await descargarPdf(res, { folio: 'LEGACY-1', archivo_url: '/uploads/constancias/legacy.pdf' });
    expect(res.download).toHaveBeenCalledWith(path.resolve('/unit-test-only/uploads/constancias/legacy.pdf'), 'constancia_LEGACY-1.pdf', expect.any(Function));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('un PDF local ausente devuelve 404', async () => {
    fs.access.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    fs.readFile.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    const res = response();
    await expect(descargarPdf(res, { folio: 'TEST', archivo_url: '/uploads/constancias/missing.pdf' })).rejects.toMatchObject({ statusCode: 404 });
    expect(res.download).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  test.each([
    '/uploads/constancias/../../.env',
    '/uploads/constancias/../comprobantes/other.pdf',
    '/uploads/constancias/../../uploads-elsewhere/file.pdf',
    '/uploads/constancias/file.txt',
    '/private/document.pdf',
    'http://127.0.0.1/internal.pdf',
  ])('rechaza rutas fuera del directorio de constancias: %s', async (file) => {
    const res = response();
    await expect(descargarPdf(res, { folio: 'TEST', archivo_url: file })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.download).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe('Comprobantes a través del mismo canal protegido', () => {
  test('acepta imágenes de comprobante y entrega su contenido sin revelar la URL firmada', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    global.fetch.mockResolvedValue(remoteResponse([png], 'image/png'));
    const res = response();
    await descargarComprobante(res, TEST_URL.replace('/constancias/', '/comprobantes/').replace('.pdf', '.png'));
    expect(global.fetch).toHaveBeenCalledWith(SIGNED_URL, expect.objectContaining({ redirect: 'error' }));
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.send).toHaveBeenCalledWith(png);
  });

  test('mantiene comprobantes locales dentro de su directorio', async () => {
    const res = response();
    await descargarComprobante(res, '/uploads/comprobantes/receipt.png');
    expect(res.download).toHaveBeenCalledWith(path.resolve('/unit-test-only/uploads/comprobantes/receipt.png'), expect.any(String), expect.any(Function));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('la descarga de comprobantes no puede acceder al directorio de constancias', async () => {
    const res = response();
    await expect(descargarComprobante(res, '/uploads/comprobantes/../constancias/other.pdf')).rejects.toThrow();
    expect(res.download).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('también rechaza comprobantes remotos mayores a 10 MB', async () => {
    global.fetch.mockResolvedValue(remoteResponse([Buffer.alloc(10 * 1024 * 1024 + 1)], 'image/png'));
    const res = response();
    await expect(descargarComprobante(res, TEST_URL.replace('/constancias/', '/comprobantes/'))).rejects.toMatchObject({ statusCode: 502 });
    expect(res.send).not.toHaveBeenCalled();
  });
});
