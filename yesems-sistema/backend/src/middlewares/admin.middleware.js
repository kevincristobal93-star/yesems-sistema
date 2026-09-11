const jwt = require('jsonwebtoken');

function verificarAdministrador(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ ok: false, mensaje: 'Token no proporcionado' });
  const [tipo, token] = authHeader.split(' ');
  if (tipo !== 'Bearer' || !token) return res.status(401).json({ ok: false, mensaje: 'Formato de token inválido' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.id_administrador) return res.status(403).json({ ok: false, mensaje: 'Se requiere una cuenta de administrador' });
    req.administrador = decoded;
    next();
  } catch (_) {
    return res.status(401).json({ ok: false, mensaje: 'Token inválido o expirado' });
  }
}

module.exports = verificarAdministrador;
