/* Aula del alumno integrada en Mi panel. El servidor sigue decidiendo el acceso. */
const PanelAula = (() => {
  'use strict';
  const API = 'https://yesems-sistema-1.onrender.com/api/aula';
  const previewable = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);
  const imageTypes = new Set(['jpg', 'jpeg', 'png', 'webp']);
  const videoHosts = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
  const activeUrls = new Set();
  const courseData = new Map();
  let section, content, dialog, renderVersion = 0, request, token, onUnauthorized;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function ensure() {
    if (section) return section;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = './panel-aula.css'; document.head.append(css);
    section = element('section', 'panel-aula-section');
    section.id = 'mi-aula';
    section.setAttribute('aria-labelledby', 'mi-aula-title');
    const heading = element('div', 'panel-aula-heading');
    const copy = element('div');
    copy.append(element('p', 'eyebrow', 'APRENDE A TU RITMO'), element('h2', '', 'Mi aula'));
    copy.append(element('p', '', 'Tus módulos y materiales están aquí, sin salir del panel.'));
    const note = element('span', 'panel-aula-heading-note', 'Curso → módulo → PDF → apoyos');
    heading.append(copy, note);
    content = element('div', 'panel-aula-courses');
    section.append(heading, content);
    document.querySelector('.welcome').after(section);
    const menuLink = document.querySelector('.student-drawer nav a[href="#mis-inscripciones"]');
    if (menuLink) { menuLink.href = '#mi-aula'; menuLink.textContent = 'Mi aula'; }
    section.addEventListener('click', handleClick);
    return section;
  }
  function revokeAll() {
    for (const url of activeUrls) URL.revokeObjectURL(url);
    activeUrls.clear();
    if (dialog?.open) dialog.close();
    dialog?.remove(); dialog = null;
  }
  function clear() {
    renderVersion++;
    courseData.clear();
    revokeAll();
    if (content) content.replaceChildren();
  }
  function showError(message) {
    clear();
    ensure();
    content.append(element('p', 'panel-aula-state', message));
  }
  function paid(item) {
    if (typeof item.progreso?.pago_completo === 'boolean') return item.progreso.pago_completo;
    if (item.monto_total != null && Number(item.monto_total) === 0) return true;
    return item.total_pagado != null && item.monto_total != null &&
      Number.isFinite(Number(item.total_pagado)) && Number(item.total_pagado) >= Number(item.monto_total);
  }
  function courseShell(item) {
    const board = element('article', 'panel-aula-course');
    board.dataset.enrollment = String(item.id_inscripcion);
    const heading = element('div', 'panel-aula-course-heading');
    const text = element('div');
    text.append(element('span', 'panel-aula-course-kicker', 'CURSO INSCRITO'), element('h3', '', item.curso_nombre || 'Mi curso'));
    const state = element('span', 'panel-aula-access', paid(item) && item.estado !== 'cancelada' ? 'Contenido disponible' : 'Acceso pendiente');
    heading.append(text, state);
    const body = element('div', 'panel-aula-course-body');
    board.append(heading, body);
    content.append(board);
    return board;
  }
  function stateMessage(body, title, detail, className = '') {
    const box = element('div', `panel-aula-state ${className}`);
    box.append(element('strong', '', title), element('p', '', detail));
    body.replaceChildren(box);
  }
  function safeVideoUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password && videoHosts.has(url.hostname)) return url.href;
    } catch { /* Un enlace incorrecto no se muestra como acción. */ }
    return null;
  }
  function fileCard(doc, inscription, supporting = false) {
    const type = String(doc.tipo_material || (doc.extension === 'pdf' ? 'pdf' : 'documento'));
    const card = element('div', `panel-aula-resource ${type === 'pdf' && !supporting ? 'is-primary' : ''}`);
    const icon = element('span', 'panel-aula-resource-icon', type === 'pdf' ? 'PDF' : imageTypes.has(doc.extension) ? 'IMG' : type === 'organizador' ? 'ORG' : type === 'ejercicio' ? 'ACT' : 'DOC');
    const details = element('div', 'panel-aula-resource-copy');
    const label = ({ pdf: 'Lectura principal', organizador: 'Organizador gráfico', ejercicio: 'Actividad', imagen: 'Imagen de apoyo' })[type] || 'Material complementario';
    details.append(element('small', '', label), element('strong', '', doc.titulo || 'Material sin título'));
    if (doc.descripcion) details.append(element('p', '', doc.descripcion));
    const meta = element('span', 'panel-aula-resource-meta', String(doc.extension || 'archivo').toUpperCase());
    const actions = element('div', 'panel-aula-resource-actions');
    const id = Number(doc.id_documento);
    if (Number.isSafeInteger(id) && id > 0) {
      if (previewable.has(String(doc.extension).toLowerCase())) {
        const view = element('button', 'panel-aula-primary-action', doc.extension === 'pdf' ? 'Leer PDF' : 'Ver imagen');
        view.type = 'button'; view.dataset.fileAction = 'view'; view.dataset.document = String(id);
        view.dataset.enrollment = String(inscription); actions.append(view);
      }
      const download = element('button', '', 'Descargar');
      download.type = 'button'; download.dataset.fileAction = 'download'; download.dataset.document = String(id);
      download.dataset.enrollment = String(inscription); actions.append(download);
    }
    card.append(icon, details, meta, actions);
    return card;
  }
  function videoCard(video) {
    const card = element('div', 'panel-aula-video');
    card.append(element('span', 'panel-aula-video-icon', '▶'));
    const copy = element('div');
    copy.append(element('small', '', 'VIDEO DE APOYO'), element('strong', '', video.titulo || 'Video'));
    if (video.descripcion) copy.append(element('p', '', video.descripcion));
    const url = safeVideoUrl(video.url);
    if (url) {
      const link = element('a', '', 'Ver video ↗');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
      copy.append(link);
    }
    card.append(copy);
    return card;
  }
  function renderModule(module, index, inscription) {
    const card = element('article', 'panel-aula-module');
    const heading = element('div', 'panel-aula-module-heading');
    const number = element('span', 'panel-aula-module-number', String(index + 1).padStart(2, '0'));
    const title = element('div');
    title.append(element('small', '', `MÓDULO ${index + 1}`), element('h4', '', module.titulo || 'Módulo'));
    const badge = element('span', `panel-aula-module-badge ${module.completado ? 'is-done' : ''}`, module.completado ? 'Completado' : 'Por estudiar');
    heading.append(number, title, badge);
    card.append(heading);
    if (module.descripcion) card.append(element('p', 'panel-aula-module-description', module.descripcion));
    const documents = Array.isArray(module.documentos) ? module.documentos : [];
    const videos = Array.isArray(module.videos) ? module.videos : [];
    const main = element('div', 'panel-aula-materials');
    const roots = documents.filter(doc => !doc.principal_id || !documents.some(parent => parent.id_documento === doc.principal_id));
    for (const doc of roots) {
      const group = element('div', 'panel-aula-material-group');
      group.append(fileCard(doc, inscription));
      const supports = documents.filter(child => child.principal_id === doc.id_documento);
      const relatedVideos = videos.filter(video => video.principal_id === doc.id_documento);
      if (supports.length || relatedVideos.length) {
        const supportArea = element('div', 'panel-aula-supports');
        supportArea.append(element('strong', 'panel-aula-supports-title', 'Para comprender y practicar'));
        for (const child of supports) supportArea.append(fileCard(child, inscription, true));
        for (const video of relatedVideos) supportArea.append(videoCard(video));
        group.append(supportArea);
      }
      main.append(group);
    }
    for (const video of videos.filter(video => !video.principal_id || !documents.some(doc => doc.id_documento === video.principal_id))) main.append(videoCard(video));
    if (!documents.length && !videos.length) main.append(element('p', 'panel-aula-empty-material', 'Administración aún no ha agregado materiales a este módulo.'));
    card.append(main);
    const footer = element('div', 'panel-aula-module-footer');
    const note = element('small', '', 'Marcar este módulo no modifica tu asistencia ni tu constancia.');
    const completion = element('button', 'panel-aula-complete', module.completado ? 'Marcar como pendiente' : 'Marcar módulo como completado');
    completion.type = 'button'; completion.dataset.moduleProgress = String(module.id_modulo);
    completion.dataset.enrollment = String(inscription); completion.dataset.complete = String(!module.completado);
    completion.setAttribute('aria-pressed', String(Boolean(module.completado)));
    footer.append(note, completion); card.append(footer);
    return card;
  }
  function renderCourse(board, aula) {
    const body = board.querySelector('.panel-aula-course-body');
    if (!body) return;
    const modules = Array.isArray(aula.modulos) ? aula.modulos : [];
    const introduction = element('div', 'panel-aula-introduction');
    const introCopy = element('div');
    introCopy.append(element('strong', '', modules.length ? 'Tu ruta de aprendizaje' : 'Contenido en preparación'));
    introCopy.append(element('p', '', modules.length ? 'Sigue los módulos en orden. Abre la lectura principal y después revisa sus apoyos.' : 'Tu inscripción está lista. Los materiales aparecerán cuando administración publique el primer módulo.'));
    introduction.append(introCopy);
    const count = element('span', 'panel-aula-progress-count', `${aula.progreso?.completados || 0} de ${modules.length} módulos completados`);
    introduction.append(count);
    const track = element('div', 'panel-aula-track'); track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'Módulos completados'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
    const value = Math.max(0, Math.min(100, Number(aula.progreso?.porcentaje) || 0));
    track.setAttribute('aria-valuenow', String(value));
    const fill = element('span'); fill.style.width = `${value}%`; track.append(fill);
    const parts = [introduction, track];
    if (modules.length) {
      const list = element('div', 'panel-aula-module-list');
      modules.forEach((module, index) => list.append(renderModule(module, index, aula.id_inscripcion)));
      parts.push(list);
    }
    body.replaceChildren(...parts);
  }
  function render(items, apiRequest, bearer, expired) {
    ensure();
    clear();
    request = apiRequest; token = bearer; onUnauthorized = expired;
    const version = renderVersion;
    if (!items.length) {
      stateMessage(content, 'Tu aula te espera', 'Cuando te inscribas en un curso, aquí aparecerán sus módulos y materiales.');
      return;
    }
    for (const item of items) {
      if (!Number.isSafeInteger(Number(item.id_inscripcion)) || Number(item.id_inscripcion) < 1) continue;
      const board = courseShell(item);
      const body = board.querySelector('.panel-aula-course-body');
      if (item.estado === 'cancelada') {
        stateMessage(body, 'Inscripción cancelada', 'Este curso ya no está disponible en tu aula.');
      } else if (!paid(item)) {
        stateMessage(body, 'Contenido pendiente de habilitar', 'Cuando el pago completo quede aprobado, aquí aparecerán los módulos y materiales de tu curso.', 'is-locked');
      } else {
        stateMessage(body, 'Preparando tus módulos…', 'Estamos consultando el contenido disponible para ti.');
        request(`/aula/mia/${item.id_inscripcion}`).then(data => {
          if (renderVersion !== version || !board.isConnected) return;
          courseData.set(String(item.id_inscripcion), data);
          renderCourse(board, data);
        }).catch(error => {
          if (renderVersion !== version || !board.isConnected) return;
          stateMessage(body, 'No se pudo mostrar este curso', error.message || 'Intenta actualizar el panel.');
        });
      }
    }
  }
  function findDocument(enrollment, id) {
    const aula = courseData.get(String(enrollment));
    return aula?.modulos?.flatMap(module => module.documentos || []).find(doc => Number(doc.id_documento) === Number(id));
  }
  function safeFileName(doc) {
    const title = String(doc.titulo || 'material').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100);
    const extension = /^[a-z0-9]{1,5}$/i.test(String(doc.extension)) ? doc.extension : 'bin';
    return `${title}.${extension}`;
  }
  function openPreview(url, doc) {
    if (dialog?.open) dialog.close();
    dialog?.remove();
    const viewer = element('dialog', 'panel-aula-preview');
    dialog = viewer;
    viewer.setAttribute('aria-label', `Vista previa de ${doc.titulo}`);
    const heading = element('div', 'panel-aula-preview-heading');
    heading.append(element('strong', '', doc.titulo));
    const close = element('button', '', 'Cerrar'); close.type = 'button'; close.onclick = () => viewer.close(); heading.append(close);
    const ext = String(doc.extension).toLowerCase();
    const media = imageTypes.has(ext) ? element('img') : element('iframe');
    media.src = url;
    if (media.tagName === 'IMG') media.alt = doc.titulo;
    else media.title = doc.titulo;
    viewer.append(heading, media);
    viewer.addEventListener('close', () => { URL.revokeObjectURL(url); activeUrls.delete(url); viewer.remove(); if (dialog === viewer) dialog = null; }, { once: true });
    document.body.append(viewer); viewer.showModal();
  }
  async function handleFile(button) {
    const enrollment = button.dataset.enrollment;
    const doc = findDocument(enrollment, button.dataset.document);
    if (!doc || !token) return;
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Cargando…';
    try {
      const response = await fetch(`${API}/mia/${encodeURIComponent(enrollment)}/documentos/${encodeURIComponent(doc.id_documento)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(45000),
      });
      if (response.status === 401) { onUnauthorized?.(); return; }
      if (response.status === 404) throw Error('Este material ya no está disponible. Actualiza el panel.');
      if (response.status === 403) throw Error('Tu acceso a este material cambió. Actualiza el panel y revisa tu inscripción.');
      if (!response.ok) throw Error('No se pudo abrir el archivo en este momento. Intenta de nuevo más tarde.');
      const blob = await response.blob();
      if (!blob.size) throw Error('El archivo está vacío.');
      const url = URL.createObjectURL(blob); activeUrls.add(url);
      if (button.dataset.fileAction === 'view' && previewable.has(String(doc.extension).toLowerCase())) openPreview(url, doc);
      else {
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = safeFileName(doc);
        document.body.append(anchor); anchor.click(); anchor.remove();
        setTimeout(() => { URL.revokeObjectURL(url); activeUrls.delete(url); }, 60000);
      }
    } catch (error) {
      const feedback = button.closest('.panel-aula-course-body');
      const notice = element('p', 'panel-aula-error', error.name === 'TimeoutError' ? 'La descarga tardó demasiado. Intenta de nuevo.' : error.message);
      feedback?.prepend(notice); setTimeout(() => notice.remove(), 7000);
    } finally { if (button.isConnected) { button.disabled = false; button.textContent = original; } }
  }
  async function handleProgress(button) {
    const enrollment = button.dataset.enrollment;
    const id = button.dataset.moduleProgress;
    const board = button.closest('.panel-aula-course');
    if (!courseData.has(enrollment) || !board) return;
    button.disabled = true;
    const original = button.textContent; button.textContent = 'Guardando…';
    try {
      const data = await request(`/aula/mia/${enrollment}/modulos/${id}/progreso`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completado: button.dataset.complete === 'true' }),
      });
      if (!board.isConnected) return;
      courseData.set(enrollment, data);
      renderCourse(board, data);
    } catch (error) {
      if (button.isConnected) {
        const notice = element('p', 'panel-aula-error', error.message || 'No se pudo guardar tu avance.');
        button.closest('.panel-aula-module')?.append(notice);
        setTimeout(() => notice.remove(), 7000);
      }
    } finally { if (button.isConnected) { button.disabled = false; button.textContent = original; } }
  }
  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button || !section.contains(button)) return;
    if (button.dataset.fileAction) handleFile(button);
    else if (button.dataset.moduleProgress) handleProgress(button);
  }
  return { render, clear, showError };
})();
