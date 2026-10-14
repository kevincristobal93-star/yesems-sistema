const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const usuarioModel = require('../models/usuario.model');

const listarUsuarios = async (req, res) => {
  try {
    const usuarios = await usuarioModel.obtenerUsuarios();
    res.json({ ok: true, usuarios });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await usuarioModel.obtenerUsuarioPorId(id);
    if (!usuario) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }
    res.json({ ok: true, usuario });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// POST /api/usuarios/registrar (público, catálogo abierto)
const registrarCliente = async (req, res) => {
  try {
    const { nombre, apellido, email, password } = req.body;
    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'nombre, apellido, email y password son obligatorios' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const nuevo = await usuarioModel.registrarCliente({ nombre, apellido, email, password });
    res.status(201).json({ ok: true, usuario: nuevo });
  } catch (error) {
    console.error('Error al registrar cliente:', error);
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe un usuario con ese email' });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

// POST /api/usuarios/login (público)
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'email y password son obligatorios' });
    }

    const usuario = await usuarioModel.obtenerUsuarioPorEmail(email);
    if (!usuario || !usuario.activo || !['cliente', 'alumno'].includes(usuario.rol) || !usuario.password_hash) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValido) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id_usuario: usuario.id_usuario, email: usuario.email, rol: usuario.rol, token_version: usuario.token_version || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      ok: true,
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// PUT /api/usuarios/:id/ascender — completa datos, genera folio y pasa a rol 'alumno'
const ascenderAAlumno = async (req, res) => {
  try {
    const { id } = req.params;
    const { telefono, fecha_nacimiento, curp } = req.body;

    if (!telefono || !fecha_nacimiento || !curp) {
      return res.status(400).json({ ok: false, mensaje: 'telefono, fecha_nacimiento y curp son obligatorios' });
    }

    const existente = await usuarioModel.obtenerUsuarioPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    const actualizado = await usuarioModel.ascenderAAlumno(id, { telefono, fecha_nacimiento, curp });
    res.json({ ok: true, usuario: actualizado });
  } catch (error) {
    console.error('Error al ascender a alumno:', error.code || error.name);
    if (error.statusCode) return res.status(error.statusCode).json({ok:false,mensaje:error.message});
    if (error.code === '23505') return res.status(409).json({ok:false,mensaje:'La CURP o el folio ya están registrados en otra cuenta.'});
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerPerfilPropio = async (req, res) => {
  try {
    const usuario = await usuarioModel.obtenerUsuarioPorId(req.admin.id_usuario);
    if (!usuario || !usuario.activo) return res.status(404).json({ ok: false, mensaje: 'Cuenta no encontrada' });
    res.json({ ok: true, usuario });
  } catch (error) {
    console.error('Error al obtener perfil propio:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const actualizarPerfilPropio = async (req, res) => {
  try {
    const perfil = require('../utils/perfil').validarPerfil(req.body);
    const usuario = await usuarioModel.actualizarPerfilPropio(req.admin.id_usuario, perfil);
    if (!usuario) return res.status(404).json({ ok: false, mensaje: 'Cuenta no encontrada' });
    res.json({ ok: true, usuario });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok:false, mensaje:error.message });
    if (error.code === '23505') return res.status(409).json({ ok:false, mensaje:'La CURP ya está registrada en otra cuenta.' });
    console.error('Error al actualizar perfil propio:', error.code || error.name);
    res.status(500).json({ ok: false, mensaje: 'No se pudo guardar tu ficha. Intenta nuevamente.' });
  }
};

function tipoDeImagen(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 2 * 1024 * 1024) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const guardarFotoPropia = async (req, res) => {
  try {
    const tipo = tipoDeImagen(req.file?.buffer);
    if (!tipo || tipo !== req.file.mimetype) return res.status(400).json({ ok: false, mensaje: 'Selecciona una foto JPG, PNG o WebP válida de hasta 2 MB.' });
    const guardada = await usuarioModel.guardarFotoPropia(req.admin.id_usuario, tipo, req.file.buffer);
    if (!guardada) return res.status(404).json({ ok: false, mensaje: 'Cuenta no encontrada' });
    res.json({ ok: true, actualizado_at: guardada.actualizado_at });
  } catch (error) {
    console.error('Error al guardar foto de perfil:', error.code || error.name);
    res.status(500).json({ ok: false, mensaje: 'No se pudo guardar la foto. Intenta nuevamente.' });
  }
};

const obtenerFotoPropia = async (req, res) => {
  try {
    const foto = await usuarioModel.obtenerFotoPropia(req.admin.id_usuario);
    if (!foto) return res.status(204).set('Cache-Control', 'private, no-store').end();
    res.set({ 'Content-Type': foto.mime_type, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
    res.send(foto.contenido);
  } catch (error) {
    console.error('Error al consultar foto de perfil:', error.code || error.name);
    res.status(500).json({ ok: false, mensaje: 'No se pudo consultar la foto.' });
  }
};

const eliminarFotoPropia = async (req, res) => {
  try {
    await usuarioModel.eliminarFotoPropia(req.admin.id_usuario);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar foto de perfil:', error.code || error.name);
    res.status(500).json({ ok: false, mensaje: 'No se pudo quitar la foto.' });
  }
};

const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, telefono, fecha_nacimiento, curp, folio } = req.body;

    const existente = await usuarioModel.obtenerUsuarioPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    const actualizado = await usuarioModel.actualizarUsuario(id, { nombre, apellido, telefono, fecha_nacimiento, curp, folio });
    res.json({ ok: true, usuario: actualizado });
  } catch (error) {
    console.error('Error al actualizar usuario:', error.code || error.name);
    if (error.statusCode) return res.status(error.statusCode).json({ok:false,mensaje:error.message});
    if (error.code === '23505') return res.status(409).json({ok:false,mensaje:'La CURP o el folio ya están registrados en otra cuenta.'});
    res.status(500).json({ ok: false, error: error.message });
  }
};

const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const existente = await usuarioModel.obtenerUsuarioPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }
    const desactivado = await usuarioModel.desactivarUsuario(id);
    res.json({ ok: true, mensaje: 'Usuario desactivado', usuario: desactivado });
  } catch (error) {
    console.error('Error al desactivar usuario:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  listarUsuarios,
  obtenerUsuario,
  registrarCliente,
  login,
  obtenerPerfilPropio,
  actualizarPerfilPropio,
  guardarFotoPropia,
  obtenerFotoPropia,
  eliminarFotoPropia,
  ascenderAAlumno,
  actualizarUsuario,
  eliminarUsuario,
};
