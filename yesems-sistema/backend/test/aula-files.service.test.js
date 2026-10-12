jest.mock('../src/services/storage.service', () => ({ cloudinaryEnabled: true, obtenerUrlDescarga: jest.fn() }));

const { guardar } = require('../src/services/aula-files.service');
const originalFetch = global.fetch;

describe('aula-files.service Cloudinary uploads', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_CLOUD_NAME;
  });

  test('registra el motivo del proveedor sin filtrar credenciales y conserva el error publico generico', async () => {
    process.env.CLOUDINARY_API_SECRET = 'secret-test-only';
    process.env.CLOUDINARY_API_KEY = 'key-test-only';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: { message: 'Invalid api_secret=secret-test-only api_key=key-test-only' } }), headers: new Headers() });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(guardar(Buffer.from('test'))).rejects.toMatchObject({ statusCode: 502 });
    expect(global.fetch).toHaveBeenCalledWith('https://api.cloudinary.com/v1_1/test-cloud/raw/upload', expect.objectContaining({ method: 'POST', redirect: 'error' }));
    expect(log).toHaveBeenCalledWith('[aula-cloudinary-upload]', {
      http_code: 403,
      name: 'Error',
      message: 'Invalid api_secret=[redacted] api_key=[redacted]',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-test-only');
    expect(JSON.stringify(log.mock.calls)).not.toContain('key-test-only');
  });

  test('sube un PDF raw autenticado y conserva su URL privada', async () => {
    process.env.CLOUDINARY_API_SECRET = 'secret-test-only';
    process.env.CLOUDINARY_API_KEY = 'key-test-only';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    global.fetch = jest.fn().mockImplementation(async (_url, options) => {
      const id = options.body.get('public_id');
      expect(options.body.get('type')).toBe('authenticated');
      expect(options.body.get('overwrite')).toBe('false');
      expect(options.body.get('file')).toBeInstanceOf(Blob);
      expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('key-test-only:secret-test-only').toString('base64')}`);
      return { ok: true, status: 200, json: async () => ({ secure_url: `https://res.cloudinary.com/test-cloud/raw/authenticated/v1/${id}`, public_id: id, resource_type: 'raw', type: 'authenticated' }) };
    });

    await expect(guardar(Buffer.from('%PDF-1.4\n%%EOF'))).resolves.toMatch(/^https:\/\/res\.cloudinary\.com\/test-cloud\/raw\/authenticated\/v1\/yesems\/aula\/[a-f0-9-]{36}\.pdf$/);
  });
});
