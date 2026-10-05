const API_URL = 'https://yesems-sistema-1.onrender.com/api';
const token = localStorage.getItem('yesems_token');
let user = null;
try { user = JSON.parse(localStorage.getItem('yesems_usuario') || 'null'); } catch { /* La sesión se validará de nuevo. */ }
const panelMessage = document.querySelector('#panel-message');
const list = document.querySelector('#inscription-list');
const reloadButton = document.querySelector('#reload-panel');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const escapeHtml = PanelProgreso.escapeHtml;
let sessionExpired = false;
let loadingPanel = false;
let completionPromptShown = false;

function renderCompletion(items) {
  let banner=document.querySelector('#complete-enrollment-banner');
  if(!banner){
    const css=document.createElement('link');css.rel='stylesheet';css.href='./inscripcion-pendiente.css';document.head.append(css);
    banner=document.createElement('section');banner.id='complete-enrollment-banner';
    document.querySelector('.quick-summary').before(banner);
  }
  const selected=new URLSearchParams(location.search).get('curso');
  const validCourse=/^[1-9]\d*$/.test(selected || '')?selected:null;
  const active=items.filter(item=>item.estado!=='cancelada');
  const matching=active.find(item=>String(item.id_curso)===validCourse);
  const pending=matching || active.find(item=>!paymentComplete(item) && !item.tiene_pago_pendiente);
  const needsCourse=validCourse && !matching;
  if(!needsCourse && active.length && (!pending || paymentComplete(pending) || pending.tiene_pago_pendiente)){banner.hidden=true;return;}
  banner.hidden=false;
  const href=needsCourse?`./inscripcion.html?curso=${encodeURIComponent(validCourse)}`:pending?`./pago.html?inscripcion=${encodeURIComponent(pending.id_inscripcion)}`:'./catalogo-alumno.html';
  const detail=needsCourse || !pending?'Datos pendientes: tener una cuenta no significa estar inscrito. Completa o revisa tu ficha, confirma el curso y continúa al pago.':'Tu inscripción está pendiente de pago. Paga en efectivo o transferencia y sube tu comprobante; administración confirmará cuando reciba el importe completo.';
  const content=`<p class="eyebrow">SIGUIENTE PASO</p><h2>Completa tu inscripción</h2><p>${detail}</p><a class="payment-button" href="${href}">${pending && !needsCourse?'Continuar con mi pago':'Continuar inscripción'}</a>`;
  banner.innerHTML=content;
  if(completionPromptShown)return;
  completionPromptShown=true;
  const dialog=document.createElement('dialog');dialog.className='enrollment-prompt';dialog.setAttribute('aria-labelledby','completion-title');
  dialog.innerHTML=content.replace('<h2>','<h2 id="completion-title">')+'<button type="button">Completar después</button>';
  document.body.append(dialog);
  dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}

function setupPanelMotion() {
  if (!('IntersectionObserver' in window)) return;
  document.body.classList.add('motion-ready');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.quick-summary, .dashboard-grid, .featured-section, .activity-section, #mis-inscripciones').forEach((section) => observer.observe(section));
}

function paymentComplete(item) {
  if (item.progreso && typeof item.progreso.pago_completo === 'boolean') return item.progreso.pago_completo;
  if (item.total_pagado === null || item.total_pagado === undefined || item.monto_total === null || item.monto_total === undefined) return false;
  return Number.isFinite(Number(item.total_pagado)) && Number.isFinite(Number(item.monto_total))
    && Number(item.total_pagado) >= Number(item.monto_total);
}

function paymentLabel(item) {
  if (paymentComplete(item)) return 'Pago completo confirmado';
  if (item.tiene_pago_pendiente) return 'Pago en validación';
  return 'Pago pendiente';
}

function statusLabel(value) {
  const labels = { pendiente: 'Pendiente', activa: 'Activa', inscrito: 'Inscrito', completada: 'Completada', cancelada: 'Cancelada' };
  return labels[value] || String(value || 'pendiente').replaceAll('_', ' ');
}

