const proxyAddress = require('proxy-addr');

describe('Direcciones de proxy: regresión de seguridad', () => {
  test('una subred IPv6 incorrecta no confía en cualquier dirección IPv4', () => {
    const trust = proxyAddress.compile('::ffff:10.0.0.0/8');
    expect(trust('203.0.113.25')).toBe(false);
    const req = { socket: { remoteAddress: '203.0.113.25' }, headers: { 'x-forwarded-for': '192.0.2.50' } };
    expect(proxyAddress(req, trust)).toBe('203.0.113.25');
  });

  test('la subred IPv4 correcta conserva su comportamiento', () => {
    const trust = proxyAddress.compile('10.0.0.0/8');
    expect(trust('10.1.2.3')).toBe(true);
    expect(trust('203.0.113.25')).toBe(false);
  });
});
