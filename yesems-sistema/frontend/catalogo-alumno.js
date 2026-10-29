const API_URL = 'https://yesems-sistema-1.onrender.com/api';
const token = localStorage.getItem('yesems_token');
const user = JSON.parse(localStorage.getItem('yesems_usuario') || 'null');

if (!token || !user) window.location.replace('./cursos.html');

const grid = document.querySelector('#courses');
const message = document.querySelector('#message');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
let courses = [];
const catalogFilters = ListFilters.attachCatalog({ search, category, modality: document.querySelector('#modality'), chips: document.querySelector('#catalog-chips'), onChange: render });
grid.addEventListener('click', event => { if (event.target.closest('[data-clear-catalog]')) catalogFilters.reset(); });

function closeSession() {
  localStorage.removeItem('yesems_token');
  localStorage.removeItem('yesems_usuario');
  window.location.replace('./cursos.html');
}

function setupAccount() {
  const fullName = `${user?.nombre || ''} ${user?.apellido || ''}`.trim() || 'Alumno YES EMS';
  document.querySelector('#student-name').textContent = fullName;
  document.querySelector('#student-email').textContent = user?.email || '';
  document.querySelector('#student-initial').textContent = fullName.charAt(0).toUpperCase() || 'A';
}

CatalogoView.bindDetails(grid, () => courses, (course) => {
  window.location.href = course.ya_inscrito
    ? './panel.html#mis-inscripciones'
    : `./inscripcion.html?curso=${encodeURIComponent(course.id_curso)}`;
});

function render() {
  const filtered = catalogFilters.filter(courses);

  message.textContent = filtered.length
    ? `${filtered.length} ${filtered.length === 1 ? 'curso encontrado' : 'cursos encontrados'}`
    : courses.length ? 'No encontramos cursos con esos filtros.' : 'No hay cursos publicados por el momento.';
  grid.innerHTML = filtered.length
    ? filtered.map((course) => CatalogoView.card(course, true)).join('')
    : CatalogoView.emptyState(courses.length > 0);
}

async function request(path) {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => null);
  if (response.status === 401) {
    closeSession();
    throw new Error('Tu sesión terminó. Vuelve a iniciar sesión.');
  }
  if (!response.ok || !data?.ok) throw new Error(data?.mensaje || 'No fue posible consultar la información.');
  return data;
}

async function load() {
  grid.setAttribute('aria-busy', 'true');
  try {
    const [catalog, account] = await Promise.all([request('/cursos'), request('/inscripciones/mias')]);
    const enrolled = new Set((account.inscripciones || []).filter((item) => item.estado !== 'cancelada').map((item) => String(item.id_curso)));
    courses = (catalog.cursos || []).map((course) => ({ ...course, ya_inscrito: enrolled.has(String(course.id_curso)) }));

    document.querySelector('#available-count').textContent = courses.filter((course) => !course.oferta_provisional && !course.cupo_lleno && !course.ya_inscrito).length;
    document.querySelector('#enrolled-count').textContent = enrolled.size;
    catalogFilters.update(courses);
  } catch (error) {
    message.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor. Intenta nuevamente.' : error.message;
    grid.innerHTML = '<div class="catalog-empty"><strong>No pudimos cargar el catálogo.</strong><p>Actualiza la página en unos momentos.</p></div>';
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

document.querySelector('#logout').addEventListener('click', closeSession);
setupAccount();
load();