function formatDate(value) {
  if (!value) return 'Fecha no disponible';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function amount(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? money.format(Number(value)) : 'Por confirmar';
}

function availabilityLabel(item) {
  if (!item.id_horario) return 'Disponibilidad por confirmar';
  const mode = { en_linea: 'En línea', presencial: 'Presencial', hibrida: 'Híbrida', por_definir: 'Por definir' }[item.disponibilidad_modalidad] || 'Por definir';
  const time = item.disponibilidad_hora_inicio && item.disponibilidad_hora_fin
    ? `${String(item.disponibilidad_hora_inicio).slice(0, 5)} – ${String(item.disponibilidad_hora_fin).slice(0, 5)}` : '';
  return [mode, item.disponibilidad_dia, time, item.disponibilidad_informacion].filter(Boolean).join(' · ');
}

function renderFeaturedCourse(item) {
  const featured = document.querySelector('#featured-course');
  document.querySelector('#featured-status').textContent = item.progreso?.conclusion_validada === true
    ? 'Conclusión validada' : InscripcionEstado.estado(item);
  featured.className = 'featured-course';
  featured.innerHTML = `<div><span class="featured-label">Avance académico</span><h3>${escapeHtml(item.curso_nombre)}</h3><p>${escapeHtml(item.curso_descripcion || 'Curso YES EMS')}</p>${PanelProgreso.renderMeter(item.progreso)}<p class="progress-note">El avance corresponde a las sesiones o actividades que la administración ha registrado como cumplidas.</p></div>
    <div class="featured-meta"><strong class="${paymentComplete(item) ? '' : 'payment-pending'}">${paymentLabel(item)}</strong><a class="payment-button" href="#inscripcion-${escapeHtml(item.id_inscripcion)}">Ver mi seguimiento</a></div>`;
}

function renderActivity(items) {
  const activity = [];
  items.forEach((item) => {
    activity.push({ date: item.fecha_inscripcion, title: `Inscripción en ${item.curso_nombre}`, detail: 'Inscripción creada' });
    if (item.tiene_pago_pendiente) activity.push({ date: null, title: 'Pago enviado a revisión', detail: item.curso_nombre });
    if (item.progreso?.conclusion_validada === true) activity.push({ date: null, title: 'Conclusión del curso validada', detail: item.curso_nombre });
    if (item.estado_constancia === 'autorizada') activity.push({ date: null, title: 'Constancia disponible', detail: item.curso_nombre });
  });
  document.querySelector('#activity-list').innerHTML = activity.slice(0, 5).map((event) => `<div class="activity-item"><span class="activity-dot" aria-hidden="true"></span><div><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail)}${event.date ? ` · ${escapeHtml(formatDate(event.date))}` : ''}</small></div></div>`).join('') || '<p class="panel-message">Todavía no hay movimientos para mostrar.</p>';
}

function closeExpiredSession() {
  if (sessionExpired) return;
  sessionExpired = true;
  localStorage.removeItem('yesems_token');
  localStorage.removeItem('yesems_usuario');
  list.innerHTML = '';
  panelMessage.hidden = false;
  panelMessage.textContent = 'Tu sesión expiró. Te llevaremos al inicio para que vuelvas a iniciar sesión.';
  document.querySelector('#activity-list').textContent = 'Inicia sesión nuevamente para consultar tus movimientos.';
  document.querySelector('#featured-course').textContent = 'Inicia sesión nuevamente para consultar tu avance.';
  document.querySelector('#featured-status').textContent = 'Sesión expirada';
  ['#summary-courses', '#summary-payments', '#summary-certificates'].forEach((selector) => { document.querySelector(selector).textContent = '—'; });
  reloadButton.disabled = true;
  window.setTimeout(() => window.location.replace('./cursos.html'), 1800);
}

async function apiRequest(path, options = {}, download = false) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 75000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options, signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (response.status === 401) {
      closeExpiredSession();
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }
    if (download && response.ok) {
      const blob = await response.blob();
      if (!blob.size || !['application/pdf', 'application/octet-stream'].some((type) => blob.type.includes(type))) {
        throw new Error('El servidor no devolvió un PDF válido. Intenta de nuevo o contacta a la administración.');
      }
      return blob;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.mensaje || data?.error || (response.status === 403 ? 'No tienes permiso para realizar esta acción.' : 'No se pudo completar la consulta. Intenta de nuevo.'));
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('El servidor está tardando en responder. Intenta actualizar en unos momentos.');
    if (error instanceof TypeError) throw new Error('No se pudo conectar con el servidor. Comprueba tu conexión e intenta de nuevo.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function constanciaAction(item) {
  if (item.estado_constancia === 'autorizada' && item.id_constancia) {
    return `<button class="constancia-button" type="button" data-download="${escapeHtml(item.id_constancia)}">Descargar constancia</button>`;
  }
  if (item.estado_constancia === 'pendiente') return '<span class="constancia-status">Constancia en revisión</span>';
  if (item.estado_constancia === 'rechazada') return '<span class="constancia-status">Solicitud rechazada. Contacta a la administración para revisar tu caso.</span>';
  if (PanelProgreso.canRequest(item)) return `<button class="constancia-button" type="button" data-request="${escapeHtml(item.id_inscripcion)}">Solicitar constancia</button>`;
  return '<span class="constancia-status">La constancia requiere avance suficiente, pago completo y conclusión validada.</span>';
}

function renderEnrollment(item) {
  return `<article class="enrollment-card" id="inscripcion-${escapeHtml(item.id_inscripcion)}"><div><h3>${escapeHtml(item.curso_nombre)}</h3><p>${escapeHtml(item.curso_descripcion || 'Curso YES EMS')}</p><div class="enrollment-info"><span>Inscripción: ${escapeHtml(formatDate(item.fecha_inscripcion))}</span><span>Disponibilidad: ${escapeHtml(availabilityLabel(item))}</span></div></div>
    <div class="enrollment-side"><span class="badge">${escapeHtml(InscripcionEstado.estado(item))}</span><strong class="constancia-status">${paymentLabel(item)}</strong><p class="payment-summary">Confirmado: ${amount(item.total_pagado)} de ${amount(item.monto_total)}</p><a class="payment-button" href="./pago.html?inscripcion=${encodeURIComponent(item.id_inscripcion)}">Ver pago</a><div class="constancia-actions">${constanciaAction(item)}</div><p class="panel-feedback" role="status" aria-live="polite"></p></div>
    ${PanelProgreso.render(item.progreso, item.estado)}</article>`;
}

async function loadPanel() {
  if (loadingPanel || sessionExpired) return;
  loadingPanel = true;
  reloadButton.disabled = true;
  reloadButton.textContent = 'Actualizando…';
  list.setAttribute('aria-busy', 'true');
  panelMessage.hidden = false;
  panelMessage.textContent = 'Consultando tus inscripciones y el avance registrado…';
  const openDetails = new Set([...list.querySelectorAll('.enrollment-card')].filter((card) => card.querySelector('details[open]')).map((card) => card.id));
  try {
    const data = await apiRequest('/inscripciones/mias');
    if (!Array.isArray(data.inscripciones)) throw new Error('La información de las inscripciones no está disponible. Intenta actualizar.');
    const items = data.inscripciones;
    renderCompletion(items);
    document.querySelector('#summary-courses').textContent = items.length;
    document.querySelector('#summary-payments').textContent = items.filter((item) => item.estado !== 'cancelada' && !paymentComplete(item)).length;
    document.querySelector('#summary-certificates').textContent = items.filter((item) => item.estado_constancia === 'autorizada').length;
    document.querySelector('#inscription-count').textContent = `${items.length} ${items.length === 1 ? 'inscripción' : 'inscripciones'}`;
    panelMessage.hidden = true;
    renderActivity(items);
    if (!items.length) {
      list.innerHTML = '<div class="empty">Aún no tienes inscripciones. <a href="./catalogo-alumno.html">Explora los cursos disponibles</a> para comenzar.</div>';
      document.querySelector('#featured-status').textContent = 'Sin cursos inscritos';
      document.querySelector('#featured-course').className = 'featured-course empty';
      document.querySelector('#featured-course').textContent = 'Aún no tienes un curso destacado. Explora nuestro catálogo para comenzar.';
      return;
    }
    renderFeaturedCourse(items.find((item) => item.estado !== 'cancelada') || items[0]);
    list.innerHTML = items.map(renderEnrollment).join('');
    list.querySelectorAll('.enrollment-card').forEach((card) => {
      if (openDetails.has(card.id) && card.querySelector('details')) card.querySelector('details').open = true;
    });
  } catch (error) {
    if (sessionExpired) return;
    panelMessage.hidden = false;
    panelMessage.textContent = error.message;
    list.innerHTML = '';
    document.querySelector('#activity-list').textContent = 'No se pudieron consultar los movimientos. Usa “Actualizar” para volver a intentar.';
    document.querySelector('#featured-course').className = 'featured-course empty';
    document.querySelector('#featured-course').textContent = 'No se pudo consultar tu avance. No se mostrarán porcentajes hasta obtener los registros.';
    document.querySelector('#featured-status').textContent = 'Información no disponible';
    document.querySelector('#inscription-count').textContent = '';
    ['#summary-courses', '#summary-payments', '#summary-certificates'].forEach((selector) => { document.querySelector(selector).textContent = '—'; });
  } finally {
    loadingPanel = false;
    reloadButton.disabled = sessionExpired;
    reloadButton.textContent = 'Actualizar';
    list.setAttribute('aria-busy', 'false');
  }
}

list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-request], [data-download]');
  if (!button || button.disabled || sessionExpired) return;
  const feedback = button.closest('.enrollment-card').querySelector('.panel-feedback');
  const originalLabel = button.textContent;
  const isRequest = button.hasAttribute('data-request');
  button.disabled = true;
  button.textContent = isRequest ? 'Solicitando…' : 'Descargando…';
  feedback.textContent = '';
  feedback.className = 'panel-feedback';
  try {
    if (isRequest) {
      await apiRequest('/constancias/mia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_inscripcion: Number(button.dataset.request) }),
      });
      button.textContent = 'Solicitud enviada';
      feedback.textContent = 'Tu solicitud fue enviada para revisión.';
      feedback.classList.add('is-success');
      await loadPanel();
    } else {
      const blob = await apiRequest(`/constancias/mia/${encodeURIComponent(button.dataset.download)}/descargar`, {}, true);
      const url = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = `constancia_${button.dataset.download}.pdf`;
      document.body.append(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      feedback.textContent = 'Descarga iniciada.';
      feedback.classList.add('is-success');
    }
  } catch (error) {
    if (!sessionExpired) {
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
    }
  } finally {
    if (button.isConnected && !sessionExpired) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
});

