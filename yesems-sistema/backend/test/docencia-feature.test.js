const fs = require('fs');
const path = require('path');
const vm = require('vm');
const script = fs.readFileSync(path.resolve(__dirname, '../../frontend/docencia-destacada.js'), 'utf8');
test.each([
  ['2026-10-15T23:00:00-06:00', '$1,990'],
  ['2026-10-16T00:00:00-06:00', 'Consultar'],
])('vigencia del precio en Ciudad de México: %s', (now, expected) => {
  const nodes = { 'docencia-price': { textContent: '$1,990' } };
  class FixedDate extends Date { constructor() { super(now); } }
  vm.runInNewContext(script, { Date: FixedDate, Intl, document: { getElementById: id => nodes[id] ||= { textContent: '' } } });
  expect(nodes['docencia-price'].textContent).toBe(expected);
});
