// Capturas reproducibles del frontend real con una API local y datos ficticios.
// No carga .env ni conecta a Render, Gmail, Cloudinary o PostgreSQL.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { startBrowser } = require('../test/helpers/browser-client');

const output = path.resolve(__dirname, '../../docs/evidencias semana 05 al 09 octubre 2026');
const records = Array.from({ length: 8 }, (_, index) => ({
  id_inscripcion: index + 1, usuario_nombre: index === 6 ? 'José' : `Alumno ${index + 1}`,
  usuario_apellido: 'Prueba', alumno_folio: `YES-${String(index + 1).padStart(3, '0')}`,
  curso_nombre: index % 2 ? 'Impresión 3D' : 'Corte y grabado láser',
  estado: index % 2 ? 'confirmada' : 'pendiente', monto_total: 1000,
  fecha_inscripcion: '2026-10-06T12:00:00Z',
}));

async function main() {
  await fs.mkdir(output, { recursive: true });
  const app = express();
  app.use(express.json());
  app.use('/api', (req, res) => {
    if (req.path === '/inscripciones') return res.json({ ok: true, inscripciones: records });
    if (req.path === '/acceso/config') return res.json({ ok: true, correo: true, google_client_id: null });
    if (req.path === '/acceso/password/codigo') return res.status(503).json({ ok: false, mensaje: 'Prueba local: el envío real se valida con Gmail API configurada. No se muestran secretos.' });
    if (req.path === '/aula/admin/cursos') return res.json({ ok: true, cursos: [{ id_curso: 1, nombre: 'Impresión 3D', activo: true }] });
    if (req.path === '/aula/admin/cursos/1') return res.json({ ok: true, curso: { id_curso: 1, nombre: 'Impresión 3D', activo: true, aula_revision: 3 }, modulos: [
      { id_modulo: 1, titulo: 'Introducción', descripcion: 'Conoce el equipo, los materiales y las normas de seguridad.', orden: 1, publicado: true, documentos: [{ id_documento: 1, titulo: 'Manual introductorio', bytes: 124000 }] },
      { id_modulo: 2, titulo: 'Diseño', descripcion: 'Prepara modelos y ejercicios antes de imprimir.', orden: 2, publicado: false, documentos: [{ id_documento: 2, titulo: 'Guía de diseño', bytes: 98000 }, { id_documento: 3, titulo: 'Ejercicios', bytes: 76000 }] },
    ] });
    return res.json({ ok: true, metricas: { cursos: 4, alumnos: 8, pagos_pendientes: 2, constancias_pendientes: 0 }, ultimas_inscripciones: records.slice(0, 6), cursos: [], categorias: [], horarios: [], pagos: [], constancias: [], reportes: { generales: {}, por_curso: [], por_mes: [] } });
  });
  app.use(express.static(path.resolve(__dirname, '../../frontend')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await startBrowser(origin);
    async function label(text) {
      await browser.evaluate(`(() => { let note=document.getElementById('evidence-label'); if(!note){note=document.createElement('p');note.id='evidence-label';document.body.append(note);} note.textContent=${JSON.stringify(text)}; note.style.cssText='position:fixed;bottom:0;left:0;right:0;margin:0;padding:7px;text-align:center;background:#102c40;color:white;font:12px Arial;z-index:2147483647;pointer-events:none'; })()`);
    }
    async function shot(name, text) { await label(text); await browser.screenshot(path.join(output, name)); }

    await browser.navigate(`${origin}/cursos.html`);
    await browser.evaluate("localStorage.setItem('yesems_admin_token','sesion-local-ficticia');localStorage.setItem('yesems_administrador',JSON.stringify({nombre:'Administración de prueba'}));");
    await browser.navigate(`${origin}/admin.html`);
    await browser.waitFor("document.querySelector('#inscripciones .list-filters') && document.querySelectorAll('#inscription-table tr').length===8");
    await browser.fill('#inscripciones [name=search]', 'jose');
    await browser.evaluate("document.querySelector('#inscripciones').scrollIntoView({block:'start'})");
    await shot('01-busqueda-y-filtros.png', 'Captura local · Datos ficticios · Búsqueda y filtros del administrador · 06/10/2026');

    await browser.navigate(`${origin}/password.html`);
    await browser.waitFor("!document.querySelector('#recovery-send').disabled");
    await browser.fill('#recovery-email', 'cuenta.prueba@example.test');
    await browser.click('#recovery-send');
    await browser.waitFor("document.querySelector('#password-message').textContent !== 'Procesando…'");
    await shot('02-gmail-api-diagnostico.png', 'Captura local · Datos ficticios · Diagnóstico seguro de correo · 07/10/2026');

    await browser.evaluate("localStorage.setItem('yesems_admin_token','sesion-local-ficticia');");
    await browser.navigate(`${origin}/admin-aula.html`);
    await browser.waitFor("document.querySelector('#courses').options.length===2");
    await browser.fill('#courses', '1');
    await browser.waitFor("document.querySelectorAll('#modules article').length===2");
    await browser.viewport(1440, 1250);
    await browser.evaluate("document.querySelector('#modules').scrollIntoView({block:'start'})");
    await shot('03-aula-virtual-modulos-pdf.png', 'Captura local · Datos ficticios · Módulos y PDF administrados · 09/10/2026');
    if (browser.errors.length) throw new Error(browser.errors.join('\n'));
    console.log(JSON.stringify({ output, images: 3, productionModified: false }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
