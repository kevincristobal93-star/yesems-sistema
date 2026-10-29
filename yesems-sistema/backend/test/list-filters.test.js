const {matches,normal}=require('../../frontend/list-filters');
const row={search:'José Pérez YESEMS-2026-00007 Láser referencia ABC',course:'Láser',state:'pendiente',method:'efectivo',date:'2026-10-06'};

test('categoría y modalidad se combinan con búsqueda sin alterar los filtros existentes', () => {
  const catalog = { search: 'Diseño láser', category: 'Tecnología', modalities: ['Virtual', 'Presencial'] };
  expect(matches(catalog, {search:'laser',category:'Tecnología',modality:'Virtual'})).toBe(true);
  expect(matches(catalog, {category:'Artes'})).toBe(false);
  expect(matches(catalog, {modality:'Mixta'})).toBe(false);
  expect(matches({...catalog,modalities:[]}, {modality:'Virtual'})).toBe(false);
});

test('las modalidades solo se obtienen de campos explícitos, sin suponerlas por descripción', () => {
  const { modalities } = require('../../frontend/list-filters');
  expect(modalities({descripcion:'Curso virtual'})).toEqual([]);
  expect(modalities({modalidad:'por_definir'})).toEqual([]);
  expect(modalities({modalidad:'Virtual',modalidades:['Virtual','Presencial',null]})).toEqual(['Virtual','Presencial']);
});
test('búsqueda por varios términos ignora acentos y mayúsculas',()=>{
  expect(normal(' JOSÉ ')).toBe('jose');expect(matches(row,{search:'perez laser 00007'})).toBe(true);
  expect(matches(row,{search:'otro alumno'})).toBe(false);
});
test('filtros se combinan y fechas incluyen límites',()=>{
  expect(matches(row,{course:'Láser',state:'pendiente',method:'efectivo',from:'2026-10-06',to:'2026-10-06'})).toBe(true);
  for(const filters of [{course:'3D'},{state:'confirmada'},{method:'transferencia'},{from:'2026-10-07'},{to:'2026-10-05'}])expect(matches(row,filters)).toBe(false);
});
test('sin fecha no coincide con un periodo; sin filtros se muestran todos',()=>{
  expect(matches({...row,date:''},{from:'2026-10-01'})).toBe(false);expect(matches(row,{})).toBe(true);
});
