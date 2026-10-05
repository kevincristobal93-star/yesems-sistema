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
  const capacity = (course) => course.cupo_confirmado === false ? 'Cupo por confirmar' : `${escapeHtml(course.cupo ?? '—')} ${course.oferta_provisional ? 'personas por grupo' : 'lugares'}`;
  function card(course, student = false) {
    const provisional = course.oferta_provisional === true;
    const cls = (name) => student ? name : `course-${name}`;
    const title = student ? 'h2' : 'h3';
    const action = `<button class="course-more-button" type="button" data-course-details="${escapeHtml(course.id_curso)}" aria-haspopup="dialog" aria-label="Ver más información de ${escapeHtml(course.nombre || 'este curso')}">Ver más información <span aria-hidden="true">→</span></button>`;
    return `<article class="${cls('card')} catalog-tile">
      ${icon(course)}
      <p class="${cls('category')}">${escapeHtml(course.categoria || 'Capacitación')}</p>
      ${provisional ? '<p class="proposal-badge">Propuesta · Por confirmar</p>' : ''}
      <${title}>${escapeHtml(course.nombre || 'Curso YES EMS')}</${title}>
      <p class="${cls('description')} catalog-summary">${escapeHtml(course.descripcion || 'Consulta los detalles con nuestro equipo.')}</p>
      <div class="${cls('data')}"><span>${duration(course)}${provisional ? ' sugeridas' : ''}</span><span>${capacity(course)}${provisional ? ' sugeridas' : ''}</span></div>
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
    return `<button class="course-detail-close" type="button" data-close-details aria-label="Cerrar información del curso">×</button>
      ${icon(course)}
      <p class="course-detail-category">${escapeHtml(course.categoria || 'Capacitación')}</p>
      <h2 id="course-detail-title">${escapeHtml(course.nombre || 'Curso YES EMS')}</h2>
      ${provisional ? '<p class="proposal-badge">Propuesta · Por confirmar</p>' : ''}
      <section><h3>Acerca del curso</h3><p class="course-detail-description">${escapeHtml(overview)}</p></section>
      ${plus ? `<section class="course-detail-plus"><h3>El plus de tu capacitación</h3><p>${escapeHtml(plus)}</p></section>` : ''}
      <dl class="course-detail-facts"><div><dt>Duración${provisional ? ' sugerida' : ''}</dt><dd>${duration(course)}</dd></div>
      <div><dt>Cupo${provisional ? ' sugerido' : ''}</dt><dd>${capacity(course)}</dd></div>
      <div><dt>Precio</dt><dd>${price(course)}</dd></div></dl>
      ${provisional ? '<p class="proposal-note">Duración y cupo sujetos a validación. Fechas, modalidad, equipo y materiales por confirmar. Inscripciones aún no abiertas.</p>' : ''}
      ${!provisional ? '<p class="proposal-note">Para obtener constancia es necesario estar inscrito al curso completo, cubrir el pago y cumplir los requisitos académicos y la validación administrativa.</p>' : ''}
      ${!provisional && course.duracion_aproximada ? '<p class="proposal-note">Fechas y horarios por acordar con YES EMS. Consulta la disponibilidad y los materiales antes de pagar.</p>' : ''}
      ${!provisional && course.activo !== false ? '<button class="course-more-button" type="button" data-detail-enroll>Quiero inscribirme</button>' : ''}`;
  }
  function bindDetails(container, getCourses, onEnroll) {
    let dialog;
    let selected;
    container.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-course-details]');
      if (!trigger) return;
      selected = getCourses().find((course) => String(course.id_curso) === trigger.dataset.courseDetails);
      if (!selected) return;
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'course-detail-dialog';
        dialog.setAttribute('aria-labelledby', 'course-detail-title');
        dialog.addEventListener('click', (e) => {
          if (e.target.closest('[data-close-details]')) dialog.close();
          if (e.target.closest('[data-detail-enroll]') && !selected.oferta_provisional && selected.activo !== false) {
            dialog.close(); onEnroll(selected);
          }
        });
        dialog.addEventListener('close', () => document.documentElement.classList.remove('course-details-open'));
        document.body.append(dialog);
      }
      dialog.innerHTML = details(selected);
      trigger.focus();
      dialog.showModal();
      dialog.scrollTop = 0;
      document.documentElement.classList.add('course-details-open');
    });
  }
  const api = { card, details, icon, bindDetails, escapeHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatalogoView = api;
})(typeof window !== 'undefined' ? window : globalThis);
