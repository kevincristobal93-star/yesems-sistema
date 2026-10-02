const { card } = require('../../frontend/catalogo-view');
const course = { id_curso: 7, nombre: 'Curso de prueba', descripcion: 'Plus: proyecto práctico', categoria: 'Tecnología', duracion_horas: 32, cupo: 12, precio: '0.00' };

describe.each([false, true])('Catálogo (alumno=%s)', (student) => {
  test('propuesta no anuncia gratuidad ni ofrece inscripción', () => {
    const html = card({ ...course, oferta_provisional: true }, student);
    expect(html).toContain('Costo por confirmar');
    expect(html).toContain('32 horas sugeridas');
    expect(html).toContain('12 personas por grupo sugeridas');
    expect(html).toContain('Solicitar información');
    expect(html).toContain('api.whatsapp.com');
    expect(html).not.toContain('$0.00');
    expect(html).not.toContain('Quiero inscribirme');
    expect(html).not.toContain('inscripcion.html');
    expect(html).not.toContain('data-enroll-course');
  });
  test('oferta validada conserva precio y acceso a inscripción', () => {
    const html = card({ ...course, oferta_provisional: false, precio: '500.00' }, student);
    expect(html).toContain('$500.00');
    expect(html).toContain('Quiero inscribirme');
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
