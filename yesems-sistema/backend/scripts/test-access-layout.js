// Solo interfaz local; no carga .env, bases de datos ni proveedores externos.
const express = require('express');
const path = require('node:path');
const assert = require('node:assert/strict');
const { startBrowser } = require('../test/helpers/browser-client');

(async () => {
  const app = express();
  app.get('/api/acceso/config', (_req, res) => res.json({ok:true,correo:true,google_client_id:null}));
  let enrollments=[];
  app.get('/api/inscripciones/mias',(_req,res)=>res.json({ok:true,inscripciones:enrollments}));
  app.get('/api/usuarios/mio',(_req,res)=>res.json({ok:true,usuario:{nombre:'Alumno',apellido:'Prueba',email:'test@example.test',telefono:'5500000000',fecha_nacimiento:'2000-01-01',curp:'TEST000101HDFXXX00'}}));
  app.get('/api/cursos/1',(_req,res)=>res.json({ok:true,curso:{nombre:'Curso ficticio',precio:500}}));
  app.get('/api/cursos/1/disponibilidades',(_req,res)=>res.json({ok:true,disponibilidades:[]}));
  app.get('/api/pagos/mio/42',(_req,res)=>res.json({ok:true,inscripcion:{curso_nombre:'Curso ficticio',monto_total:500,estado_inscripcion:'pendiente',pagos:[]}}));
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
    await browser.evaluate("localStorage.setItem('yesems_token','solo-prueba');localStorage.setItem('yesems_usuario',JSON.stringify({nombre:'Alumno',apellido:'Prueba',email:'test@example.test'}))");
    await browser.navigate(origin+'/panel.html?curso=1');
    await browser.waitFor("document.querySelector('.enrollment-prompt')?.open");
    assert.equal(await browser.evaluate("document.querySelector('.enrollment-prompt a').getAttribute('href')"),'./inscripcion.html?curso=1');
    await browser.click('.enrollment-prompt button');
    await browser.waitFor("document.querySelector('.enrollment-prompt')===null");
    assert.equal(await browser.evaluate("document.querySelector('.enrollment-prompt')===null"),true);
    await browser.click('#complete-enrollment-banner a');
    await browser.waitFor("document.querySelector('#nombre')?.value==='Alumno'");
    assert.equal(await browser.evaluate("document.querySelector('#apellido').value"),'Prueba');
    enrollments=[{id_inscripcion:42,id_curso:1,estado:'pendiente',curso_nombre:'Curso ficticio',monto_total:500,total_pagado:0}];
    await browser.navigate(origin+'/panel.html?curso=1');
    await browser.waitFor("document.querySelector('.enrollment-prompt')?.open");
    assert.equal(await browser.evaluate("document.querySelector('.enrollment-prompt a').getAttribute('href')"),'./pago.html?inscripcion=42');
    await browser.click('.enrollment-prompt a');
    await browser.waitFor("document.querySelector('#payment-layout')?.hidden===false");
    assert.equal(await browser.evaluate("document.querySelector('#method').value"),'efectivo');
    assert.equal(await browser.evaluate("document.querySelector('#receipt').required"),true);
    assert.equal(await browser.evaluate("document.querySelector('#payment-form').checkValidity()"),false);
    assert.deepEqual(browser.errors, []);
    console.log('OK: acceso y registro separados, recuperación, móvil, panel posponible, inscripción existente, perfil precargado y comprobante obligatorio. Google real no probado.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
