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
  const app = express();
  app.get('/api/cursos', (_req, res) => res.json({ ok: true, cursos: courses }));
  app.get('/api/cursos/:id', (req, res) => res.json({ ok: true, curso: courses.find(c => c.id_curso === Number(req.params.id)) }));
  app.get('/api/cursos/:id/disponibilidades', (_req, res) => res.json({ ok: true, disponibilidades: [] }));
  app.get('/api/acceso/config', (_req, res) => res.json({ ok: true, correo: false, google_client_id: null }));
  app.get('/api/usuarios/mio', (_req, res) => res.json({ ok: true, usuario: { nombre: 'Alumno', apellido: 'Prueba' } }));
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
    assert.equal(await browser.evaluate("document.querySelectorAll('.catalog-icon svg').length"), 5);
    await browser.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await browser.evaluate("document.querySelector('.catalog-tile').scrollIntoView({block:'center'})");
    const point = await browser.evaluate("(() => { const r=document.querySelector('.catalog-icon').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
    await browser.command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await browser.waitFor("getComputedStyle(document.querySelector('.catalog-tile')).transform==='matrix(1, 0, 0, 1, 0, -7)'");
    await browser.waitFor("getComputedStyle(document.querySelector('.catalog-icon')).backgroundColor==='rgb(255, 210, 40)'");
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
    assert.equal(await browser.evaluate("document.querySelectorAll('.proposal-badge').length"), 4);
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-course-details]').length"), 5);
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
    assert.deepEqual(browser.errors, []);
    console.log('OK: iconos, detalle completo, Escape/cierre, móvil, movimiento reducido, búsqueda, propuesta sin inscripción y curso validado disponible. Solo datos ficticios locales.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
