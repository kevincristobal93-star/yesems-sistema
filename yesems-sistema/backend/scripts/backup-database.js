// Respaldo cifrado y recuperación controlada. Nunca carga .env automáticamente.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Pool } = require('pg');
const MAGIC = Buffer.from('YESEMSB1');
const repository = path.resolve(__dirname, '../../..');

function keyFromEnv(env) {
  if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY || '')) throw new Error('Configura BACKUP_ENCRYPTION_KEY con 32 bytes aleatorios en hexadecimal. No la compartas ni la guardes con la copia.');
  return Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'hex');
}
function connection(raw) {
  let url;
  try { url=new URL(raw); } catch { throw new Error('Falta una URL PostgreSQL válida en la variable de entorno indicada.'); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error('La conexión debe especificar servidor y base de datos.');
  return {host:url.hostname, port:url.port || '5432', database:decodeURIComponent(url.pathname.slice(1)), user:decodeURIComponent(url.username), password:decodeURIComponent(url.password), sslmode:url.searchParams.get('sslmode') || (['localhost','127.0.0.1','[::1]'].includes(url.hostname)?'disable':'require')};
}
function toolEnv(config, env) {
  return {...process.env, ...env, PGHOST:config.host, PGPORT:config.port, PGDATABASE:config.database, PGUSER:config.user, PGPASSWORD:config.password, PGSSLMODE:config.sslmode, PGCONNECT_TIMEOUT:'20', PGOPTIONS:''};
}
function startTool(name, args, config, env) {
  const binary = env.PG_BIN ? path.join(env.PG_BIN, process.platform==='win32'?name+'.exe':name) : name;
  const child=spawn(binary,args,{env:toolEnv(config,env),windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});
  child.stderr.resume(); // No imprimir credenciales ni detalles de conexión en registros.
  const done=new Promise((resolve,reject)=>{
    child.once('error',()=>reject(new Error(`No se pudo ejecutar ${name}. Revisa PG_BIN y los permisos.`)));
    child.once('close',code=>code===0?resolve():reject(new Error(`${name} falló. Revisa conectividad, permisos y compatibilidad de PostgreSQL; no se completó la operación.`)));
  });
  // Evitar rechazos sin manejar mientras el flujo termina.
  done.catch(()=>{});
  return {child,done};
}
async function backup(env=process.env) {
  const key=keyFromEnv(env); const config=connection(env.BACKUP_DATABASE_URL);
  if (!env.BACKUP_DIRECTORY || !path.isAbsolute(env.BACKUP_DIRECTORY)) throw new Error('BACKUP_DIRECTORY debe ser una ruta absoluta privada fuera del repositorio y del servidor web.');
  await fsp.mkdir(env.BACKUP_DIRECTORY,{recursive:true,mode:0o700});
  const directory=await fsp.realpath(env.BACKUP_DIRECTORY);
  const relative=path.relative(repository,directory);
  if (!relative || (!relative.startsWith('..'+path.sep) && !path.isAbsolute(relative))) throw new Error('No se permiten respaldos dentro del repositorio. Usa una carpeta privada externa.');
  const nonce=crypto.randomBytes(12); const header=Buffer.concat([MAGIC,nonce]);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(header);
  const file=path.join(directory,`yesems-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(6).toString('hex')}.yesemsbak`);
  let created=false; let processHandle;
  try {
    await fsp.writeFile(file+'.partial',header,{flag:'wx',mode:0o600});created=true;
    const run=startTool('pg_dump',['--format=custom','--no-owner','--no-privileges','--no-tablespaces'],config,env);processHandle=run.child;
    await Promise.all([pipeline(run.child.stdout,cipher,fs.createWriteStream(file+'.partial',{flags:'a',mode:0o600})),run.done]);
    await fsp.appendFile(file+'.partial',cipher.getAuthTag());
    await fsp.rename(file+'.partial',file);
    return file;
  } catch(error) {
    processHandle?.kill();if(created)await fsp.unlink(file+'.partial').catch(()=>{});throw error;
  }
}
async function decrypt(file, output, env) {
  const key=keyFromEnv(env);const input=await fsp.open(file,'r');
  try {
    const stat=await input.stat();if(!stat.isFile() || stat.size<37)throw new Error('Archivo de respaldo inválido.');
    const header=Buffer.alloc(20),tag=Buffer.alloc(16);
    await input.read(header,0,20,0);await input.read(tag,0,16,stat.size-16);
    if(!header.subarray(0,8).equals(MAGIC))throw new Error('Formato de respaldo no reconocido.');
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAAD(header);decipher.setAuthTag(tag);
    await pipeline(fs.createReadStream(file,{start:20,end:stat.size-17}),decipher,fs.createWriteStream(output,{flags:'wx',mode:0o600}));
  } catch { throw new Error('No se pudo verificar el respaldo: clave incorrecta, archivo dañado o sin permisos.'); }
  finally {await input.close();}
}
async function tempWork(callback) {
  const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'yesems-recovery-'));
  try { await fsp.chmod(directory,0o700);return await callback(directory); }
  finally {
    const resolved=path.resolve(directory);
    if(path.dirname(resolved)===path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('yesems-recovery-')) await fsp.rm(resolved,{recursive:true,force:true});
  }
}
async function verify(file, env=process.env) {
  return tempWork(async directory=>{
    const dump=path.join(directory,'verified.dump');await decrypt(file,dump,env);
    const run=startTool('pg_restore',['--list',dump],{host:'127.0.0.1',port:'5432',database:'unused',user:'unused',password:'',sslmode:'disable'},env);
    run.child.stdout.resume();await run.done;
    return {ok:true};
  });
}
async function restore(file, confirmation, env=process.env) {
  const target=connection(env.RESTORE_DATABASE_URL);
  if(!/^yesems_restore_[a-z0-9_]{1,40}$/.test(target.database) || confirmation!==target.database) throw new Error('Recupera únicamente a una base vacía llamada yesems_restore_... y confirma ese nombre exacto. Nunca uses la base de producción.');
  if(env.BACKUP_DATABASE_URL) {
    const source=connection(env.BACKUP_DATABASE_URL);
    if(source.host===target.host && source.port===target.port && source.database===target.database) throw new Error('Origen y destino no pueden ser la misma base.');
  }
  return tempWork(async directory=>{
    const dump=path.join(directory,'verified.dump');await decrypt(file,dump,env);
    const pool=new Pool({host:target.host,port:Number(target.port),database:target.database,user:target.user,password:target.password,ssl:target.sslmode==='disable'?false:{rejectUnauthorized:target.sslmode==='verify-full'},connectionTimeoutMillis:20000});
    try {
      const result=await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema')
        OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema'))
        OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS occupied`);
      if(result.rows[0].occupied)throw new Error('El destino contiene objetos. Recuperación rechazada: no se sobrescriben datos existentes.');
      const run=startTool('pg_restore',['--dbname',target.database,'--no-owner','--no-privileges','--no-tablespaces','--exit-on-error','--single-transaction',dump],target,env);
      run.child.stdout.resume();await run.done;
      // Las sesiones y códigos anteriores al respaldo no deben reactivarse.
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        for(const table of ['usuarios','administradores']) {
          const exists=await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='token_version'",[table]);
          if(exists.rowCount)await client.query(`UPDATE ${table} SET token_version=COALESCE(token_version,0)+1`);
        }
        for(const table of ['acceso_codigos','acceso_nonces']) {
          if((await client.query('SELECT to_regclass($1) AS name',['public.'+table])).rows[0].name)await client.query(`DELETE FROM ${table}`);
        }
        await client.query('COMMIT');
      } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
      return {ok:true,database:target.database};
    } finally {await pool.end();}
  });
}
async function main() {
  const [action,file,confirmation]=process.argv.slice(2);
  if(action==='create') console.log('Respaldo cifrado creado:',await backup());
  else if(action==='verify' && file) {await verify(path.resolve(file));console.log('Integridad y formato verificados. Para probar recuperación completa, restaura en una base vacía.');}
  else if(action==='restore' && file && confirmation) {const result=await restore(path.resolve(file),confirmation);console.log('Recuperación completada en',result.database,'Revisa cursos, pagos y archivos antes de cualquier cambio de producción.');}
  else throw new Error('Uso: node scripts/backup-database.js create | verify ARCHIVO | restore ARCHIVO yesems_restore_NOMBRE');
}
if(require.main===module)main().catch(()=>{console.error('Operación de respaldo/recuperación no completada. Comprueba variables, clave, PostgreSQL y que el destino esté vacío. No se publica ni reemplaza producción.');process.exitCode=1;});
module.exports={backup,verify,restore,connection,keyFromEnv};
