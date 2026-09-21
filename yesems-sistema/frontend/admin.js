const API_URL = 'https://yesems-sistema.onrender.com/api';
const token = localStorage.getItem('yesems_admin_token');
const admin = JSON.parse(localStorage.getItem('yesems_administrador') || 'null');
const message = document.querySelector('#dashboard-message');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const menuButton = document.querySelector('#menu-button');
const closeMenuButton = document.querySelector('#close-menu-button');
const drawer = document.querySelector('#admin-menu');
const overlay = document.querySelector('#menu-overlay');
const coursesMessage = document.querySelector('#courses-message');
const coursesList = document.querySelector('#courses-admin-list');
const courseDialog = document.querySelector('#course-dialog');
const courseForm = document.querySelector('#course-form');
const courseFormMessage = document.querySelector('#course-form-message');
let adminCourses = [];
let categories = [];
const availabilityMessage = document.querySelector('#availability-message');
const availabilityList = document.querySelector('#availability-list');
const availabilityDialog = document.querySelector('#availability-dialog');
const availabilityForm = document.querySelector('#availability-form');
const availabilityFormMessage = document.querySelector('#availability-form-message');
let availabilities = [];

function toggleMenu(open) {
  drawer.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  menuButton.setAttribute('aria-expanded', String(open));
  overlay.hidden = !open;
  document.body.classList.toggle('menu-open', open);
}
menuButton.addEventListener('click', () => toggleMenu(true));
closeMenuButton.addEventListener('click', () => toggleMenu(false));
overlay.addEventListener('click', () => toggleMenu(false));
drawer.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => toggleMenu(false)));

