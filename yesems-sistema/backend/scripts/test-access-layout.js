// Solo interfaz local; no carga .env, bases de datos ni proveedores externos.
const express = require('express');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startBrowser } = require('../test/helpers/browser-client');

(async () => {
  const app = express();
  app.get('/api/acceso/config', (_req, res) => res.json({ok:true,correo:true,google_client_id:null}));
  app.use(express.static(path.resolve(__dirname, '../../frontend')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await startBrowser(origin);
    await browser.navigate(origin + '/password.html');
    await browser.click('#recovery-google-login');
    await browser.waitFor("document.querySelector('#verified-access').open && !document.querySelector('#access-send').disabled");
    assert.equal(await browser.evaluate("document.querySelector('#verified-title').textContent"), 'Iniciar sesión');
    assert.equal(await browser.evaluate("document.querySelector('#access-registration').hidden"), true);
    assert.equal(await browser.evaluate("document.querySelector('#access-login-prompt').hidden"), true);
    await browser.click('#access-register-mode');
    assert.equal(await browser.evaluate("document.querySelector('#verified-title').textContent"), 'Crear tu cuenta');
    assert.equal(await browser.evaluate("document.querySelector('#access-registration').hidden"), false);
    assert.equal(await browser.evaluate("document.querySelector('#access-login-help').hidden"), true);
    await browser.viewport(390, 844);
    assert.equal(await browser.evaluate("document.querySelector('#verified-access').scrollWidth <= document.querySelector('#verified-access').clientWidth+1"), true);
    await browser.click('#access-login-mode');
    assert.equal(await browser.evaluate("document.querySelector('#access-registration').hidden"), true);
    assert.deepEqual(browser.errors, []);
    console.log('OK: acceso y registro separados, recuperación y ancho móvil. Google real no probado.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
