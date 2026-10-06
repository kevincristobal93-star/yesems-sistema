const {Pool}=require('pg');
const crypto=require('crypto');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const service=require('../scripts/backup-database');
const enabled=process.env.YES_EMS_ISOLATED_TEST==='1' && process.env.NODE_ENV==='test' && process.env.DATABASE_URL===process.env.TEST_DATABASE_URL && Boolean(process.env.TEST_DATABASE_URL);
(enabled?describe:describe.skip)('Respaldo y recuperación PostgreSQL aislados',()=>{
  let source,target,directory,env;
  const database='yesems_restore_test_'+crypto.randomBytes(4).toString('hex');
  beforeAll(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL);
    if(url.hostname!=='127.0.0.1' || url.pathname!=='/yesems_progress_test')throw Error('Solo clúster temporal de pruebas');
    source=new Pool({connectionString:url.toString()});
    await source.query('CREATE TABLE backup_probe (id int PRIMARY KEY, texto text); INSERT INTO backup_probe VALUES(1,\'solo prueba sin datos reales\')');
    await source.query('CREATE TABLE usuarios (id int, token_version int); INSERT INTO usuarios VALUES(1,4); CREATE TABLE acceso_codigos (codigo text); INSERT INTO acceso_codigos VALUES(\'ficticio\')');
    await source.query(`CREATE DATABASE ${database}`);url.pathname='/'+database;
    target=new Pool({connectionString:url.toString()});
    directory=await fs.mkdtemp(path.join(os.tmpdir(),'yesems-backup-test-'));
    env={...process.env,BACKUP_DATABASE_URL:process.env.TEST_DATABASE_URL,RESTORE_DATABASE_URL:url.toString(),BACKUP_DIRECTORY:directory,BACKUP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),PG_BIN:process.env.PG_BIN || (process.platform==='win32'?'C:\\Program Files\\PostgreSQL\\18\\bin':'')};
  });
  afterAll(async()=>{
    await target?.end();await source?.end();
    if(directory && path.dirname(path.resolve(directory))===path.resolve(os.tmpdir()) && path.basename(directory).startsWith('yesems-backup-test-'))await fs.rm(directory,{recursive:true,force:true});
  });
  test('copia cifrada, integridad, destino vacío y revocación de sesiones anteriores',async()=>{
    const file=await service.backup(env);
    const bytes=await fs.readFile(file);expect(bytes.includes(Buffer.from('solo prueba sin datos reales'))).toBe(false);
    await expect(service.verify(file,env)).resolves.toEqual({ok:true});
    await expect(service.verify(file,{...env,BACKUP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex')})).rejects.toThrow();
    const changed=path.join(directory,'damaged.yesemsbak');bytes[25]^=1;await fs.writeFile(changed,bytes);
    await expect(service.restore(changed,database,env)).rejects.toThrow();
    expect((await target.query("SELECT to_regclass('public.backup_probe') AS name")).rows[0].name).toBe(null);
    await expect(service.restore(file,'produccion',env)).rejects.toThrow();
    await service.restore(file,database,env);
    expect((await target.query('SELECT texto FROM backup_probe')).rows[0].texto).toBe('solo prueba sin datos reales');
    expect((await target.query('SELECT token_version FROM usuarios')).rows[0].token_version).toBe(5);
    expect((await target.query('SELECT count(*)::int AS n FROM acceso_codigos')).rows[0].n).toBe(0);
    await expect(service.restore(file,database,env)).rejects.toThrow('contiene objetos');
    expect((await source.query('SELECT token_version FROM usuarios')).rows[0].token_version).toBe(4);
  },60000);
});
