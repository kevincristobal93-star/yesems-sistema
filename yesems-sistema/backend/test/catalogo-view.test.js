const { card, details, icon } = require('../../frontend/catalogo-view');
const course = { id_curso: 7, nombre: 'Curso de prueba', descripcion: 'Plus: proyecto práctico', categoria: 'Tecnología', duracion_horas: 32, cupo: 12, precio: '0.00' };

test('la portada utiliza la galería pública y escapa su título', () => {
  const html = card({ ...course, imagenes_publicas: [null, { id_imagen: -1 }, { id_imagen: 9, titulo: 'Vista "especial"' }] });
  expect(html).toContain('class="course-cover-photo"');
  expect(html).toContain('/api/cursos/7/imagenes/9');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('Vista &quot;especial&quot;');
  expect(card(course)).toContain('class="course-cover-initial"');
  expect(card(course)).not.toContain('<img');
});

test.each([undefined, null, '', false, -1, 'abc', 15])('no inventa barra ni urgencia con disponibilidad inválida: %s', lugares_disponibles => {
  const html = card({ ...course, lugares_disponibles });
  expect(html).not.toContain('<meter');
  expect(html).not.toContain('Últimos lugares');
  expect(html).not.toContain('Nuevo');
});

test('barra real, sin urgencia cuando está lleno ni cuando el control está desactivado', () => {
  const limited = { ...course, lugares_disponibles: 2, es_nuevo: true };
  expect(card(limited)).toContain('<meter min="0" max="12" value="2">');
  expect(card(limited)).toContain('Últimos lugares');
  expect(card(limited)).toContain('Nuevo');
  for (const extra of [{control_cupo:false}, {cupo_confirmado:false}, {oferta_provisional:true}, {cupo:null}]) {
    expect(card({...limited,...extra})).not.toContain('<meter');
    expect(card({...limited,...extra})).not.toContain('Últimos lugares');
  }
  expect(card({...limited,lugares_disponibles:0,cupo_lleno:true})).not.toContain('Últimos lugares');
});

test('estado vacío ilustrado distingue catálogo vacío de búsqueda sin coincidencias', () => {
  const { emptyState } = require('../../frontend/catalogo-view');
  expect(emptyState()).toContain('<svg');
  expect(emptyState()).toContain('Todavía no hay cursos publicados');
  expect(emptyState()).not.toContain('data-clear-catalog');
  expect(emptyState(true)).toContain('data-clear-catalog');
});

test('sin control de cupo no muestra valores históricos ni disponibilidad pendiente', () => {
  const unlimited = { ...course, control_cupo: false, cupo_lleno: false, cupo_confirmado: false };
  expect(card(unlimited)).not.toContain('Cupo por confirmar');
  expect(details(unlimited)).not.toContain('<dt>Cupo');
  expect(details(unlimited)).toContain('Quiero inscribirme');
});

describe.each([false, true])('Catálogo (alumno=%s)', (student) => {
  test('propuesta no anuncia gratuidad ni ofrece inscripción', () => {
    const html = card({ ...course, oferta_provisional: true }, student);
    expect(html).toContain('Costo por confirmar');
    expect(html).toContain('32 horas sugeridas');
    expect(html).toContain('12 personas por grupo sugeridas');
    expect(html).toContain('Ver más información');
    expect(html).toContain('data-course-details="7"');
    expect(html).not.toContain('api.whatsapp.com');
    expect(html).not.toContain('$0.00');
    expect(html).not.toContain('Quiero inscribirme');
    expect(html).not.toContain('inscripcion.html');
    expect(html).not.toContain('data-enroll-course');
  });
  test('oferta validada conserva precio y acceso a inscripción', () => {
    const html = card({ ...course, oferta_provisional: false, precio: '500.00' }, student);
    expect(html).toContain('$500.00');
    expect(html).toContain('Ver más información');
    expect(details({ ...course, oferta_provisional: false })).toContain('Quiero inscribirme');
    expect(html).not.toContain('Propuesta ·');
  });
  test('un curso gratuito validado sigue mostrando su precio real', () => {
    expect(card(course, student)).toContain('$0.00');
  });
  test('escapa texto proveniente de la API', () => {
    const html = card({ ...course, nombre: '<img onerror=alert(1)>', descripcion: '<script>bad()</script>' }, student);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
  });
});

