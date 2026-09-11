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
            curp, folio, rol, activo, created_at
     FROM usuarios WHERE id_usuario = $1`,
    [id]
  );
  return resultado.rows[0];
};

const obtenerUsuarioPorEmail = async (email) => {
  const resultado = await pool.query(
    'SELECT * FROM usuarios WHERE email = $1',
    [email]
  );
  return resultado.rows[0];
};

// Registro ligero de un cliente nuevo (sin CURP/folio todavía)
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
    [telefono, fecha_nacimiento, curp, id]
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
    [nombre, apellido, telefono, fecha_nacimiento, curp, folio, id]
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

module.exports = {
  obtenerUsuarios,
  obtenerUsuarioPorId,
  obtenerUsuarioPorEmail,
  registrarCliente,
  ascenderAAlumno,
  actualizarUsuario,
  desactivarUsuario,
};
