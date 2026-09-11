const API_URL = 'http://127.0.0.1:4000/api';
const grid = document.querySelector('#course-grid');
const message = document.querySelector('#catalog-message');
const count = document.querySelector('#course-count');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
let courses = [];

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function valueOr(value, fallback) {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function renderCourses() {
  const query = search.value.trim().toLocaleLowerCase('es-MX');
  const selectedCategory = category.value;
  const filtered = courses.filter((course) => {
    const text = `${course.nombre || ''} ${course.descripcion || ''}`.toLocaleLowerCase('es-MX');
    return text.includes(query) && (!selectedCategory || course.categoria === selectedCategory);
  });

  count.textContent = `${filtered.length} ${filtered.length === 1 ? 'curso disponible' : 'cursos disponibles'}`;
  message.textContent = filtered.length ? '' : 'No encontramos cursos que coincidan con tu búsqueda.';
  grid.innerHTML = filtered.map((course) => `
    <article class="course-card">
      <p class="course-category">${valueOr(course.categoria, 'Capacitación')}</p>
      <h3>${valueOr(course.nombre, 'Curso sin nombre')}</h3>
      <p class="course-description">${valueOr(course.descripcion, 'Consulta los detalles de este curso con nuestro equipo.')}</p>
      <div class="course-data">
        <span>${valueOr(course.duracion_horas, '—')} horas</span>
        <span>${valueOr(course.cupo, '—')} lugares</span>
      </div>
      <p class="course-price">${course.precio === null || course.precio === undefined ? 'Costo por confirmar' : money.format(Number(course.precio))}</p>
      <a class="enroll-button" href="./registro.html?curso=${encodeURIComponent(course.id_curso)}">Quiero inscribirme</a>
    </article>
  `).join('');
}

async function loadCourses() {
  try {
    const response = await fetch(`${API_URL}/cursos`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el catálogo.');

    courses = data.cursos || [];
    const categories = [...new Set(courses.map((course) => course.categoria).filter(Boolean))].sort();
    category.insertAdjacentHTML('beforeend', categories.map((item) => `<option value="${item}">${item}</option>`).join(''));
    renderCourses();
  } catch (error) {
    message.textContent = error instanceof TypeError
      ? 'No fue posible conectar con el servidor. Inicia el backend en http://localhost:4000.'
      : error.message;
    count.textContent = '';
  }
}

search.addEventListener('input', renderCourses);
category.addEventListener('change', renderCourses);
document.querySelector('#current-year').textContent = new Date().getFullYear();
loadCourses();
