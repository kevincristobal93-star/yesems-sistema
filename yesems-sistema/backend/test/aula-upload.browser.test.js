// Navegador y multipart reales, API local simulada. No usa cuentas, base ni almacenamiento de producción.
const express = require('express');
const multer = require('multer');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { startBrowser } = require('./helpers/browser-client');
const suite = process.env.YES_EMS_AULA_UPLOAD_BROWSER_TEST === '1' ? describe : describe.skip;

suite('Carga de PDF del aula en navegador', () => {
  let server, browser, origin, artifacts, failure = false, requests = [], release;
  let state = { curso: { id_curso: 1, nombre: 'Curso de prueba', activo: true, aula_revision: 0 }, modulos: [
    { id_modulo: 1, titulo: 'Material general', descripcion: '', publicado: false, documentos: [] },
  ] };
  const upload = '#modules article > .upload-form';
  const pdf = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n';
  async function selectFile(selector, filename = 'manual_prueba.pdf', size = null) {
    await browser.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const data = new DataTransfer();
      data.items.add(new File([${size ? `new Uint8Array(${size})` : JSON.stringify(pdf)}], ${JSON.stringify(filename)}, {type:'application/pdf'}));
      input.files = data.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
  }
  beforeAll(async () => {
    const app = express();
    const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, parts: 3, fieldSize: 1000 } }).single('archivo');
    app.get('/api/aula/admin/cursos', (_req, res) => res.json({ cursos: [state.curso] }));
    app.get('/api/aula/admin/cursos/1', (_req, res) => res.json(state));
    app.use('/api/aula', (req, res) => parser(req, res, error => {
      if (error) return res.status(400).json({ mensaje: error.code });
      requests.push({ method: req.method, path: req.path, fields: req.body, file: req.file?.buffer.toString() });
      if (failure) return res.status(503).json({ mensaje: 'Almacenamiento no disponible. Intenta nuevamente.' });
      release = () => {
        state.modulos[0].documentos = [{ id_documento: 1, titulo: req.body.titulo, bytes: req.file.buffer.length }];
        state.curso.aula_revision++;
        res.status(req.method === 'POST' ? 201 : 200).json(state);
      };
    }));
    // La API se sirve en loopback para conservar los bytes multipart enviados por el navegador.
    app.get('/aula.js', async (_req, res) => {
      const source = await fs.readFile(path.resolve(__dirname, '../../frontend/aula.js'), 'utf8');
      res.type('application/javascript').send(source.replace('https://yesems-sistema-1.onrender.com/api/aula', '/api/aula'));
    });
    app.use(express.static(path.resolve(__dirname, '../../frontend')));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    origin = `http://127.0.0.1:${server.address().port}`;
    artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'yesems-upload-preview-'));
    browser = await startBrowser(origin);
    await browser.navigate(origin + '/admin-aula.html');
    await browser.evaluate("localStorage.setItem('yesems_admin_token','solo-prueba-local')");
    await browser.navigate(origin + '/admin-aula.html');
    await browser.waitFor("document.querySelector('#courses').options.length===2");
    await browser.fill('#courses', '1');
    await browser.waitFor("document.querySelector('#modules .upload-form')");
  }, 60000);
  afterAll(async () => {
    try { if (browser) await browser.close(); }
    finally { if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
    if (artifacts) console.log('Capturas locales: ' + artifacts);
  }, 30000);

  test('pulsar Subir PDF sin archivo muestra el motivo junto al botón', async () => {
    await browser.click(upload + ' button');
    expect(await browser.evaluate(`document.querySelector('${upload} .upload-status').textContent`)).toContain('Primero selecciona');
    expect(requests).toHaveLength(0);
  });

  test('rechaza archivos incorrectos y grandes antes de enviarlos', async () => {
    await selectFile(upload + ' input[type=file]', 'nota.txt');
    await browser.click(upload + ' button');
    expect(await browser.evaluate(`document.querySelector('${upload} .upload-status').textContent`)).toContain('extensión .pdf');
    await selectFile(upload + ' input[type=file]', 'grande.pdf', 5 * 1024 * 1024 + 1);
    await browser.click(upload + ' button');
    expect(await browser.evaluate(`document.querySelector('${upload} .upload-status').textContent`)).toContain('hasta 5 MB');
    expect(requests).toHaveLength(0);
  });

  test('completa el título, muestra errores locales y conserva el PDF para reintentar', async () => {
    failure = true;
    await selectFile(upload + ' input[type=file]');
    expect(await browser.evaluate(`document.querySelector('${upload} input[name=titulo]').value`)).toBe('manual prueba');
    await browser.click(upload + ' button');
    await browser.waitFor(`document.querySelector('${upload} .upload-status').classList.contains('error')`);
    expect(await browser.evaluate(`document.querySelector('${upload} .upload-status').textContent`)).toContain('Almacenamiento no disponible');
    expect(await browser.evaluate(`document.querySelector('${upload} input[type=file]').files.length`)).toBe(1);
    expect(await browser.evaluate(`document.querySelector('${upload} button').disabled`)).toBe(false);
    expect(requests[0].file).toBe(pdf);
    await browser.viewport(390, 844);
    await browser.evaluate(`document.querySelector('${upload}').scrollIntoView({block:'center'})`);
    await browser.screenshot(path.join(artifacts, 'error-pdf-mobile.png'));
    failure = false;
  });

  test('la carga real multipart muestra progreso y confirma el documento guardado', async () => {
    await browser.click(upload + ' button');
    await browser.waitFor(`document.querySelector('${upload} button').textContent==='Subiendo PDF…'`);
    expect(await browser.evaluate(`document.querySelector('${upload} button').disabled`)).toBe(true);
    // Espera a que el servidor local reciba el archivo, sin tocar servicios externos.
    for (let i = 0; !release && i < 50; i++) await new Promise(r => setTimeout(r, 20));
    expect(release).toEqual(expect.any(Function)); release(); release = null;
    await browser.waitFor("document.querySelector('#document-count').textContent==='1'");
    expect(requests[1]).toMatchObject({ method: 'POST', path: '/admin/cursos/1/modulos/1/documentos', file: pdf, fields: { titulo: 'manual prueba', revision: '0' } });
    expect(await browser.evaluate("document.querySelector('#modules .success').textContent")).toContain('guardado correctamente');
    expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    await browser.screenshot(path.join(artifacts, 'pdf-guardado-mobile.png'));
  });

  test('reemplazar envía PUT con la revisión actual y confirma el resultado', async () => {
    const replace = '#modules .documents .upload-form';
    await selectFile(replace + ' input[type=file]', 'version_nueva.pdf');
    await browser.click(replace + ' button');
    for (let i = 0; !release && i < 50; i++) await new Promise(r => setTimeout(r, 20));
    expect(release).toEqual(expect.any(Function)); release(); release = null;
    await browser.waitFor("document.querySelector('#modules .success').textContent.includes('reemplazado')");
    expect(requests[2]).toMatchObject({ method: 'PUT', path: '/admin/cursos/1/documentos/1', fields: { revision: '1' } });
    expect(browser.errors).toEqual([]);
  });
});
