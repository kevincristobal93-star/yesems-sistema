const pool = require('../config/db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const obtenerUsuarios = async () => {
  const resultado = await pool.query(
    `SELECT id_usuario, nombre, apellido, email, telefono, fecha_nacimiento,
            curp, folio, rol, activo, created_at
     FROM usuarios WHERE activo = true ORDER BY apellido ASC, nombre ASC`
  );
  return resultado.rows;
};

const obtenerUsuarioPorId = async (id) => {
  const resultado = await pool.query(
    `SELECT id_usuario, nombre, apellido, email, telefono, fecha_nacimiento,
            curp, folio, rol, activo, created_at, token_version
     FROM usuarios WHERE id_usuario = $1`,
    [id]
  );
  return resultado.rows[0];
};

const obtenerUsuarioPorEmail = async (email) => {
  const resultado = await pool.query(
    'SELECT * FROM usuarios WHERE lower(btrim(email)) = $1',
    [typeof email === 'string' ? email.trim().toLowerCase() : '']
  );
  // No elegir arbitrariamente una cuenta si hay duplicados históricos.
  return resultado.rows.length === 1 ? resultado.rows[0] : undefined;
};

// Registro interno; la ruta pública requiere verificación de correo.
const registrarCliente = async (datos) => {
  const { nombre, apellido, email, password } = datos;
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const resultado = await pool.query(
    `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol)
     VALUES ($1, $2, $3, $4, 'cliente')
     RETURNING id_usuario, nombre, apellido, email, rol, activo, created_at`,
    [nombre, apellido, email, password_hash]
  );
  return resultado.rows[0];
};

// "Ascender" a alumno: completa sus datos al momento de inscribirse
const ascenderAAlumno = async (id, datos) => {
  const { telefono, fecha_nacimiento, curp } = datos;
  const resultado = await pool.query(
    `UPDATE usuarios
     SET telefono = $1,
         fecha_nacimiento = $2,
         curp = $3,
         folio = COALESCE(folio, 'YESEMS-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(id_usuario::text, 5, '0')),
         rol = 'alumno'
     WHERE id_usuario = $4
     RETURNING id_usuario, nombre, apellido, email, telefono, fecha_nacimiento, curp, folio, rol, activo`,
    [telefono, fecha_nacimiento, require('../utils/identidad').normalizarCurp(curp), id]
  );
  return resultado.rows[0];
};

const actualizarUsuario = async (id, datos) => {
  const { nombre, apellido, telefono, fecha_nacimiento, curp, folio } = datos;
  const resultado = await pool.query(
    `UPDATE usuarios SET nombre = $1, apellido = $2, telefono = $3,
     fecha_nacimiento = $4, curp = $5, folio = $6
     WHERE id_usuario = $7
     RETURNING id_usuario, nombre, apellido, email, telefono, fecha_nacimiento, curp, folio, rol, activo`,
    [nombre, apellido, telefono, fecha_nacimiento, curp ? require('../utils/identidad').normalizarCurp(curp) : null, folio, id]
  );
  return resultado.rows[0];
};

const desactivarUsuario = async (id) => {
  const resultado = await pool.query(
    'UPDATE usuarios SET activo = false WHERE id_usuario = $1 RETURNING id_usuario, nombre, apellido, activo',
    [id]
  );
  return resultado.rows[0];
};

const actualizarPerfilPropio = async (id, datos) => {
  const { nombre, apellido, telefono, fecha_nacimiento, curp } = datos;
  const resultado = await pool.query(
    `UPDATE usuarios SET nombre = $1, apellido = $2,
      telefono = CASE WHEN $5 THEN $3 ELSE telefono END,
      fecha_nacimiento = CASE WHEN $6 THEN $7::date ELSE fecha_nacimiento END,
      curp = CASE WHEN $8 THEN $9 ELSE curp END
      WHERE id_usuario = $4 AND activo = true
      RETURNING id_usuario, nombre, apellido, email, telefono, fecha_nacimiento, curp, folio, rol, activo`,
    [nombre, apellido, telefono ?? null, id, telefono !== undefined, fecha_nacimiento !== undefined, fecha_nacimiento ?? null, curp !== undefined, curp ?? null]
  );
  return resultado.rows[0];
};

module.exports = {
  obtenerUsuarios,
  obtenerUsuarioPorId,
  obtenerUsuarioPorEmail,
  registrarCliente,
  ascenderAAlumno,
  actualizarUsuario,
  desactivarUsuario,
  actualizarPerfilPropio,
};
