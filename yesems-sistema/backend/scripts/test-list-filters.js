const express=require('express');
const path=require('node:path');
const assert=require('node:assert/strict');
const {startBrowser}=require('../test/helpers/browser-client');
(async()=>{
 const records=Array.from({length:9},(_,i)=>({id_inscripcion:i+1,usuario_nombre:i===8?'José':'Alumno',usuario_apellido:'Pérez',curso_nombre:i%2?'Impresión 3D':'Láser',estado:i%2?'confirmada':'pendiente',monto_total:1000,alumno_folio:'YESEMS-'+(i+1),fecha_inscripcion:'2026-10-06T12:00:00Z'}));
 const app=express();app.use('/api',(req,res)=>{
   if(req.path==='/inscripciones')return res.json({ok:true,inscripciones:records});
   if(req.path==='/inscripciones/mias')return res.json({ok:true,inscripciones:records.map(r=>({...r,total_pagado:r.estado==='confirmada'?1000:0}))});
   res.json({ok:true,metricas:{cursos:0,alumnos:0,pagos_pendientes:0,constancias_pendientes:0},ultimas_inscripciones:records.slice(0,6),cursos:[],categorias:[],horarios:[],pagos:[],constancias:[],reportes:{generales:{},por_curso:[],por_mes:[]}});
 });app.use(express.static(path.resolve(__dirname,'../../frontend')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
 try {
  const origin=`http://127.0.0.1:${server.address().port}`;browser=await startBrowser(origin);
  await browser.navigate(origin+'/cursos.html');
  await browser.evaluate("localStorage.setItem('yesems_admin_token','test');localStorage.setItem('yesems_administrador',JSON.stringify({nombre:'Prueba'}));localStorage.setItem('yesems_token','test');localStorage.setItem('yesems_usuario',JSON.stringify({nombre:'Prueba'}));");
  await browser.navigate(origin+'/admin.html');await browser.waitFor("document.querySelectorAll('#inscription-table tr').length===9 && document.querySelector('#inscripciones .list-filters')");
  await browser.fill('#inscripciones [name=search]','jose perez');
  assert.equal(await browser.evaluate("document.querySelectorAll('#inscription-table tr:not([hidden])').length"),1);
  assert.equal(await browser.evaluate("document.querySelector('#inscription-table tr:not([hidden])').textContent.includes('José')"),true);
  await browser.fill('#inscripciones [name=state]','confirmada');assert.equal(await browser.evaluate("document.querySelectorAll('#inscription-table tr:not([hidden])').length"),0);
  await browser.click('#inscripciones button[type=reset]');assert.equal(await browser.evaluate("document.querySelectorAll('#inscription-table tr:not([hidden])').length"),9);
  await browser.fill('#inscripciones [name=from]','2026-10-07');await browser.fill('#inscripciones [name=to]','2026-10-06');
  assert.equal(await browser.evaluate("document.querySelector('#inscripciones .list-filter-count').textContent.includes('posterior')"),true);
  await browser.viewport(390,844);assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
  await browser.navigate(origin+'/panel.html');await browser.waitFor("document.querySelectorAll('.enrollment-card').length===9 && document.querySelector('.list-filters')");
  await browser.evaluate("document.querySelector('.enrollment-prompt')?.close()");
  await browser.fill('.list-filters [name=course]','Impresión 3D');
  assert.equal(await browser.evaluate("document.querySelectorAll('.enrollment-card:not([hidden])').length"),4);
  await browser.fill('.list-filters [name=state]','Pago pendiente');assert.equal(await browser.evaluate("document.querySelectorAll('.enrollment-card:not([hidden])').length"),0);
  assert.deepEqual(browser.errors,[]);console.log('Correcto: todas las inscripciones, búsqueda sin acentos, filtros combinados, limpiar, fechas y filtros del alumno.');
 } finally {await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
