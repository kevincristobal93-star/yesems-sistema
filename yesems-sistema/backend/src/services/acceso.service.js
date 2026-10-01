const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
function email(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized.length > 150 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(normalized)) throw fail(400, 'Escribe un correo válido.');
  return normalized;
}
function profile(body) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const apellido = typeof body.apellido === 'string' ? body.apellido.trim() : '';
  const telefono = typeof body.telefono === 'string' ? body.telefono.replace(/[\s()-]/g, '') : '';
  if (!nombre || nombre.length > 100 || !apellido || apellido.length > 100 || !/^\+?[0-9]{10,15}$/.test(telefono)) throw fail(400, 'Completa nombre, apellidos y teléfono de contacto (10 a 15 dígitos).');
  return { nombre, apellido, telefono };
}
const digest = (value) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(value).digest('hex');
function config() {
  return { correo: Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM), google_client_id: process.env.GOOGLE_CLIENT_ID || null };
}
async function limit(key, max, seconds) {
  const result = await pool.query(`INSERT INTO acceso_limites(clave,cantidad,expira) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(clave) DO UPDATE SET cantidad=CASE WHEN acceso_limites.expira<=now() THEN 1 ELSE acceso_limites.cantidad+1 END,
    expira=CASE WHEN acceso_limites.expira<=now() THEN EXCLUDED.expira ELSE acceso_limites.expira END RETURNING cantidad`, [key, seconds]);
  if (result.rows[0].cantidad > max) throw fail(429, 'Límite de intentos alcanzado. Intenta más tarde.');
}
async function sendCode(address, ip, purpose = 'access') {
  address = email(address);
  const storageKey = purpose === 'access' ? address : purpose + ':' + address;
  if (!config().correo) throw fail(503, 'La verificación por correo aún no está configurada. Las cuentas existentes pueden usar su contraseña.');
  await limit('send-ip:' + digest(ip), 5, 3600);
  await pool.query("DELETE FROM acceso_codigos WHERE expira<now()-interval '1 day'");
  await pool.query("DELETE FROM acceso_limites WHERE expira<now()-interval '1 day'");
  await pool.query('DELETE FROM acceso_nonces WHERE expira<now()');
  await limit('send-email:' + digest(address), 1, 60);
  // Ventana móvil para no rebasar 90 envíos en 24h ni 2700 en 32 días.
  // Serializar cupo global: incluye reservas fallidas (no se reembolsan).
  const budget = await pool.connect();
  try {
    await budget.query('BEGIN');
    await budget.query("SELECT pg_advisory_xact_lock(805019)");
    const used = (await budget.query(`SELECT count(*) FILTER(WHERE enviado>now()-interval '24 hours')::int AS dia,
      count(*)::int AS mes FROM acceso_envios WHERE enviado>now()-interval '32 days'`)).rows[0];
    if (used.dia >= 90 || used.mes >= 2700) throw fail(429, 'Se alcanzó el límite gratuito de correo. Intenta más tarde.');
    await budget.query('INSERT INTO acceso_envios DEFAULT VALUES');
    await budget.query("DELETE FROM acceso_envios WHERE enviado<now()-interval '32 days'");
    await budget.query('COMMIT');
  } catch(error) { await budget.query('ROLLBACK'); throw error; }
  finally { budget.release(); }
  const code = String(crypto.randomInt(100000, 1000000));
  const hash = digest(storageKey + ':' + code);
  await pool.query(`INSERT INTO acceso_codigos(email,hash,expira) VALUES($1,$2,now()+interval '10 minutes')
    ON CONFLICT(email) DO UPDATE SET hash=$2,expira=EXCLUDED.expira,intentos=0,enviado=now()`, [storageKey, hash]);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [address], subject: purpose === 'access' ? 'Tu código de acceso a YES EMS' : 'Cambio de contraseña de YES EMS',
        text: `Tu código es ${code}. ${purpose === 'access' ? 'Permite acceder a tu cuenta.' : 'Permite cambiar la contraseña de tu cuenta, si está registrada. NO es un código de inicio de sesión.'} Vence en 10 minutos y solo puede usarse una vez. No lo compartas. Si no lo solicitaste, ignora este mensaje.` }),
    });
    if (!response.ok) throw new Error('mail');
  } catch (_) {
    await pool.query('DELETE FROM acceso_codigos WHERE email=$1 AND hash=$2', [storageKey, hash]);
    throw fail(503, 'No se pudo enviar el código. Intenta más tarde.');
  }
}
async function consumeCode(address, code, onVerified) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw fail(400, 'Escribe el código de seis dígitos.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Todos los propósitos de una cuenta usan el mismo orden de bloqueo.
    // Evita interbloqueos al invalidar otros códigos durante un cambio simultáneo.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [address.split(':').pop()]);
    const { rows } = await client.query('SELECT * FROM acceso_codigos WHERE email=$1 FOR UPDATE', [address]);
    const row = rows[0];
    if (!row || row.intentos >= 5 || new Date(row.expira) <= new Date()) throw fail(400, 'Código inválido o vencido. Solicita uno nuevo.');
    const valid = crypto.timingSafeEqual(Buffer.from(row.hash, 'hex'), Buffer.from(digest(address + ':' + code), 'hex'));
    if (!valid) {
      await client.query('UPDATE acceso_codigos SET intentos=intentos+1 WHERE email=$1', [address]);
      await client.query('COMMIT');
      throw fail(400, 'Código inválido o vencido.');
    }
    if (onVerified) await onVerified(client);
    await client.query('DELETE FROM acceso_codigos WHERE email=$1', [address]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
function session(user) {
  return { ok: true, token: jwt.sign({ id_usuario: user.id_usuario, email: user.email, rol: user.rol, token_version: user.token_version || 0 }, process.env.JWT_SECRET, { expiresIn: '8h' }),
    usuario: { id_usuario: user.id_usuario, nombre: user.nombre, apellido: user.apellido, email: user.email, rol: user.rol } };
}
async function account(address, data, googleSub = null) {
  const result = await pool.query('SELECT * FROM usuarios WHERE lower(btrim(email))=$1', [address]);
  if (result.rows.length > 1) throw fail(409, 'Esta cuenta requiere revisión del administrador. No se modificaron tus datos.');
  let user = result.rows[0];
  if (user) {
    if (!user.activo || !['cliente','alumno'].includes(user.rol)) throw fail(403, 'No se puede acceder a esta cuenta por este medio.');
    if (googleSub && user.google_sub !== googleSub) throw fail(409, 'Ya tienes cuenta. Accede con un código por correo o con tu contraseña; no crearemos otra cuenta.');
    user = (await pool.query('UPDATE usuarios SET email_verificado_at=COALESCE(email_verificado_at,now()) WHERE id_usuario=$1 RETURNING *', [user.id_usuario])).rows[0];
  } else {
    const p = profile(data);
    user = (await pool.query(`INSERT INTO usuarios(nombre,apellido,email,telefono,rol,email_verificado_at,google_sub)
      VALUES($1,$2,$3,$4,'cliente',now(),$5) RETURNING *`, [p.nombre,p.apellido,address,p.telefono,googleSub])).rows[0];
  }
  return session(user);
}
async function byEmail(body, ip) {
  const address = email(body.email);
  await limit('verify:' + digest(ip), 30, 900);
  const found = await pool.query('SELECT id_usuario FROM usuarios WHERE lower(btrim(email))=$1', [address]);
  if (!found.rows.length) profile(body);
  await consumeCode(address, body.codigo);
  return account(address, body);
}
function challenge() {
  if (!config().google_client_id) throw fail(503, 'Google aún no está configurado.');
  const nonce = crypto.randomBytes(24).toString('hex');
  return { nonce, challenge: jwt.sign({ nonce, purpose: 'google' }, process.env.JWT_SECRET, { expiresIn: '5m', audience: 'google-auth' }) };
}
async function byGoogle(body, ip) {
  if (!config().google_client_id) throw fail(503, 'Google aún no está configurado.');
  await limit('google:' + digest(ip), 20, 900);
  let payload; let state;
  try {
    state = jwt.verify(body.challenge, process.env.JWT_SECRET, { audience: 'google-auth', algorithms: ['HS256'] });
    const { OAuth2Client } = require('google-auth-library');
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: body.credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
    if (state.purpose !== 'google' || !state.nonce || payload.nonce !== state.nonce || !payload.sub || !payload.email_verified) throw new Error();
  } catch (_) { throw fail(401, 'No se pudo verificar el acceso con Google. Intenta nuevamente.'); }
  const address = email(payload.email);
  if (!address.endsWith('@gmail.com') && !payload.hd) throw fail(400, 'Para este correo utiliza la opción de código por correo.');
  const known = await pool.query('SELECT * FROM usuarios WHERE google_sub=$1', [payload.sub]);
  if (!known.rows.length) {
    const existing = await pool.query('SELECT id_usuario FROM usuarios WHERE lower(btrim(email))=$1', [address]);
    if (!existing.rows.length) profile(body);
  }
  const nonce = await pool.query("INSERT INTO acceso_nonces(nonce,expira) VALUES($1,now()+interval '5 minutes') ON CONFLICT DO NOTHING RETURNING nonce", [state.nonce]);
  if (!nonce.rows.length) throw fail(401, 'Acceso ya utilizado. Vuelve a intentarlo.');
  if (known.rows.length) {
    const user = known.rows[0];
    if (!user.activo || !['cliente','alumno'].includes(user.rol)) throw fail(403, 'Cuenta no disponible.');
    return session(user);
  }
  return account(address, body, payload.sub);
}
module.exports = { config, email, profile, sendCode, consumeCode, byEmail, byGoogle, challenge, limit, digest };
