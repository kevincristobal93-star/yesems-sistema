// Prueba visual opcional. API simulada en loopback; no usa PostgreSQL ni Render.
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { startBrowser } = require('./helpers/browser-client');
const suite = process.env.YES_EMS_REPORTS_BROWSER_TEST === '1' ? describe : describe.skip;

suite('Reportes administrativos en navegador con datos ficticios', () => {
  let server, browser, origin, artifacts;
  let fail = false;
  const report = {
    generales: { inscripciones_activas: 1, ingresos_confirmados: 0, ingresos_pendientes: 500 },
    por_curso: [{ nombre: 'Curso de prueba', activo: true, inscripciones: 1 }],
    por_mes: ['04', '05', '06', '07', '08', '09'].map((m, i) => ({ periodo: `2026-${m}`, inscripciones: i === 5 ? 1 : 0 })),
  };
  beforeAll(async () => {
    const express = require('express');
    const app = express();
    app.use('/api', (req, res) => {
      if (req.path === '/administradores/reportes') return res.status(fail ? 503 : 200).json(fail ? { ok: false, mensaje: 'Fallo de prueba' } : { ok: true, reportes: report });
      res.json({ ok: true, metricas: { cursos: 0, alumnos: 0, pagos_pendientes: 0, constancias_pendientes: 0 }, ultimas_inscripciones: [], cursos: [], categorias: [], horarios: [], pagos: [], constancias: [] });
    });
    app.get('/setup', (_req, res) => res.send('<html><body>Prueba local</body></html>'));
    app.use(express.static(path.resolve(__dirname, '../../frontend')));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    origin = `http://127.0.0.1:${server.address().port}`;
    artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'yesems-report-preview-'));
    browser = await startBrowser(origin);
    await browser.navigate(`${origin}/setup`);
    await browser.evaluate(`localStorage.setItem('yesems_admin_token', 'solo-prueba-local'); localStorage.setItem('yesems_administrador', JSON.stringify({nombre:'Prueba'}));`);
    await browser.navigate(`${origin}/admin.html`);
    await browser.waitFor("document.querySelector('#reports-updated').textContent.includes('Actualizado')", 'reportes cargados');
  }, 60000);
  afterAll(async () => {
    try { if (browser) await browser.close(); }
    finally { if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); }
    if (artifacts) console.log(`Capturas de reportes con datos ficticios: ${artifacts}`);
  }, 30000);
  test('escritorio muestra seis meses y cero no dibuja una barra positiva', async () => {
    expect(await browser.evaluate("document.querySelectorAll('#month-report .trend-item').length")).toBe(6);
    expect(await browser.evaluate("document.querySelector('#month-report .trend-bar').getBoundingClientRect().height")).toBe(0);
    expect(await browser.evaluate("Math.max(...[...document.querySelectorAll('#month-report .trend-bar')].map(x=>x.getBoundingClientRect().width))")).toBeLessThanOrEqual(38);
    await browser.evaluate("document.querySelector('#reportes').scrollIntoView({block:'start',behavior:'instant'})");
    expect(await browser.evaluate("document.querySelector('#reports-title').getBoundingClientRect().top >= document.querySelector('.admin-topbar').getBoundingClientRect().bottom")).toBe(true);
    await browser.screenshot(path.join(artifacts, 'reportes-desktop.png'));
    expect(browser.errors).toEqual([]);
  });
  test('móvil no desborda horizontalmente', async () => {
    await browser.viewport(390, 844);
    await browser.evaluate("document.querySelector('#reportes').scrollIntoView({block:'start',behavior:'instant'})");
    expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(true);
    await browser.screenshot(path.join(artifacts, 'reportes-mobile.png'));
  });
  test('error visible, valores desconocidos y reintento funcional', async () => {
    fail = true;
    await browser.click('#refresh-reports');
    await browser.waitFor("document.querySelector('#reports-message').textContent.includes('No se pudieron')");
    expect(await browser.evaluate("document.querySelector('#report-confirmed-income').textContent")).toBe('—');
    fail = false;
    await browser.click('#refresh-reports');
    await browser.waitFor("document.querySelector('#reports-message').hidden");
    expect(await browser.evaluate("document.querySelector('#report-active-enrollments').textContent")).toBe('1');
  });
});
