const pool = require('../config/db');
const { withCourseLock } = require('./seguimiento.model');
const { httpError } = require('../utils/http-error');
const files = require('../services/aula-files.service');
const documentosSql = `COALESCE((SELECT json_agg(json_build_object('id_documento',d.id_documento,'titulo',d.titulo,'bytes',d.bytes) ORDER BY d.id_documento) FROM aula_documentos d WHERE d.id_modulo=m.id_modulo AND d.activo), '[]'::json)`;

async function listarCursos() {
  return (await pool.query('SELECT id_curso, nombre, activo FROM cursos ORDER BY nombre, id_curso')).rows;
}
async function obtenerCurso(idCurso, client = pool) {
  // Un snapshot evita combinar la revisión de un estado con los módulos de otro.
  const { rows } = await client.query(`SELECT c.id_curso, c.nombre, c.activo, c.aula_revision,
    COALESCE((SELECT json_agg(json_build_object('id_modulo', m.id_modulo, 'titulo', m.titulo,
      'descripcion', m.descripcion, 'orden', m.orden, 'publicado', m.publicado, 'documentos', ${documentosSql})
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
    const result = await client.query(`UPDATE aula_modulos SET publicado=$3, actualizado_por=$4, actualizado_at=now()
      WHERE id_curso=$1 AND id_modulo=$2 RETURNING id_modulo`, [idCurso, idModulo, publicado, admin]);
    if (!result.rowCount) throw httpError(404, 'Módulo no encontrado en este curso.');
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
    SELECT i.id_inscripcion, c.id_curso, c.nombre,
      (i.estado <> 'cancelada' AND c.activo AND NOT c.oferta_provisional AND
       COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_inscripcion=i.id_inscripcion
                 AND p.estado='completado'),0) >= i.monto_total) AS autorizado
    FROM inscripciones i JOIN cursos c ON c.id_curso=i.id_curso
    WHERE i.id_inscripcion=$1 AND i.id_usuario=$2
  ) SELECT a.*, CASE WHEN a.autorizado THEN COALESCE((
      SELECT json_agg(json_build_object('id_modulo',m.id_modulo,'titulo',m.titulo,
        'descripcion',m.descripcion,'orden',m.orden,'documentos',${documentosSql}) ORDER BY m.orden, m.id_modulo)
      FROM aula_modulos m WHERE m.id_curso=a.id_curso AND m.publicado=true
    ),'[]'::json) ELSE '[]'::json END AS modulos FROM acceso a`, [idInscripcion, idUsuario]);
  if (!rows[0]) throw httpError(404, 'Inscripción no encontrada.');
  if (!rows[0].autorizado) throw httpError(403, 'El aula requiere un curso disponible, una inscripción no cancelada y el pago completo aprobado. Revisa tu inscripción en Mi panel.');
  const { id_inscripcion, id_curso, nombre, modulos } = rows[0];
  return { curso: { id_curso, nombre }, id_inscripcion, modulos };
}
async function agregarDocumento(idCurso, idModulo, revision, titulo, buffer, admin) {
  let url;
  try {
    return await modificar(idCurso, revision, async client => {
      const module = await client.query('SELECT id_modulo FROM aula_modulos WHERE id_modulo=$1 AND id_curso=$2', [idModulo, idCurso]);
      if (!module.rowCount) throw httpError(404, 'Módulo no encontrado.');
      const count = (await client.query('SELECT count(*)::int AS n FROM aula_documentos WHERE id_modulo=$1 AND activo', [idModulo])).rows[0].n;
      if (count >= 20) throw httpError(409, 'Cada módulo admite hasta 20 PDF activos.');
      url = await files.guardar(buffer);
      await client.query('INSERT INTO aula_documentos(id_modulo,titulo,archivo_url,bytes,creado_por) VALUES ($1,$2,$3,$4,$5)', [idModulo,titulo,url,buffer.length,admin]);
    });
  } catch (error) {
    if (url) { try { await files.descartar(url); } catch { console.error('No se pudo limpiar un archivo huérfano del aula. Revisar almacenamiento.'); } }
    throw error;
  }
}
async function reemplazarDocumento(idCurso, idDocumento, revision, titulo, buffer, admin) {
  let url;
  try {
    return await modificar(idCurso, revision, async client => {
      const previous = await client.query(`SELECT d.id_documento,d.id_modulo FROM aula_documentos d JOIN aula_modulos m USING(id_modulo)
        WHERE d.id_documento=$1 AND m.id_curso=$2 AND d.activo FOR UPDATE OF d`, [idDocumento,idCurso]);
      if (!previous.rowCount) throw httpError(404, 'PDF activo no encontrado en este curso.');
      const { id_modulo } = previous.rows[0];
      url = await files.guardar(buffer);
      const result = await client.query(`INSERT INTO aula_documentos(id_modulo,titulo,archivo_url,bytes,creado_por,reemplaza_id)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id_documento`, [id_modulo,titulo,url,buffer.length,admin,idDocumento]);
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
async function retirarDocumento(idCurso, idDocumento, revision) {
  return modificar(idCurso, revision, async client => {
    const result = await client.query('UPDATE aula_documentos d SET activo=false FROM aula_modulos m WHERE d.id_documento=$1 AND d.id_modulo=m.id_modulo AND m.id_curso=$2 AND d.activo RETURNING d.id_documento', [idDocumento,idCurso]);
    if (!result.rowCount) throw httpError(404, 'Documento no encontrado.');
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
module.exports = { listarCursos, obtenerCurso, crearModulo, editarModulo, publicarModulo, ordenarModulos, obtenerAulaPropia, agregarDocumento, reemplazarDocumento, historialCurso, retirarDocumento, documentoAdmin, documentoAlumno };
