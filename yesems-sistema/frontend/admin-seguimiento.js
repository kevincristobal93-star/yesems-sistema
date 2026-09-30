/* Seguimiento administrativo. Los permisos y requisitos se vuelven a validar en la API. */
(() => {
  'use strict';

  const section = document.querySelector('#seguimiento');
  if (!section || !token || !admin) return;

  const get = (id) => document.getElementById(id);
  const courseSelect = get('tracking-course');
  const activityForm = get('tracking-activity-form');
  const state = { course: null, activities: [], inscriptions: [], studentId: null, progress: null, busy: false, thresholdDirty: false, attendanceDrafts: new Map(), refreshPending: false };
  const modes = { presencial: 'Presencial', en_linea: 'En línea', hibrida: 'Híbrida', por_definir: 'Por definir' };
  const types = { sesion: 'Sesión', actividad: 'Actividad' };
  let disabledSnapshot = [];

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function action(label, callback, className = 'secondary-action') {
    const button = node('button', label, className);
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }

  function status(text = '', error = false, student = false) {
    const target = get(student ? 'tracking-student-message' : 'tracking-message');
    target.textContent = text;
    target.dataset.error = String(error);
  }

  function setBusy(busy) {
    state.busy = busy;
    section.setAttribute('aria-busy', String(busy));
    if (busy) {
      disabledSnapshot = [...section.querySelectorAll('button, input, select, textarea')].map((element) => [element, element.disabled]);
      disabledSnapshot.forEach(([element]) => { element.disabled = true; });
    } else {
      disabledSnapshot.forEach(([element, disabled]) => { if (element.isConnected) element.disabled = disabled; });
      disabledSnapshot = [];
      syncControls();
      if (state.refreshPending) { state.refreshPending = false; queueMicrotask(loadCourses); }
    }
  }

  function syncControls() {
    const course = state.course;
    const draft = course && !course.plan_publicado && !course.plan_bloqueado && !state.busy;
    courseSelect.disabled = state.busy;
    get('tracking-refresh').disabled = state.busy;
    get('tracking-threshold').disabled = !draft;
    get('tracking-rule-save').disabled = !draft;
    get('tracking-activity-fields').disabled = !draft;
    get('tracking-publish').hidden = Boolean(course?.plan_publicado);
    get('tracking-publish').disabled = !draft || !state.activities.length || course?.porcentaje_minimo == null || state.thresholdDirty || activityFormDirty();
    get('tracking-publish-help').textContent = course?.plan_publicado ? ''
      : state.thresholdDirty || activityFormDirty() ? 'Guarda o cancela los cambios pendientes antes de publicar el plan.'
        : course?.porcentaje_minimo == null ? 'Para publicar, define y guarda el porcentaje mínimo de este curso.'
          : !state.activities.length ? 'Agrega al menos una sesión o actividad antes de publicar.' : '';
    get('tracking-reopen').hidden = !course?.plan_publicado;
    get('tracking-reopen').disabled = Boolean(course?.plan_bloqueado) || state.busy;
    get('tracking-conclude').disabled = !state.progress?.puede_concluir || currentAttendanceDirty() || state.busy;
    section.querySelectorAll('#tracking-students button, #tracking-activities button').forEach((button) => { button.disabled = state.busy; });
    const attendanceEditable = state.progress?.plan_publicado && !state.progress?.conclusion_validada && state.progress?.estado !== 'cancelada';
    get('tracking-attendance').querySelectorAll('fieldset').forEach((fieldset) => { fieldset.disabled = !attendanceEditable || state.busy; });
  }

  function activityFormDirty() {
    return Boolean(get('tracking-activity-name').value.trim() || get('tracking-activity-id').value || get('tracking-activity-date').value);
  }

  function currentAttendanceDirty() {
    return [...state.attendanceDrafts.keys()].some((key) => key.startsWith(`${state.studentId}:`));
  }

  function confirmDiscardPlan() {
    return (!state.thresholdDirty && !activityFormDirty()) || window.confirm('Hay cambios del plan sin guardar. ¿Cambiar de curso y descartarlos?');
  }

  function readableError(error) {
    return error instanceof TypeError ? 'No se pudo conectar. Revisa tu conexión y vuelve a intentar.' : error.message;
  }

  function send(path, method, body) {
    return request(`/seguimiento${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
  }

  function studentName(inscription) {
    return [inscription?.usuario_nombre, inscription?.usuario_apellido].filter(Boolean).join(' ') || `Inscripción #${inscription?.id_inscripcion}`;
  }

  function activityMetadata(activity) {
    const parts = [types[activity.tipo] || activity.tipo, modes[activity.modalidad] || activity.modalidad];
    if (activity.fecha) {
      const value = String(activity.fecha).slice(0, 10);
      const date = new Date(`${value}T12:00:00`);
      if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString('es-MX'));
    }
    return parts.filter(Boolean).join(' · ');
  }

  function resetActivityForm() {
    activityForm.reset();
    get('tracking-activity-id').value = '';
    get('tracking-activity-title').textContent = 'Agregar al plan';
    get('tracking-activity-save').textContent = 'Agregar actividad';
    get('tracking-activity-cancel').hidden = true;
    syncControls();
  }

  function editActivity(activity) {
    if (state.busy || state.course?.plan_publicado || state.course?.plan_bloqueado) return;
    get('tracking-activity-id').value = activity.id_actividad;
    get('tracking-activity-name').value = activity.titulo;
    get('tracking-activity-type').value = activity.tipo;
    get('tracking-activity-mode').value = activity.modalidad;
    get('tracking-activity-date').value = activity.fecha ? String(activity.fecha).slice(0, 10) : '';
    get('tracking-activity-title').textContent = 'Editar actividad';
    get('tracking-activity-save').textContent = 'Guardar cambios';
    get('tracking-activity-cancel').hidden = false;
    syncControls();
    get('tracking-activity-name').focus();
  }

  function renderActivities() {
    const list = get('tracking-activities');
    list.replaceChildren();
    if (!state.activities.length) {
      list.append(node('li', 'Todavía no hay sesiones o actividades. Agrega el plan completo antes de publicarlo.', 'tracking-empty'));
      return;
    }
    state.activities.forEach((activity, index) => {
      const item = node('li');
      item.append(node('h5', `${index + 1}. ${activity.titulo}`), node('p', activityMetadata(activity)));
      if (!state.course.plan_publicado && !state.course.plan_bloqueado) {
        const actions = node('div', undefined, 'tracking-actions');
        actions.append(action('Editar', () => editActivity(activity)), action('Retirar del plan', () => {
          if (state.busy || !window.confirm(`¿Retirar "${activity.titulo}" del plan? Ya no contará en el avance. El registro se conservará en el historial.`)) return;
          mutate(`/actividades/${activity.id_actividad}`, 'DELETE', undefined, 'Actividad retirada del plan.', false, () => {
            if (String(get('tracking-activity-id').value) === String(activity.id_actividad)) resetActivityForm();
          });
        }, 'secondary-action tracking-delete'));
        item.append(actions);
      }
      list.append(item);
    });
  }

  function renderStudents() {
    const tbody = get('tracking-students');
    tbody.replaceChildren();
    if (!state.inscriptions.length) {
      const row = node('tr');
      const cell = node('td', 'Este curso todavía no tiene inscripciones.', 'tracking-empty');
      cell.colSpan = 5;
      row.append(cell);
      tbody.append(row);
      return;
    }
    state.inscriptions.forEach((inscription) => {
      const row = node('tr');
      const progress = inscription.progreso;
      const selected = String(inscription.id_inscripcion) === String(state.studentId);
      row.setAttribute('aria-selected', String(selected));
      const count = progress ? `${progress.cumplidas} de ${progress.total} · ${progress.porcentaje}%` : 'Sin datos de avance';
      row.append(node('td', studentName(inscription)), node('td', inscription.estado), node('td', count), node('td', progress ? (progress.pago_completo ? 'Completo' : 'Pendiente') : 'Sin datos de pago'));
      const actions = node('td');
      const button = action(selected ? 'Actualizar avance' : 'Ver avance', () => selectStudent(inscription.id_inscripcion));
      button.setAttribute('aria-label', `Ver avance de ${studentName(inscription)}`);
      actions.append(button);
      row.append(actions);
      tbody.append(row);
    });
  }

  function renderCourse() {
    const course = state.course;
    get('tracking-course-detail').hidden = !course;
    if (!course) return;
    if (!state.thresholdDirty || course.plan_publicado || course.plan_bloqueado) get('tracking-threshold').value = course.porcentaje_minimo ?? '';
    const planStatus = get('tracking-plan-status');
    planStatus.textContent = course.plan_bloqueado ? 'Plan cerrado' : course.plan_publicado ? 'Plan publicado' : 'Borrador';
    planStatus.dataset.published = String(Boolean(course.plan_publicado));
    get('tracking-plan-help').textContent = course.plan_bloqueado
      ? 'Este plan ya tiene conclusiones validadas y está protegido para conservar sus requisitos.'
      : course.plan_publicado
        ? 'El plan está listo para registrar cumplimiento. Para cambiar actividades o el requisito, primero reabre el plan; esto solo es posible antes de validar una conclusión.'
        : 'Define el porcentaje requerido y todas las sesiones o actividades. Al publicar el plan podrás registrar el cumplimiento de los alumnos.';
    renderActivities();
    renderStudents();
    syncControls();
  }

  function renderProgress() {
    const progress = state.progress;
    const detail = get('tracking-student-detail');
    detail.hidden = !progress;
    if (!progress) return;
    const inscription = state.inscriptions.find((item) => String(item.id_inscripcion) === String(state.studentId));
    get('tracking-student-title').textContent = studentName(inscription);
    const summary = get('tracking-student-summary');
    summary.replaceChildren();
    const completion = node('div', undefined, 'tracking-stat');
    completion.append(node('strong', progress.total ? `${progress.porcentaje}% de cumplimiento` : 'Sin plan de actividades'), node('p', `${progress.cumplidas} de ${progress.total} cumplidas · ${progress.pendientes} pendientes`));
    if (progress.total) {
      const bar = node('progress');
      bar.max = 100;
      bar.value = Number(progress.porcentaje);
      bar.setAttribute('aria-label', 'Porcentaje de cumplimiento registrado');
      completion.append(bar);
    }
    const payment = node('div', undefined, 'tracking-stat');
    payment.append(node('strong', progress.pago_completo ? 'Pago completo confirmado' : 'Pago pendiente de completar'), node('p', `${money.format(Number(progress.total_pagado))} confirmado de ${money.format(Number(progress.monto_total))}`));
    summary.append(completion, payment);

    const requirements = get('tracking-student-requirements');
    requirements.replaceChildren();
    requirements.dataset.ready = String(Boolean(progress.puede_concluir || progress.puede_solicitar_constancia));
    requirements.append(node('p', `Requisito del curso: ${progress.porcentaje_minimo == null ? 'por definir' : `${progress.porcentaje_minimo}% de cumplimiento`}. Estado de inscripción: ${progress.estado}.`));
    if (progress.conclusion_validada) {
      requirements.append(node('p', progress.puede_solicitar_constancia
        ? 'Conclusión validada. El alumno cumple los requisitos para solicitar su constancia.'
        : 'Conclusión registrada. Revisa los requisitos actuales antes de tramitar una constancia.'));
    } else if (progress.puede_concluir) {
      requirements.append(node('p', 'Cumple los requisitos. Falta tu validación final para concluir el curso.'));
    }
    if (progress.bloqueos?.length) {
      const reasons = node('ul');
      progress.bloqueos.forEach((reason) => reasons.append(node('li', reason)));
      requirements.append(reasons);
    }
    const draftNotice = node('p', 'Tienes registros sin guardar. Guárdalos antes de validar la conclusión.');
    draftNotice.hidden = !currentAttendanceDirty();
    requirements.append(draftNotice);

    const attendance = get('tracking-attendance');
    attendance.replaceChildren();
    const editable = progress.plan_publicado && !progress.conclusion_validada && progress.estado !== 'cancelada';
    if (!(progress.actividades || []).length) attendance.append(node('p', 'Sin actividades para registrar.', 'tracking-empty'));
    (progress.actividades || []).forEach((activity) => {
      const draftKey = `${progress.id_inscripcion}:${activity.id_actividad}`;
      const pendingDraft = state.attendanceDrafts.get(draftKey);
      const form = node('form');
      const fields = node('fieldset');
      fields.disabled = !editable;
      fields.append(node('legend', activity.titulo), node('p', activityMetadata(activity), 'tracking-help'));
      const checkLabel = node('label', undefined, 'tracking-check');
      const check = node('input');
      check.type = 'checkbox';
      check.checked = editable && pendingDraft ? pendingDraft.cumplida : Boolean(activity.cumplida);
      check.id = `tracking-check-${progress.id_inscripcion}-${activity.id_actividad}`;
      checkLabel.htmlFor = check.id;
      checkLabel.append(check, node('span', activity.tipo === 'sesion' ? 'Asistencia cumplida' : 'Actividad cumplida'));
      const noteLabel = node('label', 'Observaciones (opcional)');
      const notes = node('textarea');
      notes.id = `tracking-note-${progress.id_inscripcion}-${activity.id_actividad}`;
      notes.maxLength = 1000;
      notes.rows = 2;
      notes.value = editable && pendingDraft ? pendingDraft.observaciones : activity.observaciones || '';
      noteLabel.htmlFor = notes.id;
      const save = node('button', 'Guardar registro', 'secondary-action');
      save.type = 'submit';
      save.setAttribute('aria-label', `Guardar registro de ${activity.titulo}`);
      const actions = node('div', undefined, 'tracking-actions');
      actions.append(save);
      const draftMessage = node('p', pendingDraft && editable ? 'Cambios sin guardar.' : 'Registro guardado.', 'tracking-help');
      const rememberDraft = () => {
        const value = { cumplida: check.checked, observaciones: notes.value };
        const changed = value.cumplida !== Boolean(activity.cumplida) || value.observaciones.trim() !== (activity.observaciones || '');
        if (changed) state.attendanceDrafts.set(draftKey, value);
        else state.attendanceDrafts.delete(draftKey);
        draftMessage.textContent = changed ? 'Cambios sin guardar.' : 'Registro guardado.';
        draftNotice.hidden = !currentAttendanceDirty();
        syncControls();
      };
      check.addEventListener('change', rememberDraft);
      notes.addEventListener('input', rememberDraft);
      fields.append(checkLabel, noteLabel, notes, draftMessage, actions);
      form.append(fields);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.busy || !editable) return;
        await mutate(`/inscripciones/${progress.id_inscripcion}/actividades/${activity.id_actividad}`, 'PUT', { cumplida: check.checked, observaciones: notes.value.trim() }, 'Registro guardado. El avance ya fue recalculado.', true, () => state.attendanceDrafts.delete(draftKey));
      });
      attendance.append(form);
    });
    get('tracking-conclude').textContent = progress.conclusion_validada ? 'Conclusión ya validada' : 'Validar conclusión del curso';
    syncControls();
  }

  async function reloadCourse() {
    if (!courseSelect.value) return;
    const data = await request(`/seguimiento/cursos/${courseSelect.value}`);
    state.course = data.curso;
    state.activities = data.actividades || [];
    state.inscriptions = data.inscripciones || [];
    if (state.studentId && !state.inscriptions.some((item) => String(item.id_inscripcion) === String(state.studentId))) state.studentId = null;
    state.progress = null;
    renderCourse();
    renderProgress();
    if (state.studentId) {
      const studentData = await request(`/seguimiento/inscripciones/${state.studentId}`);
      state.progress = studentData.progreso;
      renderProgress();
    }
  }

  async function loadCourses() {
    if (state.busy) return;
    setBusy(true);
    status('Cargando cursos y seguimiento...');
    try {
      const selectedId = courseSelect.value;
      const data = await request('/seguimiento/cursos');
      courseSelect.replaceChildren(new Option('Selecciona un curso', ''));
      (data.cursos || []).forEach((course) => courseSelect.add(new Option(`${course.nombre}${course.activo === false ? ' (inactivo)' : ''}`, String(course.id_curso))));
      courseSelect.value = selectedId;
      if (courseSelect.value) await reloadCourse();
      else {
        state.course = null;
        state.studentId = null;
        state.progress = null;
        get('tracking-course-detail').hidden = true;
      }
      status(courseSelect.value ? 'Seguimiento actualizado.' : data.cursos?.length ? 'Selecciona un curso para administrar su plan y consultar el avance.' : 'Todavía no hay cursos. Crea uno en Cursos y disponibilidad.');
    } catch (error) { status(readableError(error), true); }
    finally { setBusy(false); }
  }

  async function selectStudent(id) {
    if (state.busy) return;
    state.studentId = id;
    state.progress = null;
    get('tracking-student-detail').hidden = false;
    get('tracking-student-title').textContent = studentName(state.inscriptions.find((item) => String(item.id_inscripcion) === String(id)));
    get('tracking-student-summary').replaceChildren();
    get('tracking-student-requirements').replaceChildren();
    get('tracking-attendance').replaceChildren();
    syncControls();
    setBusy(true);
    status('Cargando avance del alumno...', false, true);
    try {
      const data = await request(`/seguimiento/inscripciones/${id}`);
      state.progress = data.progreso;
      renderStudents();
      renderProgress();
      status('', false, true);
      get('tracking-student-title').focus({ preventScroll: true });
      get('tracking-student-detail').scrollIntoView({ block: 'nearest', behavior: 'auto' });
    } catch (error) { status(readableError(error), true, true); }
    finally { setBusy(false); }
  }

  async function mutate(path, method, body, successMessage, student = false, afterSave = () => {}) {
    if (state.busy) return;
    setBusy(true);
    status('Guardando cambios...', false, student);
    let saved = false;
    try {
      await send(path, method, body);
      saved = true;
      afterSave();
      await reloadCourse();
      status(successMessage, false, student);
    } catch (error) {
      if (student) get('tracking-student-detail').hidden = false;
      status(`${saved ? 'Los cambios se guardaron, pero no se pudo actualizar la vista. Usa Actualizar. ' : ''}${readableError(error)}`, true, student);
    } finally { setBusy(false); }
  }

  courseSelect.addEventListener('change', async () => {
    if (state.busy) return;
    if (!confirmDiscardPlan()) { courseSelect.value = state.course?.id_curso || ''; return; }
    state.thresholdDirty = false;
    resetActivityForm();
    state.studentId = null;
    state.course = null;
    state.progress = null;
    get('tracking-course-detail').hidden = true;
    if (!courseSelect.value) { status('Selecciona un curso para continuar.'); return; }
    setBusy(true);
    status('Cargando plan e inscripciones...');
    try { await reloadCourse(); status(''); }
    catch (error) { status(readableError(error), true); }
    finally { setBusy(false); }
  });

  get('tracking-refresh').addEventListener('click', loadCourses);
  get('tracking-activity-cancel').addEventListener('click', resetActivityForm);
  get('tracking-threshold').addEventListener('input', () => {
    state.thresholdDirty = get('tracking-threshold').value !== String(state.course?.porcentaje_minimo ?? '');
    syncControls();
  });
  activityForm.addEventListener('input', () => {
    get('tracking-activity-cancel').hidden = !activityFormDirty();
    syncControls();
  });
  get('tracking-rule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.course || state.busy) return;
    mutate(`/cursos/${state.course.id_curso}/regla`, 'PATCH', { porcentaje_minimo: Number(get('tracking-threshold').value) }, 'Requisito guardado para este curso.', false, () => { state.thresholdDirty = false; });
  });

  activityForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.course || state.busy) return;
    const title = get('tracking-activity-name').value.trim();
    if (!title) { status('Escribe el título de la sesión o actividad.', true); get('tracking-activity-name').focus(); return; }
    const id = get('tracking-activity-id').value;
    mutate(id ? `/actividades/${id}` : `/cursos/${state.course.id_curso}/actividades`, id ? 'PUT' : 'POST', {
      titulo: title,
      tipo: get('tracking-activity-type').value,
      modalidad: get('tracking-activity-mode').value,
      fecha: get('tracking-activity-date').value || null
    }, id ? 'Actividad actualizada.' : 'Actividad agregada al plan.', false, resetActivityForm);
  });

  get('tracking-publish').addEventListener('click', () => {
    if (state.busy || !state.course || !window.confirm(`¿Publicar el plan completo de "${state.course.nombre}" con ${state.activities.length} actividades y un mínimo de ${state.course.porcentaje_minimo}%? Todas las actividades tendrán el mismo peso.`)) return;
    mutate(`/cursos/${state.course.id_curso}/publicar`, 'POST', undefined, 'Plan publicado. Ya puedes registrar el cumplimiento.');
  });
  get('tracking-reopen').addEventListener('click', () => {
    if (state.busy || !state.course || !window.confirm('¿Reabrir el plan? Mientras esté en borrador no se podrán validar conclusiones ni emitir nuevas constancias. Cambiar el plan recalculará el avance de sus alumnos.')) return;
    mutate(`/cursos/${state.course.id_curso}/reabrir`, 'POST', undefined, 'Plan abierto para edición. Publícalo de nuevo al terminar.');
  });
  get('tracking-conclude').addEventListener('click', async () => {
    if (state.busy || !state.progress?.puede_concluir || currentAttendanceDirty()) return;
    const inscription = state.inscriptions.find((item) => String(item.id_inscripcion) === String(state.studentId));
    if (!window.confirm(`¿Validar la conclusión de ${studentName(inscription)}? Tiene ${state.progress.cumplidas} de ${state.progress.total} actividades cumplidas (${state.progress.porcentaje}%) y el pago completo confirmado. El plan quedará protegido y el alumno podrá solicitar su constancia.`)) return;
    await mutate(`/inscripciones/${state.studentId}/concluir`, 'POST', undefined, 'Conclusión validada. El alumno ya puede solicitar su constancia.', true);
    loadDashboard();
    loadCertificates();
  });

  document.addEventListener('yesems:admin-data-changed', () => {
    if (state.busy) state.refreshPending = true;
    else loadCourses();
  });
  loadCourses();
})();
