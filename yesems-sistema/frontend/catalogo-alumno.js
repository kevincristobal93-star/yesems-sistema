const API_URL = 'https://yesems-sistema-1.onrender.com/api';
const token = localStorage.getItem('yesems_token');
const user = JSON.parse(localStorage.getItem('yesems_usuario') || 'null');

if (!token || !user) window.location.replace('./cursos.html');

const grid = document.querySelector('#courses');
const message = document.querySelector('#message');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
let courses = [];

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
  const query = search.value.trim().toLocaleLowerCase('es-MX');
  const filtered = courses.filter((course) => {
    const content = `${course.nombre || ''} ${course.descripcion || ''}`.toLocaleLowerCase('es-MX');
    return content.includes(query) && (!category.value || course.categoria === category.value);
  });

  message.textContent = filtered.length
    ? `${filtered.length} ${filtered.length === 1 ? 'curso encontrado' : 'cursos encontrados'}`
    : 'No encontramos cursos con esos filtros.';
  grid.innerHTML = filtered.length
    ? filtered.map((course) => CatalogoView.card(course, true)).join('')
    : '<div class="catalog-empty"><strong>No hay coincidencias.</strong><p>Prueba con otra palabra o selecciona todas las categorías.</p></div>';
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

    [...new Set(courses.map((item) => item.categoria).filter(Boolean))].sort().forEach((item) => {
      category.insertAdjacentHTML('beforeend', `<option value="${CatalogoView.escapeHtml(item)}">${CatalogoView.escapeHtml(item)}</option>`);
    });
    document.querySelector('#available-count').textContent = courses.filter((course) => !course.oferta_provisional && !course.cupo_lleno && !course.ya_inscrito).length;
    document.querySelector('#enrolled-count').textContent = enrolled.size;
    render();
  } catch (error) {
    message.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor. Intenta nuevamente.' : error.message;
    grid.innerHTML = '<div class="catalog-empty"><strong>No pudimos cargar el catálogo.</strong><p>Actualiza la página en unos momentos.</p></div>';
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

search.addEventListener('input', render);
category.addEventListener('change', render);
document.querySelector('#logout').addEventListener('click', closeSession);
setupAccount();
load();
