(() => {
  'use strict';
  const API = 'https://yesems-sistema-1.onrender.com/api/aula';
  const $ = id => document.getElementById(id);
  const admin = document.body.dataset.admin === 'true';
  if (!admin) $('login').href = './cursos.html';
  const key = admin ? 'yesems_admin_token' : 'yesems_token';
  let state = null, editing = null, busy = false;
  const message = (text, error = false) => { $('feedback').textContent = text; $('feedback').classList.toggle('error', error); };
  function lock(value) {
    busy = value;
    document.querySelectorAll('button,select').forEach(el => { el.disabled = value || el.dataset.unavailable === 'true'; });
    if (admin) $('fields').disabled = value || !state?.curso.activo;
  }
  async function request(path, method = 'GET', body) {
    const token = localStorage.getItem(key);
    if (!token) { $('workspace').hidden = true; $('login').hidden = false; throw Error('Inicia sesión para consultar el aula.'); }
    const multipart = body instanceof FormData;
    const response = await fetch(API + path, { method, cache: 'no-store', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}) });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    if (response.status === 401) { localStorage.removeItem(key); $('workspace').hidden = true; $('modules').replaceChildren(); $('login').hidden = false; }
    if (!response.ok) throw Error(data?.mensaje || 'No se pudo consultar el aula. Intenta nuevamente.');
    return data;
  }
  function resetEditor() {
    editing = null;
    if (admin) { $('module-form').reset(); $('editor-title').textContent = 'Nuevo módulo'; }
  }
  function render() {
    $('course-title').textContent = state.curso.nombre;
    $('modules').replaceChildren();
    if (admin) $('editor').hidden = !state.curso.activo;
    if (!state.modulos.length) { const p = document.createElement('p'); p.textContent = admin ? 'Aún no hay módulos. Crea el primero como borrador.' : 'El administrador aún no ha publicado módulos.'; $('modules').append(p); }
    state.modulos.forEach((mod, index) => {
      const article = document.createElement('article');
      const heading = document.createElement('h2'); heading.textContent = `${index + 1}. ${mod.titulo}`;
      const desc = document.createElement('p'); desc.textContent = mod.descripcion;
      article.append(heading, desc);
      const documents = document.createElement('ul'); documents.className = 'documents';
      (mod.documentos || []).forEach(doc => {
        const item = document.createElement('li');
        const link = document.createElement('button'); link.type = 'button'; link.textContent = `Abrir PDF: ${doc.titulo}`;
        link.onclick = () => openDocument(doc); item.append(link);
        if (admin) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Retirar PDF'; remove.onclick = () => mutate(`/documentos/${doc.id_documento}`, 'DELETE', {}); item.append(remove);
          const replace = document.createElement('form'); replace.className = 'upload-form';
          const title = document.createElement('input'); title.value = doc.titulo; title.maxLength = 150; title.required = true; title.setAttribute('aria-label', `Nombre nuevo para ${doc.titulo}`);
          const file = document.createElement('input'); file.type = 'file'; file.accept = 'application/pdf,.pdf'; file.required = true; file.setAttribute('aria-label', `Seleccionar reemplazo para ${doc.titulo}`);
          const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Reemplazar PDF';
          replace.append(title,file,submit); replace.onsubmit = event => { event.preventDefault(); replaceDocument(doc,title.value,file.files[0]); }; item.append(replace);
        }
        documents.append(item);
      });
      if ((mod.documentos || []).length) article.append(documents);
      if (admin) {
        const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = mod.publicado ? 'Publicado' : 'Borrador'; article.append(badge);
        const actions = document.createElement('div'); actions.className = 'actions'; article.append(actions);
        function button(label, action, unavailable = false) {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', `${label}: ${mod.titulo}`); b.dataset.unavailable = String(unavailable || !state.curso.activo); b.disabled = unavailable || !state.curso.activo; b.onclick = action; actions.append(b);
        }
        button('Editar', () => { editing = mod.id_modulo; $('title').value = mod.titulo; $('description').value = mod.descripcion; $('editor-title').textContent = 'Editar módulo'; $('title').focus(); });
        button(mod.publicado ? 'Ocultar' : 'Publicar', () => mutate(`/modulos/${mod.id_modulo}/publicacion`, 'PATCH', { publicado: !mod.publicado }));
        for (const [label, offset] of [['Subir', -1], ['Bajar', 1]]) button(label, () => {
          const ids = state.modulos.map(m => m.id_modulo); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
          mutate('/orden', 'PUT', { modulos: ids });
        }, index + offset < 0 || index + offset >= state.modulos.length);
        const upload = document.createElement('form'); upload.className = 'upload-form';
        const label = document.createElement('label'); label.textContent = 'Nombre del PDF';
        const name = document.createElement('input'); name.maxLength = 150; name.required = true; name.name = 'titulo'; label.append(name);
        const file = document.createElement('input'); file.type = 'file'; file.name = 'archivo'; file.accept = 'application/pdf,.pdf'; file.required = true;
        const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Subir PDF';
        upload.append(label, file, submit); upload.onsubmit = event => { event.preventDefault(); uploadDocument(mod, name.value, file.files[0]); }; article.append(upload);
      }
      $('modules').append(article);
    });
    if (admin && !state.curso.activo) message('Curso desactivado: aula en modo de consulta.');
  }
  async function mutate(path, method, body) {
    if (busy || !state) return;
    lock(true); message('Guardando…');
    try { state = await request(`/admin/cursos/${state.curso.id_curso}${path}`, method, { ...body, revision: state.curso.aula_revision }); resetEditor(); render(); message('Cambios guardados.'); }
    catch (error) { message(error.message, true); }
    finally { lock(false); $('refresh').focus(); }
  }
  async function uploadDocument(module, title, file) {
    if (busy || !file) return;
    const form = new FormData(); form.append('titulo', title); form.append('revision', String(state.curso.aula_revision)); form.append('archivo', file);
    lock(true); message('Subiendo PDF…');
    try { state = await request(`/admin/cursos/${state.curso.id_curso}/modulos/${module.id_modulo}/documentos`, 'POST', form); render(); message('PDF guardado como borrador del módulo.'); }
    catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function replaceDocument(doc, title, file) {
    if (busy || !file) return;
    const form = new FormData(); form.append('titulo', title); form.append('revision', String(state.curso.aula_revision)); form.append('archivo', file);
    lock(true); message('Guardando nueva versión…');
    try { state = await request(`/admin/cursos/${state.curso.id_curso}/documentos/${doc.id_documento}`, 'PUT', form); $('history').hidden = true; $('history').replaceChildren(); render(); message('Nueva versión guardada. La anterior se conserva en el historial.'); }
    catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function loadHistory() {
    if (busy || !state) return;
    const section = $('history');
    if (!section.hidden) { section.hidden = true; return; }
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
      section.hidden = false; message('Historial actualizado.');
    } catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function openDocument(doc) {
    if (busy) return;
    lock(true); message('Abriendo PDF…');
    try {
      const path = admin ? `/admin/cursos/${state.curso.id_curso}/documentos/${doc.id_documento}` : `/mia/${new URLSearchParams(location.search).get('inscripcion')}/documentos/${doc.id_documento}`;
      const token = localStorage.getItem(key); const response = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) throw Error('No se pudo abrir el PDF.');
      const url = URL.createObjectURL(await response.blob()); const popup = window.open(url, '_blank', 'noopener');
      if (!popup) { const a = document.createElement('a'); a.href = url; a.download = `${doc.titulo}.pdf`; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000); message('');
    } catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function load() {
    if (busy) return;
    const id = admin ? $('courses').value : new URLSearchParams(location.search).get('inscripcion');
    state = null; $('modules').replaceChildren(); if (admin) { $('editor').hidden = true; resetEditor(); $('course-title').textContent = ''; }
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
