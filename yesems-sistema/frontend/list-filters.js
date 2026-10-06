(function(root) {
  const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').trim();
  function matches(row, filters) {
    const terms = normal(filters.search).split(/\s+/).filter(Boolean);
    return terms.every(term => normal(row.search).includes(term))
      && (!filters.course || row.course === filters.course)
      && (!filters.state || row.state === filters.state)
      && (!filters.method || row.method === filters.method)
      && (!filters.from || Boolean(row.date && row.date >= filters.from))
      && (!filters.to || Boolean(row.date && row.date <= filters.to));
  }
  const instances = new WeakMap();
  function attach(container, items, options = {}) {
    if (!container) return;
    let instance = instances.get(container);
    if (!instance) {
      const form = document.createElement('form'); form.className='list-filters'; form.setAttribute('aria-label','Buscar y filtrar '+(options.title || 'registros'));
      const inputs={};
      const field = (name, label, type) => {
        const wrapper=document.createElement('label'); wrapper.textContent=label;
        const input=document.createElement(type==='select'?'select':'input');input.name=name;
        if(type!=='select') input.type=type;
        if(type==='search') { input.placeholder='Nombre, curso, folio o referencia'; input.maxLength=150; }
        wrapper.append(input);form.append(wrapper);inputs[name]=input;
      };
      field('search','Buscar','search');field('course','Curso','select');
      field('state','Estado','select');if(options.method)field('method','Método','select');
      field('from','Desde','date');field('to','Hasta','date');
      const clear=document.createElement('button');clear.type='reset';clear.textContent='Limpiar filtros';form.append(clear);
      const count=document.createElement('p');count.className='list-filter-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');form.append(count);
      (container.closest('.table-wrap') || container).before(form);
      instance={form,inputs,count,rows:[]};instances.set(container,instance);
      const apply=()=>{
        const filters=Object.fromEntries(Object.entries(inputs).map(([name,input])=>[name,input.value]));
        const invalid=filters.from && filters.to && filters.from>filters.to;
        let visible=0;
        instance.rows.forEach(({element,data})=>{const show=!invalid && matches(data,filters);element.hidden=!show;if(show)visible++;});
        count.textContent=invalid?'La fecha inicial no puede ser posterior a la final.':`${visible} de ${instance.rows.length} registros${visible===0?' · No hay coincidencias.':''}`;
      };
      instance.apply=apply;
      form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',apply);form.addEventListener('change',apply);
      form.addEventListener('reset',()=>{Object.values(inputs).forEach(input=>input.value='');apply();});
    }
    const children=[...container.children];
    instance.rows=items.map((item,i)=>({element:children[i],data:options.map?options.map(item):item})).filter(row=>row.element);
    for(const name of ['course','state','method']) {
      const select=instance.inputs[name];if(!select)continue;
      const selected=select.value;select.replaceChildren(new Option('Todos',''));
      [...new Set(instance.rows.map(row=>row.data[name]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).forEach(value=>select.add(new Option(value,value)));
      select.value=selected;if(select.selectedIndex<0)select.value='';
    }
    instance.apply();
  }
  const api={normal,matches,attach};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.ListFilters=api;
})(typeof window!=='undefined'?window:globalThis);
