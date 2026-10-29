// Prueba de interfaz local: intercepta API y bloquea conexiones externas.
const express = require('express');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startBrowser } = require('../test/helpers/browser-client');

(async () => {
  const courses = [
    ['Reparación de celulares', 32, 12], ['Sublimación y diseño (crea tu marca)', 24, 12],
    ['Corte y grabado láser', 24, 10], ['Impresión 3D', 32, 10],
  ].map(([nombre, duracion_horas, cupo], i) => ({ id_curso: i + 1, nombre, duracion_horas, cupo, precio: 0, activo: true, oferta_provisional: true, categoria: 'Tecnología y emprendimiento', descripcion: 'Propuesta inicial. Plus: proyecto práctico con cálculo de costos.' }));
  courses.push({ id_curso: 5, nombre: 'Curso validado de prueba', duracion_horas: 20, cupo: 25, precio: 500, activo: true, oferta_provisional: false });
  courses.slice(0,4).forEach(course => { course.modalidad = 'Presencial'; });
  Object.assign(courses[4], { categoria: 'Artes', modalidad: 'Virtual', lugares_disponibles: 2, es_nuevo: true, imagenes_publicas: [{id_imagen:1,titulo:'Proyecto del curso'}] });
  courses[2].imagenes_publicas = [{id_imagen:99,titulo:'Imagen no disponible'}];
  const app = express();
  let failCatalog = false;
  app.get('/api/cursos', (_req, res) => failCatalog ? res.status(503).json({ ok: false, mensaje: 'Prueba de indisponibilidad' }) : res.json({ ok: true, cursos: courses }));
  app.get('/api/cursos/5/imagenes/1', (_req, res) => res.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#176b87"/><circle cx="320" cy="180" r="100" fill="#f5b942"/></svg>'));
  app.get('/api/cursos/:id', (req, res) => res.json({ ok: true, curso: courses.find(c => c.id_curso === Number(req.params.id)) }));
  app.get('/api/cursos/:id/disponibilidades', (_req, res) => res.json({ ok: true, disponibilidades: [] }));
  app.get('/api/acceso/config', (_req, res) => res.json({ ok: true, correo: false, google_client_id: null }));
  app.get('/api/usuarios/mio', (_req, res) => res.json({ ok: true, usuario: { nombre: 'Alumno', apellido: 'Prueba' } }));
  app.get('/api/inscripciones/mias', (_req, res) => res.json({ ok: true, inscripciones: [] }));
  app.use(express.static(path.resolve(__dirname, '../../frontend')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await startBrowser(origin);
    await browser.navigate(origin + '/cursos.html');
    await browser.waitFor("document.querySelectorAll('.course-card').length===5");
    assert.equal(await browser.evaluate("document.querySelectorAll('.proposal-badge').length"), 4);
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-course-details]').length"), 5);
    assert.equal(await browser.evaluate("document.querySelectorAll('.course-cover-initial').length"), 5);
    assert.equal(await browser.evaluate("document.querySelectorAll('.course-cover-photo').length"), 2);
    assert.equal(await browser.evaluate("document.querySelectorAll('.course-capacity meter').length"), 1);
    await browser.evaluate("document.querySelector('[data-course-details=\"3\"]').scrollIntoView()");
    await browser.waitFor("document.querySelector('.course-cover-photo[src*=\"/99\"]').hidden");
    await browser.click('[data-filter-chip="category"][data-value="Artes"]');
    assert.equal(await browser.evaluate("document.querySelector('#category').value"), 'Artes');
    assert.equal(await browser.evaluate("document.querySelectorAll('.course-card').length"), 1);
    await browser.waitFor("document.querySelector('.course-cover-photo').naturalWidth > 0");
    await browser.click('[data-filter-chip="modality"][data-value="Presencial"]');
    assert.equal(await browser.evaluate("Boolean(document.querySelector('.catalog-empty svg'))"), true);
    await browser.click('[data-clear-catalog]');
    assert.equal(await browser.evaluate("document.querySelectorAll('.course-card').length"), 5);
    await browser.evaluate("document.querySelector('#category').value='Artes';document.querySelector('#category').dispatchEvent(new Event('change'))");
    assert.equal(await browser.evaluate("document.querySelector('[data-filter-chip=\"category\"][data-value=\"Artes\"]').getAttribute('aria-pressed')"), 'true');
    await browser.fill('#search','sin coincidencias');
    await browser.click('[data-clear-catalog]');
    await browser.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await browser.evaluate("document.querySelector('.catalog-tile').scrollIntoView({block:'center'})");
    await browser.evaluate("document.querySelector('[data-course-details]').focus()");
    await browser.waitFor("getComputedStyle(document.querySelector('.catalog-tile')).transform==='matrix(1, 0, 0, 1, 0, -5)'");
    await browser.waitFor("getComputedStyle(document.querySelector('.course-more-button span')).transform==='matrix(1, 0, 0, 1, 5, 0)'");
    let evidence;
    if (process.argv.includes('--screenshots')) {
      evidence = await require('node:fs/promises').mkdtemp(path.join(require('node:os').tmpdir(), 'yesems-catalog-preview-'));
      await browser.screenshot(path.join(evidence, 'catalogo.png'));
    }
    await browser.click('[data-course-details="1"]');
    await browser.waitFor("document.querySelector('.course-detail-dialog')?.open");
    assert.equal(await browser.evaluate("document.querySelector('#course-detail-title').textContent"), 'Reparación de celulares');
    assert.equal(await browser.evaluate("document.querySelector('.course-detail-plus').textContent.includes('proyecto práctico con cálculo de costos.')"), true);
    assert.equal(await browser.evaluate("document.querySelector('[data-detail-enroll]')===null"), true);
    if (evidence) await browser.screenshot(path.join(evidence, 'detalle.png'));
    await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await browser.waitFor("!document.querySelector('.course-detail-dialog').open");
    assert.equal(await browser.evaluate("document.activeElement.dataset.courseDetails"), '1');
    await browser.evaluate("document.querySelector('#search').value='láser';document.querySelector('#search').dispatchEvent(new Event('input'))");
    assert.equal(await browser.evaluate("document.querySelectorAll('.course-card').length"), 1);
    await browser.viewport(390, 844);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    await browser.evaluate("localStorage.setItem('yesems_token','prueba-local');localStorage.setItem('yesems_usuario',JSON.stringify({nombre:'Alumno',apellido:'Prueba'}))");
    await browser.navigate(origin + '/catalogo-alumno.html');
    await browser.waitFor("document.querySelectorAll('.card').length===5");
    assert.equal(await browser.evaluate("document.querySelector('#catalog-title').textContent"), 'Tu siguiente paso como docente.');
    assert.equal(await browser.evaluate("document.querySelector('#student-name').textContent"), 'Alumno Prueba');
    assert.equal(await browser.evaluate("document.querySelector('#available-count').textContent"), '1');
    await browser.click('[data-scope="available"]');
    assert.equal(await browser.evaluate("document.querySelectorAll('.card').length"), 1);
    await browser.click('[data-scope="enrolled"]');
    assert.equal(await browser.evaluate("Boolean(document.querySelector('.catalog-empty'))"), true);
    await browser.click('#reset-filters');
    await browser.evaluate("document.querySelector('#sort').value='price-high';document.querySelector('#sort').dispatchEvent(new Event('change'))");
    assert.equal(await browser.evaluate("document.querySelector('[data-course-details]').dataset.courseDetails"), '5');
    await browser.click('#reset-filters');
    assert.equal(await browser.evaluate("document.querySelectorAll('.proposal-badge').length"), 4);
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-course-details]').length"), 5);
    await browser.click('[data-filter-chip="modality"][data-value="Virtual"]');
    assert.equal(await browser.evaluate("document.querySelectorAll('.card').length"), 1);
    await browser.fill('#search','sin coincidencias');
    await browser.click('[data-clear-catalog]');
    assert.equal(await browser.evaluate("document.querySelectorAll('.card').length"), 5);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    if (evidence) await browser.screenshot(path.join(evidence, 'catalogo-alumno-movil.png'));
    await browser.click('[data-course-details="3"]');
    await browser.waitFor("document.querySelector('.course-detail-dialog')?.open");
    assert.equal(await browser.evaluate("document.querySelector('#course-detail-title').textContent"), 'Corte y grabado láser');
    assert.equal(await browser.evaluate("document.querySelector('.course-detail-dialog').scrollWidth <= document.querySelector('.course-detail-dialog').clientWidth + 1"), true);
    assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.catalog-tile')).animationName"), 'none');
    if (evidence) { await browser.screenshot(path.join(evidence, 'movil.png')); console.log('Capturas locales: ' + evidence); }
    await browser.click('[data-close-details]');
    await browser.click('[data-course-details="5"]');
    await browser.click('[data-detail-enroll]');
    await browser.waitFor("location.pathname==='/inscripcion.html'");
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    await browser.navigate(origin + '/inscripcion.html?curso=1');
    await browser.waitFor("document.querySelector('#enrollment-form')?.hidden===true");
    assert.equal(await browser.evaluate("document.querySelector('#course-price').textContent"), 'Por confirmar');
    await browser.navigate(origin + '/inscripcion.html?curso=5');
    await browser.waitFor("document.querySelector('#course-content')?.hidden===false");
    assert.equal(await browser.evaluate("document.querySelector('#enrollment-form').hidden"), false);
    courses.forEach(course => { delete course.modalidad; course.control_cupo = false; });
    await browser.navigate(origin + '/catalogo-alumno.html');
    await browser.waitFor("document.querySelectorAll('.card').length===5");
    assert.equal(await browser.evaluate("document.querySelector('#modality').disabled"), true);
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-filter-chip=\"modality\"]').length"), 0);
    assert.equal(await browser.evaluate("document.querySelectorAll('.course-capacity meter').length"), 0);
    failCatalog = true;
    await browser.navigate(origin + '/catalogo-alumno.html');
    await browser.waitFor("Boolean(document.querySelector('[data-retry-catalog]'))");
    assert.equal(await browser.evaluate("document.querySelector('#available-count').textContent"), '—');
    failCatalog = false;
    await browser.click('[data-retry-catalog]');
    await browser.waitFor("document.querySelectorAll('.card').length===5");
    await browser.viewport(1440, 900);
    await browser.evaluate('window.scrollTo(0,0)');
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    assert.equal(await browser.evaluate("document.querySelector('.student-hero').getBoundingClientRect().height < 400"), true);
    if (evidence) await browser.screenshot(path.join(evidence, 'docente-desktop.png'));
    courses.splice(0);
    for (const page of ['cursos.html', 'catalogo-alumno.html']) {
      await browser.navigate(origin + '/' + page);
      await browser.waitFor("Boolean(document.querySelector('.catalog-empty svg'))");
      assert.equal(await browser.evaluate("document.querySelector('.catalog-empty').textContent.includes('Todavía no hay cursos publicados')"), true);
      assert.equal(await browser.evaluate("document.querySelectorAll('[data-filter-chip]').length"), 0);
    }
    assert.deepEqual(browser.errors, []);
    console.log('OK: portadas y fallback, chips/selectores sincronizados, cupo condicional, estados vacíos, detalle, Escape, móvil, movimiento reducido e inscripción. Solo datos ficticios locales.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
