(() => {
  const api='https://yesems-sistema-1.onrender.com/api';
  const change=new URLSearchParams(location.search).get('modo')==='cambiar';
  const token=localStorage.getItem('yesems_token');
  const get=id=>document.getElementById(id);
  let busy=false;let available=false;let done=false;
  async function request(path,body){
    const response=await fetch(api+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(change?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.mensaje||'No fue posible continuar.');return data;
  }
  async function action(fn){
    if(busy||done)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);get('password-message').textContent='Procesando…';
    try{await fn();}catch(e){get('password-message').textContent=e instanceof TypeError||e.name==='TimeoutError'?'No se pudo conectar. Intenta nuevamente.':e.message;}
    finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=done||!available);}
  }
  get('password-send-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{
    const result=await request('/acceso/password/'+(change?'mio/codigo':'codigo'),{email:get('recovery-email').value.trim()});
    get('password-reset-form').hidden=false;get('recovery-code').value='';get('recovery-code').focus();get('password-message').textContent=result.mensaje;
  });});
  get('recovery-email').addEventListener('input',()=>{get('password-reset-form').hidden=true;get('recovery-code').value='';});
  get('password-reset-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{
    const password=get('new-password').value;const confirmacion=get('new-password-confirm').value;
    if(password!==confirmacion)throw new Error('Las contraseñas no coinciden.');
    if(new TextEncoder().encode(password).length>72)throw new Error('La contraseña supera el máximo de 72 bytes; usa menos caracteres.');
    const result=await request('/acceso/password/'+(change?'mio':'restablecer'),{email:get('recovery-email').value.trim(),codigo:get('recovery-code').value,password,confirmacion});
    done=true;get('password-reset-form').reset();get('password-reset-form').hidden=true;get('password-send-form').hidden=true;
    localStorage.removeItem('yesems_token');localStorage.removeItem('yesems_usuario');get('password-message').textContent=result.mensaje;get('password-message').classList.add('success');get('password-login').focus();
  });});
  action(async()=>{
    if(change){
      if(!token)throw new Error('Inicia sesión para cambiar tu contraseña, o usa la opción Olvidé mi contraseña.');
      get('password-title').textContent='Cambiar mi contraseña';
      const own=await request('/usuarios/mio');get('recovery-email').value=own.usuario.email;get('recovery-email').readOnly=true;
    }
    const config=await request('/acceso/config');available=config.correo;
    get('password-message').textContent=available?'':'El envío de códigos aún no está configurado. Contacta al centro; tu contraseña actual no ha cambiado.';
  });
})();
