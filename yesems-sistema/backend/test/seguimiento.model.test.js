jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const pool = require('../src/config/db');
const { calcularProgreso, withEnrollmentLock } = require('../src/models/seguimiento.model');

function inscripcion(overrides = {}) {
  return {
    id_inscripcion: 1, id_curso: 2, estado: 'confirmada', monto_total: '500.00',
    total_pagado: '500.00', porcentaje_minimo: 75, plan_publicado: true,
    concluida_at: null, concluida_por: null,
    actividades: [true, true, true, false].map((cumplida, i) => ({ id_actividad: i + 1, cumplida })),
    ...overrides,
  };
}

describe('Reglas de avance y conclusión verificable', () => {
  test('el mínimo configurado permite concluir pero exige validación administrativa para la constancia', () => {
    expect(calcularProgreso(inscripcion())).toMatchObject({
      total: 4, cumplidas: 3, pendientes: 1, porcentaje: 75,
      puede_concluir: true, puede_solicitar_constancia: false, conclusion_validada: false,
    });
  });

  test('una conclusión nueva validada permite la constancia y no necesita concluirse otra vez', () => {
    expect(calcularProgreso(inscripcion({ estado: 'completada', concluida_por: 9, concluida_at: '2026-01-01' }))).toMatchObject({
      puede_concluir: false, puede_solicitar_constancia: true, conclusion_validada: true,
    });
  });

  test('una inscripción completada histórica no demuestra conclusión ni habilita constancias nuevas', () => {
    expect(calcularProgreso(inscripcion({ estado: 'completada' }))).toMatchObject({
      puede_concluir: true, puede_solicitar_constancia: false, conclusion_validada: false,
    });
  });

  test('dos de tres no cumplen un mínimo del 67%, independientemente del porcentaje mostrado', () => {
    const data = inscripcion({ porcentaje_minimo: 67, actividades: [{ cumplida: true }, { cumplida: true }, { cumplida: false }] });
    expect(calcularProgreso(data)).toMatchObject({ porcentaje: 66.67, puede_concluir: false });
    expect(calcularProgreso({ ...data, porcentaje_minimo: 66 }).puede_concluir).toBe(true);
  });

  test.each([
    ['sin porcentaje configurado', { porcentaje_minimo: null }],
    ['sin actividades', { actividades: [] }],
    ['plan en borrador', { plan_publicado: false }],
    ['inscripción cancelada', { estado: 'cancelada' }],
    ['pago parcial', { total_pagado: '499.99' }],
    ['porcentaje insuficiente', { porcentaje_minimo: 100 }],
  ])('%s bloquea conclusión y constancia', (_reason, overrides) => {
    expect(calcularProgreso(inscripcion(overrides))).toMatchObject({
      puede_concluir: false, puede_solicitar_constancia: false,
    });
  });

  test('la constancia vuelve a estar bloqueada si el saldo deja de estar cubierto', () => {
    expect(calcularProgreso(inscripcion({
      estado: 'completada', concluida_por: 9, concluida_at: '2026-01-01', total_pagado: '499.99',
    }))).toMatchObject({ conclusion_validada: true, pago_completo: false, puede_solicitar_constancia: false });
  });

  test('un curso gratuito no exige un pago de importe artificial', () => {
    expect(calcularProgreso(inscripcion({ monto_total: '0.00', total_pagado: '0.00' }))).toMatchObject({
      pago_completo: true, puede_concluir: true,
    });
  });
});

describe('Transacciones de inscripción', () => {
  beforeEach(() => jest.clearAllMocks());

  function connection() {
    const client = {
      query: jest.fn().mockImplementation(async (sql) => {
        if (sql.startsWith('SELECT id_curso')) return { rows: [{ id_curso: 2 }] };
        if (sql.startsWith('SELECT * FROM cursos')) return { rows: [{ id_curso: 2 }] };
        if (sql.startsWith('SELECT * FROM inscripciones')) return { rows: [{ id_inscripcion: 1, id_curso: 2 }] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
    return client;
  }

  test('bloquea curso antes que inscripción y entrega la misma conexión al cambio', async () => {
    const client = connection();
    const action = jest.fn().mockResolvedValue({ ok: true });
    await expect(withEnrollmentLock(1, action)).resolves.toEqual({ ok: true });
    expect(action).toHaveBeenCalledWith(client);
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements.findIndex((sql) => /FROM cursos .*FOR UPDATE/.test(sql)))
      .toBeLessThan(statements.findIndex((sql) => /FROM inscripciones .*FOR UPDATE/.test(sql)));
    expect(statements.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('si falla una operación revierte y libera la conexión', async () => {
    const client = connection();
    await expect(withEnrollmentLock(1, async () => { throw new Error('fallo de prueba'); })).rejects.toThrow('fallo de prueba');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('una inscripción inexistente da 404 sin ejecutar el cambio', async () => {
    const client = connection();
    client.query.mockResolvedValue({ rows: [] });
    const action = jest.fn();
    await expect(withEnrollmentLock(22, action)).rejects.toMatchObject({ statusCode: 404 });
    expect(action).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
