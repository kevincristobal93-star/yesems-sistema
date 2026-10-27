// Prueba visual aislada: HTML/CSS reales sin scripts de aplicación ni API de producción.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const { startBrowser } = require('../test/helpers/browser-client');
const frontend = path.resolve(__dirname, '../../frontend');
const pages = ['index.html', 'admin.html', 'panel.html', 'admin-aula.html', 'aula.html', 'pago.html', 'catalogo-alumno.html'];
const app = express();
app.get(pages.map(p => '/' + p), (req, res) => {
  const html = fs.readFileSync(path.join(frontend, req.path.slice(1)), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const fixture = `<section id="token-fixture" style="padding:16px;background:white;color:#17233d;position:relative;z-index:99999">
    <button id="focus-button">Botón</button><a id="focus-link" href="#token-fixture">Enlace</a><input id="focus-input" aria-label="Campo de prueba">
    ${['success', 'warning', 'danger', 'info'].map(v => `<span class="badge badge--${v}">${v}</span>`).join('')}
  </section>`;
  res.type('html').send(html.replace(/(<body\b[^>]*>)/i, '$1' + fixture));
});
app.use(express.static(frontend));
(async () => {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await startBrowser(origin);
    for (const width of [390, 1440]) {
      await browser.viewport(width, 1000);
      for (const page of pages) {
        await browser.navigate(`${origin}/${page}`);
        await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        const actual = await browser.evaluate(`(async () => {
          const styles = getComputedStyle(document.documentElement);
          const focus = [];
          for (const name of ['button', 'link', 'input']) {
            const el = document.getElementById('focus-' + name); el.focus();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const style = getComputedStyle(el);
            focus.push([style.outlineStyle, style.outlineWidth, style.outlineColor]);
          }
          return {
            blue: styles.getPropertyValue('--blue').trim(),
            radius: styles.getPropertyValue('--radius-md').trim(),
            badges: [...document.querySelectorAll('#token-fixture .badge')].map(el => ({ color: getComputedStyle(el).color, dot: getComputedStyle(el, '::before').content, width: getComputedStyle(el, '::before').width })),
            focus
          };
        })()`);
        assert.equal(actual.blue, '#176b87');
        assert.equal(actual.radius, '12px');
        assert.deepEqual(actual.badges.map(b => b.color), ['rgb(23, 116, 71)', 'rgb(128, 89, 0)', 'rgb(180, 35, 24)', 'rgb(16, 84, 108)']);
        for (const badge of actual.badges) { assert.equal(badge.dot, '""'); assert.equal(badge.width, '6px'); }
        for (const focus of actual.focus) assert.deepEqual(focus, ['solid', '3px', 'rgb(38, 132, 255)']);
        console.log(`OK ${page} ${width}px: tokens, badges y foco`);
      }
    }
    assert.deepEqual(browser.errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
