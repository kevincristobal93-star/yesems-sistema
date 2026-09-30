const jwt = require('jsonwebtoken');
const adminModel = require('../models/administrador.model');

async function verificarAdministrador(req, res, next) {
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

    // El token debe pertenecer a un administrador, no a un usuario/cliente
    if (!Number.isSafeInteger(decoded.id_administrador) || decoded.id_administrador <= 0 || decoded.id_usuario) {
      return res.status(403).json({ ok: false, mensaje: 'Acceso restringido a administradores' });
    }

    const admin = await adminModel.obtenerAdminPorId(decoded.id_administrador);
    if (!admin || !admin.activo) {
      return res.status(401).json({ ok: false, mensaje: 'Administrador no válido o inactivo' });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) {
      console.error('Error al verificar el administrador:', error);
      return res.status(503).json({ ok: false, mensaje: 'No fue posible verificar la cuenta. Intenta nuevamente.' });
    }
    return res.status(401).json({ ok: false, mensaje: 'Token inválido o expirado' });
  }
}

module.exports = verificarAdministrador;
