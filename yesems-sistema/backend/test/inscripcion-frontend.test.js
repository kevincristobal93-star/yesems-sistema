const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/inscripcion.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../../frontend/inscripcion.html'), 'utf8');

async function screen(reply = { ok: true, inscripcion: { id_inscripcion: 42 } }, status = 201) {
  const nodes = new Map();
  function node(selector) {
    if (nodes.has(selector)) return nodes.get(selector);
    const element = {
      value: '', textContent: '', disabled: false, hidden: false, valid: true,
      handlers: {}, classList: { add: jest.fn(), remove: jest.fn() },
      addEventListener: jest.fn((event, handler) => { element.handlers[event] = handler; }),
      checkValidity: jest.fn(() => element.valid), reportValidity: jest.fn(), scrollIntoView: jest.fn(),
      before: jest.fn((child) => { child.parentElement = element.parentElement; }),
      querySelector: (child) => node(`${selector} ${child}`),
      querySelectorAll: () => [node('#submit-button'), node('#back-to-data'), node('#telefono'), node('#availability-select')],
    };
    nodes.set(selector, element);
    return element;
  }
  node('#continue-button').parentElement = node('#personal-step');
  node('#confirmation-step .confirmation-actions').parentElement = node('#confirmation-step');
  node('#form-message').parentElement = node('#personal-step');
  node('#confirmation-step').hidden = true;
  node('#availability-select').disabled = true;
  node('#telefono').value = '5500000000';
  node('#fecha-nacimiento').value = '2000-01-01';
  node('#curp').value = 'TEST000101HDFXXX00';
  const fetch = jest.fn(async (url, options) => {
    if (options?.method === 'POST') return { ok: status < 400, json: async () => reply };
    return { ok: true, json: async () => url.endsWith('/disponibilidades')
      ? { ok: true, disponibilidades: [] } : { ok: true, curso: { nombre: 'Curso de prueba', precio: 500 } } };
  });
  const storage = new Map([
    ['yesems_token', 'token-ficticio-sin-uso-en-red'],
    ['yesems_usuario', JSON.stringify({ nombre: 'Alumno', apellido: 'Prueba' })],
  ]);
  const window = { location: { search: '?curso=1', href: '', replace: jest.fn() } };
  vm.runInNewContext(source, {
    document: { querySelector: node }, window, fetch, URLSearchParams, TypeError,
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setTimeout: (fn) => { fn(); },
  });
  await new Promise(setImmediate);
  node('#continue-button').handlers.click();
  function submit() {
    const event = { preventDefault: jest.fn(), currentTarget: node('#enrollment-form') };
    const pending = node('#enrollment-form').handlers.submit(event);
    // Igual que el DOM: al terminar el despacho síncrono, currentTarget es null.
    event.currentTarget = null;
    return pending;
  }
  return { node, fetch, window, submit };
}

describe('Confirmación de inscripción → pago', () => {
  test.each([
    ['inscripción nueva', { ok: true, inscripcion: { id_inscripcion: 42 } }, 201],
    ['inscripción ya existente', { ok: true, existente: true, inscripcion: { id_inscripcion: 42 } }, 200],
  ])('%s redirige aunque currentTarget desaparezca después de await', async (_name, reply, status) => {
    const ui = await screen(reply, status);
    await ui.submit();
    expect(ui.window.location.href).toBe('./pago.html?inscripcion=42');
    expect(ui.node('#form-message').textContent).toBe('');
  });

  test('el error del servidor se muestra dentro del paso visible y permite reintentar', async () => {
    const ui = await screen({ ok: false, mensaje: 'El curso no está disponible' }, 404);
    await ui.submit();
    expect(ui.node('#form-message').parentElement).toBe(ui.node('#confirmation-step'));
    expect(ui.node('#confirmation-step').hidden).toBe(false);
    expect(ui.node('#form-message').textContent).toBe('El curso no está disponible');
    expect(ui.node('#submit-button').disabled).toBe(false);
    expect(ui.node('#back-to-data').disabled).toBe(false);
    expect(ui.window.location.href).toBe('');
  });

  test('un doble clic no envía dos solicitudes', async () => {
    const ui = await screen();
    await Promise.all([ui.submit(), ui.submit()]);
    expect(ui.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });

  test('si faltan datos devuelve al paso personal antes de mostrar la validación', async () => {
    const ui = await screen();
    ui.node('#enrollment-form').valid = false;
    await ui.submit();
    expect(ui.node('#personal-step').hidden).toBe(false);
    expect(ui.node('#confirmation-step').hidden).toBe(true);
    expect(ui.node('#form-message').parentElement).toBe(ui.node('#personal-step'));
    expect(ui.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  test('una respuesta sin ID válido no abre un pago incorrecto', async () => {
    const ui = await screen({ ok: true, inscripcion: {} });
    await ui.submit();
    expect(ui.window.location.href).toBe('');
    expect(ui.node('#form-message').textContent).toContain('número de inscripción');
    expect(ui.node('#submit-button').disabled).toBe(false);
  });

  test('al regresar conserva un único mensaje visible en el paso personal', async () => {
    const ui = await screen();
    ui.node('#back-to-data').handlers.click();
    expect(ui.node('#form-message').parentElement).toBe(ui.node('#personal-step'));
    expect((html.match(/id="form-message"/g) || []).length).toBe(1);
  });
});
