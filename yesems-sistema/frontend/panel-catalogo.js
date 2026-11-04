// Reutiliza el catálogo completo sin duplicar sus filtros ni su flujo de inscripción.
(() => {
  const section = document.createElement('section');
  section.id = 'teacher-catalog';
  section.className = 'dashboard-view-hidden';
  section.setAttribute('aria-label', 'Mis cursos: catálogo completo');
  document.querySelector('main').append(section);
  async function mount() {
    section.setAttribute('aria-busy', 'true');
    section.innerHTML = '<p role="status">Preparando el catálogo completo…</p>';
    try {
      const response = await fetch('./catalogo-alumno.html', { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Catálogo no disponible');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const catalog = page.querySelector('.catalog-section');
      if (!catalog) throw new Error('Catálogo no disponible');
      section.replaceChildren(document.importNode(catalog, true));
      window.initTeacherCatalog(section);
    } catch {
      section.innerHTML = '<p role="status">No pudimos abrir el catálogo. Inténtalo nuevamente.</p><button type="button" data-retry-mount>Reintentar</button>';
      section.querySelector('button').addEventListener('click', mount, { once: true });
    } finally {
      section.setAttribute('aria-busy', 'false');
    }
  }
  mount();
})();
