jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn() },
    utils: { private_download_url: jest.fn() },
  },
}));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), unlinkSync: jest.fn() }));

const ENV_KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const originalEnv = Object.fromEntries(ENV_KEYS.map((name) => [name, process.env[name]]));
const TEST_CLOUD = 'yesems-unit-tests-only';
const AUTHENTICATED_URL = `https://res.cloudinary.com/${TEST_CLOUD}/raw/authenticated/v123/yesems/constancias/fake-document.pdf`;
const LEGACY_URL = `https://res.cloudinary.com/${TEST_CLOUD}/raw/upload/v123/yesems/constancias/legacy.pdf`;
const SIGNED_DOWNLOAD = 'https://api.cloudinary.com/v1_1/yesems-unit-tests-only/raw/download?signature=fake-test-signature';

function loadStorage(configured = true) {
  jest.resetModules();
  ENV_KEYS.forEach((key) => { delete process.env[key]; });
  if (configured) {
    process.env.CLOUDINARY_CLOUD_NAME = TEST_CLOUD;
    process.env.CLOUDINARY_API_KEY = 'fake-unit-test-key';
    process.env.CLOUDINARY_API_SECRET = 'fake-unit-test-secret-not-a-credential';
  }
  const cloudinary = require('cloudinary').v2;
  cloudinary.uploader.upload.mockResolvedValue({ secure_url: AUTHENTICATED_URL });
  cloudinary.utils.private_download_url.mockReturnValue(SIGNED_DOWNLOAD);
  return { service: require('../src/services/storage.service'), cloudinary, fs: require('fs') };
}

afterEach(() => {
  jest.restoreAllMocks();
  ENV_KEYS.forEach((name) => {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  });
});

describe('Almacenamiento privado de documentos', () => {
  test('sube documentos autenticados con identificadores aleatorios y conserva solo una URL sin firma', async () => {
    const { service, cloudinary, fs } = loadStorage();
    const file = '/unit-test-only/constancia_YESEMS-2099-0001.pdf';
    await expect(service.guardarArchivoPermanente(file, 'yesems/constancias')).resolves.toBe(AUTHENTICATED_URL);
    await service.guardarArchivoPermanente(file, 'yesems/constancias');
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith(file, expect.objectContaining({
      resource_type: 'raw', type: 'authenticated', folder: 'yesems/constancias', overwrite: false,
      public_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i),
    }));
    expect(cloudinary.uploader.upload.mock.calls[0][1].public_id)
      .not.toBe(cloudinary.uploader.upload.mock.calls[1][1].public_id);
    expect(fs.unlinkSync).toHaveBeenCalledWith(file);
    expect(fs.unlinkSync.mock.invocationCallOrder[0]).toBeGreaterThan(cloudinary.uploader.upload.mock.invocationCallOrder[0]);
    expect(cloudinary.utils.private_download_url).not.toHaveBeenCalled();
  });

  test('sin configuración mantiene el archivo local y no contacta Cloudinary', async () => {
    const { service, cloudinary, fs } = loadStorage(false);
    await expect(service.guardarArchivoPermanente('/unit-test-only/receipt.png', 'yesems/comprobantes')).resolves.toBeNull();
    expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  test('si la subida falla no elimina el documento local', async () => {
    const { service, cloudinary, fs } = loadStorage();
    cloudinary.uploader.upload.mockRejectedValue(new Error('simulated cloud error'));
    await expect(service.guardarArchivoPermanente('/unit-test-only/document.pdf', 'yesems/constancias')).rejects.toThrow('simulated cloud error');
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});

describe('Resolución segura de descargas Cloudinary', () => {
  test('conserva URLs históricas públicas válidas sin exigir credenciales ni firmarlas', async () => {
    const { service, cloudinary } = loadStorage(false);
    await expect(Promise.resolve().then(() => service.obtenerUrlDescarga(LEGACY_URL))).resolves.toBe(LEGACY_URL);
    expect(cloudinary.utils.private_download_url).not.toHaveBeenCalled();
  });

  test('acepta una URL histórica sin prefijo de versión', async () => {
    const { service } = loadStorage(false);
    const url = LEGACY_URL.replace('/v123/', '/');
    await expect(Promise.resolve().then(() => service.obtenerUrlDescarga(url))).resolves.toBe(url);
  });

  test('firma documentos autenticados del cloud configurado con expiración de un minuto', async () => {
    const { service, cloudinary } = loadStorage();
    jest.spyOn(Date, 'now').mockReturnValue(1900000000000);
    await expect(Promise.resolve().then(() => service.obtenerUrlDescarga(AUTHENTICATED_URL))).resolves.toBe(SIGNED_DOWNLOAD);
    expect(cloudinary.utils.private_download_url).toHaveBeenCalledWith('yesems/constancias/fake-document.pdf', '', expect.objectContaining({
      resource_type: 'raw', type: 'authenticated', expires_at: 1900000060,
    }));
  });

  test('no firma documentos autenticados pertenecientes a otra cuenta', async () => {
    const { service, cloudinary } = loadStorage();
    const url = AUTHENTICATED_URL.replace(TEST_CLOUD, 'another-fictitious-cloud');
    await expect(Promise.resolve().then(() => service.obtenerUrlDescarga(url))).rejects.toThrow();
    expect(cloudinary.utils.private_download_url).not.toHaveBeenCalled();
  });

  test('rechaza un documento autenticado si faltan credenciales', async () => {
    const { service, cloudinary } = loadStorage(false);
    await expect(Promise.resolve().then(() => service.obtenerUrlDescarga(AUTHENTICATED_URL))).rejects.toThrow();
    expect(cloudinary.utils.private_download_url).not.toHaveBeenCalled();
  });

  test.each([
    'http://res.cloudinary.com/test/raw/upload/file.pdf',
    'https://127.0.0.1/private.pdf',
    'https://169.254.169.254/latest/meta-data/',
    'https://res.cloudinary.com.attacker.invalid/test/raw/upload/file.pdf',
    'https://user:fake@res.cloudinary.com/test/raw/upload/file.pdf',
    'https://res.cloudinary.com:8080/test/raw/upload/file.pdf',
    'https://res.cloudinary.com/test/raw/upload/file.pdf?destination=internal',
    'https://res.cloudinary.com/test/raw/upload/file.pdf#fragment',
    'https://res.cloudinary.com/test/image/upload/file.pdf',
    'https://res.cloudinary.com/test/raw/fetch/https://example.invalid/file.pdf',
    'https://res.cloudinary.com/',
    '/uploads/constancias/document.pdf',
  ])('rechaza ubicaciones remotas no permitidas: %s', async (url) => {
    const { service, cloudinary } = loadStorage();
    await expect(Promise.resolve().then(() => service.obtenerUrlDescarga(url))).rejects.toThrow();
    expect(cloudinary.utils.private_download_url).not.toHaveBeenCalled();
  });
});
