// HTML real, navegación real; sin autenticación ni llamadas a producción.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const { startBrowser } = require('../test/helpers/browser-client');
const root = path.resolve(__dirname,'../../frontend');
const app = express();
app.get(['/admin.html','/panel.html'],(req,res)=>{
  const html=fs.readFileSync(path.join(root,req.path.slice(1)),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  res.type('html').send(html.replace('</body>','<script src="./dashboard-sidebar.js"></script></body>'));
});
app.use(express.static(root));
(async()=>{
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  let browser;
  try {
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await startBrowser(origin);
    for(const page of ['admin','panel']){
      await browser.viewport(1440,1000);await browser.navigate(`${origin}/${page}.html`);
      const state=()=>browser.evaluate(`(()=>{const d=document.querySelector('aside');return {hidden:d.getAttribute('aria-hidden'),inert:d.inert,left:d.getBoundingClientRect().left,main:document.querySelector('main').getBoundingClientRect().left,overflow:document.documentElement.scrollWidth>innerWidth,groups:d.querySelectorAll('.sidebar-group').length}})()`);
      let s=await state();if(s.overflow) console.log(await browser.evaluate(`[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right])`));assert.equal(s.hidden,'false');assert.equal(s.left,0);assert.ok(s.main>=252);assert.equal(s.overflow,false);assert.ok(s.groups>=3);
      await browser.viewport(390,844);
      s=await state();assert.equal(s.inert,true);assert.equal(s.hidden,'true');assert.equal(s.overflow,false);
      const menu=page==='admin'?'#menu-button':'#student-menu-button';
      await browser.click(menu);s=await state();assert.equal(s.inert,false);assert.equal(s.hidden,'false');
      await browser.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      s=await state();assert.equal(s.inert,true);assert.equal(await browser.evaluate(`document.activeElement.matches('${menu}')`),true);
      await browser.click(menu);await browser.viewport(1440,1000);s=await state();assert.equal(s.hidden,'false');assert.equal(s.inert,false);
      assert.equal(await browser.evaluate(`document.body.classList.contains('sidebar-open')`),false);
      console.log(`OK ${page}: escritorio, móvil, Escape, foco y cambio de tamaño`);
    }
    assert.deepEqual(browser.errors,[]);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
