const bcrypt = require('bcrypt');
const pool = require('../config/db');
const access = require('./acceso.service');
const fail = (statusCode,message)=>Object.assign(new Error(message),{statusCode});
const generic = 'Si la cuenta está disponible, podrás cambiar su contraseña con el código enviado. Revisa tu correo.';
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password,'utf8') > 72 || !password.trim()) {
    throw fail(400,'Usa una contraseña de al menos 12 caracteres y como máximo 72 bytes.');
  }
}
async function ownAddress(id) {
  const result = await pool.query('SELECT email FROM usuarios WHERE id_usuario=$1 AND activo=true', [id]);
  if (!result.rows[0]) throw fail(401,'Cuenta no disponible.');
  return access.email(result.rows[0].email);
}
async function requestCode(address,ip,userId) {
  address = userId ? await ownAddress(userId) : access.email(address);
  // Misma respuesta y envío para todo correo válido: no revela si existe una cuenta.
  await access.sendCode(address,ip,userId ? 'change:'+userId : 'password');
  return {ok:true,mensaje:generic};
}
async function update(body,ip,userId) {
  await access.limit('password-verify:'+access.digest(ip),20,900);
  validatePassword(body.password);
  if (body.password !== body.confirmacion) throw fail(400,'Las contraseñas no coinciden.');
  const address=userId ? await ownAddress(userId) : access.email(body.email);
  const key=(userId ? 'change:'+userId : 'password')+':'+address;
  const hash=await bcrypt.hash(body.password,10);
  await access.consumeCode(key,body.codigo,async(client)=>{
    const {rows}=await client.query('SELECT id_usuario,activo,rol FROM usuarios WHERE lower(btrim(email))=$1 FOR UPDATE',[address]);
    if(rows.length!==1 || !rows[0].activo || !['cliente','alumno'].includes(rows[0].rol) || (userId && rows[0].id_usuario!==userId)) {
      throw fail(400,'No fue posible cambiar la contraseña. Revisa los datos o contacta al centro.');
    }
    await client.query(`UPDATE usuarios SET password_hash=$1,token_version=token_version+1,
      email_verificado_at=COALESCE(email_verificado_at,now()) WHERE id_usuario=$2`,[hash,rows[0].id_usuario]);
    // Invalida también códigos previos de acceso/recuperación/cambio.
    await client.query('DELETE FROM acceso_codigos WHERE email=ANY($1::text[]) AND email<>$2',[[address,'password:'+address,'change:'+rows[0].id_usuario+':'+address],key]);
  });
  return {ok:true,mensaje:'Contraseña actualizada. Las sesiones anteriores se cerraron. Inicia sesión con tu nueva contraseña.'};
}
module.exports={requestCode,update,validatePassword};