test('el detalle conserva todo el texto y separa el plus sin inventar contenido', () => {
  const html = details({ ...course, descripcion: 'Contenido inicial completo. Plus: Proyecto final y costos.', oferta_provisional: true });
  expect(html).toContain('Contenido inicial completo.');
  expect(html).toContain('Proyecto final y costos.');
  expect(html).toContain('El plus de tu capacitación');
  expect(html).toContain('Inscripciones aún no abiertas');
  expect(html).not.toContain('data-detail-enroll');
  expect(html).not.toContain('$0.00');
});
test('el detalle también escapa contenido no confiable', () => {
  expect(details({ ...course, nombre: '<script>x</script>', descripcion: 'Plus: <img onerror=bad()>' })).not.toMatch(/<script>|<img/);
});

test('la ficha del catálogo separa imágenes públicas y materiales privados', () => {
  const html = details({ ...course, imagenes_publicas: [{ id_imagen: 11, titulo: 'Vista del proyecto' }] });
  expect(html).toContain('course-detail-layout');
  expect(html).toContain('/api/cursos/7/imagenes/11');
  expect(html).toContain('Vista del proyecto');
  expect(html).toContain('PDF y materiales de estudio');
  expect(html).toContain('dentro del aula virtual');
  expect(details(course)).toContain('course-detail-placeholder');
});

test('muestra lugares reales y bloquea la acción cuando el cupo está lleno', () => {
  expect(card({ ...course, lugares_disponibles: 3 })).toContain('3 lugares disponibles');
  expect(card({ ...course, lugares_disponibles: 1 })).toContain('1 lugar disponible');
  const full = details({ ...course, oferta_provisional: false, cupo_lleno: true, lugares_disponibles: 0 });
  expect(full).toContain('Cupo lleno');
  expect(full).toContain('no hay lugares disponibles');
  expect(full).not.toContain('data-detail-enroll');
});

test('el catálogo del alumno reconoce una inscripción existente', () => {
  const enrolled = { ...course, oferta_provisional: false, ya_inscrito: true, cupo_lleno: true };
  expect(card(enrolled, true)).toContain('Ya estás inscrito');
  const html = details(enrolled);
  expect(html).toContain('Ver mi inscripción');
  expect(html).not.toContain('Por el momento no hay lugares disponibles');
});

test.each(['Reparación de celulares', 'Sublimación y diseño (crea tu marca)', 'Corte y grabado láser', 'Impresión 3D'])('tarifa y duración actualizadas: %s', (nombre) => {
  const updated = { ...course, nombre, oferta_provisional: false, precio: 1000, duracion_horas: 60, duracion_aproximada: true, cupo_confirmado: false };
  for (const html of [card(updated), card(updated, true), details(updated)]) {
    expect(html).toContain('$1,000.00');
    expect(html).toContain('60 horas aproximadamente');
    expect(html).not.toContain('4 semanas');
    expect(html).not.toContain('$1,200.00');
    expect(html).not.toContain('clase individual');
    expect(html).not.toContain('$100.00');
  }
  expect(details(updated)).toContain('es necesario estar inscrito al curso completo');
});
test.each([['Reparación de celulares', 'phone'], ['Sublimación y diseño', 'shirt'], ['Corte y grabado láser', 'laser'], ['Impresión 3D', 'printer']])('icono de %s', (nombre, type) => {
  expect(icon({ nombre })).toContain(`data-icon="${type}"`);
  expect(icon({ nombre })).toContain('aria-hidden="true"');
});
