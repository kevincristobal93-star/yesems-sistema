const pool = require('../config/db');
const files = require('../services/aula-files.service');
const { httpError } = require('../utils/http-error');

async function listar(idCurso, client = pool) {
  const { rows } = await client.query(`SELECT id_imagen, titulo, extension
    FROM curso_imagenes_publicas WHERE id_curso=$1 AND activo ORDER BY id_imagen`, [idCurso]);
  return rows;
}

async function agregar(idCurso, titulo, buffer, extension, idAdmin) {
  const client = await pool.connect();
  let url;
  try {
    await client.query('BEGIN');
    const course = await client.query('SELECT activo FROM cursos WHERE id_curso=$1 FOR UPDATE', [idCurso]);
    if (!course.rowCount) throw httpError(404, 'Curso no encontrado.');
    if (!course.rows[0].activo) throw httpError(409, 'No se pueden publicar imágenes de un curso desactivado.');
    const count = await client.query('SELECT count(*)::int AS total FROM curso_imagenes_publicas WHERE id_curso=$1 AND activo', [idCurso]);
    if (count.rows[0].total >= 8) throw httpError(409, 'La galería admite hasta 8 imágenes. Quita una para agregar otra.');
    url = await files.guardar(buffer, extension);
    await client.query(`INSERT INTO curso_imagenes_publicas(id_curso,titulo,archivo_url,bytes,extension,creado_por)
      VALUES($1,$2,$3,$4,$5,$6)`, [idCurso, titulo, url, buffer.length, extension, idAdmin]);
    const images = await listar(idCurso, client);
    await client.query('COMMIT');
    return images;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (url) await files.descartar(url).catch(() => console.error('No se pudo limpiar una imagen de catálogo sin registro.'));
    throw error;
  } finally { client.release(); }
}

async function ocultar(idCurso, idImagen) {
  const result = await pool.query(`UPDATE curso_imagenes_publicas SET activo=false
    WHERE id_curso=$1 AND id_imagen=$2 AND activo RETURNING id_imagen`, [idCurso, idImagen]);
  if (!result.rowCount) throw httpError(404, 'Imagen no encontrada en este curso.');
  return listar(idCurso);
}

async function obtenerPublica(idCurso, idImagen) {
  const { rows } = await pool.query(`SELECT i.id_imagen,i.archivo_url,i.bytes
    FROM curso_imagenes_publicas i JOIN cursos c ON c.id_curso=i.id_curso
    WHERE i.id_curso=$1 AND i.id_imagen=$2 AND i.activo AND c.activo`, [idCurso, idImagen]);
  if (!rows[0]) throw httpError(404, 'Imagen no disponible.');
  return rows[0];
}

module.exports = { listar, agregar, ocultar, obtenerPublica };
