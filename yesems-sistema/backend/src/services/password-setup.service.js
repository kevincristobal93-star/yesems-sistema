const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const access = require('./acceso.service');
const { validatePassword } = require('./password.service');
const { httpError } = require('../utils/http-error');

// Solo una verificación reciente de Google o un código consumido emite este permiso.
// No es un token de sesión y nunca permite reemplazar una contraseña existente.
async function complete(body, ip) {
  await access.limit('password-setup:' + access.digest(ip), 10, 900);
  let claims;
  try {
    claims = jwt.verify(body.setup_token, process.env.JWT_SECRET, {
      algorithms: ['HS256'], audience: 'yesems-password-setup',
    });
    if (claims.purpose !== 'password_setup' || !Number.isSafeInteger(claims.id_usuario) || claims.id_usuario <= 0) throw Error();
  } catch (_) { throw httpError(401, 'La verificación venció o no es válida. Verifica de nuevo tu correo o entra con Google.'); }
  validatePassword(body.password);
  if (body.password !== body.confirmacion) throw httpError(400, 'Las contraseñas no coinciden.');
  const hash = await bcrypt.hash(body.password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('SELECT * FROM usuarios WHERE id_usuario=$1 FOR UPDATE', [claims.id_usuario])).rows[0];
    if (!user || !user.activo || !['cliente', 'alumno'].includes(user.rol) || !user.email_verificado_at ||
        (user.token_version || 0) !== (claims.token_version || 0)) throw httpError(401, 'Vuelve a verificar tu cuenta para continuar.');
    if (user.password_hash) throw httpError(409, 'Ya tienes una contraseña de YES EMS. Inicia sesión o utiliza la recuperación.');
    const needsProfile = !user.google_sub && (!user.nombre || !user.apellido);
    const profile = needsProfile ? access.profile(body) : user;
    const saved = (await client.query(`UPDATE usuarios SET password_hash=$2, token_version=token_version+1,
      nombre=$3, apellido=$4, telefono=$5 WHERE id_usuario=$1 RETURNING *`,
    [user.id_usuario, hash, profile.nombre, profile.apellido, profile.telefono])).rows[0];
    await client.query('DELETE FROM acceso_codigos WHERE email=ANY($1::text[])',
      [[user.email, 'password:' + user.email, 'change:' + user.id_usuario + ':' + user.email]]);
    await client.query('COMMIT');
    return access.session(saved);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { complete };
