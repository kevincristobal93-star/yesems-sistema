const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
jest.setTimeout(30000);
jest.mock('google-auth-library', () => ({OAuth2Client:jest.fn(()=>({verifyIdToken:jest.fn(async({idToken,audience})=>{
  if(idToken!=='token-ficticio' || audience!=='test-client') throw new Error('Invalid signature');
  return {getPayload:()=>global.__googleTestPayload};
})}))}));
const enabled=process.env.YES_EMS_ISOLATED_TEST==='1' && process.env.NODE_ENV==='test' && process.env.TEST_DATABASE_URL===process.env.DATABASE_URL;
(enabled?describe:describe.skip)('Registro verificado y unicidad — PostgreSQL temporal, proveedores simulados',()=>{
  let pool,server,base,access,nativeFetch,sendFails=false;
  const messages=new Map(); const tag=crypto.randomBytes(5).toString('hex');
  const address=(label)=>`${label}-${tag}@example.test`;
  const profile={nombre:'Persona',apellido:'De prueba',telefono:'5500000000'};
  async function request(route,body,expected=200){
    const response=await nativeFetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const data=await response.json();expect({status:response.status,data:data.ok}).toEqual({status:expected,data:expected<400});return data;
  }
  async function clearLimits(){await pool.query('DELETE FROM acceso_limites');}
  async function code(email){await request('/acceso/codigo',{email});return messages.get(email.trim().toLowerCase());}
  beforeAll(async()=>{
    if(new URL(process.env.DATABASE_URL).hostname!=='127.0.0.1' || !process.env.TEST_PG_DATA_DIR?.includes('yesems-progress-test-'))throw new Error('Solo base temporal');
    pool=require('../src/config/db');await require('../src/config/run-migrations').runStartupMigrations();
    access=require('../src/services/acceso.service');nativeFetch=global.fetch;
    process.env.RESEND_API_KEY='solo-prueba-no-real';process.env.AUTH_EMAIL_FROM='test@example.test';process.env.GOOGLE_CLIENT_ID='test-client';
    global.fetch=jest.fn(async(url,options)=>{
      if(typeof url==='string' && url.startsWith('http://127.0.0.1:'))return nativeFetch(url,options);
      if(url!=='https://api.resend.com/emails')throw new Error('Red externa prohibida en esta prueba');
      const body=JSON.parse(options.body);messages.set(body.to[0],body.text.match(/\b\d{6}\b/)[0]);
      return {ok:!sendFails};
    });
    const express=require('express');const app=express();app.use(require('../src/app'));app.use(express.static(path.resolve(__dirname,'../../frontend')));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    base=`http://127.0.0.1:${server.address().port}/api`;
  });
  beforeEach(clearLimits);
  afterAll(async()=>{global.fetch=nativeFetch;delete global.__googleTestPayload;process.env.RESEND_API_KEY='';process.env.AUTH_EMAIL_FROM='';process.env.GOOGLE_CLIENT_ID='';if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(pool)await pool.end();});
  test('registro antiguo no permite saltarse verificación',async()=>{await request('/usuarios/registrar',{...profile,email:address('bypass'),password:'not-real-test-password'},403);});
  test('sin proveedor configurado no simula envíos ni registra cuentas',async()=>{
    process.env.RESEND_API_KEY='';await request('/acceso/codigo',{email:address('offline')},503);process.env.RESEND_API_KEY='solo-prueba-no-real';
  });
  test('código no se devuelve al navegador ni almacena en claro; crea cliente verificado',async()=>{
    const email=address('create');const response=await request('/acceso/codigo',{email:' '+email.toUpperCase()+' '});
    expect(response.codigo).toBeUndefined();const codigo=messages.get(email);
    const saved=(await pool.query('SELECT hash FROM acceso_codigos WHERE email=$1',[email])).rows[0];expect(saved.hash).not.toContain(codigo);
    const result=await request('/acceso/correo',{...profile,email,codigo,rol:'admin'});
    expect(result.usuario.rol).toBe('cliente');expect(result.token).toBeTruthy();
    const user=(await pool.query('SELECT * FROM usuarios WHERE id_usuario=$1',[result.usuario.id_usuario])).rows[0];
    expect(user.email_verificado_at).toBeTruthy();expect(user.password_hash).toBeNull();expect(user.telefono).toBe(profile.telefono);
    await request('/acceso/correo',{email,codigo},400);
    const own=await nativeFetch(base+'/usuarios/mio',{headers:{Authorization:'Bearer '+result.token}});expect(own.status).toBe(200);
  });
  test('correo normalizado y CURP son únicos incluso concurrentemente; nombres repetidos sí se permiten',async()=>{
    const one=(await pool.query("INSERT INTO usuarios(nombre,apellido,email,curp) VALUES('Mismo','Nombre',$1,'TEST000101HDFXXX98') RETURNING id_usuario",[address('unique')])).rows[0];
    await expect(pool.query("INSERT INTO usuarios(nombre,apellido,email) VALUES('Mismo','Nombre',$1)",[' '+address('unique').toUpperCase()+' '])).rejects.toMatchObject({code:'23505'});
    await expect(pool.query("INSERT INTO usuarios(nombre,apellido,email,curp) VALUES('Mismo','Nombre',$1,'test000101hdfxxx98')",[address('curp')])).rejects.toMatchObject({code:'23505'});
    const results=await Promise.allSettled([1,2].map(i=>pool.query("INSERT INTO usuarios(nombre,apellido,email) VALUES('Mismo','Nombre',$1)",[address('race')])));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await expect(pool.query('UPDATE usuarios SET nombre=$1 WHERE id_usuario=$2',['Mismo',one.id_usuario])).resolves.toBeTruthy();
  });
  test('cinco códigos erróneos bloquean el correcto y no crean cuenta',async()=>{
    const email=address('wrong');const codigo=await code(email);const wrong=codigo==='000000'?'111111':'000000';
    for(let i=0;i<5;i++)await request('/acceso/correo',{...profile,email,codigo:wrong},400);
    await request('/acceso/correo',{...profile,email,codigo},400);
  });
  test('código vencido y reenvío inmediato se rechazan',async()=>{
    const email=address('expired');const codigo=await code(email);await request('/acceso/codigo',{email},429);
    await pool.query("UPDATE acceso_codigos SET expira=now()-interval '1 second' WHERE email=$1",[email]);
    await request('/acceso/correo',{...profile,email,codigo},400);
  });
  test('cuenta existente conserva su identidad y no se duplica; cuenta inactiva no accede',async()=>{
    const email=address('legacy');const row=(await pool.query("INSERT INTO usuarios(nombre,apellido,email,rol) VALUES('Original','Alumno',$1,'alumno') RETURNING id_usuario",[email])).rows[0];
    let codigo=await code(email);const result=await request('/acceso/correo',{email,codigo});expect(result.usuario.id_usuario).toBe(row.id_usuario);expect(result.usuario.nombre).toBe('Original');
    await clearLimits();await pool.query('UPDATE usuarios SET activo=false WHERE id_usuario=$1',[row.id_usuario]);codigo=await code(email);
    await request('/acceso/correo',{email,codigo},403);
  });
  test('fallo del proveedor invalida el código y devuelve un error seguro',async()=>{
    sendFails=true;const email=address('failure');await request('/acceso/codigo',{email},503);sendFails=false;
    expect((await pool.query('SELECT * FROM acceso_codigos WHERE email=$1',[email])).rows).toHaveLength(0);
  });
  test('cupo gratuito bloquea envío antes de llamar al proveedor',async()=>{
    await pool.query('INSERT INTO acceso_envios(enviado) SELECT now() FROM generate_series(1,90)');
    const calls=global.fetch.mock.calls.length;await request('/acceso/codigo',{email:address('quota')},429);expect(global.fetch.mock.calls.length).toBe(calls);
    await pool.query('DELETE FROM acceso_envios');
  });
  test('Google rechaza credencial inválida, nonce incorrecto y correo no verificado',async()=>{
    const state=await request('/acceso/google/reto',{});
    await request('/acceso/google',{credential:'invalid',challenge:state.challenge},401);
    global.__googleTestPayload={sub:tag,email:'test@gmail.com',email_verified:true,nonce:'incorrecto'};
    await request('/acceso/google',{credential:'token-ficticio',challenge:state.challenge},401);
    global.__googleTestPayload.nonce=state.nonce;global.__googleTestPayload.email_verified=false;
    await request('/acceso/google',{credential:'token-ficticio',challenge:state.challenge},401);
  });
  test('ventana real en Edge registra con código, funciona en móvil y conserva el curso elegido',async()=>{
    const {startBrowser}=require('./helpers/browser-client');const os=require('os');let browser;
    const origin=base.replace(/\/api$/,'');const artifacts=await fs.mkdtemp(path.join(os.tmpdir(),'yesems-access-evidence-'));
    process.env.GOOGLE_CLIENT_ID='';
    try{
      browser=await startBrowser(origin);await browser.navigate(origin+'/registro.html?curso=1');
      await browser.click('.form-container > .primary-button');
      await browser.waitFor("document.querySelector('#verified-access').open && !document.querySelector('#access-send').disabled");
      await browser.click('#access-login-mode');
      expect(await browser.evaluate("document.querySelector('#access-registration').hidden")).toBe(true);
      await browser.click('#access-register-mode');
      expect(await browser.evaluate("document.querySelector('#access-registration').hidden")).toBe(false);
      await browser.fill('#access-name','Alumna');await browser.fill('#access-lastname','Prueba acceso');await browser.fill('#access-phone','5500000000');await browser.fill('#access-email',address('browser'));
      await browser.screenshot(path.join(artifacts,'registro-desktop.png'));
      await browser.viewport(390,844);
      expect(await browser.evaluate("document.querySelector('#verified-access').scrollWidth <= document.querySelector('#verified-access').clientWidth+1")).toBe(true);
      await browser.screenshot(path.join(artifacts,'registro-mobile.png'));
      await browser.click('#access-send');await browser.waitFor("!document.querySelector('#access-code-form').hidden");
      await browser.fill('#access-code',messages.get(address('browser')));await browser.click('#access-code-form button');
      await browser.waitFor("location.pathname.endsWith('/inscripcion.html')");
      expect(await browser.evaluate('location.search')).toBe('?curso=1');
      expect(await browser.evaluate("JSON.parse(localStorage.getItem('yesems_usuario')).nombre")).toBe('Alumna');
      await browser.navigate(origin+'/password.html');
      expect(await browser.evaluate("document.querySelector('#google-recovery a').href")).toBe('https://accounts.google.com/signin/recovery');
      await browser.click('#recovery-google-login');
      await browser.waitFor("document.querySelector('#verified-access').open");
      expect(await browser.evaluate("document.querySelector('#access-registration').hidden")).toBe(true);
      expect(browser.errors).toEqual([]);console.log('Capturas de registro ficticio:',artifacts);
    }finally{process.env.GOOGLE_CLIENT_ID='test-client';if(browser)await browser.close();}
  },60000);
  test('Google crea cliente con sub único; rechaza replay y no vincula por correo una cuenta previa',async()=>{
    const state=await request('/acceso/google/reto',{});
    global.__googleTestPayload={sub:tag,email:`google-${tag}@gmail.com`,email_verified:true,nonce:state.nonce};
    const body={...profile,credential:'token-ficticio',challenge:state.challenge};
    const result=await request('/acceso/google',body);expect(result.usuario.rol).toBe('cliente');
    await request('/acceso/google',body,401);
    const next=await request('/acceso/google/reto',{});global.__googleTestPayload={...global.__googleTestPayload,sub:tag+'other',nonce:next.nonce};
    await request('/acceso/google',{...body,challenge:next.challenge},409);
  });
  test('migración preserva duplicados históricos, protege nuevas escrituras y es repetible',async()=>{
    const {Pool}=require('pg');await pool.query('CREATE DATABASE yesems_identity_migration_test');
    const url=new URL(process.env.DATABASE_URL);url.pathname='/yesems_identity_migration_test';const db=new Pool({connectionString:url.toString()});
    try{
      await db.query(await fs.readFile(path.resolve(__dirname,'../database/migrations/001_initial_schema.sql'),'utf8'));
      await db.query("INSERT INTO usuarios(nombre,apellido,email,curp) VALUES('A','B','same@example.test','TEST000101HDFXXX00'),('A','B','SAME@example.test','TEST000101HDFXXX00')");
      const before=(await db.query('SELECT id_usuario,email,curp FROM usuarios ORDER BY id_usuario')).rows;
      const migration=await fs.readFile(path.resolve(__dirname,'../database/migrations/005_verified_identity.sql'),'utf8');
      await db.query(migration);await db.query(migration);
      expect((await db.query('SELECT id_usuario,email,curp FROM usuarios ORDER BY id_usuario')).rows).toEqual(before);
      await expect(db.query("INSERT INTO usuarios(nombre,apellido,email) VALUES('A','B',' same@example.test ')")).rejects.toMatchObject({code:'23505'});
      await db.query("UPDATE usuarios SET nombre='Conservado' WHERE id_usuario=2");
    }finally{await db.end();}
  });
  test('recuperar cambia contraseña, invalida sesiones anteriores y no permite reutilizar el código',async()=>{
    const email=address('password');const password='Contrasena-prueba-inicial-123';const next='Contrasena-prueba-nueva-456';
    const account=await require('../src/models/usuario.model').registrarCliente({...profile,email,password});
    const login=await request('/usuarios/login',{email,password});
    const known=await request('/acceso/password/codigo',{email});await clearLimits();
    const unknown=await request('/acceso/password/codigo',{email:address('missing')});expect(unknown.mensaje).toBe(known.mensaje);
    const codigo=messages.get(email);
    await request('/acceso/password/restablecer',{email,codigo,password:next,confirmacion:next});
    expect((await pool.query('SELECT token_version FROM usuarios WHERE id_usuario=$1',[account.id_usuario])).rows[0].token_version).toBe(1);
    expect((await nativeFetch(base+'/usuarios/mio',{headers:{Authorization:'Bearer '+login.token}})).status).toBe(401);
    await request('/usuarios/login',{email,password},401);
    const fresh=await request('/usuarios/login',{email,password:next});
    expect((await nativeFetch(base+'/usuarios/mio',{headers:{Authorization:'Bearer '+fresh.token}})).status).toBe(200);
    await request('/acceso/password/restablecer',{email,codigo,password:next,confirmacion:next},400);
  });
  test('código de acceso no restablece contraseña y código de recuperación no inicia sesión',async()=>{
    const email=address('purposes');const codigo=await code(email);const password='Contrasena-prueba-123';
    await request('/acceso/password/restablecer',{email,codigo,password,confirmacion:password},400);
    await clearLimits();await request('/acceso/password/codigo',{email});
    await pool.query('DELETE FROM acceso_codigos WHERE email=$1',[email]);
    await request('/acceso/correo',{...profile,email,codigo:messages.get(email)},400);
  });
  test('recuperación rechaza código vencido, cinco errores y contraseña débil',async()=>{
    const email=address('reset-invalid');await request('/acceso/password/codigo',{email});let codigo=messages.get(email);
    const password='Contrasena-prueba-123';
    await request('/acceso/password/restablecer',{email,codigo,password:'corta',confirmacion:'corta'},400);
    await pool.query("UPDATE acceso_codigos SET expira=now()-interval '1 second' WHERE email=$1",['password:'+email]);
    await request('/acceso/password/restablecer',{email,codigo,password,confirmacion:password},400);
    await clearLimits();await request('/acceso/password/codigo',{email});codigo=messages.get(email);
    for(let i=0;i<5;i++)await request('/acceso/password/restablecer',{email,codigo:'000000',password,confirmacion:password},400);
    await request('/acceso/password/restablecer',{email,codigo,password,confirmacion:password},400);
  });
  test('cambio autenticado usa exclusivamente el correo de su cuenta y revoca su token',async()=>{
    const email=address('own-password');const password='Prueba-password-inicial';
    await require('../src/models/usuario.model').registrarCliente({...profile,email,password});
    const login=await request('/usuarios/login',{email,password});
    const own=async(route,body)=>nativeFetch(base+'/acceso/password/'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+login.token},body:JSON.stringify(body)});
    expect((await own('mio/codigo',{email:address('victim')})).status).toBe(200);
    expect(messages.has(address('victim'))).toBe(false);expect(messages.has(email)).toBe(true);
    expect((await own('mio',{email:address('victim'),codigo:messages.get(email),password:'Nueva-password-prueba',confirmacion:'Nueva-password-prueba'})).status).toBe(200);
    expect((await own('mio/codigo',{})).status).toBe(401);
    await request('/acceso/password/mio/codigo',{},401);
  });
  test('dos recuperaciones simultáneas solo consumen una vez el código',async()=>{
    const email=address('password-race');const password='Contrasena-prueba-concurrente';
    const user=await require('../src/models/usuario.model').registrarCliente({...profile,email,password});
    await request('/acceso/password/codigo',{email});
    const body={email,codigo:messages.get(email),password:'Contrasena-nueva-concurrente',confirmacion:'Contrasena-nueva-concurrente'};
    const results=await Promise.all([1,2].map(()=>nativeFetch(base+'/acceso/password/restablecer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})));
    expect(results.map(r=>r.status).sort()).toEqual([200,400]);
    expect((await pool.query('SELECT token_version FROM usuarios WHERE id_usuario=$1',[user.id_usuario])).rows[0].token_version).toBe(1);
  });
  test('formulario de recuperación real en navegador guarda la contraseña y vuelve a ofrecer inicio de sesión',async()=>{
    const {startBrowser}=require('./helpers/browser-client');let browser;const email=address('browser-password');
    await require('../src/models/usuario.model').registrarCliente({...profile,email,password:'Prueba-anterior-password'});
    try{
      browser=await startBrowser(base.replace(/\/api$/,''));await browser.navigate(base.replace(/\/api$/,'')+'/password.html');
      await browser.waitFor("!document.querySelector('#recovery-send').disabled");await browser.fill('#recovery-email',email);await browser.click('#recovery-send');
      await browser.waitFor("!document.querySelector('#password-reset-form').hidden");
      await browser.fill('#recovery-code',messages.get(email));await browser.fill('#new-password','Prueba-nueva-password');await browser.fill('#new-password-confirm','Prueba-nueva-password');
      await browser.click('#password-reset-form button');await browser.waitFor("document.querySelector('#password-message').textContent.includes('Contraseña actualizada')");
      expect(await browser.evaluate("localStorage.getItem('yesems_token')")).toBeNull();expect(browser.errors).toEqual([]);
    }finally{if(browser)await browser.close();}
  },60000);
});
