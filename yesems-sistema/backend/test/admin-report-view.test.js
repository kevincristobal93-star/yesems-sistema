const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/admin-report-view.js'), 'utf8');
const view = vm.runInNewContext(`${source}\nAdminReportView;`, {});

test('reportes: meses sin inscripciones conservan altura cero', () => {
  const html = view.months([{ periodo: '2026-01', inscripciones: 0 }, { periodo: '2026-02', inscripciones: 1 }]);
  expect(html).toContain('height:0px');
  expect(html).toContain('height:120px');
  expect(html).not.toContain('NaN');
});
test('reportes: ordena cursos y conserva cantidades sin porcentajes inventados', () => {
  const html = view.courses([{ nombre: 'Primero', inscripciones: 1 }, { nombre: 'Segundo', inscripciones: 2 }]);
  expect(html.indexOf('Segundo')).toBeLessThan(html.indexOf('Primero'));
  expect(html).toContain('width:50%');
  expect(html).toContain('width:100%');
});
test('reportes: sin registros muestra estado vacío, no datos de ejemplo', () => {
  expect(view.courses([])).toContain('Todavía no hay inscripciones');
  expect(view.courses([{ nombre: 'Curso', inscripciones: 0 }])).not.toContain('bar-fill');
  expect(view.months([])).toContain('No hay información mensual');
});
test('reportes: nombres y periodos no se interpretan como HTML', () => {
  expect(view.courses([{ nombre: '<img src=x>', inscripciones: 1 }])).toContain('&lt;img src=x&gt;');
  expect(view.months([{ periodo: '<script>', inscripciones: 1 }])).not.toContain('<script>');
});
test('reportes: identifica cursos inactivos con historial', () => {
  expect(view.courses([{ nombre: 'Anterior', activo: false, inscripciones: 1 }])).toContain('(inactivo)');
});

jest.mock('../src/config/db', () => ({ query: jest.fn() }));
test('consultas de reportes cuentan inscripciones distintas y completan seis meses', async () => {
  const pool = require('../src/config/db');
  pool.query.mockResolvedValue({ rows: [] });
  await require('../src/models/administrador.model').obtenerReportesIniciales();
  const sql = pool.query.mock.calls.map(([query]) => query);
  expect(sql[0]).toContain('COUNT(DISTINCT i.id_inscripcion)');
  expect(sql[1]).toContain('COUNT(DISTINCT i.id_inscripcion)');
  expect(sql[2]).toContain('generate_series');
  expect(sql[2]).toContain("INTERVAL '5 months'");
});