if (!token || !admin) {
  window.location.replace('./admin-login.html');
} else {
  document.querySelector('#admin-name').textContent = admin.nombre;
  document.querySelector('#current-date').textContent = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  document.querySelector('#footer-year').textContent = new Date().getFullYear();
  loadDashboard();
  loadPendingPayments();
  loadReports();
  loadCourseManagement();
  loadAvailabilityManagement();
  loadCertificates();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function renderCategoryOptions(selectedId = '') {
  const select = document.querySelector('#course-category');
  select.innerHTML = '<option value="">Selecciona una categoría</option>' + categories.map((category) => `<option value="${category.id_categoria}" ${String(category.id_categoria) === String(selectedId) ? 'selected' : ''}>${escapeHtml(category.nombre)}</option>`).join('');
}

async function loadCourseManagement() {
  try {
    const [coursesData, categoriesData] = await Promise.all([request('/cursos'), request('/categorias')]);
    adminCourses = coursesData.cursos || [];
    categories = categoriesData.categorias || [];
    coursesMessage.hidden = true;
    coursesList.innerHTML = adminCourses.length ? adminCourses.map((course) => `<article class="course-admin-card"><div><h3>${escapeHtml(course.nombre)}</h3><p>${escapeHtml(course.descripcion || 'Sin descripción disponible.')}</p></div><div class="course-admin-meta"><span>${escapeHtml(course.categoria || 'Sin categoría')}</span><span>${Number(course.duracion_horas)} horas</span><span>${Number(course.cupo)} lugares</span><span>${money.format(Number(course.precio || 0))}</span></div><div class="course-admin-actions"><button type="button" data-edit-course="${course.id_curso}">Editar</button><button type="button" data-delete-course="${course.id_curso}">Desactivar</button></div></article>`).join('') : '<p class="empty-state">Aún no hay cursos activos. Crea el primero para mostrarlo en el catálogo público.</p>';
  } catch (error) {
    coursesMessage.hidden = false;
    coursesMessage.textContent = error.message;
  }
}

function openCourseDialog(course = null) {
  courseForm.reset();
  courseFormMessage.textContent = '';
  document.querySelector('#course-id').value = course?.id_curso || '';
  document.querySelector('#course-dialog-label').textContent = course ? 'Editar oferta' : 'Nueva oferta';
  document.querySelector('#course-dialog-title').textContent = course ? 'Actualizar curso' : 'Crear curso';
  document.querySelector('#save-course-button').textContent = course ? 'Guardar cambios' : 'Guardar curso';
  document.querySelector('#course-name').value = course?.nombre || '';
  document.querySelector('#course-duration').value = course?.duracion_horas || '';
  document.querySelector('#course-capacity').value = course?.cupo || '';
  document.querySelector('#course-price').value = course?.precio || 0;
  document.querySelector('#course-description').value = course?.descripcion || '';
  renderCategoryOptions(course?.id_categoria);
  courseDialog.showModal();
}

function availabilityText(availability) {
  const mode = { en_linea: 'En línea', presencial: 'Presencial', hibrida: 'Híbrida', por_definir: 'Por definir' }[availability.modalidad] || 'Por definir';
  const dates = [availability.fecha_inicio && `Inicio: ${new Date(`${availability.fecha_inicio}T00:00:00`).toLocaleDateString('es-MX')}`, availability.fecha_fin && `Término: ${new Date(`${availability.fecha_fin}T00:00:00`).toLocaleDateString('es-MX')}`].filter(Boolean);
  const time = availability.hora_inicio && availability.hora_fin ? `${availability.hora_inicio.slice(0, 5)} – ${availability.hora_fin.slice(0, 5)}` : 'Horario por confirmar';
  return { mode, dates, time };
}

function renderAvailabilityCourseOptions(selectedId = '') {
  const select = document.querySelector('#availability-course');
  select.innerHTML = '<option value="">Selecciona un curso</option>' + adminCourses.map((course) => `<option value="${course.id_curso}" ${String(course.id_curso) === String(selectedId) ? 'selected' : ''}>${escapeHtml(course.nombre)}</option>`).join('');
}

async function loadAvailabilityManagement() {
  try {
    const data = await request('/horarios');
    availabilities = data.horarios || [];
    availabilityMessage.hidden = true;
    availabilityList.innerHTML = availabilities.length ? availabilities.map((availability) => {
      const info = availabilityText(availability);
      const details = [availability.dia_semana, info.time, ...info.dates, availability.informacion_adicional].filter(Boolean).map(escapeHtml).join(' · ');
      return `<article class="availability-card"><div><h4>${escapeHtml(availability.curso_nombre || 'Curso')}</h4><p>${details || 'Disponibilidad por confirmar.'}${availability.notas ? `<br>${escapeHtml(availability.notas)}` : ''}</p><div class="availability-tags"><span>${info.mode}</span>${availability.enlace ? '<span>Enlace configurado</span>' : ''}</div></div><div class="availability-actions"><button type="button" data-edit-availability="${availability.id_horario}">Editar</button><button type="button" data-delete-availability="${availability.id_horario}">Eliminar</button></div></article>`;
    }).join('') : '<p class="empty-state">Aún no se ha definido disponibilidad. Puedes crear una y comunicar los detalles al alumno.</p>';
  } catch (error) {
    availabilityMessage.hidden = false;
    availabilityMessage.textContent = error.message;
  }
}

function openAvailabilityDialog(availability = null, courseId = '') {
  availabilityForm.reset();
  availabilityFormMessage.textContent = '';
  document.querySelector('#availability-id').value = availability?.id_horario || '';
  document.querySelector('#availability-dialog-label').textContent = availability ? 'Editar disponibilidad' : 'Nueva disponibilidad';
  document.querySelector('#availability-dialog-title').textContent = availability ? 'Actualizar servicio' : 'Configurar servicio';
  document.querySelector('#save-availability-button').textContent = availability ? 'Guardar cambios' : 'Guardar disponibilidad';
  renderAvailabilityCourseOptions(availability?.id_curso || courseId);
  document.querySelector('#availability-mode').value = availability?.modalidad || 'por_definir';
  document.querySelector('#availability-day').value = availability?.dia_semana || '';
  document.querySelector('#availability-details').value = availability?.informacion_adicional || '';
  document.querySelector('#availability-start-date').value = availability?.fecha_inicio ? String(availability.fecha_inicio).slice(0, 10) : '';
  document.querySelector('#availability-end-date').value = availability?.fecha_fin ? String(availability.fecha_fin).slice(0, 10) : '';
  document.querySelector('#availability-start-time').value = availability?.hora_inicio ? String(availability.hora_inicio).slice(0, 5) : '';
  document.querySelector('#availability-end-time').value = availability?.hora_fin ? String(availability.hora_fin).slice(0, 5) : '';
  document.querySelector('#availability-link').value = availability?.enlace || '';
  document.querySelector('#availability-notes').value = availability?.notas || '';
  availabilityDialog.showModal();
}

document.querySelector('#new-course-button').addEventListener('click', () => openCourseDialog());
document.querySelectorAll('[data-close-course-dialog]').forEach((button) => button.addEventListener('click', () => courseDialog.close()));
document.querySelector('#new-availability-button').addEventListener('click', () => openAvailabilityDialog());
document.querySelectorAll('[data-close-availability-dialog]').forEach((button) => button.addEventListener('click', () => availabilityDialog.close()));

coursesList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-course]');
  const deleteButton = event.target.closest('[data-delete-course]');
  if (editButton) {
    openCourseDialog(adminCourses.find((course) => String(course.id_curso) === editButton.dataset.editCourse));
    return;
  }
  if (!deleteButton || !window.confirm('¿Desactivar este curso? Dejará de mostrarse al público, sin borrar sus inscripciones.')) return;
  deleteButton.disabled = true;
  try {
    await request(`/cursos/${deleteButton.dataset.deleteCourse}`, { method: 'DELETE' });
    await loadCourseManagement();
    loadDashboard();
  } catch (error) {
    deleteButton.disabled = false;
    alert(error.message);
  }
});

