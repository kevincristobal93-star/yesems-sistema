(() => {
  const admin = !!document.getElementById('admin-menu');
  const drawer = document.getElementById(admin ? 'admin-menu' : 'student-drawer');
  if (!drawer) return;
  const button = document.getElementById(admin ? 'menu-button' : 'student-menu-button');
  const close = document.getElementById(admin ? 'close-menu-button' : 'close-student-menu');
  const overlay = document.getElementById(admin ? 'menu-overlay' : 'student-menu-overlay');
  const desktop = matchMedia('(min-width:1100px)');
  button.setAttribute('aria-controls', drawer.id);
  drawer.setAttribute('aria-label', admin ? 'Navegación administrativa' : 'Navegación del docente');
  const brand = document.createElement('a');
  brand.className = 'sidebar-brand';
  brand.href = admin ? './admin.html' : './panel.html';
  brand.innerHTML = `<img src="./assets/yesems-logo.png" alt="YES EMS"><span><small>Panel YES EMS</small>${admin ? 'Administración' : 'Docente'}</span>`;
  drawer.prepend(brand);
  const nav = drawer.querySelector('nav');
  if (admin) {
    const aula = nav.querySelector('a[href="./admin-aula.html"]');
    if (aula) aula.href = '#aula-prioridad';
  }
  if (!admin) {
    const aula = document.createElement('a'); aula.href='#mi-aula'; aula.textContent='Aula virtual y materiales';nav.append(aula);
    const courses = nav.querySelector('a[href="#mis-inscripciones"]');
    if(courses) courses.textContent='Inscripciones, pagos y constancias';
  }
  const links = [...nav.querySelectorAll('a')];
  const groups = admin ? [
    ['General', ['#resumen','#reportes']],
    ['Contenidos', ['#aula-prioridad','#cursos','#seguimiento']],
    ['Gestión comercial', ['#inscripciones','#pagos']],
    ['Acreditación', ['#constancias']],
    ['Sistema', ['#respaldos']],
  ] : [
    ['General', ['./panel.html']],
    ['Contenidos', ['#mi-aula','./catalogo-alumno.html']],
    ['Mi formación', ['#mis-inscripciones']],
    ['Mi cuenta', ['./configuracion.html']],
  ];
  for (const [title, hrefs] of groups) {
    const label = document.createElement('p'); label.className='sidebar-group'; label.textContent=title; nav.append(label);
    for (const href of hrefs) {
      const link = links.find(item => item.getAttribute('href') === href);
      if (!link) continue;
      if (!link.querySelector('svg')) link.insertAdjacentHTML('afterbegin','<svg class="sidebar-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>');
      nav.append(link);
    }
  }
  let opened = false;
  function setOpen(value, restore=false) {
    opened = value && !desktop.matches;
    drawer.classList.toggle('open',opened);
    drawer.setAttribute('aria-hidden',String(!desktop.matches && !opened));
    drawer.inert = !desktop.matches && !opened;
    overlay.hidden = !opened;
    button.setAttribute('aria-expanded',String(opened));
    document.body.classList.toggle('sidebar-open',opened);
    document.body.classList.remove('menu-open');
    if(opened) close.focus();
    else if(restore && !desktop.matches) button.focus();
  }
  // Captura para sustituir los controladores antiguos sin afectar las acciones del panel.
  for(const [target,value] of [[button,true],[close,false],[overlay,false]]) {
    target.addEventListener('click',event=>{event.stopImmediatePropagation();setOpen(value,!value)},true);
  }
  function active(link) {
    links.forEach(item=>{item.classList.toggle('active',item===link);item.removeAttribute('aria-current')});
    if(link) link.setAttribute('aria-current',link.hash ? 'location' : 'page');
  }
  const main = document.querySelector('main');
  const views = admin ? {
    resumen: ['Resumen', '.admin-hero,.metrics,.operations-flow'],
    reportes: ['Reportes', '#reportes'],
    aula: ['Aula virtual', '#aula-prioridad'],
    cursos: ['Cursos y disponibilidad', '#cursos'],
    seguimiento: ['Sesiones y avance', '#seguimiento'],
    inscripciones: ['Inscripciones', '#inscripciones'],
    pagos: ['Pagos pendientes', '#pagos'],
    constancias: ['Constancias', '#constancias'],
    respaldos: ['Respaldos y recuperación', '#respaldos'],
  } : {
    resumen: ['Mi resumen', '.welcome,.quick-summary,.student-journey,.featured-section,.activity-section,#complete-enrollment-banner'],
    aula: ['Mi aula virtual', '#mi-aula'],
    inscripciones: ['Inscripciones, pagos y constancias', '#mis-inscripciones'],
    perfil: ['Mi perfil', '.dashboard-grid'],
  };
  const aliases = {'aula-prioridad':'aula','mi-aula':'aula','mis-inscripciones':'inscripciones'};
  const title = document.createElement('h1'); title.className='dashboard-view-title';title.tabIndex=-1;
  main.prepend(title);
  const waiting = document.createElement('p');waiting.className='dashboard-view-waiting';waiting.setAttribute('role','status');
  waiting.textContent='Preparando esta sección…';title.after(waiting);
  const linkViews = new Map();
  function routeURL(view) {
    const url = new URL(location.href);url.hash='';url.searchParams.set('vista',view);return url;
  }
  for (const link of links) {
    const href=link.getAttribute('href');
    const key=href.startsWith('#') ? (aliases[href.slice(1)] || href.slice(1)) : (!admin && href==='./panel.html' ? 'resumen' : null);
    if (key && views[key]) {linkViews.set(link,key);link.href=routeURL(key).href;}
  }
  if(!admin){
    const profile=document.createElement('a');profile.textContent='Mi perfil';profile.href=routeURL('perfil').href;
    nav.querySelector('a[href="./configuracion.html"]').before(profile);links.push(profile);linkViews.set(profile,'perfil');
  }
  let current='resumen';
  function renderView(focus=false) {
    const [name,selector]=views[current];
    const sections=[...main.children].filter(el=>el.tagName==='SECTION');
    let count=0;
    for(const section of sections){
      const visible=section.matches(selector);
      section.classList.toggle('dashboard-view-hidden',!visible);
      if(visible){count++;section.classList.add('is-visible');}
    }
    title.textContent=name;
    waiting.hidden=count>0;
    main.dataset.view=current;
    document.title=`YES EMS | ${admin?'Administración':'Docente'} · ${name}`;
    active([...linkViews].find(([,view])=>view===current)?.[0]);
    if(focus){title.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  }
  function readRoute(focus=false){
    const hash=location.hash.slice(1);
    const value=hash ? (aliases[hash] || hash) : new URL(location.href).searchParams.get('vista');
    current=Object.hasOwn(views,value) ? value : 'resumen';
    if(hash || (value && !Object.hasOwn(views,value))) history.replaceState(null,'',routeURL(current));
    renderView(focus);
  }
  function navigate(view){
    if(view!==current || location.hash){history.pushState(null,'',routeURL(view));}
    current=view;setOpen(false);renderView(true);
  }
  // Intercepta también los atajos del resumen; Ctrl/clic y enlaces externos se conservan.
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(!link || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download'))return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin || url.pathname!==location.pathname)return;
    const value=url.hash ? (aliases[url.hash.slice(1)] || url.hash.slice(1)) : url.searchParams.get('vista');
    if(!Object.hasOwn(views,value))return;
    event.preventDefault();event.stopImmediatePropagation();navigate(value);
  },true);
  // El aula y el aviso de perfil se crean tras las respuestas de la API.
  new MutationObserver(()=>renderView()).observe(main,{childList:true});
  window.addEventListener('popstate',()=>readRoute(true));
  window.addEventListener('hashchange',()=>readRoute(true));
  desktop.addEventListener('change',()=>setOpen(false));
  document.addEventListener('keydown',event=>{
    if(!opened)return;
    if(event.key==='Escape'){event.stopImmediatePropagation();setOpen(false,true)}
    if(event.key==='Tab'){
      const items=[...drawer.querySelectorAll('a[href],button')].filter(el=>el.getClientRects().length);
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus()}
      event.stopImmediatePropagation();
    }
  },true);
  setOpen(false);readRoute();
})();
