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
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-enroll-course]').length"), 1);
    assert.equal(await browser.evaluate("document.querySelectorAll('a.enroll-button').length"), 4);
    await browser.evaluate("document.querySelector('#search').value='láser';document.querySelector('#search').dispatchEvent(new Event('input'))");
    assert.equal(await browser.evaluate("document.querySelectorAll('.course-card').length"), 1);
    await browser.viewport(390, 844);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    await browser.evaluate("localStorage.setItem('yesems_token','prueba-local');localStorage.setItem('yesems_usuario',JSON.stringify({nombre:'Alumno',apellido:'Prueba'}))");
    await browser.navigate(origin + '/catalogo-alumno.html');
    await browser.waitFor("document.querySelectorAll('.card').length===5");
    assert.equal(await browser.evaluate("document.querySelectorAll('.proposal-badge').length"), 4);
    assert.equal(await browser.evaluate("document.querySelectorAll('a[href*=\"inscripcion.html?curso=\"]').length"), 1);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    await browser.navigate(origin + '/inscripcion.html?curso=1');
    await browser.waitFor("document.querySelector('#enrollment-form')?.hidden===true");
    assert.equal(await browser.evaluate("document.querySelector('#course-price').textContent"), 'Por confirmar');
    await browser.navigate(origin + '/inscripcion.html?curso=5');
    await browser.waitFor("document.querySelector('#course-content')?.hidden===false");
    assert.equal(await browser.evaluate("document.querySelector('#enrollment-form').hidden"), false);
    assert.deepEqual(browser.errors, []);
    console.log('OK: catálogo público/alumno, búsqueda, móvil, propuesta sin pago, enlace directo bloqueado y curso validado disponible. Solo datos ficticios locales.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
