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
    if (!usuario || !usuario.activo || !usuario.password_hash) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValido) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id_usuario: usuario.id_usuario, email: usuario.email, rol: usuario.rol },
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
    console.error('Error al ascender a alumno:', error);
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
    const { nombre, apellido, telefono } = req.body;
    if (!nombre || !apellido) return res.status(400).json({ ok: false, mensaje: 'nombre y apellido son obligatorios' });
    const usuario = await usuarioModel.actualizarPerfilPropio(req.admin.id_usuario, { nombre: nombre.trim(), apellido: apellido.trim(), telefono: telefono?.trim() });
    if (!usuario) return res.status(404).json({ ok: false, mensaje: 'Cuenta no encontrada' });
    res.json({ ok: true, usuario });
  } catch (error) {
    console.error('Error al actualizar perfil propio:', error);
    res.status(500).json({ ok: false, error: error.message });
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
    console.error('Error al actualizar usuario:', error);
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
  ascenderAAlumno,
  actualizarUsuario,
  eliminarUsuario,
};
