(function (root) {
  'use strict';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  function card(course, student = false) {
    const provisional = course.oferta_provisional === true;
    const cls = (name) => student ? name : `course-${name}`;
    const title = student ? 'h2' : 'h3';
    const id = encodeURIComponent(course.id_curso);
    const contact = `https://api.whatsapp.com/send/?phone=5215648666596&text=${encodeURIComponent(`Hola, me interesa recibir información de ${course.nombre}. ¿Me pueden confirmar precio, fechas y requisitos?`)}`;
    const action = provisional
      ? `<a class="enroll-button" href="${escapeHtml(contact)}" target="_blank" rel="noopener noreferrer">Solicitar información</a>`
      : student ? `<a href="./inscripcion.html?curso=${id}">Quiero inscribirme</a>`
        : `<button class="enroll-button" type="button" data-enroll-course="${escapeHtml(course.id_curso)}">Quiero inscribirme</button>`;
    return `<article class="${cls('card')}">
      <p class="${cls('category')}">${escapeHtml(course.categoria || 'Capacitación')}</p>
      ${provisional ? '<p class="proposal-badge">Propuesta · Por confirmar</p>' : ''}
      <${title}>${escapeHtml(course.nombre || 'Curso YES EMS')}</${title}>
      <p class="${cls('description')}">${escapeHtml(course.descripcion || 'Consulta los detalles con nuestro equipo.')}</p>
      <div class="${cls('data')}"><span>${escapeHtml(course.duracion_horas ?? '—')} horas${provisional ? ' sugeridas' : ''}</span><span>${escapeHtml(course.cupo ?? '—')} ${provisional ? 'personas por grupo sugeridas' : 'lugares'}</span></div>
      <p class="${cls('price')}">${provisional || course.precio == null ? 'Costo por confirmar' : money.format(Number(course.precio))}</p>
      ${provisional ? '<p class="proposal-note">Duración y cupo sujetos a validación. Fechas, modalidad, equipo y materiales por confirmar. Inscripciones aún no abiertas.</p>' : ''}
      ${action}
    </article>`;
  }
  const api = { card, escapeHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatalogoView = api;
})(typeof window !== 'undefined' ? window : globalThis);
