const API_URL = 'https://yesems-sistema-1.onrender.com/api';
const token = localStorage.getItem('yesems_token');
const user = JSON.parse(localStorage.getItem('yesems_usuario') || 'null');
const courseId = new URLSearchParams(window.location.search).get('curso');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
const availabilityField = document.querySelector('#availability-field');
const availabilitySelect = document.querySelector('#availability-select');
const form = document.querySelector('#enrollment-form');
const personalStep = document.querySelector('#personal-step');
const confirmationStep = document.querySelector('#confirmation-step');
const backButton = document.querySelector('#back-to-data');
let submitting = false;
document.querySelector('#footer-year').textContent = new Date().getFullYear();

if (!courseId || !/^\d+$/.test(courseId)) {
  window.location.replace('./cursos.html');
} else if (!token || !user) {
  const destination = courseId ? `./index.html?curso=${encodeURIComponent(courseId)}` : './index.html';
  window.location.replace(destination);
} else {
  document.querySelector('#user-name').textContent = `${user.nombre} ${user.apellido}`;
  loadCourse();
  loadProfile();
}

async function loadProfile() {
  try {
    const response = await fetch(`${API_URL}/usuarios/mio`, {headers:{Authorization:`Bearer ${token}`}});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error('No se pudieron recuperar tus datos. Puedes completarlos abajo.');
    for (const [field,key] of [['nombre','nombre'],['apellido','apellido'],['telefono','telefono'],['fecha-nacimiento','fecha_nacimiento'],['curp','curp']]) {
      const input=document.getElementById(field);
      if(!input.value) input.value=String(data.usuario[key] || '').slice(0,field==='fecha-nacimiento'?10:150);
    }
  } catch(error) { message.textContent=error.message; }
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
    setText('#course-duration', `${course.duracion_horas ?? '—'} horas${course.oferta_provisional ? ' sugeridas' : ''}`);
    setText('#course-capacity', `${course.cupo ?? '—'} lugares${course.oferta_provisional ? ' sugeridos' : ''}`);
    setText('#course-price', course.oferta_provisional || course.precio === null || course.precio === undefined ? 'Por confirmar' : new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(course.precio)));
    document.querySelector('#course-loading').hidden = true;
    document.querySelector('#course-content').hidden = false;
    if (course.oferta_provisional || !course.activo) {
      form.hidden = true;
      const notice = document.createElement('p');
      notice.className = 'folio-note';
      notice.textContent = 'Inscripciones no disponibles. Esta oferta requiere confirmación de YES EMS. Puedes consultar otros cursos con el enlace Cambiar curso.';
      form.before(notice);
      submitButton.disabled = true;
      return;
    }
    loadAvailabilities();
  } catch (error) { document.querySelector('#course-loading').textContent = error.message; }
}

function availabilityLabel(item) {
  const modality = { en_linea: 'En línea', presencial: 'Presencial', hibrida: 'Híbrida', por_definir: 'Por definir' }[item.modalidad] || 'Por definir';
  const time = item.hora_inicio && item.hora_fin ? ` · ${String(item.hora_inicio).slice(0, 5)} – ${String(item.hora_fin).slice(0, 5)}` : '';
  return [modality, item.dia_semana, time, item.informacion_adicional].filter(Boolean).join(' · ');
}

async function loadAvailabilities() {
  try {
    const response = await fetch(`${API_URL}/cursos/${encodeURIComponent(courseId)}/disponibilidades`);
    const data = await response.json();
    if (!response.ok || !data.ok) return;
    const options = data.disponibilidades || [];
    if (!options.length) return;
    availabilitySelect.innerHTML = '<option value="">Selecciona una opción</option>';
    options.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id_horario;
      option.textContent = availabilityLabel(item);
      availabilitySelect.appendChild(option);
    });
    availabilitySelect.disabled = false;
    availabilitySelect.required = true;
    availabilityField.hidden = false;
  } catch (_) {
    // Si no se logra consultar la disponibilidad, la inscripción puede continuar.
  }
}
function showPersonalStep() {
  if (submitting) return;
  document.querySelector('#continue-button').before(message);
  confirmationStep.hidden = true;
  personalStep.hidden = false;
  document.querySelector('#step-confirmation').classList.remove('active');
  document.querySelector('#step-personal').classList.add('active');
  message.textContent = '';
}

