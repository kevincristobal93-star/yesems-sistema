const pool = require('../config/db');
const { withCourseLock } = require('./seguimiento.model');
const { httpError } = require('../utils/http-error');
const files = require('../services/aula-files.service');
const documentosSql = `COALESCE((SELECT json_agg(json_build_object('id_documento',d.id_documento,'titulo',d.titulo,'descripcion',d.descripcion,'bytes',d.bytes,'extension',regexp_replace(d.archivo_url, '^.*[.]', ''),'tipo_material',d.tipo_material,'principal_id',d.principal_id,'orden',d.orden) ORDER BY d.orden,d.id_documento) FROM aula_documentos d WHERE d.id_modulo=m.id_modulo AND d.activo), '[]'::json)`;
const videosSql = `COALESCE((SELECT json_agg(json_build_object('id_video',v.id_video,'titulo',v.titulo,'descripcion',v.descripcion,'url',v.url,'principal_id',v.principal_id) ORDER BY v.id_video) FROM aula_videos v WHERE v.id_modulo=m.id_modulo AND v.activo), '[]'::json)`;
async function validarOrganizacion(client, idModulo, idDocumento, tipo, principal, extension) {
  if (tipo === 'pdf' && extension !== 'pdf') throw httpError(400, 'El material principal debe ser un archivo PDF.');
  if (tipo === 'imagen' && !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) throw httpError(400, 'Selecciona una imagen JPG, PNG o WebP.');
  if (principal === null) return;
  if (principal === idDocumento || tipo === 'pdf') throw httpError(400, 'Un PDF principal no puede depender de otro material.');
  const { rows } = await client.query(`SELECT id_documento FROM aula_documentos
    WHERE id_documento=$1 AND id_modulo=$2 AND activo AND tipo_material='pdf' AND principal_id IS NULL`, [principal, idModulo]);
  if (!rows.length) throw httpError(400, 'Selecciona un PDF principal activo de este modulo.');
}

