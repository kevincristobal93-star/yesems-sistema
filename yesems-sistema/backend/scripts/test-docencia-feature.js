// Revisión visual aislada. API ficticia; sin enviar mensajes ni acceder a producción.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const assert = require('node:assert/strict');
const { startBrowser } = require('../test/helpers/browser-client');

(async () => {
  const app = express();
  app.get('/api/cursos', (_req, res) => res.json({ ok: true, cursos: [] }));
  app.get('/api/acceso/config', (_req, res) => res.json({ ok: true, correo: false, google_client_id: null }));
  app.use(express.static(path.resolve(__dirname, '../../frontend')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await startBrowser(origin);
    await browser.navigate(origin + '/cursos.html');
    await browser.waitFor("document.querySelector('.docencia-cta') && document.querySelector('#catalog-message').textContent !== 'Cargando cursos...'");
    assert.equal(await browser.evaluate("document.querySelector('main > section').className"), 'docencia');
    assert.equal(await browser.evaluate("document.querySelectorAll('h1').length"), 1);
    assert.equal(await browser.evaluate("document.querySelectorAll('.docencia-benefits > div').length"), 4);
    assert.equal(await browser.evaluate("document.querySelectorAll('.docencia-includes li').length"), 8);
    assert.equal(await browser.evaluate("new URL(document.querySelector('.docencia-cta').href).pathname"), '/525648666596');
    assert.equal(await browser.evaluate("document.querySelector('.docencia-disclaimer').textContent.includes('no garantiza')"), true);
    const images = await fs.mkdtemp(path.join(os.tmpdir(), 'yesems-docencia-preview-'));
    await browser.screenshot(path.join(images, 'desktop.png'));
    for (const width of [390, 320, 768]) {
      await browser.viewport(width, 844);
      assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true, `Sin desbordamiento a ${width}px`);
      await browser.click('.docencia-more');
      assert.equal(await browser.evaluate('location.hash'), '#docencia-detalles');
      await browser.evaluate('window.scrollTo(0,0)');
      if (width === 390) await browser.screenshot(path.join(images, 'mobile.png'));
    }
    assert.deepEqual(browser.errors, []);
    console.log(`Correcto: prioridad visual, enlaces, beneficios y responsive 320/390/768px. Capturas: ${images}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