availabilityList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-availability]');
  const deleteButton = event.target.closest('[data-delete-availability]');
  if (editButton) {
    openAvailabilityDialog(availabilities.find((availability) => String(availability.id_horario) === editButton.dataset.editAvailability));
    return;
  }
  if (!deleteButton || !window.confirm('¿Eliminar esta disponibilidad? Si tiene inscripciones asociadas, el sistema la conservará para proteger el historial.')) return;
  deleteButton.disabled = true;
  try {
    await request(`/horarios/${deleteButton.dataset.deleteAvailability}`, { method: 'DELETE' });
    await loadAvailabilityManagement();
  } catch (error) {
    deleteButton.disabled = false;
    alert(error.message);
  }
});

availabilityForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#availability-id').value;
  const saveButton = document.querySelector('#save-availability-button');
  const valueOrNull = (selector) => document.querySelector(selector).value.trim() || null;
  const payload = {
    id_curso: Number(document.querySelector('#availability-course').value),
    modalidad: document.querySelector('#availability-mode').value,
    dia_semana: valueOrNull('#availability-day'),
    informacion_adicional: valueOrNull('#availability-details'),
    fecha_inicio: valueOrNull('#availability-start-date'),
    fecha_fin: valueOrNull('#availability-end-date'),
    hora_inicio: valueOrNull('#availability-start-time'),
    hora_fin: valueOrNull('#availability-end-time'),
    enlace: valueOrNull('#availability-link'),
    notas: valueOrNull('#availability-notes'),
  };
  saveButton.disabled = true;
  availabilityFormMessage.textContent = '';
  try {
    await request(`/horarios${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    availabilityDialog.close();
    await loadAvailabilityManagement();
  } catch (error) {
    availabilityFormMessage.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

courseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#course-id').value;
  const saveButton = document.querySelector('#save-course-button');
  const payload = {
    id_categoria: Number(document.querySelector('#course-category').value),
    nombre: document.querySelector('#course-name').value.trim(),
    descripcion: document.querySelector('#course-description').value.trim(),
    duracion_horas: Number(document.querySelector('#course-duration').value),
    cupo: Number(document.querySelector('#course-capacity').value),
    precio: Number(document.querySelector('#course-price').value)
  };
  saveButton.disabled = true;
  courseFormMessage.textContent = '';
  try {
    await request(`/cursos${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    courseDialog.close();
    await loadCourseManagement();
    loadDashboard();
  } catch (error) {
    courseFormMessage.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

async function loadReports() {
  try {
    const data = await request('/administradores/reportes');
    const report = data.reportes;
    document.querySelector('#report-active-enrollments').textContent = report.generales.inscripciones_activas;
    document.querySelector('#report-confirmed-income').textContent = money.format(Number(report.generales.ingresos_confirmados));
    document.querySelector('#report-pending-income').textContent = money.format(Number(report.generales.ingresos_pendientes));
    const courses = report.por_curso || [];
    const maxCourses = Math.max(1, ...courses.map((item) => Number(item.inscripciones)));
    document.querySelector('#course-report').innerHTML = courses.length ? courses.map((item) => `<div class="bar-item"><span>${item.nombre}</span><div class="bar-track"><div class="bar-fill" style="width:${(Number(item.inscripciones) / maxCourses) * 100}%"></div></div><strong>${item.inscripciones}</strong></div>`).join('') : '<span>Sin información disponible.</span>';
    const months = report.por_mes || [];
    const maxMonths = Math.max(1, ...months.map((item) => Number(item.inscripciones)));
    document.querySelector('#month-report').innerHTML = months.length ? months.map((item) => `<div class="trend-item"><strong>${item.inscripciones}</strong><div class="trend-bar" style="height:${Math.max(8, (Number(item.inscripciones) / maxMonths) * 95)}px"></div><span>${item.periodo}</span></div>`).join('') : '<span>Sin información disponible.</span>';
  } catch (error) { console.error('No se pudieron cargar los reportes:', error); }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No se pudo completar la operación.');
  return data;
}

async function loadDashboard() {
  try {
    const data = await request('/administradores/resumen');
    document.querySelector('#metric-courses').textContent = data.metricas.cursos;
    document.querySelector('#metric-students').textContent = data.metricas.alumnos;
    document.querySelector('#metric-payments').textContent = data.metricas.pagos_pendientes;
    document.querySelector('#metric-certificates').textContent = data.metricas.constancias_pendientes;
    message.hidden = true;
    const rows = data.ultimas_inscripciones || [];
    document.querySelector('#inscription-table').innerHTML = rows.length ? rows.map((item) => `<tr><td>${item.usuario_nombre} ${item.usuario_apellido}</td><td>${item.curso_nombre}</td><td>${new Date(item.fecha_inscripcion).toLocaleDateString('es-MX')}</td><td>${money.format(Number(item.monto_total))}</td><td><span class="badge">${item.estado}</span></td><td>${item.estado !== 'cancelada' ? `<button class="table-action cancel" data-cancel-inscription="${item.id_inscripcion}">Cancelar</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6">Aún no hay inscripciones.</td></tr>';
  } catch (error) { message.hidden = false; message.textContent = error.message; }
}

async function loadPendingPayments() {
  const paymentMessage = document.querySelector('#payments-message');
  try {
    const data = await request('/administradores/pagos-pendientes');
    const payments = data.pagos || [];
    document.querySelector('#pending-payment-count').textContent = `${payments.length} pendientes`;
    paymentMessage.hidden = true;
    document.querySelector('#payment-table').innerHTML = payments.length ? payments.map((payment) => `<tr><td>${payment.usuario_nombre} ${payment.usuario_apellido}<br><small>${payment.folio || ''}</small></td><td>${payment.curso_nombre}</td><td>${money.format(Number(payment.monto))}</td><td>${payment.metodo_pago}<br><small>${payment.referencia || 'Sin referencia'}</small></td><td>${new Date(payment.fecha_pago).toLocaleDateString('es-MX')}</td><td class="action-group"><button class="table-action approve" data-payment="${payment.id_pago}" data-state="completado">Aprobar</button><button class="table-action cancel" data-payment="${payment.id_pago}" data-state="cancelado">Cancelar</button></td></tr>`).join('') : '<tr><td colspan="6">No hay pagos pendientes de validación.</td></tr>';
  } catch (error) { paymentMessage.textContent = error.message; }
}

async function loadCertificates() {
  const certificatesMessage = document.querySelector('#certificates-message');
  try {
    const data = await request('/constancias');
    const certificates = data.constancias || [];
    const pending = certificates.filter((item) => item.estado === 'pendiente').length;
    document.querySelector('#pending-certificate-count').textContent = `${pending} pendientes`;
    certificatesMessage.hidden = true;
    document.querySelector('#certificate-table').innerHTML = certificates.length ? certificates.map((item) => `<tr><td>${escapeHtml(item.usuario_nombre)} ${escapeHtml(item.usuario_apellido)}</td><td>${escapeHtml(item.curso_nombre)}</td><td>${escapeHtml(item.folio)}</td><td>${new Date(item.fecha_emision).toLocaleDateString('es-MX')}</td><td><span class="badge">${escapeHtml(item.estado)}</span></td><td class="action-group">${item.estado === 'pendiente' ? `<button class="table-action approve" data-certificate="${item.id_constancia}" data-certificate-action="autorizar">Autorizar</button><button class="table-action cancel" data-certificate="${item.id_constancia}" data-certificate-action="rechazar">Rechazar</button>` : item.estado === 'autorizada' ? `<a class="table-action certificate-download" href="${API_URL}/constancias/${item.id_constancia}/descargar" data-certificate-download="${item.id_constancia}">Descargar</a>` : '<span>Sin acciones</span>'}</td></tr>`).join('') : '<tr><td colspan="6">No hay solicitudes de constancia.</td></tr>';
  } catch (error) {
    certificatesMessage.hidden = false;
    certificatesMessage.textContent = error.message;
  }
}

document.querySelector('#payment-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-payment]');
  if (!button || !window.confirm(`¿Deseas ${button.dataset.state === 'completado' ? 'aprobar' : 'cancelar'} este pago?`)) return;
  button.disabled = true;
  try {
    await request(`/administradores/pagos/${button.dataset.payment}/validar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: button.dataset.state }) });
    loadDashboard(); loadPendingPayments();
  } catch (error) { button.disabled = false; alert(error.message); }
});

document.querySelector('#certificate-table').addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-certificate-action]');
  const downloadLink = event.target.closest('[data-certificate-download]');
  if (downloadLink) {
    event.preventDefault();
    try {
      const response = await fetch(downloadLink.href, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const data = await response.json(); throw new Error(data.mensaje || 'No se pudo descargar la constancia.'); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const download = document.createElement('a'); download.href = url; download.download = 'constancia.pdf'; download.click(); URL.revokeObjectURL(url);
    } catch (error) { alert(error.message); }
    return;
  }
  if (!actionButton || !window.confirm(`¿Deseas ${actionButton.dataset.certificateAction === 'autorizar' ? 'autorizar y generar' : 'rechazar'} esta constancia?`)) return;
  actionButton.disabled = true;
  try {
    await request(`/constancias/${actionButton.dataset.certificate}/${actionButton.dataset.certificateAction}`, { method: 'PATCH' });
    loadCertificates();
    loadDashboard();
  } catch (error) { actionButton.disabled = false; alert(error.message); }
});

document.querySelector('#inscription-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-cancel-inscription]');
  if (!button || !window.confirm('¿Cancelar esta inscripción? El alumno no será eliminado; se conservará su historial.')) return;
  button.disabled = true;
  try {
    await request(`/administradores/inscripciones/${button.dataset.cancelInscription}/cancelar`, { method: 'PATCH' });
    loadDashboard(); loadPendingPayments();
  } catch (error) { button.disabled = false; alert(error.message); }
});

document.querySelector('#logout-button').addEventListener('click', () => { localStorage.removeItem('yesems_admin_token'); localStorage.removeItem('yesems_administrador'); window.location.href = './admin-login.html'; });
