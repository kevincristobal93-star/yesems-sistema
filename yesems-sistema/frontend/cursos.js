const API_URL = 'https://yesems-sistema.onrender.com/api';
const grid = document.querySelector('#course-grid');
const message = document.querySelector('#catalog-message');
const count = document.querySelector('#course-count');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const registrationDialog = document.querySelector('#registration-dialog');
const registrationForm = document.querySelector('#quick-registration-form');
const registrationMessage = document.querySelector('#quick-registration-message');
const registrationSubmit = document.querySelector('#quick-registration-submit');
const loginDialog = document.querySelector('#login-dialog');
const loginForm = document.querySelector('#quick-login-form');
const loginMessage = document.querySelector('#quick-login-message');
const loginSubmit = document.querySelector('#quick-login-submit');
let selectedCourse = null;
let courses = [];

const sessionToken = localStorage.getItem('yesems_token');
const sessionUser = JSON.parse(localStorage.getItem('yesems_usuario') || 'null');

function clearStudentSession() {
  localStorage.removeItem('yesems_token');
  localStorage.removeItem('yesems_usuario');
  window.location.href = './cursos.html';
}

function setupStudentNavigation() {
  if (!sessionToken || !sessionUser || !document.querySelector('#student-navigation')) return;
  document.querySelector('#public-navigation').hidden = true;
  document.querySelector('#student-navigation').hidden = false;
  const fullName = `${sessionUser.nombre || ''} ${sessionUser.apellido || ''}`.trim() || 'Mi cuenta';
  const initial = fullName.charAt(0).toUpperCase() || 'A';
  document.querySelector('#account-name').textContent = sessionUser.nombre || 'Mi cuenta';
  ['#account-initial', '#drawer-initial', '#dialog-account-initial'].forEach((selector) => { document.querySelector(selector).textContent = initial; });
  document.querySelector('#drawer-name').textContent = fullName;
  document.querySelector('#drawer-email').textContent = sessionUser.email || '';
  document.querySelector('#account-dialog-title').textContent = fullName;
  document.querySelector('#account-dialog-email').textContent = sessionUser.email || '';
  const drawer = document.querySelector('#student-drawer');
  const overlay = document.querySelector('#student-menu-overlay');
  const menuButton = document.querySelector('#student-menu-button');
  const closeDrawer = () => { drawer.classList.remove('open'); overlay.hidden = true; drawer.setAttribute('aria-hidden', 'true'); menuButton.setAttribute('aria-expanded', 'false'); };
  const openDrawer = () => { drawer.classList.add('open'); overlay.hidden = false; drawer.setAttribute('aria-hidden', 'false'); menuButton.setAttribute('aria-expanded', 'true'); };
  menuButton.addEventListener('click', openDrawer);
  document.querySelector('#close-student-menu').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.querySelector('#student-logout-button').addEventListener('click', clearStudentSession);
  const accountDialog = document.querySelector('#account-dialog');
  document.querySelector('#account-button').addEventListener('click', () => accountDialog.showModal());
  document.querySelector('#close-account-dialog').addEventListener('click', () => accountDialog.close());
}

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function valueOr(value, fallback) {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function renderCourses() {
  const query = search.value.trim().toLocaleLowerCase('es-MX');
  const selectedCategory = category.value;
  const filtered = courses.filter((course) => {
    const text = `${course.nombre || ''} ${course.descripcion || ''}`.toLocaleLowerCase('es-MX');
    return text.includes(query) && (!selectedCategory || course.categoria === selectedCategory);
  });

  count.textContent = `${filtered.length} ${filtered.length === 1 ? 'curso disponible' : 'cursos disponibles'}`;
  message.textContent = filtered.length ? '' : 'No encontramos cursos que coincidan con tu búsqueda.';
  grid.innerHTML = filtered.map((course) => `
    <article class="course-card">
      <p class="course-category">${valueOr(course.categoria, 'Capacitación')}</p>
      <h3>${valueOr(course.nombre, 'Curso sin nombre')}</h3>
      <p class="course-description">${valueOr(course.descripcion, 'Consulta los detalles de este curso con nuestro equipo.')}</p>
      <div class="course-data">
        <span>${valueOr(course.duracion_horas, '—')} horas</span>
        <span>${valueOr(course.cupo, '—')} lugares</span>
      </div>
      <p class="course-price">${course.precio === null || course.precio === undefined ? 'Costo por confirmar' : money.format(Number(course.precio))}</p>
      <button class="enroll-button" type="button" data-enroll-course="${course.id_curso}">Quiero inscribirme</button>
    </article>
  `).join('');
}

function openRegistration(course) {
  selectedCourse = course;
  registrationForm.reset();
  registrationMessage.textContent = '';
  registrationMessage.classList.remove('success');
  document.querySelector('#dialog-course-name').textContent = course?.nombre ? `Curso seleccionado: ${course.nombre}` : '';
  document.querySelector('#dialog-login-link').href = course ? `./index.html?curso=${encodeURIComponent(course.id_curso)}` : './index.html';
  registrationDialog.showModal();
  document.querySelector('#quick-full-name').focus();
}

function openLogin(course = selectedCourse) {
  selectedCourse = course || null;
  loginForm.reset();
  loginMessage.textContent = '';
  loginMessage.classList.remove('success');
  document.querySelector('#login-dialog-course-name').textContent = selectedCourse?.nombre ? `Curso seleccionado: ${selectedCourse.nombre}` : '';
  loginDialog.showModal();
  document.querySelector('#quick-login-email').focus();
}

grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-enroll-course]');
  if (!button) return;
  const course = courses.find((item) => String(item.id_curso) === button.dataset.enrollCourse);
  if (!course) return;
  if (localStorage.getItem('yesems_token') && localStorage.getItem('yesems_usuario')) {
    window.location.href = `./inscripcion.html?curso=${encodeURIComponent(course.id_curso)}`;
    return;
  }
  openRegistration(course);
});

