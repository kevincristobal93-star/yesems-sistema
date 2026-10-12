jest.mock('cloudinary', () => ({ v2: { uploader: { upload_stream: jest.fn() } } }));
jest.mock('../src/services/storage.service', () => ({ cloudinaryEnabled: true, obtenerUrlDescarga: jest.fn() }));

const cloudinary = require('cloudinary').v2;
const { guardar } = require('../src/services/aula-files.service');

describe('aula-files.service Cloudinary failures', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_API_KEY;
  });

  test('registra el motivo del proveedor sin filtrar credenciales y conserva el error público genérico', async () => {
    process.env.CLOUDINARY_API_SECRET = 'secret-test-only';
    process.env.CLOUDINARY_API_KEY = 'key-test-only';
    const providerError = Object.assign(new Error('Invalid api_secret=secret-test-only api_key=key-test-only'), { http_code: 401 });
    cloudinary.uploader.upload_stream.mockImplementation((_options, callback) => {
      const stream = { on: jest.fn(() => stream), end: jest.fn(() => callback(providerError)) };
      return stream;
    });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(guardar(Buffer.from('test'))).rejects.toMatchObject({ statusCode: 502 });
    expect(log).toHaveBeenCalledWith('[aula-cloudinary-upload]', {
      http_code: 401,
      name: 'Error',
      message: 'Invalid api_secret=[redacted] api_key=[redacted]',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-test-only');
    expect(JSON.stringify(log.mock.calls)).not.toContain('key-test-only');
  });
});
