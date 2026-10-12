'use strict';

// Operacion manual autorizada: crear a Oscar y eliminar los otros administradores.
// No carga .env ni utiliza la base local. Ejecutar con admin-unico-oscar.ps1.
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function main() {
  const connectionString = process.env.YESEMS_ADMIN_DATABASE_URL;
  let password = process.env.YESEMS_ADMIN_PASSWORD;
  delete process.env.YESEMS_ADMIN_DATABASE_URL;
  delete process.env.YESEMS_ADMIN_PASSWORD;
  if (!connectionString || !password) throw new Error('Utiliza el archivo PowerShell para introducir los datos de forma oculta.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== 'dpg-darij8vpn0mc73cna9bg-a.oregon-postgres.render.com'
      || url.pathname !== '/yesems_db') {
    throw new Error('La conexion no corresponde a la base yesems-db revisada en Render.');
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('El acceso administrativo requiere entre 8 caracteres y 72 bytes.');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  if (!(await bcrypt.compare(password, passwordHash))) throw new Error('No fue posible verificar la contrasena.');
  password = undefined;
  // Evita que parametros de la URL desactiven la validacion del certificado.
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('ssl')) url.searchParams.delete(key);
  }
  const client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
  let transaction = false;
  try {
    await client.connect();
    await client.query('BEGIN');
    transaction = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query('LOCK TABLE public.administradores IN EXCLUSIVE MODE');
    const email = 'planeacionesyesems02@gmail.com';
    const existing = await client.query('SELECT id_administrador FROM public.administradores WHERE lower(btrim(email))=$1', [email]);
    if (existing.rowCount) throw new Error('Oscar ya existe. Se cancela sin sobrescribir su cuenta ni eliminar administradores.');
    // Cancela si el esquema adquiere borrados en cascada u otros efectos sobre tablas relacionadas.
    const unsafe = await client.query("SELECT 1 FROM pg_constraint WHERE confrelid='public.administradores'::regclass AND contype='f' AND confdeltype NOT IN ('a','r')");
    const triggers = await client.query("SELECT 1 FROM pg_trigger WHERE tgrelid='public.administradores'::regclass AND NOT tgisinternal AND tgenabled <> 'D'");
    if (unsafe.rowCount || triggers.rowCount) throw new Error('El esquema cambio: hay efectos de borrado que requieren revision. No se modifica ninguna cuenta.');
    const created = await client.query(
      'INSERT INTO public.administradores (nombre,apellido,email,password_hash,activo) VALUES ($1,$2,$3,$4,true) RETURNING id_administrador',
      ['Oscar', 'Daniel', email, passwordHash]
    );
    const id = created.rows[0].id_administrador;
    const deleted = await client.query('DELETE FROM public.administradores WHERE id_administrador <> $1', [id]);
    const final = await client.query('SELECT id_administrador,email,activo,password_hash FROM public.administradores');
    if (final.rowCount !== 1 || final.rows[0].id_administrador !== id || !final.rows[0].activo || final.rows[0].password_hash !== passwordHash) {
      throw new Error('La verificacion final fallo. Se revierte la operacion.');
    }
    await client.query('COMMIT');
    transaction = false;
    console.log(`Confirmado: Oscar Daniel (${email}) es el unico administrador activo. Administradores eliminados: ${deleted.rowCount}.`);
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23503') throw new Error('Otro administrador tiene datos relacionados. Se revierte todo sin borrar esos datos.');
    // No publica mensajes del driver que puedan contener datos de conexion.
    if (error.code) throw new Error(`No se confirmo la operacion (codigo ${error.code}). Verifica la conexion y vuelve a consultar el estado antes de reintentar.`);
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof TypeError ? 'La URL de conexion no es valida.' : error.message);
  process.exitCode = 1;
});
