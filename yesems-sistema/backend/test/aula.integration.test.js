const enabled = process.env.YES_EMS_ISOLATED_TEST === '1' && process.env.NODE_ENV === 'test'
  && process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL;
const integration = enabled ? describe : describe.skip;
integration('Aula virtual: permisos, edición y publicación en PostgreSQL aislado', () => {
  let pool, server, origin, admin, alumno, other, userId, course, enrollment, state;
  async function api(path, method = 'GET', body, token = admin, status = 200) {
    const res = await fetch(`${origin}/api/aula${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    expect({ status: res.status, ...(res.status >= 500 ? { data } : {}) }).toEqual({ status });
    expect(res.headers.get('cache-control')).toBe('no-store');
    return data;
  }
  async function upload(path, fields, file, token = admin, status = 201, method = 'POST') {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
    if (file) form.append('archivo', new Blob([file.bytes], { type: file.type || 'application/pdf' }), file.name || 'material.pdf');
    const response = await fetch(`${origin}/api/aula${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body: form });
    const data = await response.json();
    expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('no-store'); return data;
  }
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/yesems_progress_test') throw Error('Solo base temporal.');
    pool = require('../src/config/db');
    await require('../src/config/run-migrations').runStartupMigrations();
    const jwt = require('jsonwebtoken');
    const sign = data => jwt.sign(data, process.env.JWT_SECRET, { expiresIn: '1h' });
    const a = (await pool.query("INSERT INTO administradores(nombre,apellido,email,password_hash) VALUES ('Aula','Prueba','aula-admin@example.test','test-only') RETURNING id_administrador")).rows[0]; admin = sign(a);
    for (const email of ['aula-user@example.test', 'aula-other@example.test']) {
      const u = (await pool.query("INSERT INTO usuarios(nombre,apellido,email) VALUES ('Aula','Prueba',$1) RETURNING id_usuario", [email])).rows[0];
      if (!alumno) { userId = u.id_usuario; alumno = sign(u); } else other = sign(u);
    }
    const cat = (await pool.query("INSERT INTO categorias(nombre) VALUES ('Aula prueba') RETURNING id_categoria")).rows[0].id_categoria;
    course = (await pool.query("INSERT INTO cursos(id_categoria,nombre,duracion_horas,precio,cupo) VALUES ($1,'Aula de prueba',60,1000,10) RETURNING id_curso", [cat])).rows[0].id_curso;
    enrollment = (await pool.query("INSERT INTO inscripciones(id_usuario,id_curso,monto_total,estado) VALUES ($1,$2,1000,'confirmada') RETURNING id_inscripcion", [userId, course])).rows[0].id_inscripcion;
    const app = require('../src/app');
    app.use(require('express').static(require('path').resolve(__dirname, '../../frontend')));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  }, 60000);
  afterAll(async () => { if (server) { server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); } if (pool) await pool.end(); });
  test('solo administradores pueden crear y consultar borradores', async () => {
    await api('/admin/cursos', 'GET', null, null, 401);
    await api('/admin/cursos', 'GET', null, alumno, 403);
    state = await api(`/admin/cursos/${course}`);
    state = await api(`/admin/cursos/${course}/modulos`, 'POST', { revision: 0, titulo: 'Borrador privado', publicado: true }, admin, 201);
    expect(state.modulos[0].publicado).toBe(false);
    state = await api(`/admin/cursos/${course}/modulos`, 'POST', { revision: 1, titulo: '<img src=x onerror=alert(1)>', descripcion: 'Texto seguro' }, admin, 201);
    expect(state.curso.aula_revision).toBe(2);
  });
  test('publicar y ordenar con protección contra cambios concurrentes', async () => {
    const ids = state.modulos.map(m => m.id_modulo).reverse();
    await api(`/admin/cursos/${course}/orden`, 'PUT', { revision: 0, modulos: ids }, admin, 409);
    await api(`/admin/cursos/${course}/orden`, 'PUT', { revision: 2, modulos: [ids[0]] }, admin, 400);
    await api(`/admin/cursos/${course}/orden`, 'PUT', { revision: 2, modulos: [ids[0], ids[0]] }, admin, 400);
    state = await api(`/admin/cursos/${course}/orden`, 'PUT', { revision: 2, modulos: ids });
    expect(state.modulos.map(m => m.id_modulo)).toEqual(ids);
    state = await api(`/admin/cursos/${course}/modulos/${ids[0]}/publicacion`, 'PATCH', { revision: 3, publicado: true });
    await api(`/admin/cursos/${course}/modulos/2147483647`, 'PUT', { revision: 4, titulo: 'Ajeno' }, admin, 404);
    const body = { revision: 4, titulo: 'Edición concurrente' };
    const results = await Promise.all([1, 2].map(() => fetch(`${origin}/api/aula/admin/cursos/${course}/modulos/${ids[1]}`, { method: 'PUT', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    await Promise.all(results.map(r => r.text()));
  });
  test('exige propiedad, curso activo y pago completo aprobado; oculta borradores', async () => {
    await api(`/mia/${enrollment}`, 'GET', null, other, 404);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 403);
    await pool.query("INSERT INTO pagos(id_inscripcion,monto,metodo_pago,estado) VALUES ($1,500,'efectivo','completado'),($1,500,'transferencia','pendiente')", [enrollment]);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 403);
    await pool.query("UPDATE pagos SET estado='completado' WHERE id_inscripcion=$1", [enrollment]);
    const data = await api(`/mia/${enrollment}`, 'GET', null, alumno);
    expect(data.modulos).toHaveLength(1); expect(JSON.stringify(data)).not.toContain('Edición concurrente');
    await pool.query("UPDATE inscripciones SET estado='cancelada' WHERE id_inscripcion=$1", [enrollment]);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 403);
    await pool.query("UPDATE inscripciones SET estado='confirmada' WHERE id_inscripcion=$1", [enrollment]);
    await pool.query('UPDATE cursos SET activo=false WHERE id_curso=$1', [course]);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 403);
    await api(`/admin/cursos/${course}/modulos`, 'POST', { revision: 5, titulo: 'No permitido' }, admin, 409);
    await pool.query('UPDATE cursos SET activo=true WHERE id_curso=$1', [course]);
    await pool.query('UPDATE usuarios SET activo=false WHERE id_usuario=$1', [userId]);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 401);
    await pool.query('UPDATE usuarios SET activo=true WHERE id_usuario=$1', [userId]);
  });
  test('solo administración carga PDF y el alumno autorizado recibe únicamente material publicado', async () => {
    state = await api(`/admin/cursos/${course}`);
    const published = state.modulos.find(m => m.publicado);
    const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    await upload(`/admin/cursos/${course}/modulos/${published.id_modulo}/documentos`, { revision: state.curso.aula_revision, titulo: 'Guía inicial' }, { bytes: validPdf }, alumno, 403);
    state = await upload(`/admin/cursos/${course}/modulos/${published.id_modulo}/documentos`, { revision: state.curso.aula_revision, titulo: 'Guía inicial' }, { bytes: validPdf });
    const document = state.modulos.find(m => m.id_modulo === published.id_modulo).documentos[0];
    await upload(`/admin/cursos/${course}/modulos/${published.id_modulo}/documentos`, { revision: state.curso.aula_revision, titulo: 'No PDF' }, { bytes: Buffer.from('texto'), type: 'text/plain', name: 'texto.txt' }, admin, 400);
    const unauthorized = await fetch(`${origin}/api/aula/mia/${enrollment}/documentos/${document.id_documento}`, { headers: { Authorization: `Bearer ${other}` } });
    expect(unauthorized.status).toBe(404);
    const allowed = await fetch(`${origin}/api/aula/mia/${enrollment}/documentos/${document.id_documento}`, { headers: { Authorization: `Bearer ${alumno}` } });
    expect(allowed.status).toBe(200); expect(allowed.headers.get('content-type')).toContain('application/pdf'); expect(Buffer.from(await allowed.arrayBuffer())).toEqual(validPdf);
    const replacement = Buffer.from('%PDF-1.4\n1 0 obj\n<</Version 2>>\nendobj\n%%EOF\n');
    await upload(`/admin/cursos/${course}/documentos/${document.id_documento}`, { revision: state.curso.aula_revision, titulo: 'Guía nueva' }, { bytes: replacement }, alumno, 403, 'PUT');
    state = await upload(`/admin/cursos/${course}/documentos/${document.id_documento}`, { revision: state.curso.aula_revision, titulo: 'Guía nueva' }, { bytes: replacement }, admin, 200, 'PUT');
    const current = state.modulos.find(m => m.id_modulo === published.id_modulo).documentos[0];
    expect(current.id_documento).not.toBe(document.id_documento);
    const history = await api(`/admin/cursos/${course}/historial-pdf`);
    expect(history.documentos.find(d => d.id_documento === document.id_documento)).toMatchObject({ activo: false, reemplazado_por: current.id_documento });
    expect(history.documentos.find(d => d.id_documento === current.id_documento)).toMatchObject({ activo: true, reemplaza_id: document.id_documento });
    expect(JSON.stringify(history)).not.toContain('archivo_url');
    const old = await fetch(`${origin}/api/aula/mia/${enrollment}/documentos/${document.id_documento}`, { headers: { Authorization: `Bearer ${alumno}` } });
    expect(old.status).toBe(404);
    const fresh = await fetch(`${origin}/api/aula/mia/${enrollment}/documentos/${current.id_documento}`, { headers: { Authorization: `Bearer ${alumno}` } });
    expect(fresh.status).toBe(200); expect(Buffer.from(await fresh.arrayBuffer())).toEqual(replacement);
    state = await api(`/admin/cursos/${course}/modulos/${published.id_modulo}/publicacion`, 'PATCH', { revision: state.curso.aula_revision, publicado: false });
    const hidden = await fetch(`${origin}/api/aula/mia/${enrollment}/documentos/${current.id_documento}`, { headers: { Authorization: `Bearer ${alumno}` } });
    expect(hidden.status).toBe(404);
    state = await api(`/admin/cursos/${course}/modulos/${published.id_modulo}/publicacion`, 'PATCH', { revision: state.curso.aula_revision, publicado: true });
    state = await api(`/admin/cursos/${course}/documentos/${current.id_documento}`, 'DELETE', { revision: state.curso.aula_revision });
    expect(state.modulos.flatMap(m => m.documentos).some(d => d.id_documento === current.id_documento)).toBe(false);
    expect((await pool.query('SELECT activo FROM aula_documentos WHERE id_documento=$1', [current.id_documento])).rows[0].activo).toBe(false);
  });
  test('migración repetible y sin alterar actividades ni constancias', async () => {
    const before = await api(`/admin/cursos/${course}`);
    const sql = await require('fs/promises').readFile(require('path').resolve(__dirname, '../database/migrations/010_classroom_modules.sql'), 'utf8');
    const documents = await require('fs/promises').readFile(require('path').resolve(__dirname, '../database/migrations/011_classroom_documents.sql'), 'utf8');
    const versions = await require('fs/promises').readFile(require('path').resolve(__dirname, '../database/migrations/012_classroom_document_versions.sql'), 'utf8');
    await pool.query(sql); await pool.query(sql); await pool.query(documents); await pool.query(documents); await pool.query(versions); await pool.query(versions);
    expect(await api(`/admin/cursos/${course}`)).toEqual(before);
    expect((await pool.query('SELECT count(*)::int AS n FROM curso_actividades WHERE id_curso=$1', [course])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM constancias WHERE id_inscripcion=$1', [enrollment])).rows[0].n).toBe(0);
  });
  test('navegador: edición, publicación, texto seguro y vista móvil de alumno', async () => {
    const browser = await require('./helpers/browser-client').startBrowser(origin);
    try {
      await browser.navigate(`${origin}/admin-aula.html`);
      await browser.evaluate(`localStorage.setItem('yesems_admin_token', ${JSON.stringify(admin)}); localStorage.setItem('yesems_token', ${JSON.stringify(alumno)})`);
      await browser.navigate(`${origin}/admin-aula.html`);
      await browser.waitFor(`document.querySelector('#courses').options.length > 1`);
      await browser.fill('#courses', String(course));
      await browser.waitFor(`document.querySelectorAll('#modules article').length === 2`);
      expect(await browser.evaluate(`document.querySelectorAll('#modules img').length`)).toBe(0);
      await browser.fill('#title', 'Módulo desde navegador'); await browser.fill('#description', 'Descripción de prueba');
      await browser.click('button[type=submit]');
      await browser.waitFor(`document.querySelectorAll('#modules article').length === 3`);
      await browser.click('#modules article:last-child .actions button:first-child');
      await browser.fill('#description', 'Descripción revisada');
      await browser.click('button[type=submit]');
      await browser.waitFor(`document.querySelector('#modules article:last-child p').textContent === 'Descripción revisada'`);
      await browser.click('#modules article:last-child .actions button:nth-child(2)');
      await browser.waitFor(`document.querySelector('#modules article:last-child .badge').textContent === 'Publicado'`);
      await browser.click('#modules article:last-child .actions button:nth-child(3)');
      await browser.waitFor(`document.querySelector('#modules article:nth-child(2) h2').textContent.includes('Módulo desde navegador')`);
      await browser.viewport(390, 844);
      expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await browser.navigate(`${origin}/aula.html?inscripcion=${enrollment}`);
      await browser.waitFor(`document.querySelectorAll('#modules article').length === 2`);
      expect(await browser.evaluate(`document.querySelectorAll('#modules button, #modules img').length`)).toBe(0);
      expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await browser.evaluate(`localStorage.setItem('yesems_token','invalid')`); await browser.click('#refresh');
      await browser.waitFor(`!document.querySelector('#login').hidden`);
      expect(await browser.evaluate(`document.querySelectorAll('#modules article').length`)).toBe(0);
      expect(browser.errors).toEqual([]);
    } finally { await browser.close(); }
  }, 90000);
});
