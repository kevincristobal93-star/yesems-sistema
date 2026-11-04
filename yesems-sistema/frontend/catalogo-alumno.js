window.initTeacherCatalog = function (root = document) {
if (root.dataset?.catalogInitialized) return;
if (root.dataset) root.dataset.catalogInitialized = 'true';
const API_URL = 'https://yesems-sistema-1.onrender.com/api';
const token = localStorage.getItem('yesems_token');
let user = null;
try { user = JSON.parse(localStorage.getItem('yesems_usuario') || 'null'); } catch { /* Sesión local inválida. */ }

if (!token || !user) {
  window.location.replace('./cursos.html');
  return;
}

const grid = root.querySelector('#courses');
const message = root.querySelector('#message');
const search = root.querySelector('#search');
const category = root.querySelector('#category');
let courses = [];
let scope = 'all';
let loading = false;
let loaded = false;
const sort = root.querySelector('#sort');
const catalogFilters = ListFilters.attachCatalog({ search, category, modality: root.querySelector('#modality'), chips: root.querySelector('#catalog-chips'), onChange: render });
function resetFilters() {
  scope='all';sort.value='name';
  root.querySelectorAll('[data-scope]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scope===scope)));
  catalogFilters.reset();
}
grid.addEventListener('click', event => {
  if (event.target.closest('[data-clear-catalog]')) resetFilters();
  if (event.target.closest('[data-retry-catalog]')) load();
});
root.querySelector('#reset-filters').addEventListener('click',resetFilters);
sort.addEventListener('change',render);
root.querySelectorAll('[data-scope]').forEach(button=>button.addEventListener('click',()=>{
  scope=button.dataset.scope;
  root.querySelectorAll('[data-scope]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  render();
}));

function closeSession() {
  localStorage.removeItem('yesems_token');
  localStorage.removeItem('yesems_usuario');
  window.location.replace('./cursos.html');
}

function setupAccount() {
  if (!root.querySelector('#student-name')) return;
  const name = (user?.nombre || '').trim();
  const surname = (user?.apellido || '').trim();
  const fullName = (surname && !name.toLocaleLowerCase('es').endsWith(surname.toLocaleLowerCase('es')) ? `${name} ${surname}` : name || surname).trim() || 'Docente YES EMS';
  root.querySelector('#student-name').textContent = fullName;
  root.querySelector('#student-email').textContent = user?.email || '';
  root.querySelector('#student-initial').textContent = fullName.charAt(0).toUpperCase() || 'A';
}

CatalogoView.bindDetails(grid, () => courses, (course) => {
  window.location.href = course.ya_inscrito
    ? './panel.html?vista=inscripciones'
    : `./inscripcion.html?curso=${encodeURIComponent(course.id_curso)}`;
});

function render() {
  if (!loaded || loading) return;
  const filtered = catalogFilters.filter(courses).filter(course=>scope==='enrolled' ? course.ya_inscrito : scope==='available' ? !course.ya_inscrito && !course.oferta_provisional && !course.cupo_lleno && course.activo!==false : true);
  const number = (value) => value===null || value==='' || !Number.isFinite(Number(value)) ? null : Number(value);
  filtered.sort((a,b)=>{
    if(sort.value==='name') return String(a.nombre||'').localeCompare(String(b.nombre||''),'es');
    const key=sort.value==='duration'?'duracion_horas':'precio';
    const x=number(a[key]),y=number(b[key]);
    if(x===null)return y===null?0:1;if(y===null)return -1;
    return sort.value==='price-high'?y-x:x-y;
  });

  message.textContent = filtered.length
    ? `${filtered.length} ${filtered.length === 1 ? 'curso encontrado' : 'cursos encontrados'}`
    : courses.length ? 'No encontramos cursos con esos filtros.' : 'No hay cursos publicados por el momento.';
  grid.innerHTML = filtered.length
    ? filtered.map((course) => CatalogoView.card(course, true)).join('')
    : CatalogoView.emptyState(courses.length > 0);
}

async function request(path) {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => null);
  if (response.status === 401) {
    closeSession();
    throw new Error('Tu sesión terminó. Vuelve a iniciar sesión.');
  }
  if (!response.ok || !data?.ok) throw new Error(data?.mensaje || 'No fue posible consultar la información.');
  return data;
}

async function load() {
  if(loading || !token || !user)return;
  loading=true;loaded=false;
  grid.setAttribute('aria-busy', 'true');
  message.textContent='Consultando cursos e inscripciones…';
  grid.innerHTML='<div class="catalog-loading">Preparando tu catálogo de formación…</div>';
  try {
    const [catalog, account] = await Promise.all([request('/cursos'), request('/inscripciones/mias')]);
    const enrolled = new Set((account.inscripciones || []).filter((item) => item.estado !== 'cancelada').map((item) => String(item.id_curso)));
    courses = (catalog.cursos || []).map((course) => ({ ...course, ya_inscrito: enrolled.has(String(course.id_curso)) }));

    root.querySelector('#available-count').textContent = courses.filter((course) => course.activo !== false && !course.oferta_provisional && !course.cupo_lleno && !course.ya_inscrito).length;
    root.querySelector('#enrolled-count').textContent = enrolled.size;
    loaded=true;
    catalogFilters.update(courses);
  } catch (error) {
    message.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor. Intenta nuevamente.' : error.message;
    if(error.name==='TimeoutError') message.textContent='El servidor está tardando en responder. Vuelve a intentarlo.';
    grid.innerHTML = '<div class="catalog-empty"><strong>No pudimos cargar el catálogo.</strong><p>Tus inscripciones no se han modificado. Puedes intentarlo de nuevo.</p><button type="button" data-retry-catalog>Reintentar</button></div>';
    root.querySelector('#available-count').textContent='—';root.querySelector('#enrolled-count').textContent='—';
  } finally {
    loading=false;
    grid.setAttribute('aria-busy', 'false');
    if(loaded)render();
  }
}

root.querySelector('#logout')?.addEventListener('click', closeSession);
setupAccount();
load();
};
if (document.querySelector('#courses')) window.initTeacherCatalog();
