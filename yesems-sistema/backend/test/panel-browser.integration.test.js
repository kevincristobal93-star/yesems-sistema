const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startBrowser } = require('./helpers/browser-client');

const enabled = process.env.YES_EMS_ISOLATED_TEST === '1'
  && process.env.NODE_ENV === 'test'
  && process.env.TEST_DATABASE_URL
  && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL;
const integration = enabled ? describe : describe.skip;

// Run through scripts/test-integration.js. No implicit .env database access.
integration('Paneles reales en Edge: plan, avance y constancia (base aislada)', () => {
  let pool;
  let server;
  let browser;
  let origin;
  let artifacts;
  let fixture;
  const tag = crypto.randomBytes(5).toString('hex');

  async function authPage(page, account, admin = false) {
    await browser.navigate(`${origin}/__browser_setup`);
    await browser.evaluate(`(() => {
      localStorage.clear();
      localStorage.setItem(${JSON.stringify(admin ? 'yesems_admin_token' : 'yesems_token')}, ${JSON.stringify(account.token)});
      localStorage.setItem(${JSON.stringify(admin ? 'yesems_administrador' : 'yesems_usuario')}, ${JSON.stringify(JSON.stringify(account.user))});
    })()`);
    await browser.navigate(`${origin}/${page}`);
  }

  async function trackingReady() {
    await browser.waitFor("document.querySelector('#seguimiento')?.getAttribute('aria-busy') === 'false'", 'tracking idle');
    const error = await browser.evaluate("document.querySelector('#tracking-message[data-error=\"true\"]')?.textContent || document.querySelector('#tracking-student-message[data-error=\"true\"]')?.textContent");
    if (error) throw new Error(error);
  }

  async function panelReady() {
    await browser.waitFor("document.querySelector('#inscription-list')?.getAttribute('aria-busy') === 'false' && document.querySelector('#panel-message')?.hidden", 'student data loaded');
  }

  async function screenshot(name) {
    const bytes = await browser.screenshot(path.join(artifacts, `${name}.png`));
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.length).toBeGreaterThan(1000);
  }

  async function assertNoPageOverflow() {
    const sizes = await browser.evaluate('({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth })');
    expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1);
    expect(sizes.body).toBeLessThanOrEqual(sizes.viewport + 1);
  }

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/yesems_progress_test'
      || !process.env.TEST_UPLOADS_DIR || !process.env.TEST_PG_DATA_DIR?.includes('yesems-progress-test-')) {
      throw new Error('Browser integration requires the isolated PostgreSQL test runner.');
    }
    pool = require('../src/config/db');
    await require('../src/config/run-migrations').runStartupMigrations();
    const category = (await pool.query('INSERT INTO categorias (nombre) VALUES ($1) RETURNING id_categoria', [`Browser ${tag}`])).rows[0];
    const admin = (await pool.query('INSERT INTO administradores (nombre,apellido,email,password_hash) VALUES ($1,$2,$3,$4) RETURNING id_administrador,nombre,apellido,email', ['Admin', 'Prueba navegador', `browser-admin-${tag}@example.test`, 'not-a-real-password-hash'])).rows[0];
    const student = (await pool.query("INSERT INTO usuarios (nombre,apellido,email,rol,folio) VALUES ($1,$2,$3,'alumno',$4) RETURNING id_usuario,nombre,apellido,email,rol,folio", ['Alumna', 'Prueba navegador', `browser-student-${tag}@example.test`, `BROWSER-${tag}`])).rows[0];
    const other = (await pool.query("INSERT INTO usuarios (nombre,apellido,email,rol) VALUES ($1,$2,$3,'alumno') RETURNING id_usuario,nombre,apellido,email,rol", ['Otro', 'Alumno navegador', `browser-other-${tag}@example.test`])).rows[0];
    const course = (await pool.query('INSERT INTO cursos (id_categoria,nombre,descripcion,duracion_horas,precio,cupo) VALUES ($1,$2,$3,4,500,10) RETURNING id_curso,nombre', [category.id_categoria, `Curso navegador ${tag}`, 'Sesiones y actividades de prueba; no contiene alumnos reales.'])).rows[0];
    const inactive = (await pool.query('INSERT INTO cursos (id_categoria,nombre,duracion_horas,precio,cupo,activo) VALUES ($1,$2,4,0,10,false) RETURNING id_curso', [category.id_categoria, `Curso histórico ${tag}`])).rows[0];
    const enrollment = (await pool.query("INSERT INTO inscripciones (id_usuario,id_curso,estado,monto_total) VALUES ($1,$2,'confirmada',500) RETURNING id_inscripcion", [student.id_usuario, course.id_curso])).rows[0];
    await pool.query("INSERT INTO pagos (id_inscripcion,monto,metodo_pago,estado,referencia) VALUES ($1,500,'efectivo','completado','Pago solo de prueba browser')", [enrollment.id_inscripcion]);
    const jwt = require('jsonwebtoken');
    fixture = {
      admin: { user: admin, token: jwt.sign({ id_administrador: admin.id_administrador }, process.env.JWT_SECRET, { expiresIn: '15m' }) },
      student: { user: student, token: jwt.sign({ id_usuario: student.id_usuario, rol: 'alumno' }, process.env.JWT_SECRET, { expiresIn: '15m' }) },
      other: { user: other, token: jwt.sign({ id_usuario: other.id_usuario, rol: 'alumno' }, process.env.JWT_SECRET, { expiresIn: '15m' }) },
      course, inactive, enrollment,
    };
    const express = require('express');
    const host = express();
    host.get('/__browser_setup', (_req, res) => res.type('html').send('<!doctype html><html><body>Prueba aislada</body></html>'));
    host.use(require('../src/app'));
    host.use(express.static(path.resolve(__dirname, '../../frontend')));
    server = await new Promise((resolve) => { const handle = host.listen(0, '127.0.0.1', () => resolve(handle)); });
    origin = `http://127.0.0.1:${server.address().port}`;
    artifacts = process.env.TEST_BROWSER_ARTIFACTS_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'yesems-browser-evidence-'));
    browser = await startBrowser(origin);
  }, 60000);

  afterAll(async () => {
    try { if (browser) await browser.close(); }
    finally {
      if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
      if (pool) await pool.end();
    }
    if (artifacts) console.log(`Capturas de prueba (solo datos ficticios): ${artifacts}`);
  }, 30000);

  test('administrador define el porcentaje, agrega dos actividades y publica el plan', async () => {
    await authPage('admin.html', fixture.admin, true);
    await trackingReady();
    expect(await browser.evaluate(`Boolean(document.querySelector('#tracking-course option[value="${fixture.inactive.id_curso}"]'))`)).toBe(true);
    await browser.fill('#tracking-course', fixture.course.id_curso);
    await trackingReady();
    expect(await browser.evaluate("document.querySelector('#tracking-threshold').value")).toBe('');
    expect(await browser.evaluate("document.querySelector('#tracking-publish').disabled")).toBe(true);
    await browser.fill('#tracking-threshold', 50);
    await browser.click('#tracking-rule-save');
    await trackingReady();
    for (const [title, type, mode] of [['Sesión de práctica', 'sesion', 'presencial'], ['Actividad aplicada', 'actividad', 'en_linea']]) {
      await browser.fill('#tracking-activity-name', title);
      await browser.fill('#tracking-activity-type', type);
      await browser.fill('#tracking-activity-mode', mode);
      await browser.click('#tracking-activity-save');
      await trackingReady();
    }
    expect(await browser.evaluate("document.querySelectorAll('#tracking-activities h5').length")).toBe(2);
    await browser.click('#tracking-publish');
    await trackingReady();
    expect(await browser.evaluate("document.querySelector('#tracking-plan-status').textContent")).toBe('Plan publicado');
    expect(await browser.evaluate("document.querySelector('#tracking-threshold').disabled")).toBe(true);
    fixture.activities = (await pool.query('SELECT id_actividad FROM curso_actividades WHERE id_curso=$1 AND activa=true ORDER BY orden', [fixture.course.id_curso])).rows.map((row) => row.id_actividad);
    expect(fixture.activities).toHaveLength(2);
  }, 60000);

  test('registra cumplimiento real, preserva otra edición pendiente y concluye con 50% sin inventar 100%', async () => {
    await browser.click('#tracking-students button');
    await trackingReady();
    expect(await browser.evaluate("document.querySelector('#tracking-conclude').disabled")).toBe(true);
    const prefix = fixture.enrollment.id_inscripcion;
    await browser.fill(`#tracking-note-${prefix}-${fixture.activities[1]}`, 'Nota pendiente de guardar');
    await browser.click(`#tracking-check-${prefix}-${fixture.activities[0]}`);
    await browser.click('#tracking-attendance form:first-child button');
    await trackingReady();
    expect(await browser.evaluate(`document.querySelector('#tracking-note-${prefix}-${fixture.activities[1]}').value`)).toBe('Nota pendiente de guardar');
    expect(await browser.evaluate("document.querySelector('#tracking-conclude').disabled")).toBe(true);
    await browser.fill(`#tracking-note-${prefix}-${fixture.activities[1]}`, '');
    expect(await browser.evaluate("document.querySelector('#tracking-student-summary').textContent")).toContain('50%');
    expect(await browser.evaluate("document.querySelector('#tracking-student-summary').textContent")).toContain('1 de 2');
    expect(await browser.evaluate("document.querySelector('#tracking-conclude').disabled")).toBe(false);
    await browser.click('#tracking-conclude');
    await trackingReady();
    expect(await browser.evaluate("document.querySelector('#tracking-student-summary').textContent")).toContain('50%');
    expect(await browser.evaluate("document.querySelector('#tracking-conclude').textContent")).toBe('Conclusión ya validada');
    expect(await browser.evaluate("document.querySelector('#tracking-reopen').disabled")).toBe(true);
    expect(await browser.evaluate("document.querySelector('#tracking-attendance fieldset').disabled")).toBe(true);
    const saved = (await pool.query('SELECT estado,concluida_at,concluida_por FROM inscripciones WHERE id_inscripcion=$1', [prefix])).rows[0];
    expect(saved.estado).toBe('completada');
    expect(saved.concluida_por).toBe(fixture.admin.user.id_administrador);
    expect(saved.concluida_at).not.toBeNull();
    await browser.viewport(1440, 1000);
    await browser.evaluate("document.querySelector('#tracking-student-detail').scrollIntoView({block:'start',behavior:'instant'})");
    await assertNoPageOverflow();
    await screenshot('admin-avance-desktop');
    await browser.viewport(390, 844);
    await assertNoPageOverflow();
    await screenshot('admin-avance-mobile');
  }, 60000);

  test('alumno muestra 1 de 2 y 50%, puede solicitar constancia y otro alumno no ve esos datos', async () => {
    await browser.viewport(1440, 1000);
    await authPage('panel.html', fixture.student);
    await panelReady();
    const card = `#inscripcion-${fixture.enrollment.id_inscripcion}`;
    expect(await browser.evaluate(`document.querySelector('${card} [role="progressbar"]').getAttribute('aria-valuenow')`)).toBe('50');
    expect(await browser.evaluate(`document.querySelector('${card}').textContent`)).toContain('1 de 2 cumplidas');
    expect(await browser.evaluate(`Boolean(document.querySelector('${card} [data-request]'))`)).toBe(true);
    await browser.evaluate(`document.querySelector('${card} details').open = true; document.querySelector('${card}').scrollIntoView({block:'start',behavior:'instant'})`);
    await assertNoPageOverflow();
    await screenshot('alumno-avance-desktop');
    await browser.viewport(390, 844);
    await assertNoPageOverflow();
    await screenshot('alumno-avance-mobile');
    await browser.click(`${card} [data-request]`);
    await browser.waitFor(`document.querySelector('${card}')?.textContent.includes('Constancia en revisión')`, 'certificate requested');
    const request = (await pool.query('SELECT id_constancia,estado FROM constancias WHERE id_inscripcion=$1', [fixture.enrollment.id_inscripcion])).rows[0];
    expect(request.estado).toBe('pendiente');
    fixture.certificateId = request.id_constancia;
    await authPage('panel.html', fixture.other);
    await panelReady();
    expect(await browser.evaluate(`Boolean(document.querySelector('${card}'))`)).toBe(false);
    expect(await browser.evaluate("document.querySelector('#summary-courses').textContent")).toBe('0');
    expect(await browser.evaluate("document.querySelector('#featured-course').textContent")).toContain('Aún no tienes');
  }, 60000);

  test('administrador autoriza solicitud del alumno y el PDF real se descarga con su permiso', async () => {
    await authPage('admin.html', fixture.admin, true);
    await browser.waitFor(`Boolean(document.querySelector('[data-certificate="${fixture.certificateId}"][data-certificate-action="autorizar"]'))`, 'pending certificate visible');
    await browser.click(`[data-certificate="${fixture.certificateId}"][data-certificate-action="autorizar"]`);
    await browser.waitFor(`Boolean(document.querySelector('[data-certificate-download="${fixture.certificateId}"]'))`, 'certificate authorized', 25000);
    await authPage('panel.html', fixture.student);
    await panelReady();
    expect(await browser.evaluate(`Boolean(document.querySelector('[data-download="${fixture.certificateId}"]'))`)).toBe(true);
    const response = await fetch(`${origin}/api/constancias/mia/${fixture.certificateId}/descargar`, { headers: { Authorization: `Bearer ${fixture.student.token}` }, signal: AbortSignal.timeout(15000) });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(browser.errors).toEqual([]);
    expect(browser.requests.filter((request) => request.status >= 400)).toEqual([]);
  }, 60000);
});