async function listarCursos() {
  return (await pool.query(`SELECT c.id_curso, c.nombre, c.activo,
    (SELECT count(*)::int FROM aula_modulos m WHERE m.id_curso=c.id_curso AND m.archivado_at IS NULL) AS modulos,
    (SELECT count(*)::int FROM aula_modulos m WHERE m.id_curso=c.id_curso AND m.archivado_at IS NULL AND m.publicado) AS publicados,
    (SELECT count(*)::int FROM aula_documentos d JOIN aula_modulos m ON m.id_modulo=d.id_modulo
      WHERE m.id_curso=c.id_curso AND m.archivado_at IS NULL AND d.activo) AS documentos,
    (SELECT count(*)::int FROM aula_videos v JOIN aula_modulos m ON m.id_modulo=v.id_modulo
      WHERE m.id_curso=c.id_curso AND m.archivado_at IS NULL AND v.activo) AS videos,
    ((SELECT count(*)::int FROM aula_documentos d JOIN aula_modulos m ON m.id_modulo=d.id_modulo
      WHERE m.id_curso=c.id_curso AND m.archivado_at IS NULL AND m.publicado AND d.activo)
     + (SELECT count(*)::int FROM aula_videos v JOIN aula_modulos m ON m.id_modulo=v.id_modulo
      WHERE m.id_curso=c.id_curso AND m.archivado_at IS NULL AND m.publicado AND v.activo)) AS materiales_publicados
    FROM cursos c ORDER BY c.nombre, c.id_curso`)).rows;
}
async function obtenerCurso(idCurso, client = pool) {
  // Un snapshot evita combinar la revisión de un estado con los módulos de otro.
  const { rows } = await client.query(`SELECT c.id_curso, c.nombre, c.activo, c.aula_revision,
    COALESCE((SELECT json_agg(json_build_object('id_imagen',g.id_imagen,'titulo',g.titulo)
      ORDER BY g.id_imagen) FROM curso_imagenes_publicas g
      WHERE g.id_curso=c.id_curso AND g.activo), '[]'::json) AS imagenes_publicas,
    COALESCE((SELECT json_agg(json_build_object('id_modulo', m.id_modulo, 'titulo', m.titulo,
      'descripcion', m.descripcion, 'orden', m.orden, 'publicado', m.publicado, 'archivado_at',m.archivado_at,'documentos', ${documentosSql},'videos',${videosSql})
      ORDER BY m.orden, m.id_modulo) FROM aula_modulos m WHERE m.id_curso=c.id_curso), '[]'::json) AS modulos
    FROM cursos c WHERE c.id_curso=$1`, [idCurso]);
  if (!rows[0]) throw httpError(404, 'Curso no encontrado.');
  const { modulos, ...curso } = rows[0];
  return { curso, modulos };
}
async function modificar(idCurso, revision, callback) {
  return withCourseLock(idCurso, async (client, curso) => {
    if (!curso.activo) throw httpError(409, 'El curso está desactivado. Su aula se conserva en modo de consulta.');
    if (curso.aula_revision !== revision) throw httpError(409, 'El aula cambió en otra sesión. Actualiza y revisa los cambios antes de guardar.');
    await callback(client);
    await client.query('UPDATE cursos SET aula_revision=aula_revision+1 WHERE id_curso=$1', [idCurso]);
    return obtenerCurso(idCurso, client);
  });
}
async function crearModulo(idCurso, revision, datos, admin) {
  return modificar(idCurso, revision, async client => {
    const count = (await client.query('SELECT count(*)::int AS cantidad FROM aula_modulos WHERE id_curso=$1', [idCurso])).rows[0].cantidad;
    if (count >= 100) throw httpError(409, 'El curso admite hasta 100 módulos.');
    await client.query(`INSERT INTO aula_modulos (id_curso, titulo, descripcion, orden, creado_por, actualizado_por)
      VALUES ($1,$2,$3,$4,$5,$5)`, [idCurso, datos.titulo, datos.descripcion, count + 1, admin]);
  });
}
async function editarModulo(idCurso, idModulo, revision, datos, admin) {
  return modificar(idCurso, revision, async client => {
    const result = await client.query(`UPDATE aula_modulos SET titulo=$3, descripcion=$4,
      actualizado_por=$5, actualizado_at=now() WHERE id_curso=$1 AND id_modulo=$2 RETURNING id_modulo`,
    [idCurso, idModulo, datos.titulo, datos.descripcion, admin]);
    if (!result.rowCount) throw httpError(404, 'Módulo no encontrado en este curso.');
  });
}
async function publicarModulo(idCurso, idModulo, revision, publicado, admin) {
  return modificar(idCurso, revision, async client => {
    if (publicado) {
      const materials = await client.query('SELECT count(*)::int AS total FROM aula_documentos WHERE id_modulo=$1 AND activo', [idModulo]);
      if (!materials.rows[0]?.total) throw httpError(409, 'Agrega al menos un documento activo antes de publicar este modulo.');
    }
    const result = await client.query(`UPDATE aula_modulos SET publicado=$3, actualizado_por=$4, actualizado_at=now()
      WHERE id_curso=$1 AND id_modulo=$2 AND archivado_at IS NULL RETURNING id_modulo`, [idCurso, idModulo, publicado, admin]);
    if (!result.rowCount) throw httpError(404, 'Módulo no encontrado en este curso.');
  });
}
async function archivarModulo(idCurso, idModulo, revision, archivado, admin) {
  return modificar(idCurso, revision, async client => {
    const result = await client.query(`UPDATE aula_modulos SET archivado_at=CASE WHEN $3 THEN COALESCE(archivado_at,now()) ELSE NULL END,
      publicado=CASE WHEN $3 THEN false ELSE publicado END, actualizado_por=$4, actualizado_at=now()
      WHERE id_curso=$1 AND id_modulo=$2 RETURNING id_modulo`, [idCurso,idModulo,archivado,admin]);
    if (!result.rowCount) throw httpError(404, 'Modulo no encontrado en este curso.');
  });
}
async function ordenarModulos(idCurso, revision, ids, admin) {
  return modificar(idCurso, revision, async client => {
    const current = (await client.query('SELECT id_modulo FROM aula_modulos WHERE id_curso=$1', [idCurso])).rows;
    const existing = new Set(current.map(m => m.id_modulo));
    if (ids.length !== existing.size || ids.some(id => !existing.has(id))) {
      throw httpError(400, 'El orden debe incluir todos los módulos de este curso y ningún módulo ajeno.');
    }
    // La restricción diferida permite intercambios sin duplicados al terminar la transacción.
    await client.query(`UPDATE aula_modulos m SET orden=n.posicion::integer, actualizado_por=$3, actualizado_at=now()
      FROM unnest($2::integer[]) WITH ORDINALITY AS n(id_modulo, posicion)
      WHERE m.id_curso=$1 AND m.id_modulo=n.id_modulo`, [idCurso, ids, admin]);
  });
}
async function obtenerAulaPropia(idInscripcion, idUsuario) {
  // Autorización y contenido en una sentencia. No basta el estado "confirmada":
  // se comprueba el saldo real. Nunca se devuelven títulos ni descripciones de borradores.
  const { rows } = await pool.query(`WITH acceso AS (
    SELECT i.id_inscripcion, i.monto_total, c.id_curso, c.nombre,
      c.descripcion AS descripcion_curso, c.duracion_horas, c.precio,
      cat.nombre AS categoria,
      (i.estado <> 'cancelada' AND c.activo AND NOT c.oferta_provisional AND
       COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_inscripcion=i.id_inscripcion
                 AND p.estado='completado'),0) >= i.monto_total) AS autorizado
    FROM inscripciones i JOIN cursos c ON c.id_curso=i.id_curso
    JOIN categorias cat ON cat.id_categoria=c.id_categoria
    WHERE i.id_inscripcion=$1 AND i.id_usuario=$2
  ) SELECT a.*, CASE WHEN a.autorizado THEN COALESCE((
      SELECT json_agg(json_build_object('id_modulo',m.id_modulo,'titulo',m.titulo,
        'descripcion',m.descripcion,'orden',m.orden,'documentos',${documentosSql},'videos',${videosSql},
        'completado',COALESCE(p.completado_at IS NOT NULL,false),'completado_at',p.completado_at) ORDER BY m.orden, m.id_modulo)
      FROM aula_modulos m LEFT JOIN aula_modulo_progreso p ON p.id_modulo=m.id_modulo AND p.id_inscripcion=a.id_inscripcion
      WHERE m.id_curso=a.id_curso AND m.publicado=true AND m.archivado_at IS NULL
    ),'[]'::json) ELSE '[]'::json END AS modulos FROM acceso a`, [idInscripcion, idUsuario]);
  if (!rows[0]) throw httpError(404, 'Inscripción no encontrada.');
  if (!rows[0].autorizado) throw httpError(403, 'El aula requiere un curso disponible, una inscripción no cancelada y el pago completo aprobado. Revisa tu inscripción en Mi panel.');
  const { id_inscripcion, id_curso, nombre, descripcion_curso, duracion_horas,
    precio, categoria, monto_total, modulos } = rows[0];
  const total = modulos.length;
  const completados = modulos.filter(modulo => modulo.completado).length;
  return { curso: { id_curso, nombre, descripcion: descripcion_curso, duracion_horas,
    precio, categoria, total_inscripcion: monto_total }, id_inscripcion, modulos,
    progreso: { completados, total, porcentaje: total ? Math.round(completados * 100 / total) : 0 } };
}
async function actualizarProgreso(idInscripcion, idUsuario, idModulo, completado) {
  const aula = await obtenerAulaPropia(idInscripcion,idUsuario);
  if (!aula.modulos.some(modulo => modulo.id_modulo === idModulo)) throw httpError(404, 'Modulo no disponible.');
  const { rows } = await pool.query(`INSERT INTO aula_modulo_progreso(id_inscripcion,id_modulo,completado_at)
    SELECT i.id_inscripcion,m.id_modulo,CASE WHEN $4::boolean THEN now() ELSE NULL END
    FROM inscripciones i JOIN cursos c ON c.id_curso=i.id_curso
    JOIN aula_modulos m ON m.id_curso=c.id_curso AND m.id_modulo=$3 AND m.publicado=true AND m.archivado_at IS NULL
    WHERE i.id_inscripcion=$1 AND i.id_usuario=$2 AND i.estado<>'cancelada' AND c.activo AND NOT c.oferta_provisional
      AND COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_inscripcion=i.id_inscripcion AND p.estado='completado'),0)>=i.monto_total
    ON CONFLICT(id_inscripcion,id_modulo) DO UPDATE SET completado_at=EXCLUDED.completado_at,actualizado_at=now()
    RETURNING completado_at`, [idInscripcion,idUsuario,idModulo,completado]);
  if (!rows[0]) throw httpError(403, 'El acceso al curso cambio. Actualiza tu aula e intenta de nuevo.');
  return obtenerAulaPropia(idInscripcion,idUsuario);
}
async function agregarDocumento(idCurso, idModulo, revision, titulo, descripcion, buffer, admin, extension = 'pdf', tipo = 'documento', principal = null) {
  let url;
  try {
    return await modificar(idCurso, revision, async client => {
      const module = await client.query('SELECT id_modulo FROM aula_modulos WHERE id_modulo=$1 AND id_curso=$2 AND archivado_at IS NULL', [idModulo, idCurso]);
      if (!module.rowCount) throw httpError(404, 'Módulo no encontrado.');
      const count = (await client.query('SELECT count(*)::int AS n FROM aula_documentos WHERE id_modulo=$1 AND activo', [idModulo])).rows[0].n;
      if (count >= 20) throw httpError(409, 'Cada módulo admite hasta 20 documentos activos.');
      await validarOrganizacion(client, idModulo, null, tipo, principal, extension);
      url = await files.guardar(buffer, extension);
      await client.query(`INSERT INTO aula_documentos(id_modulo,titulo,descripcion,archivo_url,bytes,creado_por,tipo_material,principal_id,orden)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MAX(orden),0)+1 FROM aula_documentos WHERE id_modulo=$1))`,
      [idModulo,titulo,descripcion,url,buffer.length,admin,tipo,principal]);
    });
  } catch (error) {
    if (url) { try { await files.descartar(url); } catch { console.error('No se pudo limpiar un archivo huérfano del aula. Revisar almacenamiento.'); } }
    throw error;
  }
}
async function reemplazarDocumento(idCurso, idDocumento, revision, titulo, descripcion, buffer, admin, extension = 'pdf', tipo = 'documento', principal = null) {
  let url;
  try {
    return await modificar(idCurso, revision, async client => {
      const previous = await client.query(`SELECT d.id_documento,d.id_modulo,d.orden FROM aula_documentos d JOIN aula_modulos m USING(id_modulo)
        WHERE d.id_documento=$1 AND m.id_curso=$2 AND d.activo AND m.archivado_at IS NULL FOR UPDATE OF d`, [idDocumento,idCurso]);
      if (!previous.rowCount) throw httpError(404, 'Documento activo no encontrado en este curso.');
      const { id_modulo, orden } = previous.rows[0];
      await validarOrganizacion(client, id_modulo, idDocumento, tipo, principal, extension);
      const dependents = await client.query(`SELECT ((SELECT count(*) FROM aula_documentos WHERE principal_id=$1 AND activo) +
        (SELECT count(*) FROM aula_videos WHERE principal_id=$1 AND activo))::int AS total`, [idDocumento]);
      if (dependents.rows[0].total && (tipo !== 'pdf' || principal !== null)) throw httpError(409, 'Este PDF tiene apoyos. Mantenlo como PDF principal o reorganiza sus apoyos primero.');
      url = await files.guardar(buffer, extension);
      const result = await client.query(`INSERT INTO aula_documentos(id_modulo,titulo,descripcion,archivo_url,bytes,creado_por,reemplaza_id,tipo_material,principal_id,orden)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_documento`, [id_modulo,titulo,descripcion,url,buffer.length,admin,idDocumento,tipo,principal,orden]);
      await client.query('UPDATE aula_documentos SET principal_id=$2 WHERE principal_id=$1 AND activo', [idDocumento,result.rows[0].id_documento]);
      await client.query('UPDATE aula_videos SET principal_id=$2 WHERE principal_id=$1 AND activo', [idDocumento,result.rows[0].id_documento]);
      await client.query('UPDATE aula_documentos SET activo=false WHERE id_documento=$1', [idDocumento]);
    });
  } catch (error) {
    if (url) { try { await files.descartar(url); } catch { console.error('No se pudo limpiar un archivo huérfano del aula. Revisar almacenamiento.'); } }
    throw error;
  }
}
async function historialCurso(idCurso) {
  const { rows } = await pool.query(`SELECT d.id_documento,d.id_modulo,m.titulo AS modulo,d.titulo,d.bytes,d.activo,d.reemplaza_id,d.creado_at,a.nombre AS administrador,
    (SELECT r.id_documento FROM aula_documentos r WHERE r.reemplaza_id=d.id_documento LIMIT 1) AS reemplazado_por
    FROM aula_documentos d JOIN aula_modulos m USING(id_modulo) JOIN administradores a ON a.id_administrador=d.creado_por
    WHERE m.id_curso=$1 ORDER BY d.creado_at DESC,d.id_documento DESC`, [idCurso]);
  return rows;
}
async function organizarDocumento(idCurso, idDocumento, revision, datos) {
  return modificar(idCurso, revision, async client => {
    const { rows } = await client.query(`SELECT d.id_modulo,regexp_replace(d.archivo_url, '^.*[.]', '') AS extension
      FROM aula_documentos d JOIN aula_modulos m USING(id_modulo)
      WHERE d.id_documento=$1 AND m.id_curso=$2 AND d.activo AND m.archivado_at IS NULL FOR UPDATE OF d`, [idDocumento,idCurso]);
    if (!rows.length) throw httpError(404, 'Material activo no encontrado en este curso.');
    await validarOrganizacion(client, rows[0].id_modulo, idDocumento, datos.tipo, datos.principal, rows[0].extension);
    const dependents = await client.query(`SELECT ((SELECT count(*) FROM aula_documentos WHERE principal_id=$1 AND activo) +
      (SELECT count(*) FROM aula_videos WHERE principal_id=$1 AND activo))::int AS total`, [idDocumento]);
    if (dependents.rows[0].total && (datos.tipo !== 'pdf' || datos.principal !== null)) throw httpError(409, 'Este PDF tiene apoyos. Reorganiza sus apoyos antes de cambiarlo.');
    await client.query(`UPDATE aula_documentos SET titulo=$2,descripcion=$3,tipo_material=$4,principal_id=$5 WHERE id_documento=$1`,
      [idDocumento,datos.titulo,datos.descripcion,datos.tipo,datos.principal]);
  });
}
async function ordenarDocumentos(idCurso, idModulo, revision, ids) {
  return modificar(idCurso, revision, async client => {
    const { rows } = await client.query(`SELECT d.id_documento FROM aula_documentos d JOIN aula_modulos m USING(id_modulo)
      WHERE d.id_modulo=$1 AND m.id_curso=$2 AND d.activo AND m.archivado_at IS NULL`, [idModulo,idCurso]);
    const existing = new Set(rows.map(row => row.id_documento));
    if (ids.length !== existing.size || ids.some(id => !existing.has(id))) throw httpError(400, 'El orden debe incluir todos los materiales activos de este modulo.');
    await client.query(`UPDATE aula_documentos d SET orden=n.posicion::integer
      FROM unnest($2::integer[]) WITH ORDINALITY AS n(id_documento,posicion)
      WHERE d.id_modulo=$1 AND d.id_documento=n.id_documento`, [idModulo,ids]);
  });
}
async function validarPrincipalVideo(client, idModulo, principal) {
  if (principal === null) return;
  const { rows } = await client.query(`SELECT id_documento FROM aula_documentos
    WHERE id_documento=$1 AND id_modulo=$2 AND activo AND tipo_material='pdf' AND principal_id IS NULL`, [principal,idModulo]);
  if (!rows.length) throw httpError(400, 'Selecciona un PDF principal activo de este modulo.');
}
async function agregarVideo(idCurso, idModulo, revision, datos, admin) {
  return modificar(idCurso, revision, async client => {
    const module = await client.query('SELECT id_modulo FROM aula_modulos WHERE id_modulo=$1 AND id_curso=$2 AND archivado_at IS NULL', [idModulo,idCurso]);
    if (!module.rowCount) throw httpError(404, 'Modulo no encontrado.');
    const count = await client.query('SELECT count(*)::int AS total FROM aula_videos WHERE id_modulo=$1 AND activo', [idModulo]);
    if (count.rows[0].total >= 20) throw httpError(409, 'Cada modulo admite hasta 20 enlaces de video.');
    await validarPrincipalVideo(client,idModulo,datos.principal);
    await client.query(`INSERT INTO aula_videos(id_modulo,principal_id,titulo,descripcion,url,creado_por)
      VALUES($1,$2,$3,$4,$5,$6)`, [idModulo,datos.principal,datos.titulo,datos.descripcion,datos.url,admin]);
  });
}
async function editarVideo(idCurso, idVideo, revision, datos) {
  return modificar(idCurso, revision, async client => {
    const { rows } = await client.query(`SELECT v.id_modulo FROM aula_videos v JOIN aula_modulos m USING(id_modulo)
      WHERE v.id_video=$1 AND m.id_curso=$2 AND v.activo AND m.archivado_at IS NULL FOR UPDATE OF v`, [idVideo,idCurso]);
    if (!rows.length) throw httpError(404, 'Video no encontrado en este curso.');
    await validarPrincipalVideo(client,rows[0].id_modulo,datos.principal);
    await client.query(`UPDATE aula_videos SET titulo=$2,descripcion=$3,url=$4,principal_id=$5 WHERE id_video=$1`,
      [idVideo,datos.titulo,datos.descripcion,datos.url,datos.principal]);
  });
}
async function retirarVideo(idCurso, idVideo, revision) {
  return modificar(idCurso, revision, async client => {
    const result = await client.query(`UPDATE aula_videos v SET activo=false FROM aula_modulos m
      WHERE v.id_video=$1 AND v.id_modulo=m.id_modulo AND m.id_curso=$2 AND v.activo RETURNING v.id_video`, [idVideo,idCurso]);
    if (!result.rowCount) throw httpError(404, 'Video no encontrado en este curso.');
  });
}
async function retirarDocumento(idCurso, idDocumento, revision, admin) {
  return modificar(idCurso, revision, async client => {
    const target = await client.query('SELECT d.id_modulo FROM aula_documentos d JOIN aula_modulos m USING(id_modulo) WHERE d.id_documento=$1 AND m.id_curso=$2 AND d.activo FOR UPDATE OF d', [idDocumento,idCurso]);
    if (!target.rowCount) throw httpError(404, 'Documento no encontrado.');
    const moduleId = target.rows[0].id_modulo;
    const activeCount = (await client.query('SELECT count(*)::int AS total FROM aula_documentos WHERE id_modulo=$1 AND activo', [moduleId])).rows[0].total;
    await client.query('UPDATE aula_documentos SET principal_id=NULL WHERE principal_id=$1 AND activo', [idDocumento]);
    await client.query('UPDATE aula_videos SET principal_id=NULL WHERE principal_id=$1 AND activo', [idDocumento]);
    await client.query('UPDATE aula_documentos SET activo=false WHERE id_documento=$1', [idDocumento]);
    if (activeCount === 1) await client.query('UPDATE aula_modulos SET publicado=false,actualizado_por=$2,actualizado_at=now() WHERE id_modulo=$1 AND publicado', [moduleId,admin]);
  });
}
async function documentoAdmin(idCurso, idDocumento) {
  const { rows } = await pool.query('SELECT d.* FROM aula_documentos d JOIN aula_modulos m USING(id_modulo) WHERE d.id_documento=$1 AND m.id_curso=$2 AND d.activo', [idDocumento,idCurso]);
  if (!rows[0]) throw httpError(404, 'Documento no encontrado.'); return rows[0];
}
async function documentoAlumno(inscripcion, usuario, documento) {
  const aula = await obtenerAulaPropia(inscripcion, usuario);
  if (!aula.modulos.some(m => m.documentos.some(d => d.id_documento === documento))) throw httpError(404, 'Documento no disponible.');
  return documentoAdmin(aula.curso.id_curso, documento);
}
module.exports = { listarCursos, obtenerCurso, crearModulo, editarModulo, publicarModulo, archivarModulo, ordenarModulos, obtenerAulaPropia, actualizarProgreso, agregarDocumento, reemplazarDocumento, organizarDocumento, ordenarDocumentos, agregarVideo, editarVideo, retirarVideo, historialCurso, retirarDocumento, documentoAdmin, documentoAlumno };
