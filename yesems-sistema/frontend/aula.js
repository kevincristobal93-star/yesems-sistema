(() => {
  'use strict';
  const API = 'https://yesems-sistema-1.onrender.com/api/aula';
  const COURSE_API = 'https://yesems-sistema-1.onrender.com/api/cursos';
  const $ = id => document.getElementById(id);
  const admin = document.body.dataset.admin === 'true';
  if (!admin) $('login').href = './cursos.html';
  const key = admin ? 'yesems_admin_token' : 'yesems_token';
  let state = null, editing = null, busy = false;
  const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  let galleryItems = [], galleryIndex = 0, gallerySignature = null, galleryUrl = null, galleryAbort = null;
  const isImageDocument = doc => imageExtensions.has(String(doc.extension || '').toLowerCase());
  function clearGalleryImage() {
    galleryAbort?.abort(); galleryAbort = null;
    if (galleryUrl) URL.revokeObjectURL(galleryUrl);
    galleryUrl = null;
    if ($('gallery-image')) { $('gallery-image').removeAttribute('src'); $('gallery-image').hidden = true; }
  }
  function resetGallery() { clearGalleryImage(); galleryItems = []; galleryIndex = 0; gallerySignature = null; }
  async function showGalleryImage(index) {
    if (admin || !galleryItems.length) return;
    galleryIndex = (index + galleryItems.length) % galleryItems.length;
    clearGalleryImage();
    const doc = galleryItems[galleryIndex];
    $('gallery-count').textContent = `Imagen ${galleryIndex + 1} de ${galleryItems.length}`;
    $('gallery-caption').textContent = `${doc.titulo} · ${doc.modulo}`;
    $('gallery-fallback-title').textContent = doc.titulo;
    $('gallery-fallback-message').textContent = 'Cargando vista previa segura…';
    $('gallery-fallback').hidden = false;
    $('gallery-dots').replaceChildren();
    galleryItems.forEach((item, position) => {
      const dot = document.createElement('button'); dot.type = 'button';
      dot.setAttribute('aria-label', `Ver imagen ${position + 1}: ${item.titulo}`);
      dot.setAttribute('aria-current', String(position === galleryIndex));
      dot.onclick = () => showGalleryImage(position);
      $('gallery-dots').append(dot);
    });
    const controller = new AbortController(); galleryAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const enrollment = new URLSearchParams(location.search).get('inscripcion');
      const response = await fetch(`${API}/mia/${encodeURIComponent(enrollment)}/documentos/${doc.id_documento}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(key)}` }, cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw Error('No se pudo cargar esta imagen.');
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw Error('La vista previa no tiene un formato de imagen válido.');
      if (controller.signal.aborted || galleryAbort !== controller) return;
      galleryUrl = URL.createObjectURL(blob);
      $('gallery-image').alt = `${doc.titulo}, imagen del módulo ${doc.modulo}`;
      $('gallery-image').src = galleryUrl;
      $('gallery-image').hidden = false;
      $('gallery-fallback').hidden = true;
    } catch (error) {
      if (galleryAbort === controller) $('gallery-fallback-message').textContent = 'Vista previa no disponible. Puedes consultar los demás materiales del módulo.';
    } finally { clearTimeout(timeout); }
  }
  function renderShowcase() {
    if (admin || !state) return;
    const course = state.curso;
    $('course-description').textContent = course.descripcion?.trim() || 'La descripción de este curso estará disponible pronto.';
    $('course-category').textContent = course.categoria || 'Formación YES EMS';
    $('course-duration').textContent = course.duracion_horas ? `${course.duracion_horas} horas` : 'Por confirmar';
    const price = Number(course.total_inscripcion ?? course.precio);
    $('course-price').textContent = Number.isFinite(price) ? price ? money.format(price) : 'Sin costo' : 'Por confirmar';
    $('course-module-count').textContent = String(state.modulos.length);
    const items = state.modulos.flatMap(mod => (mod.documentos || []).filter(isImageDocument).map(doc => ({ ...doc, modulo: mod.titulo })));
    const signature = items.map(doc => `${doc.id_documento}:${doc.modulo}`).join('|');
    if (signature === gallerySignature) return;
    resetGallery(); galleryItems = items; gallerySignature = signature;
    const multiple = items.length > 1;
    $('gallery-previous').hidden = !multiple; $('gallery-next').hidden = !multiple;
    if (items.length) showGalleryImage(0);
    else {
      $('gallery-count').textContent = 'Vista previa del curso';
      $('gallery-caption').textContent = 'El administrador aún no ha publicado imágenes.';
      $('gallery-fallback-title').textContent = course.nombre;
      $('gallery-fallback-message').textContent = 'Las imágenes de los módulos publicados aparecerán aquí.';
      $('gallery-fallback').hidden = false;
      $('gallery-dots').replaceChildren();
    }
  }
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
        $('student-progress-slot').append(overview);
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
  function renderPublicGallery() {
    if (!admin) return;
    const panel = $('public-gallery-admin'); panel.hidden = !state;
    if (!state) return;
    const list = $('public-gallery-list'); list.replaceChildren();
    const images = state.curso.imagenes_publicas || [];
    if (!images.length) {
      const empty = document.createElement('p'); empty.textContent = 'Aún no hay imágenes públicas. La ficha del curso mostrará una ilustración temporal.'; list.append(empty);
    }
    for (const item of images) {
      const card = document.createElement('article');
      const image = document.createElement('img'); image.src = `${COURSE_API}/${state.curso.id_curso}/imagenes/${item.id_imagen}`; image.alt = item.titulo; image.loading = 'lazy';
      const title = document.createElement('strong'); title.textContent = item.titulo;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Quitar de la ficha';
      remove.dataset.unavailable = String(!state.curso.activo); remove.disabled = !state.curso.activo;
      remove.onclick = () => hidePublicImage(item);
      card.append(image, title, remove); list.append(card);
    }
    for (const control of $('public-gallery-form').querySelectorAll('input,button')) {
      control.dataset.unavailable = String(!state.curso.activo); control.disabled = !state.curso.activo;
    }
  }
  async function publicGalleryRequest(path, method, body) {
    const response = await fetch(COURSE_API + path, { method, cache: 'no-store', signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${localStorage.getItem(key)}` }, ...(body ? { body } : {}) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Error(data?.mensaje || 'No se pudo actualizar la galería pública.');
    return data.imagenes;
  }
  async function savePublicImage(event) {
    event.preventDefault();
    if (busy || !state) return;
    const input = $('public-gallery-file'), file = input.files[0], title = $('public-gallery-name').value.trim();
    const status = $('public-gallery-status'); status.hidden = false; status.classList.remove('error', 'success');
    if (!file || !/\.(jpe?g|png|webp)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024 || !title || title.length > 150) {
      status.textContent = 'Selecciona una imagen JPG, PNG o WebP de hasta 5 MB y escribe su nombre.'; status.classList.add('error'); return;
    }
    const body = new FormData(); body.append('titulo', title); body.append('archivo', file);
    lock(true); status.textContent = 'Publicando imagen…';
    try {
      state.curso.imagenes_publicas = await publicGalleryRequest(`/${state.curso.id_curso}/imagenes`, 'POST', body);
      $('public-gallery-form').reset(); renderPublicGallery(); status.textContent = 'Imagen publicada en la ficha del catálogo.'; status.classList.add('success'); message(status.textContent);
    } catch (error) { status.textContent = error.message; status.classList.add('error'); message(error.message, true); }
    finally { lock(false); }
  }
  async function hidePublicImage(item) {
    if (busy || !state || !window.confirm(`¿Quitar «${item.titulo}» de la ficha pública?`)) return;
    lock(true); message('Actualizando galería pública…');
    try {
      state.curso.imagenes_publicas = await publicGalleryRequest(`/${state.curso.id_curso}/imagenes/${item.id_imagen}`, 'DELETE');
      renderPublicGallery(); message('Imagen retirada de la ficha pública.');
    } catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  function closeHistory() {
    if (!admin) return;
    $('history').hidden = true;
    $('history').replaceChildren();
    $('history-toggle').setAttribute('aria-expanded', 'false');
    $('history-toggle').textContent = 'Ver historial de documentos';
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
    if (response.status === 401) { localStorage.removeItem(key); $('workspace').hidden = true; $('modules').replaceChildren(); $('login').hidden = false; if (!admin) resetGallery(); }
    if (!response.ok) throw Error(data?.mensaje || 'No se pudo consultar el aula. Intenta nuevamente.');
    return data;
  }
  function resetEditor() {
    editing = null;
    if (admin) { $('module-form').reset(); $('editor-title').textContent = 'Nuevo módulo'; if ($('editor-help')) $('editor-help').textContent = 'Añade un tema al curso. Se guardará como borrador.'; }
  }
  function documentStatus(form, text, error = false) {
    const status = form.querySelector('.upload-status');
    status.textContent = text;
    status.classList.toggle('error', error);
    status.hidden = !text;
  }
  function createPdfForm(mod, doc) {
    const form = document.createElement('form'); form.className = 'upload-form'; form.noValidate = true;
    const heading = document.createElement('h3'); heading.textContent = doc ? 'Reemplazar este material' : 'Añadir contenido al módulo';
    const help = document.createElement('p'); help.className = 'hint';
    const kindLabel = document.createElement('label'); kindLabel.textContent = '¿Qué vas a subir?';
    const kind = document.createElement('select'); kind.name = 'material_type';
    for (const [value, label] of [['document', 'PDF u otro material de estudio'], ['image', 'Imagen privada del módulo (solo alumnos)']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; kind.append(option);
    }
    kind.value = doc && isImageDocument(doc) ? 'image' : 'document'; kindLabel.append(kind);
    const fileLabel = document.createElement('label'); fileLabel.textContent = 'Archivo';
    const file = document.createElement('input'); file.type = 'file'; file.name = 'archivo'; file.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.md,.epub,.zip,.jpg,.jpeg,.png,.webp'; file.required = true; fileLabel.append(file);
    const titleLabel = document.createElement('label'); titleLabel.textContent = 'Nombre del documento';
    const name = document.createElement('input'); name.name = 'titulo'; name.maxLength = 150; name.required = true; name.value = doc?.titulo || ''; name.placeholder = 'Se completa al seleccionar el archivo'; titleLabel.append(name);
    const descriptionLabel = document.createElement('label'); descriptionLabel.textContent = 'Descripcion del documento (opcional)';
    const description = document.createElement('textarea'); description.name = 'descripcion'; description.maxLength = 1000; description.value = doc?.descripcion || ''; description.placeholder = 'Describe brevemente este material.'; descriptionLabel.append(description);
    let suggestedTitle = name.value;
    file.onchange = () => {
      const selected = file.files[0];
      if (!selected) { documentStatus(form, 'Selecciona el documento que quieres subir.'); return; }
      if (!name.value.trim() || name.value === suggestedTitle) {
        suggestedTitle = selected.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 150);
        name.value = suggestedTitle;
      }
      documentStatus(form, `Archivo seleccionado: ${selected.name}. Pulsa ${submit.textContent} para guardarlo.`);
    };
    const submit = document.createElement('button'); submit.type = 'submit';
    function updateKind() {
      const image = kind.value === 'image';
      file.accept = image ? '.jpg,.jpeg,.png,.webp' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.md,.epub,.zip';
      help.textContent = image
        ? 'JPG, PNG o WebP de hasta 5 MB. Solo los alumnos autorizados verán esta imagen en el aula. Usa la sección superior para la ficha pública.'
        : 'PDF u otro material de hasta 5 MB. Los alumnos lo encontrarán debajo de este módulo.';
      submit.textContent = doc ? (image ? 'Reemplazar imagen' : 'Reemplazar material') : (image ? 'Subir imagen' : 'Subir material');
    }
    kind.onchange = () => { file.value = ''; updateKind(); };
    updateKind();
    const status = document.createElement('p'); status.className = 'upload-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;
    form.append(heading, help, kindLabel, fileLabel, titleLabel, descriptionLabel, submit, status);
    for (const control of [kind, file, name, description, submit]) { control.dataset.unavailable = String(!state.curso.activo || Boolean(mod.archivado_at)); control.disabled = !state.curso.activo || Boolean(mod.archivado_at); }
    form.onsubmit = event => { event.preventDefault(); saveDocument(mod, doc, form, name, description, file); };
    return form;
  }
  function render() {
    updateOverview();
    renderPublicGallery();
    $('course-title').textContent = state.curso.nombre;
    renderShowcase();
    $('modules').replaceChildren();
    if (admin) $('editor').hidden = !state.curso.activo;
    if (!state.modulos.length) {
      if (admin) { const p = document.createElement('p'); p.textContent = 'Aún no hay módulos. Crea el primero como borrador.'; $('modules').append(p); }
      else {
        const empty = document.createElement('div'); empty.className = 'student-empty';
        const title = document.createElement('strong'); title.textContent = 'Los módulos están en preparación';
        const detail = document.createElement('p'); detail.textContent = 'Cuando administración publique el contenido del curso, aparecerá aquí con sus imágenes y materiales.';
        empty.append(title, detail); $('modules').append(empty);
      }
    }
    state.modulos.forEach((mod, index) => {
      const article = document.createElement('article'); article.dataset.moduleId = mod.id_modulo;
      if (!admin) {
        article.className = 'student-module';
        const top = document.createElement('div'); top.className = 'student-module-top';
        const kicker = document.createElement('span'); kicker.className = 'student-module-kicker'; kicker.textContent = `MÓDULO ${String(index + 1).padStart(2, '0')}`;
        const status = document.createElement('span'); status.className = 'student-module-state'; status.dataset.complete = String(Boolean(mod.completado)); status.textContent = mod.completado ? 'Completado' : 'Por empezar';
        top.append(kicker, status); article.append(top);
      }
      const heading = document.createElement('h2'); heading.textContent = admin ? `${index + 1}. ${mod.titulo}` : mod.titulo;
      const desc = document.createElement('p'); desc.textContent = mod.descripcion;
      article.append(heading, desc);
      const documents = document.createElement('ul'); documents.className = 'documents';
      const visibleDocuments = admin ? (mod.documentos || []) : (mod.documentos || []).filter(doc => !isImageDocument(doc));
      visibleDocuments.forEach(doc => {
        const item = document.createElement('li'); item.dataset.extension = String(doc.extension || 'pdf').toLowerCase();
        const summary = document.createElement('div'); summary.className = 'document-summary';
        const documentTitle = document.createElement('strong'); documentTitle.textContent = doc.titulo;
        const size = document.createElement('span'); size.className = 'document-size'; size.textContent = `${(doc.extension || 'pdf').toUpperCase()} - ${doc.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(doc.bytes / 1024))} KB` : `${(doc.bytes / (1024 * 1024)).toFixed(1)} MB`}`;
        summary.append(documentTitle, size);
        if (doc.descripcion) { const detail = document.createElement('p'); detail.textContent = doc.descripcion; summary.append(detail); }
        const documentActions = document.createElement('div'); documentActions.className = 'document-actions';
        const view = document.createElement('button'); view.type = 'button'; view.textContent = 'Ver documento'; view.onclick = () => openDocument(doc);
        const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Descargar'; download.onclick = () => openDocument(doc, true);
        if ((doc.extension || 'pdf') === 'pdf') documentActions.append(view); documentActions.append(download); item.append(summary, documentActions);
        if (admin) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Retirar documento'; remove.onclick = () => mutate(`/documentos/${doc.id_documento}`, 'DELETE', {}); item.append(remove);
          remove.dataset.unavailable = String(!state.curso.activo); remove.disabled = !state.curso.activo;
          item.append(createPdfForm(mod, doc));
        }
        documents.append(item);
      });
      if (visibleDocuments.length) {
        if (!admin) { const resourcesTitle = document.createElement('h3'); resourcesTitle.className = 'student-resources-heading'; resourcesTitle.textContent = `PDF y materiales · ${visibleDocuments.length}`; article.append(resourcesTitle); }
        article.append(documents);
      } else if (!admin) {
        const empty = document.createElement('p'); empty.className = 'empty-materials';
        empty.textContent = (mod.documentos || []).some(isImageDocument)
          ? 'Las imágenes de este módulo se muestran en la galería superior. Administración añadirá los PDF aquí.'
          : 'Los materiales de este módulo aparecerán aquí cuando estén disponibles.';
        article.append(empty);
      }
      if (!admin) {
        const completion = document.createElement('button'); completion.type = 'button'; completion.className = 'module-complete'; completion.setAttribute('aria-pressed', String(Boolean(mod.completado)));
        completion.textContent = mod.completado ? 'Marcar como pendiente' : 'Marcar módulo como completado';
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
        if (!mod.publicado && !mod.archivado_at && !(mod.documentos || []).length) { const note = document.createElement('p'); note.className = 'publish-requirement'; note.textContent = 'Agrega al menos un documento para poder publicar este modulo.'; article.append(note); }
        button(mod.archivado_at ? 'Restaurar modulo' : 'Archivar modulo', () => {
          if (!mod.archivado_at && !window.confirm(`Se ocultara "${mod.titulo}" del aula. Los documentos y el avance se conservaran. ¿Archivar?`)) return;
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
    const wantsImage = form.elements.material_type.value === 'image';
    const isImageFile = Boolean(file && /\.(jpe?g|png|webp)$/i.test(file.name));
    let problem = '';
    if (!file) problem = 'Primero selecciona un documento en el campo Archivo.';
    else if (!/\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|md|epub|zip|jpe?g|png|webp)$/i.test(file.name)) problem = 'Usa PDF, Office, OpenDocument, texto, EPUB, ZIP o imágenes JPG, PNG y WebP.';
    else if (wantsImage !== isImageFile) problem = wantsImage ? 'Selecciona una imagen JPG, PNG o WebP para el módulo.' : 'Para subir una imagen privada, elige «Imagen privada del módulo». Para la ficha pública, usa la sección superior.';
    else if (!file.size || file.size > 5 * 1024 * 1024) problem = 'Selecciona un documento con contenido y de hasta 5 MB.';
    else if (!name.value.trim() || name.value.trim().length > 150) problem = 'Escribe un nombre para el documento de hasta 150 caracteres.';
    if (problem) { documentStatus(form, problem, true); return; }
    const body = new FormData(); body.append('titulo', name.value.trim()); body.append('descripcion', description.value.trim()); body.append('revision', String(state.curso.aula_revision)); body.append('archivo', file);
    const submit = form.querySelector('button[type=submit]'); const originalLabel = submit.textContent;
    lock(true); form.setAttribute('aria-busy', 'true'); submit.textContent = 'Subiendo documento…';
    documentStatus(form, 'Subiendo documento… Espera a que se confirme el guardado.');
    try {
      const path = doc ? `/documentos/${doc.id_documento}` : `/modulos/${mod.id_modulo}/documentos`;
      state = await request(`/admin/cursos/${state.curso.id_curso}${path}`, doc ? 'PUT' : 'POST', body);
      closeHistory(); render();
      const article = [...$('modules').children].find(el => el.dataset.moduleId === String(mod.id_modulo));
      const notice = document.createElement('p'); notice.className = 'upload-status success'; notice.setAttribute('role', 'status'); notice.tabIndex = -1;
      notice.textContent = doc
        ? `${wantsImage ? 'Imagen' : 'Material'} reemplazado. La versión anterior se conserva en el historial.`
        : wantsImage
          ? (mod.publicado ? 'Imagen guardada. Ya aparece en la galería privada del aula.' : 'Imagen guardada. Aparecerá en el aula cuando publiques el módulo.')
          : (mod.publicado ? 'Material guardado. Ya aparece debajo de este módulo.' : 'Material guardado. Aparecerá debajo del módulo cuando lo publiques.');
      article?.prepend(notice); notice.focus({ preventScroll: true }); notice.scrollIntoView({ block: 'nearest' });
      message(notice.textContent);
    } catch (error) {
      const detail = error.name === 'TimeoutError' || error.name === 'AbortError' || error instanceof TypeError
        ? 'No se pudo confirmar la carga. Pulsa Actualizar aula para comprobar si se guardó antes de volver a subirlo.' : error.message;
      documentStatus(form, detail, true); message(detail, true);
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
      if (!result.documentos.length) { const p = document.createElement('p'); p.textContent = 'Aún no hay documentos en este curso.'; section.append(p); }
      for (const doc of result.documentos) {
        const item = document.createElement('p');
        const date = new Date(doc.creado_at).toLocaleString('es-MX');
        item.textContent = `${doc.modulo} · ${doc.titulo} · ${doc.activo ? 'Versión actual' : doc.reemplazado_por ? 'Reemplazada' : 'Retirada'} · ${date} · ${doc.administrador}`;
        section.append(item);
      }
      section.hidden = false; $('history-toggle').setAttribute('aria-expanded', 'true'); $('history-toggle').textContent = 'Ocultar historial de documentos'; message('Historial actualizado.');
    } catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function openDocument(doc, downloadFile = false) {
    if (busy) return;
    lock(true); message('Abriendo documento…');
    try {
      const path = admin ? `/admin/cursos/${state.curso.id_curso}/documentos/${doc.id_documento}` : `/mia/${new URLSearchParams(location.search).get('inscripcion')}/documentos/${doc.id_documento}`;
      const token = localStorage.getItem(key); const response = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('No se pudo abrir el documento.');
      const url = URL.createObjectURL(await response.blob());
      if (downloadFile || (doc.extension || 'pdf') !== 'pdf') { const a = document.createElement('a'); a.href = url; a.download = `${doc.titulo.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')}.${doc.extension || 'pdf'}`; a.click(); }
      else { const popup = window.open(url, '_blank'); if (popup) popup.opener = null; else { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click(); } }
      setTimeout(() => URL.revokeObjectURL(url), 60000); message('');
    } catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  async function load() {
    if (busy) return;
    const id = admin ? $('courses').value : new URLSearchParams(location.search).get('inscripcion');
    state = null; $('modules').replaceChildren(); if (!admin) resetGallery();
    if (admin) { closeHistory(); updateOverview(); renderPublicGallery(); $('editor').hidden = true; resetEditor(); $('course-title').textContent = ''; }
    if (!/^[1-9]\d*$/.test(id || '')) { message(admin ? 'Selecciona un curso.' : 'Abre el aula desde una inscripción de Mi panel.', !admin); return; }
    lock(true); message('Cargando aula…');
    try { state = await request(admin ? `/admin/cursos/${id}` : `/mia/${id}`); $('workspace').hidden = false; message(''); render(); }
    catch (error) { message(error.message, true); }
    finally { lock(false); }
  }
  $('refresh').onclick = load;
  if (!admin) {
    $('gallery-previous').onclick = () => showGalleryImage(galleryIndex - 1);
    $('gallery-next').onclick = () => showGalleryImage(galleryIndex + 1);
    window.addEventListener('pagehide', resetGallery);
  }
  if (admin) {
    $('public-gallery-form').onsubmit = savePublicImage;
    $('public-gallery-file').onchange = () => { const file = $('public-gallery-file').files[0]; if (file && !$('public-gallery-name').value.trim()) $('public-gallery-name').value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 150); };
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
