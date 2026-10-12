(() => {
  'use strict';
  const API = 'https://yesems-sistema-1.onrender.com/api/aula';
  const $ = id => document.getElementById(id);
  const admin = document.body.dataset.admin === 'true';
  if (!admin) $('login').href = './cursos.html';
  const key = admin ? 'yesems_admin_token' : 'yesems_token';
  let state = null, editing = null, busy = false;
  if ($('aula-year')) $('aula-year').textContent = new Date().getFullYear();
  function updateOverview() {
    if (!admin) {
      if (!state || !$('workspace')) return;
      let overview = $('student-overview');
      if (!overview) {
        overview = document.createElement('section'); overview.id = 'student-overview'; overview.className = 'student-overview';
        const copy = document.createElement('div'); copy.className = 'student-progress-copy';
        const title = document.createElement('h2'); title.textContent = 'Tu avance en el curso';
        const count = document.createElement('p'); count.id = 'student-progress-count';
        const track = document.createElement('div'); track.className = 'progress-track'; track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', 'Avance de modulos'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
        const bar = document.createElement('span'); bar.id = 'student-progress-bar'; track.append(bar); copy.append(title, count); overview.append(copy, track);
        $('workspace').insertBefore(overview, $('refresh'));
      }
      const progress = state.progreso || { completados: 0, total: state.modulos.length, porcentaje: 0 };
      $('student-progress-count').textContent = `${progress.completados} de ${progress.total} modulos completados`;
      $('student-progress-bar').style.width = `${progress.porcentaje}%`;
      overview.querySelector('.progress-track').setAttribute('aria-valuenow', String(progress.porcentaje));
      return;
    }
    if (!$('course-overview')) return;
    $('course-overview').hidden = !state;
    $('module-toolbar').hidden = !state;
    $('aula-start').hidden = Boolean(state);
    if (!state) return;
    $('module-count').textContent = state.modulos.length;
    $('published-count').textContent = state.modulos.filter(mod => mod.publicado).length;
    $('document-count').textContent = state.modulos.reduce((total, mod) => total + (mod.documentos || []).length, 0);
    if ($('archived-count')) $('archived-count').textContent = state.modulos.filter(mod => mod.archivado_at).length;
    $('course-mode').textContent = state.curso.activo ? 'Prepara, revisa y publica los materiales de tus alumnos.' : 'Curso desactivado · Solo consulta';
  }
  function closeHistory() {
    if (!admin) return;
    $('history').hidden = true;
    $('history').replaceChildren();
    $('history-toggle').setAttribute('aria-expanded', 'false');
    $('history-toggle').textContent = 'Ver historial de PDF';
  }
  const message = (text, error = false) => { $('feedback').textContent = text; $('feedback').classList.toggle('error', error); };
  function lock(value) {
    busy = value;
    document.querySelectorAll('button,select,.upload-form input,.upload-form textarea').forEach(el => { el.disabled = value || el.dataset.unavailable === 'true'; });
    if (admin) $('fields').disabled = value || !state?.curso.activo;
  }
  async function request(path, method = 'GET', body) {
    const token = localStorage.getItem(key);
    if (!token) { $('workspace').hidden = true; $('login').hidden = false; throw Error('Inicia sesión para consultar el aula.'); }
    const multipart = body instanceof FormData;
    const response = await fetch(API + path, { method, cache: 'no-store', signal: AbortSignal.timeout(multipart ? 90000 : 30000), headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}) });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    if (response.status === 401) { localStorage.removeItem(key); $('workspace').hidden = true; $('modules').replaceChildren(); $('login').hidden = false; }
    if (!response.ok) throw Error(data?.mensaje || 'No se pudo consultar el aula. Intenta nuevamente.');
    return data;
  }
  function resetEditor() {
    editing = null;
    if (admin) { $('module-form').reset(); $('editor-title').textContent = 'Nuevo módulo'; if ($('editor-help')) $('editor-help').textContent = 'Añade un tema al curso. Se guardará como borrador.'; }
  }
  function pdfStatus(form, text, error = false) {
    const status = form.querySelector('.upload-status');
    status.textContent = text;
    status.classList.toggle('error', error);
    status.hidden = !text;
  }
  function createPdfForm(mod, doc) {
    const form = document.createElement('form'); form.className = 'upload-form'; form.noValidate = true;
    const heading = document.createElement('h3'); heading.textContent = doc ? 'Reemplazar este PDF' : 'Agregar un PDF al módulo';
    const help = document.createElement('p'); help.className = 'hint'; help.textContent = '1. Selecciona un PDF de hasta 5 MB. 2. Revisa su nombre. 3. Pulsa el botón para guardarlo.';
    const fileLabel = document.createElement('label'); fileLabel.textContent = 'Archivo PDF';
    const file = document.createElement('input'); file.type = 'file'; file.name = 'archivo'; file.accept = 'application/pdf,.pdf'; file.required = true; fileLabel.append(file);
    const titleLabel = document.createElement('label'); titleLabel.textContent = 'Nombre del PDF';
    const name = document.createElement('input'); name.name = 'titulo'; name.maxLength = 150; name.required = true; name.value = doc?.titulo || ''; name.placeholder = 'Se completa al seleccionar el archivo'; titleLabel.append(name);
    const descriptionLabel = document.createElement('label'); descriptionLabel.textContent = 'Descripcion del PDF (opcional)';
    const description = document.createElement('textarea'); description.name = 'descripcion'; description.maxLength = 1000; description.value = doc?.descripcion || ''; description.placeholder = 'Describe brevemente este material.'; descriptionLabel.append(description);
    let suggestedTitle = name.value;
    file.onchange = () => {
      const selected = file.files[0];
      if (!selected) { pdfStatus(form, 'Selecciona el PDF que quieres subir.'); return; }
      if (!name.value.trim() || name.value === suggestedTitle) {
        suggestedTitle = selected.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 150);
        name.value = suggestedTitle;
      }
      pdfStatus(form, `Archivo seleccionado: ${selected.name}. Pulsa ${doc ? 'Reemplazar PDF' : 'Subir PDF'} para guardarlo.`);
    };
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = doc ? 'Reemplazar PDF' : 'Subir PDF';
    const status = document.createElement('p'); status.className = 'upload-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;
    form.append(heading, help, fileLabel, titleLabel, descriptionLabel, submit, status);
    for (const control of [file, name, description, submit]) { control.dataset.unavailable = String(!state.curso.activo || Boolean(mod.archivado_at)); control.disabled = !state.curso.activo || Boolean(mod.archivado_at); }
    form.onsubmit = event => { event.preventDefault(); saveDocument(mod, doc, form, name, description, file); };
    return form;
  }
  function render() {
    updateOverview();
    $('course-title').textContent = state.curso.nombre;
    $('modules').replaceChildren();
    if (admin) $('editor').hidden = !state.curso.activo;
    if (!state.modulos.length) { const p = document.createElement('p'); p.textContent = admin ? 'Aún no hay módulos. Crea el primero como borrador.' : 'El administrador aún no ha publicado módulos.'; $('modules').append(p); }
    state.modulos.forEach((mod, index) => {
      const article = document.createElement('article'); article.dataset.moduleId = mod.id_modulo;
      const heading = document.createElement('h2'); heading.textContent = `${index + 1}. ${mod.titulo}`;
      const desc = document.createElement('p'); desc.textContent = mod.descripcion;
      article.append(heading, desc);
      const documents = document.createElement('ul'); documents.className = 'documents';
      (mod.documentos || []).forEach(doc => {
        const item = document.createElement('li');
        const summary = document.createElement('div'); summary.className = 'document-summary';
        const documentTitle = document.createElement('strong'); documentTitle.textContent = doc.titulo;
        const size = document.createElement('span'); size.className = 'document-size'; size.textContent = `PDF - ${doc.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(doc.bytes / 1024))} KB` : `${(doc.bytes / (1024 * 1024)).toFixed(1)} MB`}`;
        summary.append(documentTitle, size);
        if (doc.descripcion) { const detail = document.createElement('p'); detail.textContent = doc.descripcion; summary.append(detail); }
        const documentActions = document.createElement('div'); documentActions.className = 'document-actions';
        const view = document.createElement('button'); view.type = 'button'; view.textContent = 'Ver PDF'; view.onclick = () => openDocument(doc);
        const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Descargar'; download.onclick = () => openDocument(doc, true);
        documentActions.append(view, download); item.append(summary, documentActions);
        if (admin) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Retirar PDF'; remove.onclick = () => mutate(`/documentos/${doc.id_documento}`, 'DELETE', {}); item.append(remove);
          remove.dataset.unavailable = String(!state.curso.activo); remove.disabled = !state.curso.activo;
          item.append(createPdfForm(mod, doc));
        }
        documents.append(item);
      });
      if ((mod.documentos || []).length) article.append(documents);
      else if (!admin) { const empty = document.createElement('p'); empty.className = 'empty-materials'; empty.textContent = 'Este modulo aun no tiene materiales. El administrador los agregara pronto.'; article.append(empty); }
      if (!admin) {
        const completion = document.createElement('button'); completion.type = 'button'; completion.className = 'module-complete'; completion.setAttribute('aria-pressed', String(Boolean(mod.completado)));
        completion.textContent = mod.completado ? 'Marcar como pendiente' : 'Marcar modulo como completado';
        completion.onclick = () => setModuleCompleted(mod, !mod.completado); article.append(completion);
      }
      if (admin) {
        const badge = document.createElement('span'); badge.className = 'badge'; badge.dataset.published = String(mod.publicado); badge.dataset.archived = String(Boolean(mod.archivado_at)); badge.textContent = mod.archivado_at ? 'Archivado' : mod.publicado ? 'Publicado' : 'Borrador'; article.prepend(badge);
        const actions = document.createElement('div'); actions.className = 'actions'; article.append(actions);
        function button(label, action, unavailable = false) {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', `${label}: ${mod.titulo}`); b.dataset.unavailable = String(unavailable || !state.curso.activo); b.disabled = unavailable || !state.curso.activo; b.onclick = action; actions.append(b);
        }
        button('Editar', () => { editing = mod.id_modulo; $('title').value = mod.titulo; $('description').value = mod.descripcion; $('editor-title').textContent = 'Editar módulo'; if ($('editor-help')) $('editor-help').textContent = 'Actualiza el título o la descripción de este tema.'; $('title').focus(); });
        if (!mod.archivado_at) button(mod.publicado ? 'Ocultar' : 'Publicar', () => mutate(`/modulos/${mod.id_modulo}/publicacion`, 'PATCH', { publicado: !mod.publicado }), !mod.publicado && !(mod.documentos || []).length);
        if (!mod.publicado && !mod.archivado_at && !(mod.documentos || []).length) { const note = document.createElement('p'); note.className = 'publish-requirement'; note.textContent = 'Agrega al menos un PDF para poder publicar este modulo.'; article.append(note); }
        button(mod.archivado_at ? 'Restaurar modulo' : 'Archivar modulo', () => {
          if (!mod.archivado_at && !window.confirm(`Se ocultara "${mod.titulo}" del aula. Los PDF y el avance se conservaran. ¿Archivar?`)) return;
          mutate(`/modulos/${mod.id_modulo}/archivo`, 'PATCH', { archivado: !mod.archivado_at });
        });
        for (const [label, offset] of [['Subir', -1], ['Bajar', 1]]) button(label, () => {
          const ids = state.modulos.map(m => m.id_modulo); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
          mutate('/orden', 'PUT', { modulos: ids });
        }, index + offset < 0 || index + offset >= state.modulos.length);
        article.append(createPdfForm(mod));
      }
      $('modules').append(article);
    });
    if (admin && !state.curso.activo) message('Curso desactivado: aula en modo de consulta.');
  }
  async function mutate(path, method, body) {
    if (busy || !state) return;
    lock(true); message('Guardando…');
    try { state = await request(`/admin/cursos/${state.curso.id_curso}${path}`, method, { ...body, revision: state.curso.aula_revision }); closeHistory(); resetEditor(); render(); message('Cambios guardados.'); }
    catch (error) { message(error.message, true); }
    finally { lock(false); $('refresh').focus(); }
  }
  async function setModuleCompleted(mod, completado) {
    if (busy || !state) return;
    const enrollment = new URLSearchParams(location.search).get('inscripcion');
    lock(true); message('Guardando tu avance...');
    try {
      state = await request(`/mia/${enrollment}/modulos/${mod.id_modulo}/progreso`, 'PATCH', { completado });
      render(); message(completado ? 'Modulo marcado como completado.' : 'Modulo marcado como pendiente.');
    } catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function saveDocument(mod, doc, form, name, description, input) {
    if (busy || !state) return;
    const file = input.files[0];
    let problem = '';
    if (!file) problem = 'Primero selecciona un archivo PDF en el campo Archivo PDF.';
    else if (!/\.pdf$/i.test(file.name)) problem = 'El archivo debe tener extensión .pdf.';
    else if (!file.size || file.size > 5 * 1024 * 1024) problem = 'Selecciona un PDF con contenido y de hasta 5 MB.';
    else if (!name.value.trim() || name.value.trim().length > 150) problem = 'Escribe un nombre para el PDF de hasta 150 caracteres.';
    if (problem) { pdfStatus(form, problem, true); return; }
    const body = new FormData(); body.append('titulo', name.value.trim()); body.append('descripcion', description.value.trim()); body.append('revision', String(state.curso.aula_revision)); body.append('archivo', file);
    const submit = form.querySelector('button[type=submit]'); const originalLabel = submit.textContent;
    lock(true); form.setAttribute('aria-busy', 'true'); submit.textContent = 'Subiendo PDF…';
    pdfStatus(form, 'Subiendo PDF… Espera a que se confirme el guardado.');
    try {
      const path = doc ? `/documentos/${doc.id_documento}` : `/modulos/${mod.id_modulo}/documentos`;
      state = await request(`/admin/cursos/${state.curso.id_curso}${path}`, doc ? 'PUT' : 'POST', body);
      closeHistory(); render();
      const article = [...$('modules').children].find(el => el.dataset.moduleId === String(mod.id_modulo));
      const notice = document.createElement('p'); notice.className = 'upload-status success'; notice.setAttribute('role', 'status'); notice.tabIndex = -1;
      notice.textContent = doc ? 'PDF reemplazado. La versión anterior se conserva en el historial.' : 'PDF guardado correctamente. Ya aparece en los materiales de este módulo.';
      article?.prepend(notice); notice.focus({ preventScroll: true }); notice.scrollIntoView({ block: 'nearest' });
      message(notice.textContent);
    } catch (error) {
      const detail = error.name === 'TimeoutError' || error.name === 'AbortError' || error instanceof TypeError
        ? 'No se pudo confirmar la carga. Pulsa Actualizar aula para comprobar si se guardó antes de volver a subirlo.' : error.message;
      pdfStatus(form, detail, true); message(detail, true);
    } finally { form.removeAttribute('aria-busy'); submit.textContent = originalLabel; lock(false); }
  }
  async function loadHistory() {
    if (busy || !state) return;
    const section = $('history');
    if (!section.hidden) { closeHistory(); return; }
    lock(true); message('Consultando historial…');
    try {
      const result = await request(`/admin/cursos/${state.curso.id_curso}/historial-pdf`);
      section.replaceChildren();
      if (!result.documentos.length) { const p = document.createElement('p'); p.textContent = 'Aún no hay PDF en este curso.'; section.append(p); }
      for (const doc of result.documentos) {
        const item = document.createElement('p');
        const date = new Date(doc.creado_at).toLocaleString('es-MX');
        item.textContent = `${doc.modulo} · ${doc.titulo} · ${doc.activo ? 'Versión actual' : doc.reemplazado_por ? 'Reemplazada' : 'Retirada'} · ${date} · ${doc.administrador}`;
        section.append(item);
      }
      section.hidden = false; $('history-toggle').setAttribute('aria-expanded', 'true'); $('history-toggle').textContent = 'Ocultar historial de PDF'; message('Historial actualizado.');
    } catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function openDocument(doc, downloadFile = false) {
    if (busy) return;
    lock(true); message('Abriendo PDF…');
    try {
      const path = admin ? `/admin/cursos/${state.curso.id_curso}/documentos/${doc.id_documento}` : `/mia/${new URLSearchParams(location.search).get('inscripcion')}/documentos/${doc.id_documento}`;
      const token = localStorage.getItem(key); const response = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) throw Error('No se pudo abrir el PDF.');
      const url = URL.createObjectURL(await response.blob());
      if (downloadFile) { const a = document.createElement('a'); a.href = url; a.download = `${doc.titulo}.pdf`; a.click(); }
      else { const popup = window.open(url, '_blank'); if (popup) popup.opener = null; else { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click(); } }
      setTimeout(() => URL.revokeObjectURL(url), 60000); message('');
    } catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function load() {
    if (busy) return;
    const id = admin ? $('courses').value : new URLSearchParams(location.search).get('inscripcion');
    state = null; $('modules').replaceChildren(); if (admin) { closeHistory(); updateOverview(); $('editor').hidden = true; resetEditor(); $('course-title').textContent = ''; }
    if (!/^[1-9]\d*$/.test(id || '')) { message(admin ? 'Selecciona un curso.' : 'Abre el aula desde una inscripción de Mi panel.', !admin); return; }
    lock(true); message('Cargando aula…');
    try { state = await request(admin ? `/admin/cursos/${id}` : `/mia/${id}`); $('workspace').hidden = false; message(''); render(); }
    catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  $('refresh').onclick = load;
  if (admin) {
    $('courses').onchange = load; $('cancel').onclick = resetEditor;
    $('history-toggle').onclick = loadHistory;
    $('module-form').onsubmit = event => { event.preventDefault(); mutate(editing ? `/modulos/${editing}` : '/modulos', editing ? 'PUT' : 'POST', { titulo: $('title').value, descripcion: $('description').value }); };
    (async () => { lock(true); try {
      const data = await request('/admin/cursos');
      data.cursos.forEach(course => { const option = document.createElement('option'); option.value = course.id_curso; option.textContent = course.nombre + (course.activo ? '' : ' (desactivado)'); $('courses').append(option); });
      $('workspace').hidden = false; message('Selecciona un curso para organizar sus módulos.');
    } catch (error) { message(error.message, true); } finally { lock(false); } })();
  } else load();
})();
