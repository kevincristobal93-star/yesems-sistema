'use strict';
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function main() {
  const connection = process.env.YESEMS_RESET_DATABASE_URL;
  const password = process.env.YESEMS_RESET_PASSWORD;
  delete process.env.YESEMS_RESET_DATABASE_URL;
  delete process.env.YESEMS_RESET_PASSWORD;
  if (!connection || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Usa el archivo PowerShell y una contrasena de al menos 12 caracteres y hasta 72 bytes.');
  }
  let url;
  try { url = new URL(connection); } catch { throw new Error('Conexion no valida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'dpg-darij8vpn0mc73cna9bg-a.oregon-postgres.render.com' || url.pathname !== '/yesems_db') {
    throw new Error('La conexion debe corresponder a yesems-db en Render.');
  }
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith('ssl')) url.searchParams.delete(key);
  const client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
  let transaction = false;
  try {
    await client.connect();
    await client.query('BEGIN'); transaction = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const account = await client.query('SELECT id_administrador,activo FROM public.administradores WHERE lower(btrim(email))=$1 FOR UPDATE', ['planeacionesyesems02@gmail.com']);
    if (account.rowCount !== 1 || !account.rows[0].activo) throw new Error('No existe exactamente una cuenta activa para el correo esperado.');
    const hash = await bcrypt.hash(password, 10);
    const updated = await client.query('UPDATE public.administradores SET password_hash=$1 WHERE id_administrador=$2 RETURNING password_hash', [hash, account.rows[0].id_administrador]);
    if (updated.rowCount !== 1 || !await bcrypt.compare(password, updated.rows[0].password_hash)) throw new Error('No se pudo verificar el cambio.');
    await client.query('COMMIT'); transaction = false;
    console.log('Contrasena actualizada: planeacionesyesems02@gmail.com. Puedes iniciar sesion con la nueva contrasena.');
    console.log('Las sesiones administrativas existentes pueden seguir vigentes hasta su vencimiento (8 horas).');
  } catch {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw new Error('No se confirmo el cambio. Comprueba la conexion y el estado de la cuenta; si se interrumpio al guardar, prueba el acceso antes de repetir.');
  } finally { await client.end().catch(() => {}); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
