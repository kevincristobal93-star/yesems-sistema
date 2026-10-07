const jwt = require('jsonwebtoken');
const usuarioModel = require('../models/usuario.model');

async function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ ok: false, mensaje: 'Token no proporcionado' });
  }

  const partes = authHeader.split(' ');

  if (partes.length !== 2 || partes[0] !== 'Bearer') {
    return res.status(401).json({ ok: false, mensaje: 'Formato de token inválido' });
  }

  const token = partes[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.purpose || decoded.aud) {
      return res.status(401).json({ ok: false, mensaje: 'Completa la creación de tu contraseña antes de entrar.' });
    }
    if (!Number.isSafeInteger(decoded.id_usuario) || decoded.id_usuario <= 0 || decoded.id_administrador) {
      return res.status(403).json({ ok: false, mensaje: 'Se requiere una cuenta de alumno o cliente' });
    }
    const usuario = await usuarioModel.obtenerUsuarioPorId(decoded.id_usuario);
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ ok: false, mensaje: 'Cuenta no válida o inactiva' });
    }
    if ((decoded.token_version || 0) !== (usuario.token_version || 0)) {
      return res.status(401).json({ok:false,mensaje:'La contraseña cambió. Inicia sesión nuevamente.'});
    }
    req.usuario = { id_usuario: usuario.id_usuario, rol: usuario.rol };
    // Compatibilidad con los controladores del alumno existentes.
    req.admin = req.usuario;
    next();
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) {
      console.error('Error al verificar la cuenta:', error);
      return res.status(503).json({ ok: false, mensaje: 'No fue posible verificar la cuenta. Intenta nuevamente.' });
    }
    return res.status(401).json({ ok: false, mensaje: 'Token inválido o expirado' });
  }
}

module.exports = verificarToken;
