const pool = require('../config/db');
const { withEnrollmentLock } = require('./seguimiento.model');
const { httpError, positiveId } = require('../utils/http-error');

function validarMonto(monto) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(monto)) || Number(monto) <= 0 || Number(monto) >= 100000000) {
    throw httpError(400, 'El monto debe ser positivo y tener hasta dos decimales');
  }
}

async function sincronizarConfirmacion(client, idInscripcion) {
  // Un comprobante o un abono no equivale al pago completo. Solo cuenta dinero validado.
  await client.query(`UPDATE inscripciones i SET estado = CASE
    WHEN COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_inscripcion=i.id_inscripcion AND p.estado='completado'),0) >= i.monto_total
    THEN 'confirmada' ELSE 'pendiente' END
    WHERE i.id_inscripcion=$1 AND i.estado IN ('pendiente','confirmada') AND i.concluida_at IS NULL`, [idInscripcion]);
}

async function comprobarInscripcionAbierta(client, idInscripcion) {
  const result = await client.query('SELECT * FROM inscripciones WHERE id_inscripcion = $1', [idInscripcion]);
  const inscripcion = result.rows[0];
  if (!inscripcion) throw httpError(404, 'Inscripción no encontrada');
  const emitida = await client.query("SELECT 1 FROM constancias WHERE id_inscripcion = $1 AND estado = 'autorizada'", [idInscripcion]);
  if (inscripcion.estado === 'cancelada' || inscripcion.concluida_at || emitida.rowCount) {
    throw httpError(409, 'No se pueden modificar pagos de una inscripción cancelada o concluida');
  }
  return inscripcion;
}

async function cambiarPago(id, callback) {
  positiveId(id);
  const pago = await obtenerPagoPorId(id);
  if (!pago) return null;
  return withEnrollmentLock(pago.id_inscripcion, async (client) => {
    await comprobarInscripcionAbierta(client, pago.id_inscripcion);
    return callback(client, pago.id_inscripcion);
  });
}

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
  positiveId(id_inscripcion);
  validarMonto(monto);
  return withEnrollmentLock(id_inscripcion, async (client) => {
    await comprobarInscripcionAbierta(client, id_inscripcion);
    const resultado = await client.query(
      `INSERT INTO pagos (id_inscripcion, monto, metodo_pago, referencia, estado)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'pendiente')) RETURNING *`,
      [id_inscripcion, monto, metodo_pago, referencia ?? null, estado]
    );
    await sincronizarConfirmacion(client, id_inscripcion);
    return resultado.rows[0];
  });
};

const actualizarEstadoPago = async (id, estado) => {
  if (!['completado', 'cancelado'].includes(estado)) throw httpError(400, 'Solo puedes confirmar o rechazar un pago pendiente');
  return cambiarPago(id, async (client, idInscripcion) => {
    const result = await client.query("UPDATE pagos SET estado = $1 WHERE id_pago = $2 AND estado = 'pendiente' RETURNING *", [estado, id]);
    if (!result.rowCount) throw httpError(409, 'El pago ya fue revisado');
    await sincronizarConfirmacion(client, idInscripcion);
    return result.rows[0];
  });
};

const actualizarPago = async (id, datos) => {
  const { monto, metodo_pago, referencia } = datos;
  validarMonto(monto);
  return cambiarPago(id, async (client) => {
    const resultado = await client.query(
      `UPDATE pagos SET monto = $1, metodo_pago = $2, referencia = $3
       WHERE id_pago = $4 AND estado = 'pendiente' RETURNING *`, [monto, metodo_pago, referencia ?? null, id]
    );
    if (!resultado.rowCount) throw httpError(409, 'Solo puedes corregir un pago pendiente');
    return resultado.rows[0];
  });
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
  comprobarInscripcionAbierta,
  obtenerPagos,
  obtenerPagosPorInscripcion,
  obtenerPagoPorId,
  crearPago,
  actualizarEstadoPago,
  actualizarPago,
  obtenerResumenPago,
};
