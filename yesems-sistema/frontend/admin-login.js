const API_URL = 'https://yesems-sistema-1.onrender.com/api';
const form = document.querySelector('#login-form');
const message = document.querySelector('#form-message');
const button = document.querySelector('#submit-button');
if (localStorage.getItem('yesems_admin_token')) window.location.replace('./admin.html');
form.addEventListener('submit', async (event) => {
  event.preventDefault(); message.textContent = '';
  if (!form.checkValidity()) { form.reportValidity(); return; }
  button.disabled = true; button.textContent = 'Ingresando...';
  try {
    const response = await fetch(`${API_URL}/administradores/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:document.querySelector('#email').value.trim(),password:document.querySelector('#password').value}) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No fue posible iniciar sesión.');
    localStorage.setItem('yesems_admin_token', data.token);
    localStorage.setItem('yesems_administrador', JSON.stringify(data.administrador));
    window.location.href = './admin.html';
  } catch (error) { message.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor.' : error.message; button.disabled=false; button.textContent='Ingresar al panel'; }
});
