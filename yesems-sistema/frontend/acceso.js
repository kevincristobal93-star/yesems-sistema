/* Acceso compartido: no simula verificaciones ni incluye claves privadas. */
(() => {
  const api = 'https://yesems-sistema-1.onrender.com/api';
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = './acceso.css'; document.head.append(css);
  const dialog = document.createElement('dialog');
  dialog.id = 'verified-access'; dialog.setAttribute('aria-labelledby', 'verified-title');
  dialog.innerHTML = `<button type="button" class="access-close" aria-label="Cerrar">×</button>
    <img class="access-logo" src="./assets/yesems-logo.png" alt="YES EMS">
    <p class="access-eyebrow">BIENVENIDO A YES EMS</p><h2 id="verified-title">Iniciar sesión</h2>
    <p class="access-intro" id="access-intro">Tus cursos y constancias, en un solo lugar.</p>
    <p id="access-course"></p>
    <div id="access-identify">
    <div class="access-provider"><div id="access-google"></div><p id="access-google-note" class="access-note"></p></div>
    <div class="access-divider">o con tu correo electrónico</div>
    <section id="access-registration" hidden aria-label="Datos de la nueva cuenta">
    <p class="access-note">Completa los datos de tu nueva cuenta de YES EMS.</p>
    <div class="access-profile"><label>Nombre(s)<input id="access-name" autocomplete="given-name" maxlength="100"></label>
    <label>Apellidos<input id="access-lastname" autocomplete="family-name" maxlength="100"></label>
    <label class="access-phone">Teléfono de contacto<input id="access-phone" type="tel" autocomplete="tel" maxlength="20" placeholder="10 dígitos o código de país"></label></div>
    <p class="access-note">Usaremos tu teléfono solo para contacto.</p></section>
    <form id="access-email-form"><label>Correo electrónico<input id="access-email" type="email" autocomplete="email" maxlength="150" required placeholder="tu@correo.com"></label>
    <button id="access-send" type="submit">Continuar con correo</button></form>
    <form id="access-code-form" hidden><label>Código de verificación<input id="access-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6 dígitos"></label>
    <button type="submit">Verificar y continuar</button><p class="access-note">Vence en 10 minutos. Para reenviar, espera al menos 60 segundos.</p></form>
    </div>
    <form id="access-setup-form" hidden>
      <p class="access-note">Correo verificado · Paso 2: crea tu contraseña</p>
      <label>Correo verificado<input id="access-verified-email" type="email" autocomplete="username" readonly></label>
      <label>Contraseña de YES EMS<input id="access-new-password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
      <label>Confirmar contraseña<input id="access-confirm-password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
      <p class="access-note">Usa al menos 12 caracteres (máximo 72 bytes). Crea una contraseña distinta de la de Google: YES EMS nunca te pide tu contraseña de Gmail.</p>
      <button type="submit">Crear contraseña y entrar</button>
      <button type="button" id="access-verify-again">Volver a verificar mi cuenta</button>
    </form>
    <p id="access-message" role="status" aria-live="polite"></p>
    <div id="access-login-help"><a id="access-password" href="./index.html">Entrar con mi contraseña</a>
    <a href="./password.html">¿Olvidaste tu contraseña?</a></div>
    <div class="access-switch"><p id="access-register-prompt">¿Es tu primera vez? <button type="button" id="access-register-mode">Crear una cuenta</button></p><p id="access-login-prompt" hidden>¿Ya tienes cuenta? <button type="button" id="access-login-mode">Iniciar sesión</button></p></div>
    <a class="access-admin" href="./admin-login.html">Acceso administrativo</a>`;
  document.body.append(dialog);
  const get = id => dialog.querySelector('#' + id);
  get('access-setup-form').insertBefore(get('access-registration'), get('access-new-password').parentElement);
  let course; let sentEmail; let busy = false; let version = 0; let sdk; let mailEnabled = false;
  let setupToken = null; let setupFromGoogle = false;
  function clearSetup() {
    setupToken = null; setupFromGoogle = false;
    get('access-setup-form').reset(); get('access-setup-form').hidden = true;
    get('access-identify').hidden = false;
    dialog.querySelector('.access-switch').hidden = false;
    get('access-registration').querySelectorAll('input').forEach(input => { input.required = false; });
  }
  function data() { return get('access-registration').hidden ? {} : { nombre:get('access-name').value.trim(),apellido:get('access-lastname').value.trim(),telefono:get('access-phone').value.trim() }; }
  function mode(register) {
    if (busy) return;
    clearSetup();
    get('access-registration').hidden=true;
    get('access-register-prompt').hidden=register;
    get('access-login-prompt').hidden=!register;
    get('access-login-help').hidden=register;
    get('verified-title').textContent=register?'Crear tu cuenta':'Iniciar sesión';
    get('access-intro').textContent=register?'Primero verifica tu correo. Después crearás tu contraseña de YES EMS.':'Tus cursos y constancias, en un solo lugar.';
    dialog.dataset.mode=register?'register':'login';
    sentEmail=null;get('access-code-form').hidden=true;get('access-code').value='';
    dialog.scrollTop=0;
  }
  get('access-login-mode').onclick=()=>mode(false);
  get('access-register-mode').onclick=()=>mode(true);
  get('access-verify-again').onclick=()=>{ if (!busy) { mode(true); get('access-message').textContent='Verifica nuevamente tu cuenta para continuar.'; } };
  async function request(path, body) {
    const res = await fetch(api + '/acceso/' + path, { method:body ? 'POST':'GET',headers:body ? {'Content-Type':'application/json'}:undefined,body:body ? JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000) });
    const result = await res.json(); if (!res.ok || !result.ok) throw new Error(result.mensaje || 'No fue posible continuar.'); return result;
  }
  async function action(fn) {
    if (busy) return; busy = true; dialog.setAttribute('aria-busy','true');
    dialog.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=true);
    get('access-message').textContent='Procesando…';
    try { await fn(); } catch(error) { get('access-message').textContent=error instanceof TypeError || error.name==='TimeoutError' ? 'No se pudo conectar. Intenta nuevamente.' : error.message; }
    finally { busy=false;dialog.removeAttribute('aria-busy');dialog.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=false);get('access-send').disabled=!mailEnabled; }
  }
  function finish(result, fromGoogle = false) {
    if (result.setup_required) {
      localStorage.removeItem('yesems_token');localStorage.removeItem('yesems_usuario');
      setupToken = result.setup_token; setupFromGoogle = fromGoogle;
      get('access-identify').hidden = true;
      get('access-login-help').hidden = true;
      dialog.querySelector('.access-switch').hidden = true;
      get('access-setup-form').hidden = false;
      get('access-verified-email').value = result.email;
      get('access-registration').hidden = !result.needs_profile;
      get('access-registration').querySelectorAll('input').forEach(input => { input.required = Boolean(result.needs_profile); });
      get('verified-title').textContent = 'Crea tu contraseña de YES EMS';
      get('access-intro').textContent = 'Tu correo ya está verificado. Completa este paso para acceder a tu cuenta.';
      get('access-message').textContent = 'Esta autorización dura 10 minutos. No se cambiará tu contraseña de Google.';
      get(result.needs_profile ? 'access-name' : 'access-new-password').focus();
      dialog.scrollTop = 0;
      return;
    }
    localStorage.setItem('yesems_token', result.token);localStorage.setItem('yesems_usuario',JSON.stringify(result.usuario));
    window.location.href=fromGoogle ? './panel.html'+(course?.id_curso?'?curso='+encodeURIComponent(course.id_curso):'') : course?.id_curso ? './inscripcion.html?curso='+encodeURIComponent(course.id_curso) : './panel.html';
  }
  function loadGoogle() {
    if (!sdk) sdk = new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=resolve;s.onerror=()=>{sdk=null;reject(new Error('Google no pudo cargar. Usa tu correo o intenta de nuevo.'));};document.head.append(s);});
    return sdk;
  }
  async function google(clientId, current) {
    const [state] = await Promise.all([request('google/reto',{}),loadGoogle()]);
    if (current!==version || !dialog.open) return;
    window.google.accounts.id.initialize({client_id:clientId,nonce:state.nonce,auto_select:false,callback: response=>action(async()=>{
      if (current!==version || !dialog.open || setupToken) return;
      try { finish(await request('google',{credential:response.credential,challenge:state.challenge}),true); }
      catch(error) { await google(clientId,current); throw error; }
    })});
    get('access-google').replaceChildren();
    window.google.accounts.id.renderButton(get('access-google'),{theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:Math.min(400,Math.max(200,dialog.clientWidth-80)),locale:'es'});
  }
  get('access-email-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{
    const address=get('access-email').value.trim().toLowerCase();
    const result=await request('codigo',{email:address});sentEmail=address;
    get('access-code-form').hidden=false;get('access-code').value='';get('access-code').focus();get('access-message').textContent=result.mensaje;
  });});
  get('access-email').addEventListener('input',()=>{sentEmail=null;get('access-code-form').hidden=true;});
  get('access-code-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{
    if (!sentEmail) throw new Error('Solicita un código para tu correo.');
    finish(await request('correo',{...data(),email:sentEmail,codigo:get('access-code').value}));
  });});
  get('access-setup-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{
    if (!setupToken) throw new Error('Verifica nuevamente tu correo para crear la contraseña.');
    const password=get('access-new-password').value;
    const confirmacion=get('access-confirm-password').value;
    if (password!==confirmacion) throw new Error('Las contraseñas no coinciden.');
    if (new TextEncoder().encode(password).length>72) throw new Error('La contraseña supera el máximo de 72 bytes. Usa menos caracteres.');
    const result=await request('password/crear',{setup_token:setupToken,password,confirmacion,...data()});
    const fromGoogle=setupFromGoogle;
    clearSetup();
    finish(result,fromGoogle);
  });});
  dialog.querySelector('.access-close').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{version++;clearSetup();get('access-code').value='';});
  window.YesemsAccess={open:async(selected=null)=>{
    if(dialog.open || busy)return;
    mode(Boolean(document.querySelector('#registration-form')));
    course=selected;sentEmail=null;mailEnabled=false;version++;const current=version;
    get('access-course').textContent=course?.nombre ? 'Curso: '+course.nombre : '';
    get('access-password').href='./index.html'+(course?.id_curso?'?curso='+encodeURIComponent(course.id_curso):'');
    get('access-code-form').hidden=true;get('access-code').value='';get('access-message').textContent='Consultando opciones de acceso…';
    get('access-google').replaceChildren();get('access-google-note').textContent='';get('access-send').disabled=true;
    dialog.showModal();
    try {
      const options=await request('config');if(current!==version)return;
      mailEnabled=options.correo;get('access-send').disabled=!mailEnabled;
      get('access-message').textContent=options.correo?'':'El envío de códigos aún no está habilitado. Si ya tienes cuenta, utiliza tu contraseña.';
      if(options.google_client_id) await google(options.google_client_id,current);
      else get('access-google-note').textContent='El acceso con Google aún no está habilitado.';
    } catch(error) { get('access-message').textContent='No se pudieron cargar las opciones. Cierra esta ventana y vuelve a intentar.'; }
  }};
  const legacy = document.querySelector('#registration-form');
  const existing = legacy || document.querySelector('#login-form');
  if(existing) {
    if(!legacy){const recovery=document.createElement('a');recovery.href='./password.html';recovery.id='forgot-password-link';recovery.textContent='Olvidé mi contraseña';existing.after(recovery);}
    if(legacy) legacy.hidden=true;
    const button=document.createElement('button');button.type='button';button.className='primary-button';button.textContent='Continuar con Google o correo';
    const id=new URLSearchParams(location.search).get('curso');
    button.onclick=()=>window.YesemsAccess.open(id?{id_curso:id}:null);existing.before(button);
    if(legacy) { const intro=document.querySelector('.form-intro');if(intro)intro.textContent='Verifica tu correo y crea una contraseña propia de YES EMS para completar tu cuenta.'; }
  }
})();
