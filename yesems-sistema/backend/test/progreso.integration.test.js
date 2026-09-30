const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const enabled = process.env.YES_EMS_ISOLATED_TEST === '1'
  && process.env.NODE_ENV === 'test'
  && process.env.TEST_DATABASE_URL
  && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL;

// npm test no debe conectar a ninguna base implícita de .env.
const integration = enabled ? describe : describe.skip;

integration('Proceso real de inscripción, avance y constancia (PostgreSQL aislado)', () => {
  let pool;
  let server;
  let base;
  let admin;
  let alumno;
  let otroAlumno;
  let category;
  let flow;
  let migration;
  let runStartupMigrations;
  let errorSpy;
  const tag = crypto.randomBytes(5).toString('hex');
  const password = crypto.randomBytes(24).toString('base64url');
  let sequence = 0;

  async function request(method, url, { token, body, status } = {}) {
    const multipart = body instanceof FormData;
    const response = await fetch(`${base}${url}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const json = response.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(bytes.toString()) : null;
    if (status !== undefined && response.status !== status) {
      throw new Error(`${method} ${url}: expected ${status}, got ${response.status}; ${json ? JSON.stringify(json) : bytes.subarray(0, 100)}`);
    }
    return { status: response.status, json, bytes, headers: response.headers };
  }

  async function register(label) {
    const email = `integration-${tag}-${label}@example.test`;
    const registration = await request('POST', '/usuarios/registrar', {
      body: { nombre: `Prueba ${label}`, apellido: 'Integración', email, password }, status: 201,
    });
    const login = await request('POST', '/usuarios/login', { body: { email, password }, status: 200 });
    return { id: registration.json.usuario.id_usuario, email, token: login.json.token };
  }

  async function createCourse({ price = 500, threshold = null, count = 0, publish = false, dates = [] } = {}) {
    const result = await request('POST', '/cursos', {
      token: admin.token, status: 201,
      body: { id_categoria: category, nombre: `Prueba flujo ${tag}-${++sequence}`, descripcion: 'Curso temporal de integración', duracion_horas: 8, precio: price, cupo: 20 },
    });
    const id = result.json.curso.id_curso;
    if (threshold !== null) {
      await request('PATCH', `/seguimiento/cursos/${id}/regla`, { token: admin.token, body: { porcentaje_minimo: threshold }, status: 200 });
    }
    const activities = [];
    for (let index = 0; index < count; index += 1) {
      const activity = await request('POST', `/seguimiento/cursos/${id}/actividades`, {
        token: admin.token, status: 201,
        body: { titulo: `Actividad ${index + 1}`, tipo: index % 2 ? 'actividad' : 'sesion', modalidad: ['presencial', 'en_linea', 'hibrida', 'por_definir'][index % 4], fecha: dates[index] || null },
      });
      activities.push(activity.json.actividad.id_actividad);
    }
    if (publish) await request('POST', `/seguimiento/cursos/${id}/publicar`, { token: admin.token, status: 200 });
    return { id, activities };
  }

  async function enroll(course, user = alumno) {
    const result = await request('POST', '/inscripciones/mia', {
      token: user.token, status: 201,
      body: { id_curso: course.id, telefono: '5500000000', fecha_nacimiento: '2000-01-01', curp: 'TEST000101HDFXXX00' },
    });
    return result.json.inscripcion.id_inscripcion;
  }

  async function payment(id, amount, validate = true) {
    const result = await request('POST', '/pagos', {
      token: admin.token, status: 201,
      body: { id_inscripcion: id, monto: amount, metodo_pago: 'efectivo', estado: 'pendiente', referencia: 'Prueba temporal' },
    });
    const paymentId = result.json.pago.id_pago;
    if (validate) await request('PATCH', `/administradores/pagos/${paymentId}/validar`, { token: admin.token, body: { estado: 'completado' }, status: 200 });
    return paymentId;
  }

  async function fulfill(id, activities) {
    for (const activity of activities) {
      await request('PUT', `/seguimiento/inscripciones/${id}/actividades/${activity}`, {
        token: admin.token, body: { cumplida: true, observaciones: 'Verificado en prueba' }, status: 200,
      });
    }
  }

  async function progress(id, token = alumno.token) {
    return (await request('GET', `/seguimiento/mio/${id}`, { token, status: 200 })).json.progreso;
  }

  async function assertBlocked(method, url, options) {
    const response = await request(method, url, options);
    expect([400, 409]).toContain(response.status);
    expect(response.json.ok).toBe(false);
    return response;
  }

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/yesems_progress_test'
        || !process.env.TEST_UPLOADS_DIR || !process.env.TEST_PG_DATA_DIR?.includes('yesems-progress-test-')) {
      throw new Error('Las pruebas requieren el cluster temporal del runner, no una base existente.');
    }
    pool = require('../src/config/db');
    ({ runStartupMigrations } = require('../src/config/run-migrations'));
    migration = await fs.readFile(path.join(__dirname, '../database/migrations/004_course_progress.sql'), 'utf8');
    await runStartupMigrations();
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(password, 4);
    const email = `integration-admin-${tag}@example.test`;
    admin = (await pool.query('INSERT INTO administradores (nombre, apellido, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id_administrador', ['Admin de prueba', 'Integración', email, hash])).rows[0];
    category = (await pool.query('INSERT INTO categorias (nombre) VALUES ($1) RETURNING id_categoria', [`Pruebas ${tag}`])).rows[0].id_categoria;
    const app = require('../src/app');
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    base = `http://127.0.0.1:${server.address().port}/api`;
    admin.token = (await request('POST', '/administradores/login', { body: { email, password }, status: 200 })).json.token;
    alumno = await register('alumno');
    otroAlumno = await register('otro');
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  }, 60000);

  afterAll(async () => {
    errorSpy?.mockRestore();
    if (server) {
      server.closeIdleConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    if (pool) await pool.end();
  });

  test('la migración agrega seguimiento a un esquema antiguo sin borrar inscripciones ni constancias y admite repetición', async () => {
    const { Pool } = require('pg');
    const dbName = 'yesems_progress_migration_test';
    await pool.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = `/${dbName}`;
    const old = new Pool({ connectionString: url.toString() });
    try {
      await old.query(await fs.readFile(path.join(__dirname, '../database/migrations/001_initial_schema.sql'), 'utf8'));
      await old.query(`
        INSERT INTO categorias (nombre) VALUES ('Histórico');
        INSERT INTO cursos (id_categoria,nombre,duracion_horas,precio,cupo) VALUES (1,'Curso histórico',8,500,20);
        INSERT INTO usuarios (nombre,apellido,email) VALUES ('Histórico','Prueba','historico@example.test');
        INSERT INTO inscripciones (id_usuario,id_curso,estado,monto_total) VALUES (1,1,'completada',500);
        INSERT INTO pagos (id_inscripcion,monto,metodo_pago,estado) VALUES (1,500,'efectivo','completado');
        INSERT INTO constancias (id_inscripcion,folio,estado,archivo_url) VALUES (1,'HISTORICA-PRUEBA','autorizada','/uploads/constancias/historica.pdf');
      `);
      const prior = (await old.query('SELECT * FROM constancias')).rows;
      await old.query(migration);
      await old.query(migration);
      expect((await old.query('SELECT * FROM constancias')).rows).toEqual(prior);
      expect((await old.query('SELECT estado,concluida_at,concluida_por FROM inscripciones')).rows).toEqual([{ estado: 'completada', concluida_at: null, concluida_por: null }]);
      expect((await old.query('SELECT porcentaje_minimo,plan_publicado FROM cursos')).rows).toEqual([{ porcentaje_minimo: null, plan_publicado: false }]);
      expect((await old.query('SELECT count(*)::int AS total FROM pagos')).rows[0].total).toBe(1);
    } finally { await old.end(); }
  });

  test('registro → inscripción → pago validado → avance real → conclusión concurrente → solicitud única → autorización → PDF', async () => {
    const course = await createCourse({ threshold: 75, count: 4, publish: true, dates: ['2000-01-01'] });
    const id = await enroll(course);
    expect(await progress(id)).toMatchObject({ total: 4, cumplidas: 0, pendientes: 4, porcentaje: 0, pago_completo: false, puede_solicitar_constancia: false });
    const duplicate = await request('POST', '/inscripciones/mia', { token: alumno.token, status: 200, body: { id_curso: course.id, telefono: '5500000000', fecha_nacimiento: '2000-01-01', curp: 'TEST000101HDFXXX00' } });
    expect(duplicate.json.inscripcion.id_inscripcion).toBe(id);
    const pending = await request('POST', '/pagos/mio', { token: alumno.token, status: 201, body: { id_inscripcion: id, metodo_pago: 'efectivo', referencia: 'Prueba' } });
    expect((await progress(id)).total_pagado).toBe(0);
    await request('PATCH', `/administradores/pagos/${pending.json.pago.id_pago}/validar`, { token: admin.token, body: { estado: 'completado' }, status: 200 });
    await fulfill(id, course.activities.slice(0, 3));
    expect(await progress(id)).toMatchObject({ total: 4, cumplidas: 3, pendientes: 1, porcentaje: 75, pago_completo: true, puede_concluir: true, puede_solicitar_constancia: false });
    const listing = await request('GET', '/inscripciones/mias', { token: alumno.token, status: 200 });
    expect(listing.json.inscripciones.find((row) => row.id_inscripcion === id).progreso.porcentaje).toBe(75);
    await assertBlocked('POST', '/constancias/mia', { token: alumno.token, body: { id_inscripcion: id } });
    const completions = await Promise.all([1, 2].map(() => request('POST', `/seguimiento/inscripciones/${id}/concluir`, { token: admin.token })));
    expect(completions.map((result) => result.status)).toEqual([200, 200]);
    expect(await progress(id)).toMatchObject({ estado: 'completada', conclusion_validada: true, puede_solicitar_constancia: true });
    const stored = (await pool.query('SELECT concluida_at,concluida_por FROM inscripciones WHERE id_inscripcion=$1', [id])).rows[0];
    expect(stored.concluida_por).toBe(admin.id_administrador);
    expect(stored.concluida_at).toBeInstanceOf(Date);
    const requests = await Promise.all([1, 2].map(() => request('POST', '/constancias/mia', { token: alumno.token, body: { id_inscripcion: id } })));
    expect(requests.map((result) => result.status).sort()).toEqual([201, 409]);
    const certificate = requests.find((result) => result.status === 201).json.constancia.id_constancia;
    await request('GET', `/constancias/mia/${certificate}/descargar`, { token: alumno.token, status: 403 });
    const approvals = await Promise.all([1, 2].map(() => request('PATCH', `/constancias/${certificate}/autorizar`, { token: admin.token })));
    expect(approvals.map((result) => result.status).sort()).toEqual([200, 409]);
    const pdf = await request('GET', `/constancias/mia/${certificate}/descargar`, { token: alumno.token, status: 200 });
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
    expect(pdf.headers.get('content-disposition')).toContain('attachment');
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.bytes.length).toBeGreaterThan(1000);
    expect((await pool.query('SELECT count(*)::int AS total FROM constancias WHERE id_inscripcion=$1', [id])).rows[0].total).toBe(1);
    flow = { course, id, certificate, paymentId: pending.json.pago.id_pago };
  }, 60000);

  test('conclusión validada bloquea cambios al plan, cumplimiento, cancelación y pagos históricos', async () => {
    expect(flow).toBeDefined();
    await assertBlocked('POST', `/seguimiento/cursos/${flow.course.id}/reabrir`, { token: admin.token });
    await assertBlocked('PATCH', `/seguimiento/cursos/${flow.course.id}/regla`, { token: admin.token, body: { porcentaje_minimo: 1 } });
    await assertBlocked('DELETE', `/seguimiento/actividades/${flow.course.activities[0]}`, { token: admin.token });
    await assertBlocked('PUT', `/seguimiento/inscripciones/${flow.id}/actividades/${flow.course.activities[0]}`, { token: admin.token, body: { cumplida: false } });
    await assertBlocked('PATCH', `/administradores/inscripciones/${flow.id}/cancelar`, { token: admin.token });
    await assertBlocked('PATCH', `/pagos/${flow.paymentId}/estado`, { token: admin.token, body: { estado: 'cancelado' } });
    await assertBlocked('PUT', `/pagos/${flow.paymentId}`, { token: admin.token, body: { monto: 1, metodo_pago: 'efectivo' } });
    expect((await progress(flow.id)).puede_solicitar_constancia).toBe(true);
  });

  test('sin sesión y con token inválido no se accede a seguimiento; alumno no administra ni autoriza constancias', async () => {
    await request('GET', '/seguimiento/cursos', { status: 401 });
    await request('GET', '/seguimiento/cursos', { token: 'invalid-test-token', status: 401 });
    const restricted = [
      ['GET', '/seguimiento/cursos'], ['GET', `/seguimiento/cursos/${flow.course.id}`],
      ['PATCH', `/seguimiento/cursos/${flow.course.id}/regla`, { porcentaje_minimo: 1 }],
      ['POST', `/seguimiento/cursos/${flow.course.id}/actividades`, { titulo: 'No permitido', tipo: 'sesion', modalidad: 'presencial' }],
      ['PUT', `/seguimiento/inscripciones/${flow.id}/actividades/${flow.course.activities[0]}`, { cumplida: true }],
      ['POST', `/seguimiento/inscripciones/${flow.id}/concluir`],
      ['GET', '/constancias'], ['POST', '/constancias', { id_inscripcion: flow.id }],
      ['PATCH', `/constancias/${flow.certificate}/autorizar`], ['PATCH', `/constancias/${flow.certificate}/rechazar`],
      ['GET', `/constancias/${flow.certificate}/descargar`],
      ['GET', '/usuarios'], ['GET', '/inscripciones'], ['GET', '/pagos'],
      ['PATCH', `/pagos/${flow.paymentId}/estado`, { estado: 'completado' }],
      ['POST', '/administradores/registrar', { nombre: 'No permitido', apellido: 'Prueba', email: 'no-admin@example.test', password }],
    ];
    for (const [method, url, body] of restricted) await request(method, url, { token: alumno.token, body, status: 403 });
    await request('GET', `/seguimiento/mio/${flow.id}`, { token: admin.token, status: 403 });
  });

  test('cada alumno consulta únicamente su inscripción, pagos y documentos', async () => {
    await request('GET', `/seguimiento/mio/${flow.id}`, { token: otroAlumno.token, status: 404 });
    await request('GET', `/pagos/mio/${flow.id}`, { token: otroAlumno.token, status: 404 });
    await request('POST', '/constancias/mia', { token: otroAlumno.token, body: { id_inscripcion: flow.id }, status: 404 });
    await request('GET', `/constancias/mia/${flow.certificate}/descargar`, { token: otroAlumno.token, status: 404 });
    const listing = await request('GET', '/inscripciones/mias', { token: otroAlumno.token, status: 200 });
    expect(listing.json.inscripciones.some((row) => row.id_inscripcion === flow.id)).toBe(false);
  });

  test('IDs mal formados se rechazan antes de PostgreSQL y los inexistentes devuelven 404', async () => {
    for (const id of ['abc', '0', '-1', '1.5', '2147483648']) {
      await request('GET', `/seguimiento/inscripciones/${id}`, { token: admin.token, status: 400 });
      await request('GET', `/seguimiento/mio/${id}`, { token: alumno.token, status: 400 });
      await request('GET', `/constancias/${id}`, { token: admin.token, status: 400 });
    }
    await request('GET', '/seguimiento/inscripciones/2147483647', { token: admin.token, status: 404 });
  });

  test('el porcentaje se configura explícitamente por curso y un plan vacío nunca permite concluir', async () => {
    const course = await createCourse({ price: 0 });
    const id = await enroll(course);
    const initial = await progress(id);
    expect(initial).toMatchObject({ total: 0, porcentaje: 0, porcentaje_minimo: null, puede_concluir: false });
    for (const porcentaje_minimo of [0, 101, 70.5, '80', null]) {
      await request('PATCH', `/seguimiento/cursos/${course.id}/regla`, { token: admin.token, body: { porcentaje_minimo }, status: 400 });
    }
    await assertBlocked('POST', `/seguimiento/cursos/${course.id}/publicar`, { token: admin.token });
    await request('PATCH', `/seguimiento/cursos/${course.id}/regla`, { token: admin.token, body: { porcentaje_minimo: 75 }, status: 200 });
    await assertBlocked('POST', `/seguimiento/cursos/${course.id}/publicar`, { token: admin.token });
    await assertBlocked('POST', `/seguimiento/inscripciones/${id}/concluir`, { token: admin.token });
  });

  test('dos de tres actividades no alcanzan 67%; reabrir y cambiar la regla antes de concluir conserva los registros', async () => {
    const course = await createCourse({ price: 0, threshold: 67, count: 3, publish: true });
    const id = await enroll(course);
    await fulfill(id, course.activities.slice(0, 2));
    expect(await progress(id)).toMatchObject({ cumplidas: 2, pendientes: 1, porcentaje: 66.67, puede_concluir: false });
    await assertBlocked('POST', `/seguimiento/inscripciones/${id}/concluir`, { token: admin.token });
    await request('POST', `/seguimiento/cursos/${course.id}/reabrir`, { token: admin.token, status: 200 });
    await request('PATCH', `/seguimiento/cursos/${course.id}/regla`, { token: admin.token, body: { porcentaje_minimo: 66 }, status: 200 });
    expect(await progress(id)).toMatchObject({ cumplidas: 2, plan_publicado: false, puede_concluir: false });
    await request('POST', `/seguimiento/cursos/${course.id}/publicar`, { token: admin.token, status: 200 });
    expect((await progress(id)).puede_concluir).toBe(true);
    await request('POST', `/seguimiento/inscripciones/${id}/concluir`, { token: admin.token, status: 200 });
  });

  test('pago parcial y pagos pendientes no cumplen el saldo; suma de pagos confirmados sí', async () => {
    const course = await createCourse({ threshold: 100, count: 1, publish: true });
    const id = await enroll(course);
    await fulfill(id, course.activities);
    await payment(id, 200);
    await payment(id, 299.99);
    expect(await progress(id)).toMatchObject({ total_pagado: 499.99, pago_completo: false, puede_concluir: false });
    await assertBlocked('POST', `/seguimiento/inscripciones/${id}/concluir`, { token: admin.token });
    const remaining = await payment(id, 0.01, false);
    expect((await progress(id)).total_pagado).toBe(499.99);
    await request('PATCH', `/administradores/pagos/${remaining}/validar`, { token: admin.token, body: { estado: 'completado' }, status: 200 });
    expect(await progress(id)).toMatchObject({ total_pagado: 500, pago_completo: true, puede_concluir: true });
  });

  test('cumplimiento rechaza fechas futuras y actividades de otro curso', async () => {
    const course = await createCourse({ price: 0, threshold: 100, count: 2, publish: true, dates: ['2999-01-01', '2000-01-01'] });
    const foreign = await createCourse({ price: 0, threshold: 100, count: 1, publish: true });
    const id = await enroll(course);
    await assertBlocked('PUT', `/seguimiento/inscripciones/${id}/actividades/${course.activities[0]}`, { token: admin.token, body: { cumplida: true } });
    await request('PUT', `/seguimiento/inscripciones/${id}/actividades/${foreign.activities[0]}`, { token: admin.token, body: { cumplida: true }, status: 404 });
    await request('PUT', `/seguimiento/inscripciones/${id}/actividades/${course.activities[1]}`, { token: admin.token, body: { cumplida: 'true' }, status: 400 });
    await fulfill(id, [course.activities[1]]);
    await request('POST', `/seguimiento/cursos/${course.id}/reabrir`, { token: admin.token, status: 200 });
    await assertBlocked('PUT', `/seguimiento/actividades/${course.activities[1]}`, { token: admin.token, body: { titulo: 'Cambiar a futuro', tipo: 'sesion', modalidad: 'presencial', fecha: '2999-01-01' } });
    expect((await progress(id)).cumplidas).toBe(1);
  });

  test('una inscripción cancelada no registra asistencia, no concluye y no solicita constancias', async () => {
    const course = await createCourse({ price: 0, threshold: 100, count: 1, publish: true });
    const id = await enroll(course);
    await fulfill(id, course.activities);
    await request('PATCH', `/administradores/inscripciones/${id}/cancelar`, { token: admin.token, status: 200 });
    await assertBlocked('PUT', `/seguimiento/inscripciones/${id}/actividades/${course.activities[0]}`, { token: admin.token, body: { cumplida: true } });
    await assertBlocked('POST', `/seguimiento/inscripciones/${id}/concluir`, { token: admin.token });
    await assertBlocked('POST', '/constancias/mia', { token: alumno.token, body: { id_inscripcion: id } });
    expect(await progress(id)).toMatchObject({ estado: 'cancelada', puede_concluir: false, puede_solicitar_constancia: false });
  });

  test('estado completada histórico no habilita constancias nuevas; documentos autorizados anteriores siguen descargables', async () => {
    const course = await createCourse({ price: 0, threshold: 100, count: 1, publish: true });
    const id = await enroll(course);
    await fulfill(id, course.activities);
    await pool.query("UPDATE inscripciones SET estado='completada' WHERE id_inscripcion=$1", [id]);
    expect(await progress(id)).toMatchObject({ estado: 'completada', conclusion_validada: false, puede_solicitar_constancia: false });
    await assertBlocked('POST', '/constancias/mia', { token: alumno.token, body: { id_inscripcion: id } });
    const legacyPath = path.join(process.env.TEST_UPLOADS_DIR, 'constancias', `legacy-${tag}.pdf`);
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    const content = Buffer.from('%PDF-1.4\nDocumento historico sintetico de prueba\n%%EOF\n');
    await fs.writeFile(legacyPath, content);
    const cert = (await pool.query("INSERT INTO constancias (id_inscripcion,folio,archivo_url,estado) VALUES ($1,$2,$3,'autorizada') RETURNING *", [id, `HISTORICA-${tag}`, `/uploads/constancias/legacy-${tag}.pdf`])).rows[0];
    await pool.query(migration);
    const stored = (await pool.query('SELECT * FROM constancias WHERE id_constancia=$1', [cert.id_constancia])).rows[0];
    expect(stored).toEqual(cert);
    const download = await request('GET', `/constancias/mia/${cert.id_constancia}/descargar`, { token: alumno.token, status: 200 });
    expect(download.bytes).toEqual(content);
  });

  test('autorizar vuelve a validar el saldo y deja pendiente la solicitud cuando los datos ya no cumplen', async () => {
    const course = await createCourse({ threshold: 100, count: 1, publish: true });
    const id = await enroll(course);
    const paid = await payment(id, 500);
    await fulfill(id, course.activities);
    await request('POST', `/seguimiento/inscripciones/${id}/concluir`, { token: admin.token, status: 200 });
    const certificate = (await request('POST', '/constancias/mia', { token: alumno.token, body: { id_inscripcion: id }, status: 201 })).json.constancia.id_constancia;
    // Simula un registro antiguo inconsistente solo dentro del cluster temporal.
    await pool.query("UPDATE pagos SET estado='cancelado' WHERE id_pago=$1", [paid]);
    await assertBlocked('PATCH', `/constancias/${certificate}/autorizar`, { token: admin.token });
    expect((await pool.query('SELECT estado,archivo_url FROM constancias WHERE id_constancia=$1', [certificate])).rows[0]).toEqual({ estado: 'pendiente', archivo_url: null });
  });

  test('comprobante real via multipart se guarda aislado y solo lo descargan su dueño o admin', async () => {
    const course = await createCourse();
    const id = await enroll(course);
    const form = new FormData();
    const bytes = Buffer.from('%PDF-1.4\nComprobante sintetico de integracion\n%%EOF\n');
    form.set('id_inscripcion', String(id));
    form.set('metodo_pago', 'transferencia');
    form.set('referencia', `TEST-${tag}`);
    form.set('comprobante', new Blob([bytes], { type: 'application/pdf' }), 'comprobante.pdf');
    const created = await request('POST', '/pagos/mio', { token: alumno.token, body: form, status: 201 });
    const idPago = created.json.pago.id_pago;
    const receipt = await request('GET', `/pagos/mio/${idPago}/comprobante`, { token: alumno.token, status: 200 });
    expect(receipt.bytes).toEqual(bytes);
    await request('GET', `/pagos/mio/${idPago}/comprobante`, { token: otroAlumno.token, status: 404 });
    expect((await request('GET', `/administradores/pagos/${idPago}/comprobante`, { token: admin.token, status: 200 })).bytes).toEqual(bytes);
  });

  test('cuentas desactivadas pierden acceso aunque su token aún no haya vencido', async () => {
    await pool.query('UPDATE usuarios SET activo=false WHERE id_usuario=$1', [otroAlumno.id]);
    await request('GET', '/inscripciones/mias', { token: otroAlumno.token, status: 401 });
    await pool.query('UPDATE usuarios SET activo=true WHERE id_usuario=$1', [otroAlumno.id]);
    await pool.query('UPDATE administradores SET activo=false WHERE id_administrador=$1', [admin.id_administrador]);
    await request('GET', '/seguimiento/cursos', { token: admin.token, status: 401 });
    await pool.query('UPDATE administradores SET activo=true WHERE id_administrador=$1', [admin.id_administrador]);
  });
});