document.querySelector('#close-registration-dialog').addEventListener('click', () => registrationDialog.close());
document.querySelector('#close-login-dialog').addEventListener('click', () => loginDialog.close());
document.querySelector('#open-login-dialog').addEventListener('click', (event) => { event.preventDefault(); openLogin(null); });
document.querySelector('#dialog-login-link').addEventListener('click', (event) => { event.preventDefault(); registrationDialog.close(); openLogin(selectedCourse); });
document.querySelector('#open-registration-from-login').addEventListener('click', (event) => { event.preventDefault(); loginDialog.close(); openRegistration(selectedCourse); });

registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fullName = document.querySelector('#quick-full-name').value.trim().replace(/\s+/g, ' ');
  const [nombre, ...apellidos] = fullName.split(' ');
  const apellido = apellidos.join(' ');
  const email = document.querySelector('#quick-email').value.trim();
  const password = document.querySelector('#quick-password').value;
  registrationMessage.textContent = '';
  registrationMessage.classList.remove('success');
  if (!registrationForm.checkValidity()) {
    registrationMessage.textContent = 'Completa todos los campos y usa una contraseña de al menos 8 caracteres.';
    registrationForm.reportValidity();
    return;
  }
  if (!apellido) {
    registrationMessage.textContent = 'Escribe tu nombre y al menos un apellido.';
    document.querySelector('#quick-full-name').focus();
    return;
  }
  registrationSubmit.disabled = true;
  registrationSubmit.textContent = 'Creando cuenta...';
  try {
    const registerResponse = await fetch(`${API_URL}/usuarios/registrar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, apellido, email, password }),
    });
    const registerData = await registerResponse.json();
    if (!registerResponse.ok || !registerData.ok) throw new Error(registerData.mensaje || 'No fue posible crear tu cuenta.');
    const loginResponse = await fetch(`${API_URL}/usuarios/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginResponse.json();
    if (!loginResponse.ok || !loginData.ok) throw new Error('La cuenta fue creada, pero debes iniciar sesión para continuar.');
    localStorage.setItem('yesems_token', loginData.token);
    localStorage.setItem('yesems_usuario', JSON.stringify(loginData.usuario));
    registrationMessage.classList.add('success');
    registrationMessage.textContent = 'Cuenta creada. Continuando con tu inscripción...';
    window.location.href = selectedCourse ? `./inscripcion.html?curso=${encodeURIComponent(selectedCourse.id_curso)}` : './panel.html';
  } catch (error) {
    registrationMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor. Intenta de nuevo en unos segundos.' : error.message;
    registrationSubmit.disabled = false;
    registrationSubmit.textContent = 'Crear cuenta';
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = '';
  const email = document.querySelector('#quick-login-email').value.trim();
  const password = document.querySelector('#quick-login-password').value;
  if (!loginForm.checkValidity()) {
    loginMessage.textContent = 'Completa tu correo y contraseña para continuar.';
    loginForm.reportValidity();
    return;
  }
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Ingresando...';
  try {
    const response = await fetch(`${API_URL}/usuarios/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || 'No fue posible iniciar sesión.');
    localStorage.setItem('yesems_token', data.token);
    localStorage.setItem('yesems_usuario', JSON.stringify(data.usuario));
    loginMessage.classList.add('success');
    loginMessage.textContent = `Bienvenido(a), ${data.usuario.nombre}.`;
    window.location.href = selectedCourse ? `./inscripcion.html?curso=${encodeURIComponent(selectedCourse.id_curso)}` : './panel.html';
  } catch (error) {
    loginMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor. Intenta de nuevo en unos segundos.' : error.message;
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Ingresar';
  }
});

async function loadCourses() {
  try {
    const response = await fetch(`${API_URL}/cursos`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el catálogo.');

    courses = data.cursos || [];
    const categories = [...new Set(courses.map((course) => course.categoria).filter(Boolean))].sort();
    category.insertAdjacentHTML('beforeend', categories.map((item) => `<option value="${item}">${item}</option>`).join(''));
    renderCourses();
  } catch (error) {
    message.textContent = error instanceof TypeError
      ? 'No fue posible conectar con el servidor. Verifica que la API esté disponible.'
      : error.message;
    count.textContent = '';
  }
}

search.addEventListener('input', renderCourses);
category.addEventListener('change', renderCourses);
document.querySelector('#current-year').textContent = new Date().getFullYear();
setupStudentNavigation();
loadCourses();
