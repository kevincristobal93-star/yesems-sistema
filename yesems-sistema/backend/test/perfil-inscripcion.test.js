const { validarPerfil } = require('../src/utils/perfil');
const { estado } = require('../../frontend/inscripcion-estado');

test('ficha parcial guarda datos válidos sin exigir CURP ni fecha antes de inscribirse', () => {
  expect(validarPerfil({ nombre:' Ana ', apellido:' Pérez ', telefono:'', curp:'', fecha_nacimiento:'' })).toEqual({ nombre:'Ana', apellido:'Pérez', telefono:null, curp:null, fecha_nacimiento:null });
  expect(validarPerfil({ nombre:'Ana', apellido:'Pérez', rol:'admin', email:'otro@example.test' })).toEqual({ nombre:'Ana', apellido:'Pérez' });
});
test.each([
  { nombre:[] }, { apellido:' ' }, { telefono:'123' }, { telefono:12345 },
  { fecha_nacimiento:'2026-02-30' }, { fecha_nacimiento:'2999-01-01' },
  { fecha_nacimiento:{} }, { curp:'incorrecta' },
])('rechaza datos de ficha inválidos: %j', (fields) => {
  expect(()=>validarPerfil({nombre:'Ana',apellido:'Pérez',...fields})).toThrow();
});
test.each([
  [null, 'Datos pendientes'],
  [{ estado:'pendiente', monto_total:1000, total_pagado:0 }, 'Pago pendiente'],
  [{ estado:'confirmada', monto_total:1000, total_pagado:100 }, 'Pago pendiente'],
  [{ monto_total:1000, total_pagado:0, tiene_pago_pendiente:true }, 'Pago en revisión'],
  [{ monto_total:1000, total_pagado:1000 }, 'Inscripción confirmada'],
  [{ estado:'cancelada', monto_total:1000, total_pagado:1000 }, 'Inscripción cancelada'],
  [{ monto_total:1000, pagos:[{monto:1000,estado:'pendiente'}] }, 'Pago en revisión'],
  [{ monto_total:1000, pagos:[{monto:1000,estado:'cancelado'}] }, 'Pago pendiente'],
  [{ monto_total:1000, pagos:[{monto:1000,estado:'completado'}] }, 'Inscripción confirmada'],
])('estado mostrado refleja solo pagos aprobados: %j', (input, label) => expect(estado(input)).toBe(label));
