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
  if (!admin) {
    const aula = document.createElement('a'); aula.href='#mi-aula'; aula.textContent='Aula virtual y materiales';nav.append(aula);
    const courses = nav.querySelector('a[href="#mis-inscripciones"]');
    if(courses) courses.textContent='Inscripciones, pagos y constancias';
  }
  const links = [...nav.querySelectorAll('a')];
  const groups = admin ? [
    ['General', ['#resumen','#reportes']],
    ['Contenidos', ['./admin-aula.html','#cursos','#seguimiento']],
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
  links.forEach(link=>link.addEventListener('click',event=>{
    event.stopImmediatePropagation();active(link);setOpen(false);
    if(link.hash) {
      const target=document.getElementById(link.hash.slice(1));
      if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true})}
    }
  },true));
  function syncActive(){active(links.find(link=>link.getAttribute('href')===(location.hash || (admin?'#resumen':'./panel.html'))))}
  window.addEventListener('hashchange',syncActive);
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
  setOpen(false);syncActive();
})();
