jest.mock('../src/services/storage.service', () => ({ cloudinaryEnabled: true, obtenerUrlDescarga: jest.fn() }));

const { guardar, validarDocumento, descargar, descartar } = require('../src/services/aula-files.service');
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

  test.each(['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'zip'])('sube %s raw autenticado y conserva su extensión', async extension => {
    process.env.CLOUDINARY_API_SECRET = 'secret-test-only';
    process.env.CLOUDINARY_API_KEY = 'key-test-only';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    global.fetch = jest.fn().mockImplementation(async (_url, options) => {
      const id = options.body.get('public_id');
      expect(options.body.get('type')).toBe('authenticated');
      expect(options.body.get('overwrite')).toBe('false');
      expect(options.body.get('file')).toBeInstanceOf(Blob);
      expect(options.body.get('file').name).toBe(`material.${extension}`);
      expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('key-test-only:secret-test-only').toString('base64')}`);
      return { ok: true, status: 200, json: async () => ({ secure_url: `https://res.cloudinary.com/test-cloud/raw/authenticated/v1/${id}`, public_id: id, resource_type: 'raw', type: 'authenticated' }) };
    });

    await expect(guardar(Buffer.from('test'), extension)).resolves.toMatch(new RegExp(`/yesems/aula/[a-f0-9-]{36}\\.${extension}$`));
  });
  test('descarga documentos con su tipo y extensión y valida ubicación privada', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    const buffer = Buffer.from('Material del curso');
    global.fetch = jest.fn().mockResolvedValue(new Response(buffer));
    const res = { set: jest.fn(), attachment: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };
    const doc = { id_documento: 12, bytes: buffer.length, archivo_url: 'https://res.cloudinary.com/test-cloud/raw/authenticated/v1/yesems/aula/12345678-1234-1234-1234-123456789012.txt' };
    await descargar(res, doc);
    expect(res.attachment).toHaveBeenCalledWith('material-12.txt');
    expect(res.type).toHaveBeenCalledWith('text/plain');
    expect(res.send).toHaveBeenCalledWith(buffer);
    await expect(descargar(res, { ...doc, archivo_url: doc.archivo_url.replace('.txt', '.exe') })).rejects.toMatchObject({ statusCode: 502 });
    await expect(descartar(doc.archivo_url.replace('test-cloud', 'other-cloud'))).rejects.toThrow();
  });
});

describe('validación de documentos', () => {
  test.each(['txt', 'csv', 'md'])('admite texto UTF-8 %s aunque el navegador omita MIME', extension => {
    const buffer = Buffer.from('Guía del curso, actividad 1');
    expect(validarDocumento({ originalname: `material.${extension.toUpperCase()}`, buffer })).toEqual({ buffer, extension });
  });
  test.each(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'zip'])('comprueba contenedor ZIP en %s', extension => {
    expect(() => validarDocumento({ originalname: `material.${extension}`, buffer: Buffer.from('archivo falso') })).toThrow();
    expect(validarDocumento({ originalname: `material.${extension}`, buffer: Buffer.from('504b030400000000', 'hex') }).extension).toBe(extension);
  });
  test('rechaza ejecutables, formatos desconocidos, vacíos y exceso de tamaño', () => {
    for (const file of [
      { originalname: 'app.exe', buffer: Buffer.from('MZ') },
      { originalname: 'app.exe.txt', buffer: Buffer.from('MZ executable') },
      { originalname: 'app.html', buffer: Buffer.from('<script>') },
      { originalname: 'file.txt', buffer: Buffer.alloc(0) },
      { originalname: 'file.txt', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 65) },
      { originalname: 'file.pdf', buffer: Buffer.from('not a PDF') },
    ]) expect(() => validarDocumento(file)).toThrow();
  });
});
