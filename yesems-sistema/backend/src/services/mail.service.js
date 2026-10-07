// Envío servidor-servidor. Nunca devolver respuestas OAuth ni contenido de correo.
const { randomUUID } = require('crypto');
// Solo estos identificadores públicos del proveedor pueden llegar a los logs.
// Nunca registrar error_description, message, cabeceras ni el cuerpo original.
const safeCodes = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client', 'invalid_scope',
  'access_denied', 'temporarily_unavailable', 'invalid_request', 'insufficientPermissions',
  'accessNotConfigured', 'rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded',
  'quotaExceeded', 'forbidden', 'authError', 'backendError', 'failedPrecondition',
  'UNAUTHENTICATED', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION']);
async function responseCode(response) {
  try {
    const body = await response.json();
    const candidates = [body?.error, ...(Array.isArray(body?.error?.errors) ? body.error.errors.map(item => item?.reason) : []), body?.error?.status];
    return candidates.find(code => typeof code === 'string' && safeCodes.has(code)) || 'provider_error';
  } catch (_) { return 'provider_error'; }
}
const mailbox = value => typeof value === 'string' && value.length <= 150 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(value);
function provider() { return process.env.EMAIL_PROVIDER || 'resend'; }
function configured() {
  if (provider() === 'gmail') return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN && mailbox(process.env.GMAIL_SENDER_EMAIL));
  if (provider() === 'resend') return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
  return false;
}
async function send({to,subject,text}) {
  const diagnostic = { event: 'mail_delivery_failed', reference: randomUUID(),
    provider: ['gmail','resend'].includes(provider()) ? provider() : 'unsupported',
    stage: 'validation', status: null, code: 'invalid_configuration_or_message' };
  async function check(response) {
    diagnostic.status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
    if (!response.ok) { diagnostic.code = await responseCode(response); throw new Error(); }
    diagnostic.code = 'invalid_response';
  }
  try {
    if (!configured() || !mailbox(to) || typeof subject !== 'string' || /[\r\n]/.test(subject) || typeof text !== 'string') throw new Error();
    const signal = AbortSignal.timeout(15000);
    if (provider() === 'resend') {
      diagnostic.stage = 'resend_send'; diagnostic.code = 'network_error';
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST',signal,headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({from:process.env.AUTH_EMAIL_FROM,to:[to],subject,text}),
      });
      await check(response);
      return;
    }
    diagnostic.stage = 'oauth_refresh'; diagnostic.code = 'network_error';
    const refresh = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST',signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:process.env.GMAIL_CLIENT_ID,client_secret:process.env.GMAIL_CLIENT_SECRET,refresh_token:process.env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString(),
    });
    await check(refresh);
    const credentials = await refresh.json();
    if (typeof credentials.access_token !== 'string' || !credentials.access_token || /\s/.test(credentials.access_token)) throw new Error();
    const mime = [
      `From: YES EMS <${process.env.GMAIL_SENDER_EMAIL}>`, `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', Buffer.from(text).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '',
    ].join('\r\n');
    diagnostic.stage = 'gmail_send'; diagnostic.status = null; diagnostic.code = 'network_error';
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method:'POST',signal,headers:{Authorization:`Bearer ${credentials.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),
    });
    await check(response);
    const result=await response.json();
    if (typeof result.id !== 'string' || !result.id) throw new Error();
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') diagnostic.code = 'timeout';
    console.error('[mail-diagnostic]', JSON.stringify(diagnostic));
    // La referencia permite localizar el log; no incluye datos de la cuenta.
    throw Object.assign(new Error('No se pudo enviar el correo.'), { mailReference: diagnostic.reference });
  }
}
module.exports={configured,send,diagnosticVersion:'mail-v1'};