function showConfirmationStep() {
  if (!form.checkValidity()) {
    message.textContent = 'Completa todos los datos antes de continuar.';
    form.reportValidity();
    return;
  }
  document.querySelector('#confirm-phone').textContent = document.querySelector('#telefono').value.trim();
  document.querySelector('#confirm-name').textContent = `${document.querySelector('#nombre').value.trim()} ${document.querySelector('#apellido').value.trim()}`;
  document.querySelector('#confirm-birthdate').textContent = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(`${document.querySelector('#fecha-nacimiento').value}T00:00:00`));
  document.querySelector('#confirm-curp').textContent = document.querySelector('#curp').value.trim().toUpperCase();
  const hasAvailability = !availabilitySelect.disabled && availabilitySelect.value;
  document.querySelector('#confirm-availability-row').hidden = !hasAvailability;
  if (hasAvailability) document.querySelector('#confirm-availability').textContent = availabilitySelect.options[availabilitySelect.selectedIndex].textContent;
  personalStep.hidden = true;
  confirmationStep.hidden = false;
  confirmationStep.querySelector('.confirmation-actions').before(message);
  document.querySelector('#step-personal').classList.remove('active');
  document.querySelector('#step-confirmation').classList.add('active');
  message.textContent = '';
  confirmationStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelector('#continue-button').addEventListener('click', showConfirmationStep);
backButton.addEventListener('click', showPersonalStep);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;
  if (!form.checkValidity()) {
    showPersonalStep();
    message.textContent = 'Completa todos los datos antes de continuar.';
    form.reportValidity();
    return;
  }
  submitting = true;
  message.textContent = '';
  submitButton.disabled = true;
  backButton.disabled = true;
  submitButton.textContent = 'Registrando inscripción...';
  let completed = false;
  try {
    const response = await postWithRetry(`${API_URL}/inscripciones/mia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id_curso: courseId,
        nombre: document.querySelector('#nombre').value.trim(),
        apellido: document.querySelector('#apellido').value.trim(),
        id_horario: availabilitySelect.disabled ? null : Number(availabilitySelect.value),
        telefono: document.querySelector('#telefono').value.trim(),
        fecha_nacimiento: document.querySelector('#fecha-nacimiento').value,
        curp: document.querySelector('#curp').value.trim(),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!data) throw new Error('El servidor no pudo responder. Vuelve a intentarlo en unos momentos.');
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No fue posible registrar tu inscripción.');
    const enrollmentId = Number(data.inscripcion?.id_inscripcion);
    if (!Number.isSafeInteger(enrollmentId) || enrollmentId <= 0) {
      throw new Error('No se recibió el número de inscripción. Vuelve a intentarlo o revisa Mi panel.');
    }

    if (data.usuario) localStorage.setItem('yesems_usuario', JSON.stringify({ ...user, ...data.usuario }));
    // currentTarget deja de estar disponible después de await; usar el formulario estable.
    form.querySelectorAll('input, button, select').forEach((element) => { element.disabled = true; });
    completed = true;
    message.classList.add('success');
    window.location.href = `./pago.html?inscripcion=${encodeURIComponent(enrollmentId)}`;
  } catch (error) {
    message.classList.remove('success');
    message.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.' : error.message;
  } finally {
    if (!completed) {
      submitting = false;
      submitButton.disabled = false;
      backButton.disabled = false;
      submitButton.textContent = 'Confirmar inscripción';
    }
  }
});
document.querySelector('#logout-button').addEventListener('click', () => { localStorage.removeItem('yesems_token'); localStorage.removeItem('yesems_usuario'); window.location.href = './cursos.html'; });
