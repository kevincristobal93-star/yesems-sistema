const crypto = require('crypto');
const { verifyWebhookSignature, getConfiguration } = require('../src/services/mercado-pago.service');

describe('integración segura de Mercado Pago', () => {
  test('acepta una firma HMAC válida asociada al id y request-id', () => {
    const secret = 'test-webhook-secret';
    const requestId = 'request-123';
    const dataId = '998877';
    const ts = '1704908010';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const signature = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    expect(verifyWebhookSignature({ signature: `ts=${ts},v1=${signature}`, requestId, dataId, secret })).toBe(true);
  });

  test('rechaza firma manipulada, ids faltantes o secretos ausentes', () => {
    const secret = 'test-webhook-secret';
    const requestId = 'request-123';
    const dataId = '998877';
    const ts = '1704908010';
    const signature = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
    expect(verifyWebhookSignature({ signature: `ts=${ts},v1=${signature}`, requestId: 'other-request', dataId, secret })).toBe(false);
    expect(verifyWebhookSignature({ signature: `ts=${ts},v1=${signature}`, requestId, dataId, secret: '' })).toBe(false);
    expect(verifyWebhookSignature({ signature: 'bad', requestId, dataId, secret })).toBe(false);
  });

  test('no habilita pagos sin configuración privada completa', () => {
    const keys = ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET', 'MERCADOPAGO_WEBHOOK_URL', 'MERCADOPAGO_FRONTEND_URL'];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      keys.forEach((key) => { delete process.env[key]; });
      expect(getConfiguration()).toBeNull();
    } finally {
      keys.forEach((key) => {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      });
    }
  });
});
