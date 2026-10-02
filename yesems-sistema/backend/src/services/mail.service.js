// Envío servidor-servidor. Nunca devolver respuestas OAuth ni contenido de correo.
const mailbox = value => typeof value === 'string' && value.length <= 150 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(value);
function provider() { return process.env.EMAIL_PROVIDER || 'resend'; }
function configured() {
  if (provider() === 'gmail') return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN && mailbox(process.env.GMAIL_SENDER_EMAIL));
  if (provider() === 'resend') return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
  return false;
}
async function send({to,subject,text}) {
  try {
    if (!configured() || !mailbox(to) || typeof subject !== 'string' || /[\r\n]/.test(subject) || typeof text !== 'string') throw new Error();
    const signal = AbortSignal.timeout(15000);
    if (provider() === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST',signal,headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({from:process.env.AUTH_EMAIL_FROM,to:[to],subject,text}),
      });
      if (!response.ok) throw new Error();
      return;
    }
    const refresh = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST',signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:process.env.GMAIL_CLIENT_ID,client_secret:process.env.GMAIL_CLIENT_SECRET,refresh_token:process.env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString(),
    });
    if (!refresh.ok) throw new Error();
    const credentials = await refresh.json();
    if (typeof credentials.access_token !== 'string' || !credentials.access_token || /\s/.test(credentials.access_token)) throw new Error();
    const mime = [
      `From: YES EMS <${process.env.GMAIL_SENDER_EMAIL}>`, `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', Buffer.from(text).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '',
    ].join('\r\n');
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method:'POST',signal,headers:{Authorization:`Bearer ${credentials.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),
    });
    if (!response.ok) throw new Error();
    const result=await response.json();
    if (typeof result.id !== 'string' || !result.id) throw new Error();
  } catch (_) {
    // No registrar cuerpos, códigos, tokens ni errores originales del proveedor.
    throw new Error('No se pudo enviar el correo.');
  }
}
module.exports={configured,send};
