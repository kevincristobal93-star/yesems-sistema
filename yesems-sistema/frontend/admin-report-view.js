/* Renderizado puro: solo cifras recibidas de la API, sin valores ilustrativos. */
const AdminReportView = (() => {
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const count = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const format = (value) => new Intl.NumberFormat('es-MX').format(value);
  function courses(items) {
    const rows = items.map((item) => ({ ...item, count: count(item.inscripciones) })).sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...rows.map((item) => item.count));
    if (!rows.some((item) => item.count)) return '<p class="report-empty">Todavía no hay inscripciones para comparar. Aquí verás la distribución cuando se registre la primera.</p>';
    return rows.map((item, index) => `<div class="report-course-row"><span class="report-rank" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div class="report-course-main"><div class="report-course-label"><span>${escape(item.nombre)}${item.activo === false ? ' <small>(inactivo)</small>' : ''}</span><strong>${format(item.count)} <small>${item.count === 1 ? 'inscripción' : 'inscripciones'}</small></strong></div><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${item.count / max * 100}%"></div></div></div></div>`).join('');
  }
  function months(items) {
    if (!items.length) return '<p class="report-empty">No hay información mensual disponible.</p>';
    const max = Math.max(1, ...items.map((item) => count(item.inscripciones)));
    return items.map((item) => {
      const value = count(item.inscripciones);
      const date = /^\d{4}-(0[1-9]|1[0-2])$/.test(item.periodo) ? new Date(`${item.periodo}-01T12:00:00`) : null;
      const label = date ? date.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }) : item.periodo;
      return `<div class="trend-item"><div class="report-column"><strong>${format(value)}</strong><div class="trend-bar" aria-hidden="true" style="height:${value / max * 120}px"></div></div><span>${escape(label)}</span><span class="report-sr-only">${format(value)} inscripciones</span></div>`;
    }).join('');
  }
  return { courses, months, count };
})();
