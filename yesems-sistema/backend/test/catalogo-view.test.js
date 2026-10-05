const { card, details, icon } = require('../../frontend/catalogo-view');
const course = { id_curso: 7, nombre: 'Curso de prueba', descripcion: 'Plus: proyecto práctico', categoria: 'Tecnología', duracion_horas: 32, cupo: 12, precio: '0.00' };

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
