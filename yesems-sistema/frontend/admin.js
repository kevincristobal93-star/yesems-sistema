const API_URL = 'https://yesems-sistema.onrender.com/api';
const token = localStorage.getItem('yesems_admin_token');
const admin = JSON.parse(localStorage.getItem('yesems_administrador') || 'null');
const message = document.querySelector('#dashboard-message');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const menuButton = document.querySelector('#menu-button');
const closeMenuButton = document.querySelector('#close-menu-button');
const drawer = document.querySelector('#admin-menu');
const overlay = document.querySelector('#menu-overlay');

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
}

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

document.querySelector('#payment-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-payment]');
  if (!button || !window.confirm(`¿Deseas ${button.dataset.state === 'completado' ? 'aprobar' : 'cancelar'} este pago?`)) return;
  button.disabled = true;
  try {
    await request(`/administradores/pagos/${button.dataset.payment}/validar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: button.dataset.state }) });
    loadDashboard(); loadPendingPayments();
  } catch (error) { button.disabled = false; alert(error.message); }
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
