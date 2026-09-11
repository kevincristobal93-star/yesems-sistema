const API_URL = 'http://127.0.0.1:4000/api';
const params = new URLSearchParams(window.location.search);
const courseId = params.get('curso');
const form = document.querySelector('#registration-form');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
const loginLink = document.querySelector('#login-link');

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

function showMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle('success', success);
}

async function showSelectedCourse() {
  if (!courseId) return;
  loginLink.href = `./index.html?curso=${encodeURIComponent(courseId)}`;
  try {
    const response = await fetch(`${API_URL}/cursos/${encodeURIComponent(courseId)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) return;
    document.querySelector('#selected-course-name').innerHTML = escapeHtml(data.curso.nombre);
    document.querySelector('#selected-course').hidden = false;
  } catch (_) {
    // El registro sigue disponible incluso si no se puede mostrar el curso.
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');
  const { nombre, apellido, email, password } = form;
  const confirmation = document.querySelector('#password-confirmation').value;

  if (!form.checkValidity()) {
    showMessage('Completa todos los campos requeridos y utiliza una contraseña de al menos 8 caracteres.');
    form.reportValidity();
    return;
  }
  if (password.value !== confirmation) {
    showMessage('Las contraseñas no coinciden.');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Creando cuenta...';
  try {
    const response = await fetch(`${API_URL}/usuarios/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre.value.trim(), apellido: apellido.value.trim(), email: email.value.trim(), password: password.value }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || 'No fue posible crear tu cuenta.');

    showMessage('Cuenta creada correctamente. Ahora puedes iniciar sesión para continuar.', true);
    form.reset();
    loginLink.focus();
  } catch (error) {
    showMessage(error instanceof TypeError ? 'No se pudo conectar con el servidor. Verifica que el backend esté activo.' : error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Crear cuenta';
  }
});

showSelectedCourse();
