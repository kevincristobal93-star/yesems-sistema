/* Presentación del seguimiento: la elegibilidad siempre la decide el servidor. */
const PanelProgreso = (() => {
  const percentage = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function number(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function progressNumbers(progress) {
    if (!progress || typeof progress !== 'object') return null;
    const total = number(progress.total);
    const completed = number(progress.cumplidas);
    const pending = number(progress.pendientes);
    const percent = number(progress.porcentaje);
    if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(completed) || completed < 0
      || !Number.isInteger(pending) || pending < 0 || completed + pending !== total
      || percent === null || percent < 0 || percent > 100) return null;
    return { total, completed, pending, percent };
  }

  function dateLabel(value) {
    if (!value) return 'Fecha por definir';
    // Las fechas de sesión no deben cambiar de día por la zona horaria del navegador.
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
    return Number.isNaN(parsed.getTime()) ? 'Fecha por definir' : parsed.toLocaleDateString('es-MX', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function renderMeter(progress) {
    const counts = progressNumbers(progress);
    if (!counts) {
      const message = !progress ? 'El seguimiento no está disponible. Actualiza el panel para volver a consultar.'
        : number(progress.total) === 0 ? 'Aún no hay sesiones o actividades definidas para este curso.'
          : 'No se pudo obtener un avance válido para este curso. Actualiza el panel para volver a consultar.';
      return `<p class="progress-unavailable">${message}</p>`;
    }
    const percent = percentage.format(counts.percent);
    return `<div class="course-progress-heading"><strong>${percent}%</strong><span>${counts.completed} de ${counts.total} cumplidas · ${counts.pending} pendientes</span></div>
      <div class="progress-track" role="progressbar" aria-label="Sesiones o actividades cumplidas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${counts.percent}" aria-valuetext="${counts.completed} de ${counts.total} cumplidas, ${percent}%"><span style="width:${counts.percent}%"></span></div>`;
  }

  function renderRequirements(progress, enrollmentState) {
    if (!progress) return '<p class="progress-note">La disponibilidad de la constancia se confirmará cuando se pueda consultar el seguimiento.</p>';
    const threshold = number(progress.porcentaje_minimo);
    const minimum = threshold !== null && threshold > 0 && threshold <= 100
      ? `Cumplimiento mínimo de este curso: ${percentage.format(threshold)}%.`
      : 'El administrador aún debe definir el porcentaje mínimo de este curso.';
    const conclusion = progress.conclusion_validada === true
      ? '<span class="progress-state is-complete">Conclusión validada por administración</span>'
      : '<span class="progress-state">Conclusión pendiente de validación</span>';
    const blockers = Array.isArray(progress.bloqueos) ? progress.bloqueos.filter((value) => typeof value === 'string' && value.trim()) : [];
    let note = '';
    if (progress.plan_publicado !== true) note = '<p class="progress-note">Plan pendiente de publicación. La administración debe confirmar las sesiones y actividades del curso.</p>';
    if (enrollmentState === 'completada' && progress.conclusion_validada !== true) {
      note += '<p class="progress-note">Tu inscripción figura como completada, pero aún falta validar la conclusión con el seguimiento actual.</p>';
    }
    if (progress.puede_solicitar_constancia === true) {
      note += '<p class="progress-ready">Requisitos de conclusión y pago cumplidos.</p>';
    } else if (blockers.length) {
      note += `<div class="progress-blockers"><strong>Requisitos pendientes</strong><ul>${blockers.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul></div>`;
    } else if (progress.puede_concluir === true && progress.conclusion_validada !== true) {
      note += '<p class="progress-note">Ya cumples los requisitos. La administración debe revisar y validar la conclusión.</p>';
    }
    return `<div class="progress-requirements"><p>${minimum}</p>${conclusion}${note}</div>`;
  }

  function renderActivities(progress) {
    if (!progress || !Array.isArray(progress.actividades)) return '';
    const activities = progress.actividades;
    if (!activities.length) return '';
    const types = { sesion: 'Sesión', actividad: 'Actividad' };
    const modes = { presencial: 'Presencial', en_linea: 'En línea', hibrida: 'Híbrida', por_definir: 'Modalidad por definir' };
    return `<details class="course-activities"><summary>Ver sesiones y actividades (${activities.length})</summary><ul>${activities.map((activity) => {
      const done = activity.cumplida === true;
      return `<li><div class="course-activity-heading"><strong>${escapeHtml(activity.titulo || 'Sesión o actividad')}</strong><span class="activity-status${done ? ' is-complete' : ''}">${done ? 'Cumplida' : 'Pendiente'}</span></div>
        <p>${escapeHtml(types[activity.tipo] || 'Actividad')} · ${escapeHtml(modes[activity.modalidad] || 'Modalidad por definir')} · ${escapeHtml(dateLabel(activity.fecha))}</p>
        ${activity.observaciones ? `<p class="activity-observations">Observaciones: ${escapeHtml(activity.observaciones)}</p>` : ''}</li>`;
    }).join('')}</ul></details>`;
  }

  function render(progress, enrollmentState) {
    return `<section class="enrollment-progress" aria-label="Avance académico"><h4>Tu avance en el curso</h4>${renderMeter(progress)}${renderRequirements(progress, enrollmentState)}${renderActivities(progress)}</section>`;
  }

  function canRequest(item) {
    return !item.estado_constancia && !item.id_constancia && item.progreso?.puede_solicitar_constancia === true;
  }

  return { escapeHtml, progressNumbers, renderMeter, render, canRequest };
})();
