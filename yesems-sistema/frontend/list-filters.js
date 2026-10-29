(function(root) {
  const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').trim();
  function matches(row, filters) {
    const terms = normal(filters.search).split(/\s+/).filter(Boolean);
    return terms.every(term => normal(row.search).includes(term))
      && (!filters.course || row.course === filters.course)
      && (!filters.state || row.state === filters.state)
      && (!filters.method || row.method === filters.method)
      && (!filters.category || row.category === filters.category)
      && (!filters.modality || (row.modalities || []).includes(filters.modality))
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
  // Adaptador del catálogo: reutiliza los selectores existentes, sin crear otro formulario.
  const modalities = course => [...new Set([
    ...(Array.isArray(course.modalidades) ? course.modalidades : []), course.modalidad,
  ].filter(value => typeof value === 'string' && value.trim() && value !== 'por_definir').map(value => value.trim()))];
  function attachCatalog({ search, category, modality, chips, onChange }) {
    const controls = { category, modality };
    function sync() {
      chips.querySelectorAll('[data-filter-chip]').forEach(button => {
        button.setAttribute('aria-pressed', String(controls[button.dataset.filterChip].value === button.dataset.value));
      });
      onChange();
    }
    search.addEventListener('input', sync);
    Object.values(controls).forEach(select => select.addEventListener('change', sync));
    chips.addEventListener('click', event => {
      const button = event.target.closest('[data-filter-chip]');
      if (!button || !chips.contains(button)) return;
      controls[button.dataset.filterChip].value = button.dataset.value;
      controls[button.dataset.filterChip].dispatchEvent(new Event('change', { bubbles: true }));
    });
    return {
      update(items) {
        chips.replaceChildren();
        for (const [key, select] of Object.entries(controls)) {
          const values = [...new Set(items.flatMap(item => key === 'category' ? [item.categoria].filter(Boolean) : modalities(item)))].sort((a,b) => a.localeCompare(b, 'es'));
          const previous = select.value;
          select.replaceChildren(new Option(key === 'category' ? 'Todas las categorías' : 'Todas las modalidades', ''));
          values.forEach(value => select.add(new Option(value, value)));
          select.value = values.includes(previous) ? previous : '';
          select.disabled = !values.length;
          if (!values.length) continue;
          const group = document.createElement('div'); group.className = 'catalog-chip-group';
          group.setAttribute('role', 'group'); group.setAttribute('aria-label', key === 'category' ? 'Categorías' : 'Modalidades');
          const label = document.createElement('span'); label.className = 'catalog-chip-label'; label.textContent = key === 'category' ? 'Categoría' : 'Modalidad'; group.append(label);
          for (const value of ['', ...values]) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'catalog-chip';
            button.dataset.filterChip = key; button.dataset.value = value; button.textContent = value || 'Todas'; group.append(button);
          }
          chips.append(group);
        }
        sync();
      },
      filter(items) {
        return items.filter(item => matches({ search: `${item.nombre || ''} ${item.descripcion || ''} ${item.categoria || ''}`, category: item.categoria, modalities: modalities(item) }, { search: search.value, category: category.value, modality: modality.value }));
      },
      reset() { search.value = ''; category.value = ''; modality.value = ''; sync(); search.focus(); },
    };
  }
  const api={normal,matches,attach,attachCatalog,modalities};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.ListFilters=api;
})(typeof window!=='undefined'?window:globalThis);
