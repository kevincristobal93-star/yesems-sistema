const API_URL = 'https://yesems-sistema.onrender.com/api';

const form = document.querySelector('#login-form');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
const passwordInput = document.querySelector('#password');
const togglePassword = document.querySelector('#toggle-password');
const selectedCourseId = new URLSearchParams(window.location.search).get('curso');

if (selectedCourseId) {
  const registerLink = document.querySelector('.register-link a');
  if (registerLink) registerLink.href = `./registro.html?curso=${encodeURIComponent(selectedCourseId)}`;
}

function showMessage(text, isSuccess = false) {
  message.textContent = text;
  message.classList.toggle('success', isSuccess);
}

togglePassword.addEventListener('click', () => {
  const visible = passwordInput.type === 'text';
  passwordInput.type = visible ? 'password' : 'text';
  togglePassword.textContent = visible ? 'Ver' : 'Ocultar';
  togglePassword.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');

  if (!form.checkValidity()) {
    showMessage('Completa tu correo y una contraseña de al menos 8 caracteres.');
    form.reportValidity();
    return;
  }

  const email = form.email.value.trim();
  const password = form.password.value;
  submitButton.disabled = true;
  submitButton.textContent = 'Ingresando...';

  try {
    const response = await fetch(`${API_URL}/usuarios/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.mensaje || 'No fue posible iniciar sesión.');
    }

    localStorage.setItem('yesems_token', data.token);
    localStorage.setItem('yesems_usuario', JSON.stringify(data.usuario));
    showMessage(`Bienvenido(a), ${data.usuario.nombre}. Acceso correcto.`, true);
    if (selectedCourseId) {
      window.location.href = `./inscripcion.html?curso=${encodeURIComponent(selectedCourseId)}`;
    } else {
      window.location.href = './panel.html';
    }
  } catch (error) {
    const isOffline = error instanceof TypeError;
    showMessage(isOffline ? 'No se pudo conectar con el servidor. Verifica que la API esté disponible.' : error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Ingresar';
  }
});