const drawer = document.querySelector('#student-drawer');
const overlay = document.querySelector('#student-menu-overlay');
const menuButton = document.querySelector('#student-menu-button');
function closeDrawer() {
  drawer.classList.remove('open');
  overlay.hidden = true;
  drawer.setAttribute('aria-hidden', 'true');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.focus();
}
menuButton.addEventListener('click', () => {
  drawer.classList.add('open');
  overlay.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');
  menuButton.setAttribute('aria-expanded', 'true');
  document.querySelector('#close-student-menu').focus();
});
document.querySelector('#close-student-menu').addEventListener('click', closeDrawer);
overlay.addEventListener('click', closeDrawer);
drawer.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeDrawer));
document.addEventListener('keydown', (event) => {
  if (!drawer.classList.contains('open')) return;
  if (event.key === 'Escape') { closeDrawer(); return; }
  if (event.key !== 'Tab') return;
  const focusable = drawer.querySelectorAll('button, a[href]');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
document.querySelector('#account-button').addEventListener('click', () => { window.location.href = './configuracion.html'; });
document.querySelector('#logout-button').addEventListener('click', () => {
  localStorage.removeItem('yesems_token');
  localStorage.removeItem('yesems_usuario');
  window.location.href = './cursos.html';
});
reloadButton.addEventListener('click', loadPanel);

document.querySelector('#footer-year').textContent = new Date().getFullYear();
if (!token || !user) window.location.replace('./cursos.html');
else {
  setupPanelMotion();
  const fullName = `${user.nombre || ''} ${user.apellido || ''}`.trim() || 'Alumno';
  document.querySelector('#user-name').textContent = user.nombre || 'alumno';
  document.querySelector('#student-folio').textContent = user.folio || 'Pendiente de completar';
  document.querySelector('#profile-name').textContent = fullName;
  document.querySelector('#profile-avatar').textContent = fullName.charAt(0).toUpperCase();
  document.querySelector('#profile-email').textContent = user.email || 'No disponible';
  document.querySelector('#profile-folio').textContent = user.folio || 'Pendiente';
  document.querySelector('#profile-role').textContent = user.rol || 'Alumno';
  document.querySelector('#header-avatar').textContent = fullName.charAt(0).toUpperCase();
  document.querySelector('#header-name').textContent = user.nombre || 'Mi cuenta';
  document.querySelector('#drawer-avatar').textContent = fullName.charAt(0).toUpperCase();
  document.querySelector('#drawer-name').textContent = fullName;
  document.querySelector('#drawer-email').textContent = user.email || '';
  loadPanel();
}
