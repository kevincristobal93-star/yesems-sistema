const crypto = require('crypto');

const API_URL = 'https://api.mercadopago.com';

function getConfiguration() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  const frontendUrl = process.env.MERCADOPAGO_FRONTEND_URL?.trim();
  const webhookUrl = process.env.MERCADOPAGO_WEBHOOK_URL?.trim();
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!accessToken || !frontendUrl || !webhookUrl || !webhookSecret) return null;

  let frontend;
  let webhook;
  try {
    frontend = new URL(frontendUrl);
    webhook = new URL(webhookUrl);
  } catch {
    return null;
  }
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && (frontend.protocol !== 'https:' || webhook.protocol !== 'https:')) return null;
  if (webhook.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(webhook.hostname)) return null;

  return { accessToken, frontendUrl: frontend.origin, webhookUrl: webhook.toString(), webhookSecret };
}

async function mercadoPagoRequest(path, options = {}) {
  const config = getConfiguration();
  if (!config) throw Object.assign(new Error('Mercado Pago aún no está configurado en el servidor.'), { statusCode: 503 });

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Never log or return provider payloads: they may include private payment details.
    throw Object.assign(new Error('Mercado Pago no pudo procesar la operación. Intenta nuevamente.'), { statusCode: 502 });
  }
  return data;
}

function verifyWebhookSignature({ signature, requestId, dataId, secret }) {
  if (!signature || !requestId || !dataId || !secret) return false;
  const fields = Object.fromEntries(signature.split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter(([key, value]) => key && value));
  if (!fields.ts || !fields.v1) return false;

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${fields.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  let received;
  try { received = Buffer.from(fields.v1, 'hex'); } catch { return false; }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function createPreference({ paymentId, enrollmentId, amount, courseName, email, externalReference }) {
  const config = getConfiguration();
  if (!config) throw Object.assign(new Error('Mercado Pago aún no está configurado en el servidor.'), { statusCode: 503 });
  const query = new URLSearchParams({ inscripcion: String(enrollmentId), pago: String(paymentId) });
  const returnUrl = `${config.frontendUrl}/pago.html?${query.toString()}`;
  const preference = await mercadoPagoRequest('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ id: String(enrollmentId), title: `Curso YES EMS: ${courseName}`, quantity: 1, currency_id: 'MXN', unit_price: Number(amount) }],
      payer: { email },
      external_reference: externalReference,
      notification_url: config.webhookUrl,
      back_urls: {
        success: `${returnUrl}&resultado=success`,
        pending: `${returnUrl}&resultado=pending`,
        failure: `${returnUrl}&resultado=failure`,
      },
      auto_return: 'approved',
      metadata: { id_pago: paymentId, id_inscripcion: enrollmentId },
    }),
  });
  const isTest = config.accessToken.startsWith('TEST-');
  const checkoutUrl = isTest ? preference.sandbox_init_point : preference.init_point;
  if (!preference.id || !checkoutUrl) throw Object.assign(new Error('Mercado Pago devolvió una preferencia incompleta.'), { statusCode: 502 });
  return { id: String(preference.id), checkoutUrl };
}

async function getPayment(paymentId) {
  return mercadoPagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

module.exports = { getConfiguration, verifyWebhookSignature, createPreference, getPayment };
