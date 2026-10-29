(function (root) {
  'use strict';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const paths = {
    phone: '<rect x="18" y="5" width="28" height="54" rx="6"/><path fill="white" d="M23 14h18v32H23z"/><circle fill="white" cx="32" cy="52" r="3"/>',
    shirt: '<path d="M21 8h7a4 4 0 0 0 8 0h7l15 14-9 10-6-5v27a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V27l-6 5-9-10Z"/>',
    laser: '<path d="M8 5h36v9H17v25H8zm15 14h28v9H23zm8 12h12l-6 10zM5 50h54v10H5z"/><path d="m35 40-3 8h4l3-8zm9 1 7 5-2 3-7-5zm-15 0-7 5 2 3 7-5z"/>',
    printer: '<path d="M15 5h28l7 7v12h-7V15l-3-3H22v12h-7zM13 28h38a8 8 0 0 1 8 8v11h-9v12H15V47H5V36a8 8 0 0 1 8-8z"/><path fill="white" d="M22 43h21v9H22z"/><circle fill="white" cx="49" cy="36" r="3"/>',
    document: '<path d="M15 5h24l12 13v36a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5V10a5 5 0 0 1 2-5z"/><path fill="white" d="M37 5v16h14v-5H42V5zM22 29h20v4H22zm0 9h20v4H22zm0 9h15v4H22z"/>',
  };
  function icon(course) {
    const text = `${course.catalogo_clave || ''} ${course.nombre || ''}`.toLocaleLowerCase('es-MX');
    const key = /celular/.test(text) ? 'phone' : /sublima/.test(text) ? 'shirt' : /l[aá]ser/.test(text) ? 'laser' : /3d/.test(text) ? 'printer' : 'document';
    return `<div class="catalog-icon" data-icon="${key}"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${paths[key]}</svg></div>`;
  }
  function price(course) {
    if (course.oferta_provisional || course.precio == null) return 'Costo por confirmar';
    return `${money.format(Number(course.precio))} por curso completo`;
  }
  const duration = (course) => `${escapeHtml(course.duracion_horas ?? '—')} horas${course.duracion_aproximada ? ' aproximadamente' : ''}`;
  const countValue = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  const hasCapacity = course => course.control_cupo !== false && (countValue(course.cupo) || countValue(course.lugares_disponibles) || course.cupo_lleno === true);
  function availability(course) {
    if (!hasCapacity(course) || course.cupo_confirmado === false || course.oferta_provisional || !countValue(course.cupo) || !countValue(course.lugares_disponibles)) return null;
    const total = Number(course.cupo), available = Number(course.lugares_disponibles);
    if (total <= 0 || available > total || course.cupo_lleno === true && available > 0) return null;
    return { total, available };
  }
  const publicImages = course => (Array.isArray(course.imagenes_publicas) ? course.imagenes_publicas : [])
    .filter(item => item && Number.isSafeInteger(Number(item.id_imagen)) && Number(item.id_imagen) > 0);
  const imageUrl = (course, image) => `https://yesems-sistema-1.onrender.com/api/cursos/${encodeURIComponent(course.id_curso)}/imagenes/${Number(image.id_imagen)}`;
  function cover(course) {
    const first = publicImages(course)[0];
    const category = course.categoria || 'Capacitación';
    return `<div class="course-cover">
      <span class="course-cover-initial" aria-hidden="true">${escapeHtml(Array.from(category.trim())[0]?.toLocaleUpperCase('es-MX') || 'Y')}</span>
      ${first ? `<img class="course-cover-photo" src="${imageUrl(course, first)}" alt="${escapeHtml(first.titulo || course.nombre || 'Vista del curso')}" loading="lazy" decoding="async" width="640" height="360">` : ''}
      <span class="course-cover-tag">${escapeHtml(category)}</span>
    </div>`;
  }
  function emptyState(hasCourses = false) {
    return `<div class="catalog-empty">
      <svg viewBox="0 0 160 120" aria-hidden="true" focusable="false"><circle cx="75" cy="60" r="52" fill="currentColor" opacity=".08"/><path d="M25 30h44l11 9 11-9h44v63H91l-11 8-11-8H25Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M80 39v62M38 48h24M38 61h24M98 48h24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="116" cy="83" r="17" fill="white" stroke="currentColor" stroke-width="3"/><path d="m129 96 14 14" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>
      <h3>${hasCourses ? 'No encontramos coincidencias' : 'Próximamente, nuevas oportunidades'}</h3>
      <p>${hasCourses ? 'Prueba otra búsqueda o cambia los filtros para explorar más cursos.' : 'Todavía no hay cursos publicados en este catálogo. Vuelve pronto para conocer la oferta.'}</p>
      ${hasCourses ? '<button type="button" class="catalog-reset" data-clear-catalog>Limpiar filtros</button>' : ''}
    </div>`;
  }
  const capacity = (course) => {
    if (course.cupo_lleno === true) return 'Cupo lleno';
    if (course.cupo_confirmado === false) return 'Cupo por confirmar';
    if (countValue(course.lugares_disponibles)) {
      const available = Number(course.lugares_disponibles);
      return `${available} ${available === 1 ? 'lugar disponible' : 'lugares disponibles'}`;
    }
    return `${escapeHtml(course.cupo ?? '—')} ${course.oferta_provisional ? 'personas por grupo' : 'lugares'}`;
  };
  function card(course, student = false) {
    const provisional = course.oferta_provisional === true;
    const cls = (name) => student ? name : `course-${name}`;
    const title = student ? 'h2' : 'h3';
    const places = availability(course);
    const action = `<button class="course-more-button" type="button" data-course-details="${escapeHtml(course.id_curso)}" aria-haspopup="dialog" aria-label="Ver más información de ${escapeHtml(course.nombre || 'este curso')}">Ver más información <span aria-hidden="true">→</span></button>`;
    return `<article class="${cls('card')} catalog-tile">
      ${cover(course)}
      ${course.es_nuevo === true || places && places.available > 0 && places.available <= 3 ? `<div class="course-labels">${course.es_nuevo === true ? '<span class="badge badge--info">Nuevo</span>' : ''}${places && places.available > 0 && places.available <= 3 ? '<span class="badge badge--warning">Últimos lugares</span>' : ''}</div>` : ''}
      <p class="${cls('category')}">${escapeHtml(course.categoria || 'Capacitación')}</p>
      ${provisional ? '<p class="badge badge--warning proposal-badge">Propuesta · Por confirmar</p>' : ''}
      ${student && course.ya_inscrito ? '<p class="badge badge--success student-enrolled-badge">Ya estás inscrito</p>' : ''}
      <${title}>${escapeHtml(course.nombre || 'Curso YES EMS')}</${title}>
      <p class="${cls('description')} catalog-summary">${escapeHtml(course.descripcion || 'Consulta los detalles con nuestro equipo.')}</p>
      <div class="${cls('data')}"><span>${duration(course)}${provisional ? ' sugeridas' : ''}</span>${hasCapacity(course) ? `<span>${capacity(course)}${provisional ? ' sugeridas' : ''}</span>` : ''}</div>
      ${places ? `<div class="course-capacity"><label>Cupo disponible: ${places.available} de ${places.total}<meter min="0" max="${places.total}" value="${places.available}">${places.available} de ${places.total} lugares disponibles</meter></label></div>` : ''}
      <p class="${cls('price')}">${price(course)}</p>
      ${action}
    </article>`;
  }
  function details(course) {
    const provisional = course.oferta_provisional === true;
    const description = course.descripcion || 'Consulta los detalles con nuestro equipo.';
    const split = description.indexOf('Plus:');
    const overview = split < 0 ? description : description.slice(0, split).trim();
    const plus = split < 0 ? '' : description.slice(split + 5).trim();
    const images = publicImages(course);
    const first = images[0];
    const imageUrl = first ? `https://yesems-sistema-1.onrender.com/api/cursos/${encodeURIComponent(course.id_curso)}/imagenes/${first.id_imagen}` : '';
    return `<button class="course-detail-close" type="button" data-close-details aria-label="Cerrar información del curso">×</button>
      <div class="course-detail-layout">
        <div class="course-detail-media">
          <div class="course-detail-stage">
            ${first ? `<img class="course-detail-photo" src="${imageUrl}" alt="${escapeHtml(first.titulo)}" loading="eager">` : `<div class="course-detail-placeholder">${icon(course)}<strong>Explora ${escapeHtml(course.nombre || 'este curso')}</strong><span>Las imágenes de presentación aparecerán aquí cuando administración las publique.</span></div>`}
            ${images.length > 1 ? '<button class="course-detail-arrow course-detail-arrow--prev" type="button" data-gallery-step="-1" aria-label="Imagen anterior">←</button><button class="course-detail-arrow course-detail-arrow--next" type="button" data-gallery-step="1" aria-label="Imagen siguiente">→</button>' : ''}
          </div>
          <div class="course-detail-media-footer"><span data-gallery-caption>${first ? `${escapeHtml(first.titulo)} · Imagen 1 de ${images.length}` : 'Vista previa del curso'}</span>
            <div class="course-detail-dots">${images.map((item,index) => `<button type="button" data-gallery-index="${index}" aria-label="Ver imagen ${index + 1}: ${escapeHtml(item.titulo)}" aria-current="${index === 0}"></button>`).join('')}</div>
          </div>
        </div>
        <div class="course-detail-copy">
          <p class="course-detail-category">${escapeHtml(course.categoria || 'Capacitación')}</p>
          <h2 id="course-detail-title">${escapeHtml(course.nombre || 'Curso YES EMS')}</h2>
          ${provisional ? '<p class="badge badge--warning proposal-badge">Propuesta · Por confirmar</p>' : ''}
          <section><h3>Acerca del curso</h3><p class="course-detail-description">${escapeHtml(overview)}</p></section>
          ${plus ? `<section class="course-detail-plus"><h3>El plus de tu capacitación</h3><p>${escapeHtml(plus)}</p></section>` : ''}
          <dl class="course-detail-facts"><div><dt>Duración${provisional ? ' sugerida' : ''}</dt><dd>${duration(course)}</dd></div>
          ${hasCapacity(course) ? `<div><dt>Cupo${provisional ? ' sugerido' : ''}</dt><dd>${capacity(course)}</dd></div>` : ''}
          <div class="course-detail-price"><dt>Precio</dt><dd>${price(course)}</dd></div></dl>
          ${provisional ? '<p class="proposal-note">Duración y cupo sujetos a validación. Fechas, modalidad, equipo y materiales por confirmar. Inscripciones aún no abiertas.</p>' : ''}
          ${!provisional ? '<p class="proposal-note">Para obtener constancia es necesario estar inscrito al curso completo, cubrir el pago y cumplir los requisitos académicos y la validación administrativa.</p>' : ''}
          ${!provisional && course.duracion_aproximada ? '<p class="proposal-note">Fechas y horarios por acordar con YES EMS. Consulta la disponibilidad y los materiales antes de pagar.</p>' : ''}
          ${!provisional && course.activo !== false && course.ya_inscrito ? '<button class="course-more-button" type="button" data-detail-enroll>Ver mi inscripción</button>' : ''}
          ${!provisional && course.activo !== false && !course.cupo_lleno && !course.ya_inscrito ? '<button class="course-more-button" type="button" data-detail-enroll>Quiero inscribirme</button>' : ''}
          ${!provisional && course.activo !== false && course.cupo_lleno && !course.ya_inscrito ? '<button class="course-more-button" type="button" disabled>Cupo lleno</button><p class="proposal-note">Por el momento no hay lugares disponibles. Consulta nuevas fechas con YES EMS.</p>' : ''}
        </div>
      </div>
      <section class="course-detail-materials"><div><span>CONTENIDO DEL AULA</span><h3>PDF y materiales de estudio</h3></div><p>Los documentos que publique administración se consultan debajo de cada módulo, dentro del aula virtual. El acceso se habilita al confirmar la inscripción y el pago.</p></section>`;
  }
  function bindDetails(container, getCourses, onEnroll) {
    let dialog;
    let selected;
    container.addEventListener('error', event => {
      if (event.target.matches('.course-cover-photo')) event.target.hidden = true;
    }, true);
    container.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-course-details]');
      if (!trigger) return;
      selected = getCourses().find((course) => String(course.id_curso) === trigger.dataset.courseDetails);
      if (!selected) return;
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'course-detail-dialog';
        dialog.setAttribute('aria-labelledby', 'course-detail-title');
        dialog.addEventListener('error', (event) => {
          if (event.target.matches('.course-detail-photo')) event.target.closest('.course-detail-stage').dataset.imageError = 'true';
        }, true);
        dialog.addEventListener('load', (event) => {
          if (event.target.matches('.course-detail-photo')) delete event.target.closest('.course-detail-stage').dataset.imageError;
        }, true);
        dialog.addEventListener('click', (e) => {
          if (e.target.closest('[data-close-details]')) dialog.close();
          const step = e.target.closest('[data-gallery-step]');
          const dot = e.target.closest('[data-gallery-index]');
          if (step || dot) {
            const images = publicImages(selected);
            if (images.length) {
              const index = dot ? Number(dot.dataset.galleryIndex) : (Number(dialog.dataset.galleryIndex || 0) + Number(step.dataset.galleryStep) + images.length) % images.length;
              const item = images[index];
              const photo = dialog.querySelector('.course-detail-photo');
              if (item && photo) {
                dialog.dataset.galleryIndex = String(index);
                photo.src = `https://yesems-sistema-1.onrender.com/api/cursos/${encodeURIComponent(selected.id_curso)}/imagenes/${item.id_imagen}`;
                photo.alt = item.titulo;
                dialog.querySelector('[data-gallery-caption]').textContent = `${item.titulo} · Imagen ${index + 1} de ${images.length}`;
                dialog.querySelectorAll('[data-gallery-index]').forEach((button,position) => button.setAttribute('aria-current', String(position === index)));
              }
            }
          }
          if (e.target.closest('[data-detail-enroll]') && !selected.oferta_provisional && selected.activo !== false && (!selected.cupo_lleno || selected.ya_inscrito)) {
            dialog.close(); onEnroll(selected);
          }
        });
        dialog.addEventListener('close', () => document.documentElement.classList.remove('course-details-open'));
        document.body.append(dialog);
      }
      dialog.innerHTML = details(selected);
      dialog.dataset.galleryIndex = '0';
      trigger.focus();
      dialog.showModal();
      dialog.scrollTop = 0;
      document.documentElement.classList.add('course-details-open');
    });
  }
  const api = { card, details, icon, bindDetails, escapeHtml, emptyState, availability };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatalogoView = api;
})(typeof window !== 'undefined' ? window : globalThis);
