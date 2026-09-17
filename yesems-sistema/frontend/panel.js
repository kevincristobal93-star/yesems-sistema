const API_URL = 'https://yesems-sistema.onrender.com/api';
const token = localStorage.getItem('yesems_token');
const user = JSON.parse(localStorage.getItem('yesems_usuario') || 'null');
const panelMessage = document.querySelector('#panel-message');
const list = document.querySelector('#inscription-list');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
document.querySelector('#footer-year').textContent = new Date().getFullYear();
if (!token || !user) window.location.replace('./index.html');
else {
  const fullName = `${user.nombre || ''} ${user.apellido || ''}`.trim() || 'Alumno';
  document.querySelector('#user-name').textContent = user.nombre || 'alumno';
  document.querySelector('#student-folio').textContent = user.folio || 'Pendiente de completar';
  document.querySelector('#profile-name').textContent = fullName;
  document.querySelector('#profile-avatar').textContent = fullName.charAt(0).toUpperCase();
  document.querySelector('#profile-email').textContent = user.email || 'No disponible';
  document.querySelector('#profile-folio').textContent = user.folio || 'Pendiente';
  document.querySelector('#profile-role').textContent = user.rol || 'Alumno';
  loadPanel();
}
function paymentLabel(item) { if (item.tiene_pago_pendiente) return 'Pago en validación'; if (Number(item.total_pagado) >= Number(item.monto_total)) return 'Pago confirmado'; return 'Pago pendiente'; }
function statusLabel(value) { return value ? value.replaceAll('_', ' ') : 'pendiente'; }
function formatDate(value) { return value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Fecha pendiente'; }
function availabilityLabel(item) {
  if (!item.id_horario) return 'Disponibilidad por confirmar';
  const mode = { en_linea: 'En línea', presencial: 'Presencial', hibrida: 'Híbrida', por_definir: 'Por definir' }[item.disponibilidad_modalidad] || 'Por definir';
  const time = item.disponibilidad_hora_inicio && item.disponibilidad_hora_fin ? `${String(item.disponibilidad_hora_inicio).slice(0, 5)} – ${String(item.disponibilidad_hora_fin).slice(0, 5)}` : '';
  return [mode, item.disponibilidad_dia, time, item.disponibilidad_informacion].filter(Boolean).join(' · ');
}
function renderFeaturedCourse(item) {
  const paid = Number(item.total_pagado) >= Number(item.monto_total);
  const featured = document.querySelector('#featured-course');
  document.querySelector('#featured-status').textContent = item.estado ? statusLabel(item.estado) : 'Inscripción activa';
  featured.className = 'featured-course';
  featured.innerHTML = `<div><span class="featured-label">Curso actual</span><h3>${item.curso_nombre}</h3><p>${item.curso_descripcion || 'Curso YES EMS'}</p><div class="progress-track" aria-label="Progreso del curso"><span style="width:${item.estado === 'completada' ? 100 : 15}%"></span></div><small>${item.estado === 'completada' ? 'Curso completado' : 'Progreso disponible cuando se habilite el seguimiento del curso'}</small></div><div class="featured-meta"><strong>${paid ? 'Pago confirmado' : 'Pago pendiente'}</strong><a class="payment-button" href="./pago.html?inscripcion=${encodeURIComponent(item.id_inscripcion)}">Ver detalles</a></div>`;
}
function renderActivity(items) {
  const activity = [];
  items.forEach((item) => {
    activity.push({ date: item.fecha_inscripcion, title: `Inscripción en ${item.curso_nombre}`, detail: 'Inscripción creada' });
    if (item.tiene_pago_pendiente) activity.push({ date: null, title: 'Pago enviado a revisión', detail: item.curso_nombre });
    if (item.estado_constancia === 'autorizada') activity.push({ date: null, title: 'Constancia disponible', detail: item.curso_nombre });
  });
  document.querySelector('#activity-list').innerHTML = activity.slice(0, 5).map((event) => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${event.title}</strong><small>${event.detail} · ${formatDate(event.date)}</small></div></div>`).join('') || '<p class="panel-message">Todavía no hay movimientos para mostrar.</p>';
}
function constanciaAction(item) {
  if (item.estado_constancia === 'autorizada') {
    return `<a class="constancia-button" href="${API_URL}/constancias/mia/${encodeURIComponent(item.id_constancia)}/descargar" data-download="${item.id_constancia}">Descargar constancia</a>`;
  }
  if (item.estado_constancia === 'pendiente') return '<span class="constancia-status">Constancia en revisión</span>';
  if (item.estado_constancia === 'rechazada') return '<span class="constancia-status">Constancia rechazada</span>';
  if (item.estado === 'completada') return `<button class="constancia-button" type="button" data-request="${item.id_inscripcion}">Solicitar constancia</button>`;
  return '<span class="constancia-status">Disponible al completar el curso</span>';
}
async function loadPanel() {
  try {
    const response = await fetch(`${API_URL}/inscripciones/mias`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No se pudo cargar tu panel.');
    const items = data.inscripciones || [];
    document.querySelector('#summary-courses').textContent = items.length;
    document.querySelector('#summary-payments').textContent = items.filter((item) => item.tiene_pago_pendiente || Number(item.total_pagado) < Number(item.monto_total)).length;
    document.querySelector('#summary-certificates').textContent = items.filter((item) => item.estado_constancia === 'autorizada').length;
    document.querySelector('#inscription-count').textContent = `${items.length} ${items.length === 1 ? 'inscripción' : 'inscripciones'}`;
    panelMessage.hidden = true;
    renderActivity(items);
    if (!items.length) { list.innerHTML = '<div class="empty">Aún no tienes inscripciones. Explora los cursos disponibles para comenzar.</div>'; return; }
    renderFeaturedCourse(items[0]);
    list.innerHTML = items.map((item) => `<article class="enrollment-card"><div><h3>${item.curso_nombre}</h3><p>${item.curso_descripcion || 'Curso YES EMS'}</p><div class="enrollment-info"><span>Inscripción: ${new Date(item.fecha_inscripcion).toLocaleDateString('es-MX')}</span><span>Disponibilidad: ${availabilityLabel(item)}</span><span>Monto: ${money.format(Number(item.monto_total))}</span><span>${paymentLabel(item)}</span></div></div><div class="enrollment-side"><span class="badge">${item.estado}</span><div class="constancia-actions">${constanciaAction(item)}</div><a class="payment-button" href="./pago.html?inscripcion=${encodeURIComponent(item.id_inscripcion)}">Ver pago</a></div></article>`).join('');
  } catch (error) { panelMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor.' : error.message; }
}
list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-request]');
  if (!button) return;
  button.disabled = true;
  button.textContent = 'Solicitando...';
  try {
    const response = await fetch(`${API_URL}/constancias/mia`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id_inscripcion: button.dataset.request }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No fue posible solicitar la constancia.');
    await loadPanel();
  } catch (error) { button.disabled = false; button.textContent = error.message; }
});
list.addEventListener('click', async (event) => {
  const link = event.target.closest('[data-download]');
  if (!link) return;
  event.preventDefault();
  try {
    const response = await fetch(link.href, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) { const data = await response.json(); throw new Error(data.mensaje || 'No se pudo descargar la constancia.'); }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const download = document.createElement('a'); download.href = url; download.download = 'constancia.pdf'; download.click(); URL.revokeObjectURL(url);
  } catch (error) { panelMessage.hidden = false; panelMessage.textContent = error.message; }
});
document.querySelector('#logout-button').addEventListener('click', () => { localStorage.removeItem('yesems_token'); localStorage.removeItem('yesems_usuario'); window.location.href = './cursos.html'; });
