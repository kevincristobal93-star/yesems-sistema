const fs = require('node:fs');
const path = require('node:path');
const { clase } = require('../../frontend/inscripcion-estado');
const frontend = path.resolve(__dirname, '../../frontend');

describe('Base visual compartida', () => {
  test('todas las páginas cargan tokens antes de cualquier otro estilo', () => {
    for (const file of fs.readdirSync(frontend).filter(f => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(frontend, file), 'utf8');
      const styles = html.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*>|<style\b/gi);
      expect(styles[0]).toContain('tokens.css');
      expect(html.match(/href=["']\.\/tokens\.css["']/g)).toHaveLength(1);
    }
  });

  test('paleta, radios y movimiento tienen una única definición', () => {
    const required = ['navy', 'blue', 'blue-dark', 'sky', 'gold', 'ink', 'muted', 'line', 'soft', 'danger', 'green', 'radius-sm', 'radius-md', 'radius-lg', 'shadow-sm', 'shadow-md', 'shadow-lg', 'ease'];
    const tokens = fs.readFileSync(path.join(frontend, 'tokens.css'), 'utf8');
    for (const name of required) expect(tokens).toMatch(new RegExp(`--${name}:`));
    for (const file of fs.readdirSync(frontend).filter(f => f.endsWith('.css') && f !== 'tokens.css')) {
      const css = fs.readFileSync(path.join(frontend, file), 'utf8');
      expect(css).not.toMatch(/(?:var\(\s*|[{;]\s*)--(?:primary|system-blue|flow-navy|aula-teal)\b/);
      for (const name of required) expect(css).not.toMatch(new RegExp(`--${name}\\s*:`));
    }
  });

  test.each([
    [null, 'warning'],
    [{ estado: 'cancelada' }, 'danger'],
    [{ progreso: { conclusion_validada: true } }, 'success'],
    [{ monto_total: 1000, total_pagado: 1000 }, 'success'],
    [{ monto_total: 1000, total_pagado: 0, tiene_pago_pendiente: true }, 'info'],
    [{ monto_total: 1000, total_pagado: 0 }, 'warning'],
  ])('el color acompaña al estado real: %j', (item, variant) => {
    expect(clase(item)).toBe(`badge--${variant}`);
  });
});
