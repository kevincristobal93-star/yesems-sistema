(() => {
  'use strict';
  if (!localStorage.getItem('yesems_admin_token') || !document.querySelector('.admin-hero')) return;
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = './admin-aula-priority.css'; document.head.append(style);

  const menu = document.querySelector('#admin-menu nav');
  const link = menu?.querySelector('a[href="./admin-aula.html"]');
  if (link) {
    link.classList.add('admin-aula-menu-priority');
    link.setAttribute('aria-label', 'Aula virtual, sección prioritaria');
    link.lastChild.textContent = 'Aula virtual';
    const badge = document.createElement('span'); badge.textContent = 'Prioridad'; badge.className = 'admin-aula-menu-badge';
    link.append(badge);
    menu.children[0]?.after(link);
  }

  function node(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  const section = node('section', 'admin-aula-priority');
  section.id = 'aula-prioridad'; section.setAttribute('aria-labelledby', 'aula-priority-title');
  const heading = node('div', 'admin-aula-priority-heading');
  const copy = node('div');
  const title = node('h2', '', 'Aula virtual'); title.id = 'aula-priority-title';
  copy.append(node('p', 'eyebrow', 'PRIORIDAD ACADÉMICA'), title,
    node('p', '', 'Prepara los módulos, publica el PDF principal y organiza los apoyos de cada curso.'));
  const manager = node('a', 'admin-aula-manager', 'Abrir gestor del aula →'); manager.href = './admin-aula.html';
  heading.append(copy, manager);
  const summary = node('p', 'admin-aula-priority-summary', 'Revisando el contenido de tus cursos…');
  summary.setAttribute('role', 'status');
  const list = node('div', 'admin-aula-priority-list');
  section.append(heading, summary, list,
    node('p', 'admin-aula-priority-footnote', 'Ruta recomendada: módulo → PDF principal → apoyos y videos → publicación.'));
  document.querySelector('.admin-hero').after(section);

  function priority(course) {
    if (!course.activo) return 4;
    if (!Number(course.modulos)) return 0;
    if (!Number(course.publicados)) return 1;
    if (!Number(course.materiales_publicados)) return 2;
    return 3;
  }

  function card(course) {
    const item = node('article', 'admin-aula-priority-card');
    const status = priority(course);
    const label = ['Crear primer módulo', 'Publicación pendiente', 'Agregar materiales', 'Con contenido publicado', 'Curso desactivado'][status];
    const badge = node('span', `admin-aula-priority-badge status-${status}`, label);
    const name = node('h3', '', course.nombre || 'Curso sin nombre');
    const counts = node('p', 'admin-aula-priority-counts',
      `${course.modulos || 0} módulos · ${course.publicados || 0} publicados · ${course.documentos || 0} documentos · ${course.videos || 0} videos`);
    const action = node('a', 'admin-aula-priority-action', status === 3 || status === 4 ? 'Revisar aula →' : 'Preparar aula →');
    action.href = `./admin-aula.html?curso=${encodeURIComponent(course.id_curso)}`;
    item.append(badge, name, counts, action);
    return item;
  }

  (async () => {
    try {
      const data = await request('/aula/admin/cursos');
      const courses = Array.isArray(data.cursos) ? data.cursos : [];
      const ordered = [...courses].sort((a, b) => priority(a) - priority(b) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
      const active = courses.filter(course => course.activo);
      const pending = active.filter(course => priority(course) < 3).length;
      const published = active.reduce((sum, course) => sum + Number(course.publicados || 0), 0);
      summary.textContent = `${active.length} cursos activos · ${pending} por preparar · ${published} módulos publicados`;
      if (!ordered.length) {
        list.append(node('p', 'admin-aula-priority-empty', 'Aún no hay cursos. Crea el primero en «Cursos y disponibilidad».'));
        return;
      }
      ordered.slice(0, 6).forEach(course => list.append(card(course)));
      if (ordered.length > 6) summary.textContent += ` · Mostrando 6 de ${ordered.length}`;
    } catch (error) {
      summary.textContent = error.message || 'No se pudo consultar el aula. Vuelve a intentarlo.';
    }
  })();
})();
