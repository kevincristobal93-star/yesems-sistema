const enabled = process.env.YES_EMS_ISOLATED_TEST === '1' && process.env.NODE_ENV === 'test'
  && process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL;
const integration = enabled ? describe : describe.skip;
integration('Aula virtual: permisos, edición y publicación en PostgreSQL aislado', () => {
  let pool, server, origin, admin, alumno, other, userId, course, enrollment, state, publicImageId;
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
    const courses = await api('/admin/cursos');
    expect(courses.cursos.find(item => Number(item.id_curso) === course)).toMatchObject({ modulos: 2, publicados: 0, documentos: 0, videos: 0, materiales_publicados: 0 });
  });
  test('publicar y ordenar con protección contra cambios concurrentes', async () => {
    const ids = state.modulos.map(m => m.id_modulo).reverse();
    await api(`/admin/cursos/${course}/orden`, 'PUT', { revision: 0, modulos: ids }, admin, 409);
    await api(`/admin/cursos/${course}/orden`, 'PUT', { revision: 2, modulos: [ids[0]] }, admin, 400);
    await api(`/admin/cursos/${course}/orden`, 'PUT', { revision: 2, modulos: [ids[0], ids[0]] }, admin, 400);
    state = await api(`/admin/cursos/${course}/orden`, 'PUT', { revision: 2, modulos: ids });
    expect(state.modulos.map(m => m.id_modulo)).toEqual(ids);
    await api(`/admin/cursos/${course}/modulos/${ids[0]}/publicacion`, 'PATCH', { revision: 3, publicado: true }, admin, 409);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    state = await upload(`/admin/cursos/${course}/modulos/${ids[0]}/documentos`, { revision: 3, titulo: 'Manual de prueba', descripcion: 'Material inicial' }, { bytes: pdf });
    state = await api(`/admin/cursos/${course}/modulos/${ids[0]}/publicacion`, 'PATCH', { revision: 4, publicado: true });
    await api(`/admin/cursos/${course}/modulos/2147483647`, 'PUT', { revision: 5, titulo: 'Ajeno' }, admin, 404);
    const body = { revision: 5, titulo: 'Edicion concurrente' };
    const results = await Promise.all([1, 2].map(() => fetch(`${origin}/api/aula/admin/cursos/${course}/modulos/${ids[1]}`, { method: 'PUT', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    await Promise.all(results.map(r => r.text()));
    state = await api(`/admin/cursos/${course}/modulos/${ids[1]}/archivo`, 'PATCH', { revision: 6, archivado: true });
    expect(state.modulos.find(m => m.id_modulo === ids[1]).archivado_at).toBeTruthy();
    state = await api(`/admin/cursos/${course}/modulos/${ids[1]}/archivo`, 'PATCH', { revision: 7, archivado: false });
    expect(state.modulos.find(m => m.id_modulo === ids[1]).archivado_at).toBeNull();
  });
  test('exige propiedad, curso activo y pago completo aprobado; oculta borradores', async () => {
    await api(`/mia/${enrollment}`, 'GET', null, other, 404);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 403);
    await pool.query("INSERT INTO pagos(id_inscripcion,monto,metodo_pago,estado) VALUES ($1,500,'efectivo','completado'),($1,500,'transferencia','pendiente')", [enrollment]);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 403);
    await pool.query("UPDATE pagos SET estado='completado' WHERE id_inscripcion=$1", [enrollment]);
    const data = await api(`/mia/${enrollment}`, 'GET', null, alumno);
    expect(data.modulos).toHaveLength(1); expect(JSON.stringify(data)).not.toContain('Edición concurrente');
    expect(data.progreso).toEqual({ completados: 0, total: 1, porcentaje: 0 });
    const moduleId = data.modulos[0].id_modulo;
    await api(`/mia/${enrollment}/modulos/${moduleId}/progreso`, 'PATCH', { completado: true }, other, 404);
    const completed = await api(`/mia/${enrollment}/modulos/${moduleId}/progreso`, 'PATCH', { completado: true }, alumno);
    expect(completed.progreso).toEqual({ completados: 1, total: 1, porcentaje: 100 });
    const pending = await api(`/mia/${enrollment}/modulos/${moduleId}/progreso`, 'PATCH', { completado: false }, alumno);
    expect(pending.progreso).toEqual({ completados: 0, total: 1, porcentaje: 0 });
    await pool.query("UPDATE inscripciones SET estado='cancelada' WHERE id_inscripcion=$1", [enrollment]);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 403);
    await pool.query("UPDATE inscripciones SET estado='confirmada' WHERE id_inscripcion=$1", [enrollment]);
    await pool.query('UPDATE cursos SET activo=false WHERE id_curso=$1', [course]);
    await api(`/mia/${enrollment}`, 'GET', null, alumno, 403);
    await api(`/admin/cursos/${course}/modulos`, 'POST', { revision: 8, titulo: 'No permitido' }, admin, 409);
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
    const document = state.modulos.find(m => m.id_modulo === published.id_modulo).documentos.find(d => d.titulo === 'Guía inicial');
    expect(document).toBeDefined();
    await upload(`/admin/cursos/${course}/modulos/${published.id_modulo}/documentos`, { revision: state.curso.aula_revision, titulo: 'No permitido' }, { bytes: Buffer.from('MZ'), type: 'application/octet-stream', name: 'programa.exe' }, admin, 400);
    const unauthorized = await fetch(`${origin}/api/aula/mia/${enrollment}/documentos/${document.id_documento}`, { headers: { Authorization: `Bearer ${other}` } });
    expect(unauthorized.status).toBe(404);
    const allowed = await fetch(`${origin}/api/aula/mia/${enrollment}/documentos/${document.id_documento}`, { headers: { Authorization: `Bearer ${alumno}` } });
    expect(allowed.status).toBe(200); expect(allowed.headers.get('content-type')).toContain('application/pdf'); expect(Buffer.from(await allowed.arrayBuffer())).toEqual(validPdf);
    const replacement = Buffer.from('%PDF-1.4\n1 0 obj\n<</Version 2>>\nendobj\n%%EOF\n');
    await upload(`/admin/cursos/${course}/documentos/${document.id_documento}`, { revision: state.curso.aula_revision, titulo: 'Guía nueva' }, { bytes: replacement }, alumno, 403, 'PUT');
    state = await upload(`/admin/cursos/${course}/documentos/${document.id_documento}`, { revision: state.curso.aula_revision, titulo: 'Guía nueva' }, { bytes: replacement }, admin, 200, 'PUT');
    const current = state.modulos.find(m => m.id_modulo === published.id_modulo).documentos.find(d => d.titulo === 'Guía nueva');
    expect(current).toBeDefined();
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
    const progressArchive = await require('fs/promises').readFile(require('path').resolve(__dirname, '../database/migrations/013_classroom_progress_archive.sql'), 'utf8');
    const publicGallery = await require('fs/promises').readFile(require('path').resolve(__dirname, '../database/migrations/014_course_gallery.sql'), 'utf8');
    const organization = await require('fs/promises').readFile(require('path').resolve(__dirname, '../database/migrations/015_classroom_material_organization.sql'), 'utf8');
    await pool.query(sql); await pool.query(sql); await pool.query(documents); await pool.query(documents); await pool.query(versions); await pool.query(versions); await pool.query(progressArchive); await pool.query(progressArchive); await pool.query(publicGallery); await pool.query(publicGallery); await pool.query(organization); await pool.query(organization);
    expect(await api(`/admin/cursos/${course}`)).toEqual(before);
    expect((await pool.query('SELECT count(*)::int AS n FROM curso_actividades WHERE id_curso=$1', [course])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM constancias WHERE id_inscripcion=$1', [enrollment])).rows[0].n).toBe(0);
  });
  test('galería pública: solo administración publica imágenes, sin exponer archivos privados', async () => {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZK0AAAAASUVORK5CYII=', 'base64');
    const send = async token => {
      const body = new FormData(); body.append('titulo', 'Vista de impresión 3D');
      body.append('archivo', new Blob([bytes], { type: 'image/png' }), 'presentacion.png');
      return fetch(`${origin}/api/cursos/${course}/imagenes`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    };
    expect((await send(alumno)).status).toBe(403);
    const created = await send(admin);
    expect(created.status).toBe(201);
    publicImageId = (await created.json()).imagenes[0].id_imagen;
    const catalog = await (await fetch(`${origin}/api/cursos`)).json();
    const listed = catalog.cursos.find(item => item.id_curso === course);
    expect(listed.imagenes_publicas).toEqual([{ id_imagen: publicImageId, titulo: 'Vista de impresión 3D' }]);
    expect(JSON.stringify(listed)).not.toContain('archivo_url');
    const image = await fetch(`${origin}/api/cursos/${course}/imagenes/${publicImageId}`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toContain('image/png');
    expect(image.headers.get('content-disposition')).toContain('inline');
    expect(Buffer.from(await image.arrayBuffer())).toEqual(bytes);
    expect(JSON.stringify(listed)).not.toContain('Manual de prueba');
    expect((await fetch(`${origin}/api/cursos/${course}/imagenes/2147483647`)).status).toBe(404);
  });
  test('catálogo público: ficha con galería a un lado y datos del curso al otro', async () => {
    const browser = await require('./helpers/browser-client').startBrowser(origin);
    try {
      await browser.navigate(`${origin}/cursos.html`);
      await browser.waitFor(`document.querySelector('[data-course-details="${course}"]')`);
      await browser.click(`[data-course-details="${course}"]`);
      await browser.waitFor(`document.querySelector('.course-detail-dialog[open] .course-detail-photo')?.complete`);
      expect(await browser.evaluate(`document.querySelector('.course-detail-photo').naturalWidth > 0`)).toBe(true);
      expect(await browser.evaluate(`document.querySelector('.course-detail-layout') !== null && document.querySelector('.course-detail-facts').textContent.includes('$1,000.00')`)).toBe(true);
      await browser.viewport(390, 844);
      expect(await browser.evaluate(`document.querySelector('.course-detail-dialog').scrollWidth <= document.querySelector('.course-detail-dialog').clientWidth`)).toBe(true);
      expect(browser.errors).toEqual([]);
    } finally { await browser.close(); }
  }, 90000);
  test('retirar una imagen pública no da acceso a documentos privados ni borra el archivo histórico', async () => {
    const url = `${origin}/api/cursos/${course}/imagenes/${publicImageId}`;
    expect((await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${alumno}` } })).status).toBe(403);
    const hidden = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
    expect(hidden.status).toBe(200);
    expect((await hidden.json()).imagenes).toEqual([]);
    expect((await fetch(url)).status).toBe(404);
    expect((await pool.query('SELECT activo FROM curso_imagenes_publicas WHERE id_imagen=$1', [publicImageId])).rows[0].activo).toBe(false);
  });
  test('navegador: edición, publicación, texto seguro y vista móvil de alumno', async () => {
    const browser = await require('./helpers/browser-client').startBrowser(origin);
    try {
      await browser.navigate(`${origin}/admin-aula.html`);
      await browser.evaluate(`localStorage.setItem('yesems_admin_token', ${JSON.stringify(admin)}); localStorage.setItem('yesems_token', ${JSON.stringify(alumno)})`);
      await browser.navigate(`${origin}/admin-aula.html?curso=${course}`);
      await browser.waitFor(`document.querySelector('#courses').options.length > 1`);
      await browser.waitFor(`document.querySelectorAll('#modules article').length === 2`);
      expect(await browser.evaluate(`document.querySelector('#courses').value`)).toBe(String(course));
      expect(await browser.evaluate(`document.querySelectorAll('#modules img').length`)).toBe(0);
      await browser.fill('#title', 'Módulo desde navegador'); await browser.fill('#description', 'Descripción de prueba');
      await browser.click('#module-form button[type=submit]');
      await browser.waitFor(`document.querySelectorAll('#modules article').length === 3`);
      await browser.click('#modules article:last-child .actions button:first-child');
      await browser.fill('#description', 'Descripción revisada');
      await browser.click('#module-form button[type=submit]');
      await browser.waitFor(`document.querySelector('#modules article:last-child p').textContent === 'Descripción revisada'`);
      expect(await browser.evaluate(`document.querySelector('#modules article:last-child .actions button[aria-label^="Publicar"]').disabled`)).toBe(true);
      const uploadResult = await browser.evaluate(`(async()=>{
        const token=localStorage.getItem('yesems_admin_token');
        const response=await fetch('https://yesems-sistema-1.onrender.com/api/aula/admin/cursos/${course}',{headers:{Authorization:'Bearer '+token}});
        const current=await response.json(); const form=new FormData();
        form.append('titulo','Manual de navegador'); form.append('descripcion','Guia de prueba para el alumno.');
        form.append('revision',String(current.curso.aula_revision));
        form.append('archivo',new Blob(['%PDF-1.4\\n1 0 obj\\n<<>>\\nendobj\\n%%EOF'],{type:'application/pdf'}),'manual.pdf');
        const result=await fetch('https://yesems-sistema-1.onrender.com/api/aula/admin/cursos/${course}/modulos/'+document.querySelector('#modules article:last-child').dataset.moduleId+'/documentos',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
        return {status:result.status,data:await result.json()};
      })()`);
      expect(uploadResult.status).toBe(201);
      await browser.click('#refresh');
      await browser.waitFor(`document.querySelector('#modules article:last-child .documents li .document-summary strong')?.textContent === 'Manual de navegador'`);
      expect(await browser.evaluate("document.querySelector('#modules article:last-child .module-visibility').dataset.visible")).toBe('false');
      expect(await browser.evaluate("document.querySelector('#modules article:last-child .module-visibility-publish').textContent")).toBe('Publicar módulo para alumnos');
      await browser.click('#modules article:last-child .actions button[aria-label^="Publicar"]');
      await browser.waitFor(`document.querySelector('#modules article:last-child .badge').textContent === 'Publicado'`);
      expect(await browser.evaluate("document.querySelector('#modules article:last-child .module-visibility').dataset.visible")).toBe('true');
      await browser.click('#modules article:last-child .actions button[aria-label^="Subir"]');
      await browser.waitFor(`document.querySelector('#modules article:nth-child(2) h2').textContent.includes('Módulo desde navegador')`);
      const galleryModule = await browser.evaluate(`Number(document.querySelector('#modules article:nth-child(2)').dataset.moduleId)`);
      const currentAula = await api(`/admin/cursos/${course}`);
      const previewPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZK0AAAAASUVORK5CYII=', 'base64');
      const withImage = await upload(`/admin/cursos/${course}/modulos/${galleryModule}/documentos`,
        { revision: currentAula.curso.aula_revision, titulo: 'Vista previa del curso' },
        { bytes: previewPng, type: 'image/png', name: 'vista.png' });
      expect(withImage.modulos.find(m => m.id_modulo === galleryModule).documentos.some(d => d.extension === 'png')).toBe(true);
      await upload(`/admin/cursos/${course}/modulos/${galleryModule}/documentos`,
        { revision: withImage.curso.aula_revision, titulo: 'Segunda vista del curso' },
        { bytes: previewPng, type: 'image/png', name: 'vista-2.png' });
      await browser.viewport(390, 844);
      expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await browser.navigate(`${origin}/aula.html?inscripcion=${enrollment}`);
      await browser.waitFor(`document.querySelectorAll('#modules article').length === 2`);
      await browser.waitFor(`!document.querySelector('#gallery-image').hidden && document.querySelector('#gallery-image').complete`);
      expect(await browser.evaluate(`document.querySelector('#gallery-image').naturalWidth > 0`)).toBe(true);
      expect(await browser.evaluate(`document.querySelector('#gallery-count').textContent === 'Imagen 1 de 2' && !document.querySelector('#gallery-next').hidden`)).toBe(true);
      await browser.click('#gallery-next');
      await browser.waitFor(`document.querySelector('#gallery-count').textContent === 'Imagen 2 de 2' && !document.querySelector('#gallery-image').hidden`);
      expect(await browser.evaluate(`document.querySelector('#course-category').textContent === 'Aula prueba' && document.querySelector('#course-price').textContent.includes('1,000')`)).toBe(true);
      expect(await browser.evaluate(`document.querySelectorAll('#modules .documents li[data-extension=png]').length`)).toBe(0);
      expect(await browser.evaluate(`document.querySelectorAll('#modules .actions').length === 0 && document.querySelectorAll('#modules button.module-complete').length === 2`)).toBe(true);
      expect(await browser.evaluate(`document.querySelector('#student-progress-count').textContent.includes('0 de 2')`)).toBe(true);
      await browser.click('#modules article:first-child button.module-complete');
      await browser.waitFor(`document.querySelector('#student-progress-count').textContent.includes('1 de 2')`);
      expect(await browser.evaluate(`document.querySelector('#modules article:nth-child(2) .documents li .document-summary p').textContent === 'Guia de prueba para el alumno.'`)).toBe(true);
      expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await browser.evaluate(`localStorage.setItem('yesems_usuario', JSON.stringify({ nombre:'Aula', apellido:'Prueba', email:'aula-user@example.test', rol:'alumno' }))`);
      await browser.navigate(`${origin}/panel.html`);
      await browser.waitFor(`document.querySelectorAll('#mi-aula .panel-aula-module').length === 2`);
      expect(await browser.evaluate(`document.querySelector('.enrollment-card').textContent.includes('Entrar al aula')`)).toBe(false);
      expect(await browser.evaluate(`document.querySelector('#mi-aula .panel-aula-resource.is-primary button[data-file-action="view"]') !== null`)).toBe(true);
      expect(await browser.evaluate(`document.querySelector('#mi-aula .panel-aula-progress-count').textContent.includes('1 de 2')`)).toBe(true);
      expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await browser.click('#mi-aula .panel-aula-resource.is-primary button[data-file-action="view"]');
      await browser.waitFor(`document.querySelector('.panel-aula-preview[open] iframe')?.src.startsWith('blob:')`);
      await browser.click('.panel-aula-preview-heading button');
      await browser.click('#mi-aula .panel-aula-module:first-child .panel-aula-complete');
      await browser.waitFor(`document.querySelector('#mi-aula .panel-aula-progress-count').textContent.includes('0 de 2')`);
      await browser.navigate(`${origin}/aula.html?inscripcion=${enrollment}`);
      await browser.evaluate(`localStorage.setItem('yesems_token','invalid')`); await browser.click('#refresh');
      await browser.waitFor(`!document.querySelector('#login').hidden`);
      expect(await browser.evaluate(`document.querySelectorAll('#modules article').length`)).toBe(0);
      expect(browser.errors).toEqual([]);
    } finally { await browser.close(); }
  }, 90000);
  test('subir, descargar y reemplazar texto conserva permisos y extensión', async () => {
    state = await api(`/admin/cursos/${course}`);
    const mod = state.modulos.find(m => m.publicado && !m.archivado_at);
    const bytes = Buffer.from('Guía del curso para practicar');
    state = await upload(`/admin/cursos/${course}/modulos/${mod.id_modulo}/documentos`, { revision: state.curso.aula_revision, titulo: 'Guía TXT' }, { bytes, name: 'guia.txt', type: 'text/plain' });
    const doc = state.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.find(d => d.titulo === 'Guía TXT');
    expect(doc.extension).toBe('txt');
    const url = `${origin}/api/aula/mia/${enrollment}/documentos/${doc.id_documento}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${alumno}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('.txt');
    expect(await response.text()).toBe(bytes.toString());
    expect((await fetch(url, { headers: { Authorization: `Bearer ${other}` } })).status).toBe(404);
    state = await upload(`/admin/cursos/${course}/documentos/${doc.id_documento}`, { revision: state.curso.aula_revision, titulo: 'Datos CSV' }, { bytes: Buffer.from('tema,actividad\nuno,lectura'), name: 'datos.csv', type: 'text/csv' }, admin, 200, 'PUT');
    expect(state.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.find(d => d.titulo === 'Datos CSV').extension).toBe('csv');
    expect((await fetch(url, { headers: { Authorization: `Bearer ${alumno}` } })).status).toBe(404);
  });
  test('organiza PDF y apoyos sin perder permisos ni relaciones al reemplazar', async () => {
    state = await api(`/admin/cursos/${course}`);
    const mod = state.modulos.find(m => m.publicado && !m.archivado_at);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    state = await upload(`/admin/cursos/${course}/modulos/${mod.id_modulo}/documentos`,
      { revision: state.curso.aula_revision, titulo: 'Tema central', tipo_material: 'pdf', principal_id: '' }, { bytes: pdf });
    const principal = state.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.find(d => d.titulo === 'Tema central');
    state = await upload(`/admin/cursos/${course}/modulos/${mod.id_modulo}/documentos`,
      { revision: state.curso.aula_revision, titulo: 'Mapa del tema', tipo_material: 'organizador', principal_id: principal.id_documento },
      { bytes: Buffer.from('Mapa conceptual'), name: 'mapa.txt', type: 'text/plain' });
    let support = state.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.find(d => d.titulo === 'Mapa del tema');
    expect(support).toMatchObject({ tipo_material: 'organizador', principal_id: principal.id_documento });
    state = await api(`/admin/cursos/${course}/modulos/${mod.id_modulo}/videos`, 'POST',
      { revision: state.curso.aula_revision, titulo: 'Demostracion', url: 'https://youtu.be/abc123', principal_id: principal.id_documento }, admin, 201);
    const videoId = state.modulos.find(m => m.id_modulo === mod.id_modulo).videos.find(v => v.titulo === 'Demostracion').id_video;
    await api(`/admin/cursos/${course}/documentos/${support.id_documento}/organizacion`, 'PATCH',
      { revision: state.curso.aula_revision, titulo: support.titulo, tipo_material: 'organizador', principal_id: 2147483647 }, admin, 400);
    state = await upload(`/admin/cursos/${course}/documentos/${principal.id_documento}`,
      { revision: state.curso.aula_revision, titulo: 'Tema central actualizado', tipo_material: 'pdf', principal_id: '' },
      { bytes: pdf }, admin, 200, 'PUT');
    const updated = state.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.find(d => d.titulo === 'Tema central actualizado');
    support = state.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.find(d => d.id_documento === support.id_documento);
    expect(support.principal_id).toBe(updated.id_documento);
    expect(state.modulos.find(m => m.id_modulo === mod.id_modulo).videos.find(v => v.id_video === videoId).principal_id).toBe(updated.id_documento);
    const own = await api(`/mia/${enrollment}`, 'GET', null, alumno);
    expect(own.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.find(d => d.id_documento === support.id_documento).principal_id).toBe(updated.id_documento);
    expect(own.modulos.find(m => m.id_modulo === mod.id_modulo).videos.find(v => v.id_video === videoId).url).toBe('https://youtu.be/abc123');
    const browser = await require('./helpers/browser-client').startBrowser(origin);
    try {
      await browser.navigate(`${origin}/aula.html?inscripcion=${enrollment}`);
      await browser.evaluate(`localStorage.setItem('yesems_token', ${JSON.stringify(alumno)})`);
      await browser.navigate(`${origin}/aula.html?inscripcion=${enrollment}`);
      await browser.waitFor(`document.querySelector('#modules .support-list .video-card a')`);
      expect(await browser.evaluate(`document.querySelector('#modules .support-list .video-card a').getAttribute('rel')`)).toContain('noopener');
      expect(await browser.evaluate(`document.querySelector('#modules .support-list li[data-material-type=organizador] .document-summary strong').textContent`)).toBe('Mapa del tema');
      await browser.viewport(390, 844);
      expect(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      expect(browser.errors).toEqual([]);
    } finally { await browser.close(); }
    await api(`/admin/cursos/${course}/modulos/${mod.id_modulo}/orden-documentos`, 'PUT',
      { revision: state.curso.aula_revision, documentos: [updated.id_documento] }, admin, 400);
    const ids = state.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.map(d => d.id_documento).reverse();
    state = await api(`/admin/cursos/${course}/modulos/${mod.id_modulo}/orden-documentos`, 'PUT',
      { revision: state.curso.aula_revision, documentos: ids });
    expect(state.modulos.find(m => m.id_modulo === mod.id_modulo).documentos.map(d => d.id_documento)).toEqual(ids);
    expect((await fetch(`${origin}/api/aula/mia/${enrollment}/documentos/${support.id_documento}`, { headers: { Authorization: `Bearer ${other}` } })).status).toBe(404);
  }, 90000);
});
