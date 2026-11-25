jest.mock('../src/services/acceso.service', () => ({
  digest: jest.fn(value => `digest:${value}`),
  limit: jest.fn(),
}));

const access = require('../src/services/acceso.service');
const limitAdminLogin = require('../src/middlewares/admin-login-limit.middleware');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('limitAdminLogin', () => {
  beforeEach(() => jest.clearAllMocks());

  test('aplica límites por IP y por correo normalizado usando digests', async () => {
    const req = { ip: '192.0.2.10', body: { email: '  Admin@Example.test  ' } };
    const res = response();
    const next = jest.fn();

    await limitAdminLogin(req, res, next);

    expect(access.limit).toHaveBeenNthCalledWith(1, 'admin-login-ip:digest:192.0.2.10', 30, 900);
    expect(access.limit).toHaveBeenNthCalledWith(2, 'admin-login-email:digest:admin@example.test', 10, 900);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rechaza un exceso de intentos con un mensaje que no revela la cuenta', async () => {
    access.limit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }));
    const res = response();
    const next = jest.fn();

    await limitAdminLogin({ ip: '192.0.2.10', body: { email: 'admin@example.test' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      mensaje: 'Demasiados intentos de acceso. Espera unos minutos e inténtalo de nuevo.',
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('admin@example.test');
    expect(next).not.toHaveBeenCalled();
  });

  test('responde de forma genérica si falla el limitador', async () => {
    access.limit.mockRejectedValueOnce(new Error('database details must not be exposed'));
    const res = response();
    const next = jest.fn();

    await limitAdminLogin({ ip: '192.0.2.10', body: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ ok: false, mensaje: 'No fue posible iniciar sesión. Intenta más tarde.' });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('database details');
    expect(next).not.toHaveBeenCalled();
  });

  test('si el cuerpo no incluye correo, limita por IP y deja validar el campo al controlador', async () => {
    const res = response();
    const next = jest.fn();

    await limitAdminLogin({ ip: '192.0.2.10', body: {} }, res, next);

    expect(access.limit).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('en producción usa solo la IP validada de Cloudflare, no req.ip ni X-Forwarded-For', async () => {
    const middleware = require('../src/middlewares/admin-login-limit.middleware');

    expect(middleware.getClientIp({
      ip: '10.0.0.5',
      headers: {
        'cf-connecting-ip': '203.0.113.8',
        'x-forwarded-for': '198.51.100.77, 10.0.0.5',
      },
    }, true)).toBe('203.0.113.8');
    expect(middleware.getClientIp({
      ip: '10.0.0.5',
      headers: { 'x-forwarded-for': '198.51.100.77' },
    }, true)).toBeNull();
  });

  test('si falta IP confiable en producción no aplica un límite global al proxy', async () => {
    const req = {
      ip: '10.0.0.5',
      headers: { 'x-forwarded-for': '198.51.100.77' },
      body: { email: 'admin@example.test' },
    };
    const res = response();
    const next = jest.fn();
    const originalNodeEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'production';
    try {
      await limitAdminLogin(req, res, next);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }

    expect(access.limit).toHaveBeenCalledTimes(1);
    expect(access.limit).toHaveBeenCalledWith('admin-login-email:digest:admin@example.test', 10, 900);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
