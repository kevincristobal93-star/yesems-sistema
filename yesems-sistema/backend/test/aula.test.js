const { revision, modulo, documento, orden } = require('../src/utils/aula');
test('valida revisión y no acepta coerción ni desbordamiento', () => {
  expect(revision(0)).toBe(0);
  for (const value of [undefined, null, '1', -1, 1.5, 2147483647]) expect(() => revision(value)).toThrow();
});
test('normaliza módulos y descarta propiedades ajenas', () => {
  expect(modulo({ titulo: ' Tema ', descripcion: ' Resumen ', publicado: true })).toEqual({ titulo: 'Tema', descripcion: 'Resumen' });
  for (const value of [{}, { titulo: ' ' }, { titulo: 'a'.repeat(151) }, { titulo: 'x', descripcion: {} }, { titulo: 'x', descripcion: 'a'.repeat(2001) }]) expect(() => modulo(value)).toThrow();
});
test('valida titulo y descripcion de PDF', () => {
  expect(documento({ titulo: ' Guia ', descripcion: ' Resumen ', revision: 4 })).toEqual({ titulo: 'Guia', descripcion: 'Resumen' });
  expect(documento({ titulo: 'Manual' })).toEqual({ titulo: 'Manual', descripcion: '' });
  for (const value of [{}, { titulo: ' ' }, { titulo: 'x'.repeat(151) }, { titulo: 'x', descripcion: 'a'.repeat(1001) }]) expect(() => documento(value)).toThrow();
});
test('el orden requiere IDs únicos y válidos', () => {
  expect(orden(['2', 1])).toEqual([2, 1]);
  for (const value of [null, [], [1, '1'], [0], [-1], ['1x'], Array(101).fill(1)]) expect(() => orden(value)).toThrow();
});
