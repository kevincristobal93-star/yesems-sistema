const { cleanupId } = require('../scripts/validar-cloudinary');
const folder = 'yesems/pruebas/12345678-abcd-1234-abcd-123456789abc';
const asset = '12345678-abcd-1234-abcd-987654321abc.pdf';
const url = `https://res.cloudinary.com/cloud-prueba/raw/authenticated/v123/${folder}/${asset}`;
test('limpieza Cloudinary acepta sólo el PDF ficticio de esta ejecución', () => {
  expect(cleanupId(url, folder, 'cloud-prueba')).toBe(`${folder}/${asset}`);
});
test.each([
  url.replace('cloud-prueba/', 'otro-cloud/'),
  url.replace('/authenticated/', '/upload/'),
  url.replace(folder, 'yesems/constancias'),
  url.replace(asset, 'alumno-real.pdf'),
  url.replace('res.cloudinary.com', 'example.test'),
  `${url}?firma=no`,
])('limpieza rechaza un recurso ajeno o una ubicación no válida (%#)', (candidate) => {
  expect(() => cleanupId(candidate, folder, 'cloud-prueba')).toThrow();
});
