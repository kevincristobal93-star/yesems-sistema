const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const adminModel = require('../models/administrador.model');

const SALT_ROUNDS = 10;

const listarPagosPendientes = async (req, res) => {
  try {
    const resultado = await adminModel.obtenerPagosPendientes();
    res.json({ ok: true, pagos: resultado });
  } catch (error) {
    console.error('Error al listar pagos pendientes:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const validarPago = async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['completado', 'cancelado'].includes(estado)) {
      return res.status(400).json({ ok: false, mensaje: 'estado debe ser completado o cancelado' });
    }
    const resultado = await adminModel.validarPago(req.params.id, estado);
    if (!resultado) return res.status(404).json({ ok: false, mensaje: 'Pago pendiente no encontrado' });
    res.json({ ok: true, pago: resultado });
  } catch (error) {
    console.error('Error al validar pago:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const descargarComprobantePago = async (req, res) => {
  try {
    const pago = await require('../models/pago.model').obtenerPagoPorId(req.params.id);
    if (!pago) return res.status(404).json({ ok: false, mensaje: 'Pago no encontrado' });
    if (!pago.comprobante_url) return res.status(404).json({ ok: false, mensaje: 'Este pago no tiene comprobante adjunto' });
    res.download(path.join(__dirname, '../..', pago.comprobante_url), path.basename(pago.comprobante_url));
  } catch (error) {
    console.error('Error al descargar comprobante:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const cancelarInscripcionAdmin = async (req, res) => {
  try {
    const resultado = await adminModel.cancelarInscripcionAdmin(req.params.id);
    if (!resultado) return res.status(404).json({ ok: false, mensaje: 'Inscripción no encontrada o ya cancelada' });
    res.json({ ok: true, mensaje: 'Inscripción cancelada', inscripcion: resultado });
  } catch (error) {
    console.error('Error al cancelar inscripción:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerResumen = async (req, res) => {
  try {
    const resultado = await adminModel.obtenerResumenPanel();
    res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('Error al obtener resumen administrativo:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const obtenerReportes = async (req, res) => {
  try {
    const reportes = await adminModel.obtenerReportesIniciales();
    res.json({ ok: true, reportes });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const listarAdministradores = async (req, res) => {
  try {
    const administradores = await adminModel.obtenerAdministradores();
    res.json({ ok: true, administradores });
  } catch (error) {
    console.error('Error al listar administradores:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// POST /api/administradores/registrar
const registrarAdmin = async (req, res) => {
  try {
    const { nombre, apellido, email, password } = req.body;

    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'nombre, apellido, email y password son obligatorios' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const nuevoAdmin = await adminModel.crearAdmin({ nombre, apellido, email, password_hash });

    res.status(201).json({ ok: true, administrador: nuevoAdmin });
  } catch (error) {
    console.error('Error al registrar administrador:', error);
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, mensaje: 'Ya existe un administrador con ese email' });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

// POST /api/administradores/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'email y password son obligatorios' });
    }

    const admin = await adminModel.obtenerAdminPorEmail(email);
    if (!admin || !admin.activo) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const passwordValido = await bcrypt.compare(password, admin.password_hash);
    if (!passwordValido) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id_administrador: admin.id_administrador, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      ok: true,
      token,
      administrador: {
        id_administrador: admin.id_administrador,
        nombre: admin.nombre,
        apellido: admin.apellido,
        email: admin.email,
      },
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const desactivarAdmin = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }

    const idAdministradorActual = Number(req.admin?.id_administrador);
    if (!Number.isInteger(idAdministradorActual)) {
      return res.status(401).json({ ok: false, error: 'Sesión administrativa inválida' });
    }
    if (id === idAdministradorActual) {
      return res.status(400).json({ ok: false, mensaje: 'No puedes desactivar tu propia cuenta' });
    }

    const existente = await adminModel.obtenerAdminPorId(id);
    if (!existente) {
      return res.status(404).json({ ok: false, mensaje: 'Administrador no encontrado' });
    }
    if (!existente.activo) {
      return res.status(400).json({ ok: false, mensaje: 'La cuenta administrativa ya está desactivada' });
    }

    const totalActivos = await adminModel.contarAdministradoresActivos();
    if (totalActivos <= 1) {
      return res.status(400).json({ ok: false, mensaje: 'No se puede desactivar la última cuenta de administrador activa' });
    }

    const desactivado = await adminModel.desactivarAdmin(id);
    res.json({ ok: true, mensaje: 'Administrador desactivado', administrador: desactivado });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  listarPagosPendientes,
  validarPago,
  descargarComprobantePago,
  cancelarInscripcionAdmin,
  obtenerResumen,
  obtenerReportes,
  listarAdministradores,
  registrarAdmin,
  login,
  desactivarAdmin,
};
