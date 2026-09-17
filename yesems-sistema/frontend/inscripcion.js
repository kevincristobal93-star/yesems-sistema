const API_URL = 'https://yesems-sistema.onrender.com/api';
const token = localStorage.getItem('yesems_token');
const user = JSON.parse(localStorage.getItem('yesems_usuario') || 'null');
const courseId = new URLSearchParams(window.location.search).get('curso');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
document.querySelector('#footer-year').textContent = new Date().getFullYear();

if (!courseId || !/^\d+$/.test(courseId)) {
  window.location.replace('./cursos.html');
} else if (!token || !user) {
  const destination = courseId ? `./index.html?curso=${encodeURIComponent(courseId)}` : './index.html';
  window.location.replace(destination);
} else {
  document.querySelector('#user-name').textContent = `${user.nombre} ${user.apellido}`;
  loadCourse();
}

function setText(selector, value) { document.querySelector(selector).textContent = value; }
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function postWithRetry(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    // Render puede tardar unos segundos en despertar el backend gratuito.
    await delay(2500);
    return fetch(url, options);
  }
}

async function loadCourse() {
  try {
    const response = await fetch(`${API_URL}/cursos/${encodeURIComponent(courseId)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error('No fue posible obtener el curso seleccionado.');
    const course = data.curso;
    setText('#course-title', course.nombre || 'Curso seleccionado');
    setText('#course-category', course.categoria || 'Capacitación');
    setText('#course-description', course.descripcion || 'Consulta los detalles con nuestro equipo.');
    setText('#course-duration', `${course.duracion_horas ?? '—'} horas`);
    setText('#course-capacity', `${course.cupo ?? '—'} lugares`);
    setText('#course-price', course.precio === null || course.precio === undefined ? 'Por confirmar' : new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(course.precio)));
    document.querySelector('#course-loading').hidden = true;
    document.querySelector('#course-content').hidden = false;
  } catch (error) { document.querySelector('#course-loading').textContent = error.message; }
}
document.querySelector('#enrollment-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!event.currentTarget.checkValidity()) { message.textContent = 'Completa todos los datos antes de continuar.'; event.currentTarget.reportValidity(); return; }
  message.textContent = '';
  submitButton.disabled = true;
  submitButton.textContent = 'Registrando inscripción...';
  let completed = false;
  try {
    const response = await postWithRetry(`${API_URL}/inscripciones/mia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id_curso: courseId,
        telefono: document.querySelector('#telefono').value.trim(),
        fecha_nacimiento: document.querySelector('#fecha-nacimiento').value,
        curp: document.querySelector('#curp').value.trim(),
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No fue posible registrar tu inscripción.');

    localStorage.setItem('yesems_usuario', JSON.stringify({ ...user, ...data.usuario }));
    event.currentTarget.querySelectorAll('input, button').forEach((element) => { element.disabled = true; });
    completed = true;
    message.classList.add('success');
    window.location.href = `./pago.html?inscripcion=${encodeURIComponent(data.inscripcion.id_inscripcion)}`;
  } catch (error) {
    message.classList.remove('success');
    message.textContent = error instanceof TypeError ? 'El servidor está iniciando. Espera unos segundos y vuelve a intentarlo.' : error.message;
  } finally {
    if (!completed) {
      submitButton.disabled = false;
      submitButton.textContent = 'Confirmar inscripción';
    }
  }
});
document.querySelector('#logout-button').addEventListener('click', () => { localStorage.removeItem('yesems_token'); localStorage.removeItem('yesems_usuario'); window.location.href = './cursos.html'; });
