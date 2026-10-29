const { EventEmitter } = require('node:events');

describe('Configuración PostgreSQL para conexiones interrumpibles', () => {
  const originalEnv = process.env;
  let options;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    jest.doMock('pg', () => ({ Pool: jest.fn(config => {
      options = config;
      return new EventEmitter();
    }) }));
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.dontMock('pg');
    jest.dontMock('dotenv');
  });
  test('prioriza DATABASE_URL y limita el pool conservando SSL', () => {
    process.env.DATABASE_URL = 'postgresql://example:example@localhost/example';
    process.env.NODE_ENV = 'production';
    require('../src/config/db');
    expect(options).toEqual({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
    });
  });
  test('conserva la alternativa de desarrollo local', () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'example';
    require('../src/config/db');
    expect(options.host).toBe('localhost');
    expect(options.database).toBe('example');
    expect(options.connectionString).toBeUndefined();
  });
  test('un error inactivo no termina el proceso ni revela el error original', () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const pool = require('../src/config/db');
    pool.emit('error', Object.assign(new Error('sensitive connection details'), { code: 'ECONNRESET' }));
    expect(exit).not.toHaveBeenCalled();
    expect(log).toHaveBeenLastCalledWith('Conexión inactiva de PostgreSQL interrumpida:', 'ECONNRESET');
    pool.emit('error', { code: 'postgresql://sensitive' });
    expect(log).toHaveBeenLastCalledWith('Conexión inactiva de PostgreSQL interrumpida:', 'UNKNOWN');
  });
});
