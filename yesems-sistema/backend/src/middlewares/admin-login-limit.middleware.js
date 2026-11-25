const access = require('../services/acceso.service');
const { isIP } = require('node:net');

const WINDOW_SECONDS = 15 * 60;
const IP_ATTEMPT_LIMIT = 30;
const EMAIL_ATTEMPT_LIMIT = 10;
const RATE_LIMIT_MESSAGE = 'Demasiados intentos de acceso. Espera unos minutos e inténtalo de nuevo.';
const UNAVAILABLE_MESSAGE = 'No fue posible iniciar sesión. Intenta más tarde.';

function getClientIp(req, production = process.env.NODE_ENV === 'production') {
  if (production) {
    // Render sits behind Cloudflare. Never use req.ip/X-Forwarded-For here:
    // they may identify the shared proxy or contain an untrusted chain.
    const edgeIp = req.get?.('cf-connecting-ip') || req.headers?.['cf-connecting-ip'];
    return typeof edgeIp === 'string' && isIP(edgeIp.trim()) ? edgeIp.trim() : null;
  }

  const ip = typeof req.ip === 'string' ? req.ip.trim() : '';
  return isIP(ip) ? ip : null;
}

async function limitAdminLogin(req, res, next) {
  const ip = getClientIp(req);
  const email = typeof req.body?.email === 'string'
    ? req.body.email.trim().toLowerCase().slice(0, 151)
    : '';

  try {
    // In production, if the trusted edge header is absent, skip the IP bucket
    // instead of grouping every visitor under Render's proxy address.
    if (ip) {
      await access.limit(`admin-login-ip:${access.digest(ip)}`, IP_ATTEMPT_LIMIT, WINDOW_SECONDS);
    }

    if (email) {
      await access.limit(`admin-login-email:${access.digest(email)}`, EMAIL_ATTEMPT_LIMIT, WINDOW_SECONDS);
    }

    return next();
  } catch (error) {
    if (error.statusCode === 429) {
      return res.status(429).json({ ok: false, mensaje: RATE_LIMIT_MESSAGE });
    }

    return res.status(503).json({ ok: false, mensaje: UNAVAILABLE_MESSAGE });
  }
}

limitAdminLogin.getClientIp = getClientIp;
module.exports = limitAdminLogin;
