// Capturas reproducibles del frontend real, con API local ficticia.
// No carga .env ni conecta a PostgreSQL, Google, Gmail, Cloudinary o Render.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { startBrowser } = require('../test/helpers/browser-client');

(async () => {
  const docs = path.resolve(__dirname, '../../docs');
  const migration = await fs.readFile(path.resolve(__dirname, '../database/migrations/007_proposed_courses.sql'), 'utf8');
  const courses = [...migration.matchAll(/\('(yesems-[^']+)', '([^']+)',\s*'([^']+)', (\d+), (\d+)\)/g)].map((m, i) => ({
    id_curso: i + 1, catalogo_clave: m[1], nombre: m[2], descripcion: m[3], duracion_horas: Number(m[4]), cupo: Number(m[5]),
    precio: 0, activo: true, oferta_provisional: true, categoria: 'Tecnología y emprendimiento',
  }));
  assert.equal(courses.length, 4);
  const app = express();
  let enrollments = [];
  app.get('/api/cursos', (_req,res) => res.json({ok:true,cursos:courses}));
  app.get('/api/acceso/config', (_req,res) => res.json({ok:true,correo:true,google_client_id:null}));
  app.get('/api/inscripciones/mias', (_req,res) => res.json({ok:true,inscripciones:enrollments}));
  app.get('/api/usuarios/mio', (_req,res) => res.json({ok:true,usuario:{nombre:'Alumno',apellido:'Demostración',email:'alumno@example.test'}}));
  app.get('/api/pagos/mio/42', (_req,res) => res.json({ok:true,inscripcion:{curso_nombre:'Curso de prueba para validar pagos',monto_total:500,estado_inscripcion:'pendiente',pagos:[]}}));
  app.use(express.static(path.resolve(__dirname, '../../frontend')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  const captured = [];
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await startBrowser(origin);
    const shot = async (day, name) => {
      // Rótulo de evidencia: distingue claramente la demostración de producción.
      await browser.evaluate(`(() => {
        let note=document.getElementById('evidence-label');
        if(!note){note=document.createElement('p');note.id='evidence-label';(document.querySelector('dialog[open]')||document.documentElement).append(note);}
        note.textContent='Captura local · Datos de prueba · 02/10/2026';
        note.style.cssText='position:fixed;bottom:0;left:0;right:0;margin:0;padding:5px;text-align:center;background:#102c40;color:white;font:11px Arial;z-index:2147483647;pointer-events:none';
      })()`);
      await browser.screenshot(path.join(docs, `evidencias ${day}`, name));
      captured.push(`${day}/${name}`);
      await browser.evaluate("document.getElementById('evidence-label')?.remove()");
    };
    await browser.navigate(origin + '/password.html');
    await browser.waitFor("!document.querySelector('#recovery-send').disabled");
    await shot('jueves', '03-recuperar-contrasena.png');
    await browser.click('#recovery-google-login');
    await browser.waitFor("document.querySelector('#verified-access').open && !document.querySelector('#access-send').disabled");
    await shot('jueves', '01-iniciar-sesion.png');
    await browser.click('#access-register-mode');
    assert.equal(await browser.evaluate("document.querySelector('#verified-title').textContent"), 'Crear tu cuenta');
    await shot('jueves', '02-crear-cuenta.png');
    await browser.viewport(390, 844);
    await browser.click('#access-login-mode');
    await shot('jueves', '04-acceso-movil.png');

    await browser.viewport(1440, 1450);
    await browser.navigate(origin + '/cursos.html');
    await browser.waitFor("document.querySelectorAll('.catalog-tile').length===4");
    await browser.evaluate("document.querySelector('#course-grid').scrollIntoView({block:'start'});window.scrollBy(0,-30)");
    await shot('viernes', '01-catalogo-cuatro-cursos.png');
    await browser.command('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    const point = await browser.evaluate("(() => {const r=document.querySelector('.catalog-icon').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await browser.command('Input.dispatchMouseEvent', {type:'mouseMoved',...point});
    await browser.waitFor("getComputedStyle(document.querySelector('.catalog-icon')).backgroundColor==='rgb(255, 210, 40)'");
    await shot('viernes', '02-animacion-al-pasar-cursor.png');
    await browser.click('[data-course-details="1"]');
    await browser.waitFor("document.querySelector('.course-detail-dialog').open");
    await shot('viernes', '03-detalle-curso.png');
    await browser.click('[data-close-details]');
    await browser.viewport(390, 844);
    await browser.click('[data-course-details="2"]');
    await shot('viernes', '04-detalle-movil.png');

    await browser.viewport(1440, 1000);
    await browser.evaluate("localStorage.setItem('yesems_token','sesion-local-ficticia');localStorage.setItem('yesems_usuario',JSON.stringify({nombre:'Alumno',apellido:'Demostración',email:'alumno@example.test'}))");
    await browser.navigate(origin + '/panel.html?curso=1');
    await browser.waitFor("document.querySelector('.enrollment-prompt')?.open");
    await shot('viernes', '05-completar-inscripcion.png');
    enrollments = [{id_inscripcion:42,id_curso:99,estado:'pendiente',curso_nombre:'Curso de prueba para validar pagos',monto_total:500,total_pagado:0}];
    await browser.navigate(origin + '/pago.html?inscripcion=42');
    await browser.waitFor("document.querySelector('#payment-layout')?.hidden===false");
    assert.equal(await browser.evaluate("document.querySelector('#receipt').required"), true);
    await browser.evaluate("document.querySelector('#payment-layout').scrollIntoView({block:'start'})");
    await shot('viernes', '06-pago-efectivo-comprobante.png');
    assert.deepEqual(browser.errors, []);
    console.log(JSON.stringify({capturas:captured,entorno:'local con datos de prueba',produccionModificada:false},null,2));
  } finally {
    if(browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error);process.exitCode=1;});
