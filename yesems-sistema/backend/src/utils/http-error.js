function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw httpError(400, 'ID inválido');
  }
  return Number(value);
}

function sendError(res, error) {
  if (res.headersSent) return;
  if (!error.statusCode || error.statusCode >= 500) console.error(error);
  res.status(error.statusCode || 500).json({ ok: false, mensaje: error.statusCode && error.statusCode < 500 ? error.message : 'No fue posible completar la operación. Intenta nuevamente.' });
}

function validateIdParam(req, res, next, value) {
  try { positiveId(value); next(); } catch (error) { sendError(res, error); }
}

module.exports = { httpError, positiveId, sendError, validateIdParam };
