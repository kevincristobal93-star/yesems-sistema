const pool = require('../config/db');

const obtenerPagos = async () => {
  const resultado = await pool.query(`
    SELECT p.*, i.monto_total AS inscripcion_monto_total,
           u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
    FROM pagos p
    JOIN inscripciones i ON p.id_inscripcion = i.id_inscripcion
    JOIN usuarios u ON i.id_usuario = u.id_usuario
    ORDER BY p.fecha_pago DESC
  `);
  return resultado.rows;
};

const obtenerPagosPorInscripcion = async (idInscripcion) => {
  const resultado = await pool.query(
    'SELECT * FROM pagos WHERE id_inscripcion = $1 ORDER BY fecha_pago ASC',
    [idInscripcion]
  );
  return resultado.rows;
};

const obtenerPagoPorId = async (id) => {
  const resultado = await pool.query(
    'SELECT * FROM pagos WHERE id_pago = $1',
    [id]
  );
  return resultado.rows[0];
};

const crearPago = async (datos) => {
  const { id_inscripcion, monto, metodo_pago, referencia, estado } = datos;
  const resultado = await pool.query(
    `INSERT INTO pagos (id_inscripcion, monto, metodo_pago, referencia, estado)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'pendiente')) RETURNING *`,
    [id_inscripcion, monto, metodo_pago, referencia ?? null, estado]
  );
  return resultado.rows[0];
};

const actualizarEstadoPago = async (id, estado) => {
  const resultado = await pool.query(
    'UPDATE pagos SET estado = $1 WHERE id_pago = $2 RETURNING *',
    [estado, id]
  );
  return resultado.rows[0];
};

const actualizarPago = async (id, datos) => {
  const { monto, metodo_pago, referencia } = datos;
  const resultado = await pool.query(
    `UPDATE pagos SET monto = $1, metodo_pago = $2, referencia = $3
     WHERE id_pago = $4 RETURNING *`,
    [monto, metodo_pago, referencia ?? null, id]
  );
  return resultado.rows[0];
};

// Cálculo automático: total pagado (solo pagos completados), saldo y estado de pago
const obtenerResumenPago = async (idInscripcion) => {
  const inscripcionResult = await pool.query(
    'SELECT monto_total FROM inscripciones WHERE id_inscripcion = $1',
    [idInscripcion]
  );
  const inscripcion = inscripcionResult.rows[0];
  if (!inscripcion) return null;

  const pagosResult = await pool.query(
    `SELECT COALESCE(SUM(monto), 0) AS total_pagado
     FROM pagos WHERE id_inscripcion = $1 AND estado = 'completado'`,
    [idInscripcion]
  );
  const totalPagado = parseFloat(pagosResult.rows[0].total_pagado);
  const montoTotal = parseFloat(inscripcion.monto_total);
  const saldo = montoTotal - totalPagado;

  let estadoPago;
  if (totalPagado <= 0) estadoPago = 'sin_pagos';
  else if (saldo > 0) estadoPago = 'parcial';
  else estadoPago = 'pagado';

  return {
    id_inscripcion: idInscripcion,
    monto_total: montoTotal,
    total_pagado: totalPagado,
    saldo,
    estado_pago: estadoPago,
  };
};

module.exports = {
  obtenerPagos,
  obtenerPagosPorInscripcion,
  obtenerPagoPorId,
  crearPago,
  actualizarEstadoPago,
  actualizarPago,
  obtenerResumenPago,
};