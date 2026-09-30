const fs = require('fs');
const path = require('path');
const vm = require('vm');

// El frontend es un script clásico del navegador (no un módulo CommonJS).
const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/panel-progreso.js'), 'utf8');
const panel = vm.runInNewContext(`${source}\nPanelProgreso;`, {});
const progress = {
  total: 5, cumplidas: 4, pendientes: 1, porcentaje: 80,
  porcentaje_minimo: 80, plan_publicado: true, conclusion_validada: true,
  puede_solicitar_constancia: true, actividades: [], bloqueos: [],
};

describe('Avance real y requisitos en el panel del alumno', () => {
  test('concluir no convierte 4/5 sesiones en 100%', () => {
    const html = panel.render(progress, 'completada');
    expect(html).toContain('4 de 5 cumplidas');
    expect(html).toContain('1 pendientes');
    expect(html).toContain('aria-valuenow="80"');
    expect(html).not.toContain('aria-valuenow="100"');
  });
  test('sin plan no inventa un porcentaje', () => {
    const html = panel.renderMeter({ ...progress, total: 0, cumplidas: 0, pendientes: 0, porcentaje: 0 });
    expect(html).toContain('Aún no hay sesiones');
    expect(html).not.toContain('progressbar');
  });
  test('sin datos o con conteos incoherentes no muestra una barra', () => {
    expect(panel.renderMeter(null)).not.toContain('progressbar');
    expect(panel.renderMeter({ ...progress, pendientes: 3 })).not.toContain('progressbar');
    expect(panel.renderMeter({ ...progress, porcentaje: 'abc' })).not.toContain('progressbar');
  });
  test('completada histórica no basta para solicitar una constancia', () => {
    expect(panel.canRequest({ estado: 'completada' })).toBe(false);
    const html = panel.render({ ...progress, conclusion_validada: false, puede_solicitar_constancia: false }, 'completada');
    expect(html).toContain('aún falta validar la conclusión');
  });
  test('sólo ofrece solicitar con elegibilidad real y sin otra solicitud', () => {
    expect(panel.canRequest({ progreso: progress })).toBe(true);
    expect(panel.canRequest({ progreso: progress, id_constancia: 1 })).toBe(false);
    expect(panel.canRequest({ progreso: progress, estado_constancia: 'rechazada' })).toBe(false);
    expect(panel.canRequest({ progreso: { ...progress, puede_solicitar_constancia: false } })).toBe(false);
  });
  test('muestra requisito y texto pendiente sin un mínimo predeterminado', () => {
    const html = panel.render({ ...progress, porcentaje_minimo: null, plan_publicado: false, puede_solicitar_constancia: false }, 'confirmada');
    expect(html).toContain('aún debe definir el porcentaje mínimo');
    expect(html).toContain('Plan pendiente de publicación');
  });
  test('escapa actividades, notas y bloqueos del servidor', () => {
    const html = panel.render({ ...progress, puede_solicitar_constancia: false,
      actividades: [{ titulo: '<script>test</script>', observaciones: '<img src=x onerror=test>', cumplida: false }],
      bloqueos: ['<b>Requisito</b>'],
    }, 'confirmada');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Requisito&lt;/b&gt;');
  });
});
