const { withEnrollmentLock } = require('./seguimiento.model');
const { comprobarInscripcionAbierta } = require('./pago.model');
const { httpError } = require('../utils/http-error');
const pool = require('../config/db');

async function prepararPago({ idInscripcion, idUsuario, externalReference }) {
  return withEnrollmentLock(idInscripcion, async (client) => {
    const enrollment = (await client.query(
      `SELECT i.id_inscripcion, i.id_usuario, i.monto_total, i.estado, i.concluida_at,
              c.nombre AS curso_nombre, u.email
       FROM inscripciones i JOIN cursos c ON c.id_curso=i.id_curso
       JOIN usuarios u ON u.id_usuario=i.id_usuario
       WHERE i.id_inscripcion=$1 AND i.id_usuario=$2`,
      [idInscripcion, idUsuario]
    )).rows[0];
    if (!enrollment) throw httpError(404, 'Inscripción no encontrada');
    await comprobarInscripcionAbierta(client, idInscripcion);

    const pending = (await client.query(
      "SELECT * FROM pagos WHERE id_inscripcion=$1 AND estado='pendiente' ORDER BY id_pago DESC",
      [idInscripcion]
    )).rows;
    const marketPending = pending.find((payment) => payment.metodo_pago === 'mercado_pago');
    if (marketPending) {
      if (!marketPending.mp_checkout_url) throw httpError(409, 'Tu checkout se está preparando. Espera un momento y vuelve a intentarlo.');
      return { payment: marketPending, checkoutUrl: marketPending.mp_checkout_url, existing: true };
    }
    if (pending.length) throw httpError(409, 'Ya existe un pago pendiente de revisión para esta inscripción. Consulta a YES EMS antes de iniciar otro pago.');

    const paid = Number((await client.query(
      "SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE id_inscripcion=$1 AND estado='completado'",
      [idInscripcion]
    )).rows[0].total);
    const due = Math.round((Number(enrollment.monto_total) - paid) * 100) / 100;
    if (due <= 0) throw httpError(409, 'La inscripción ya está pagada.');

    const payment = (await client.query(
      `INSERT INTO pagos (id_inscripcion,monto,metodo_pago,estado,mp_external_reference,mp_status)
       VALUES ($1,$2,'mercado_pago','pendiente',$3,'preparing') RETURNING *`,
      [idInscripcion, due.toFixed(2), externalReference]
    )).rows[0];
    return { payment, checkoutUrl: null, courseName: enrollment.curso_nombre, email: enrollment.email, amount: due, existing: false };
  });
}

async function guardarPreferencia({ idPago, preferenceId, checkoutUrl }) {
  const existing = (await pool.query('SELECT id_inscripcion FROM pagos WHERE id_pago=$1', [idPago])).rows[0];
  if (!existing) throw httpError(404, 'Pago no encontrado');
  return withEnrollmentLock(existing.id_inscripcion, async (client) => {
    const result = await client.query(
      `UPDATE pagos SET mp_preference_id=$1,mp_checkout_url=$2,mp_status='pending'
       WHERE id_pago=$3 AND estado='pendiente' RETURNING *`,
      [preferenceId, checkoutUrl, idPago]
    );
    if (!result.rowCount) throw httpError(409, 'La inscripción cambió mientras se preparaba el checkout.');
    return result.rows[0];
  });
}

async function cancelarPreparacion(idPago) {
  await pool.query(
    "UPDATE pagos SET estado='cancelado',mp_status='preference_error' WHERE id_pago=$1 AND metodo_pago='mercado_pago' AND estado='pendiente' AND mp_preference_id IS NULL",
    [idPago]
  );
}

async function procesarPagoVerificado(payment) {
  const externalReference = String(payment.external_reference || '');
  const found = (await pool.query(
    'SELECT id_inscripcion FROM pagos WHERE mp_external_reference=$1 AND metodo_pago=\'mercado_pago\'',
    [externalReference]
  )).rows[0];
  if (!found) return { matched: false };

  return withEnrollmentLock(found.id_inscripcion, async (client) => {
    const row = (await client.query(
      `SELECT p.*,i.monto_total,i.estado AS estado_inscripcion,i.concluida_at
       FROM pagos p JOIN inscripciones i ON i.id_inscripcion=p.id_inscripcion
       WHERE p.mp_external_reference=$1 FOR UPDATE OF p,i`,
      [externalReference]
    )).rows[0];
    if (!row) return { matched: false };
    const paymentId = String(payment.id);
    if (row.estado === 'completado' && row.mp_payment_id === paymentId && payment.status === 'approved') return { matched: true, duplicate: true };
    if (row.estado_inscripcion === 'cancelada' || row.concluida_at) {
      await client.query("UPDATE pagos SET mp_status=$1,mp_payment_id=$2 WHERE id_pago=$3", [payment.status, paymentId, row.id_pago]);
      return { matched: true, ignored: true };
    }
    const amountMatches = Math.round(Number(payment.transaction_amount) * 100) === Math.round(Number(row.monto) * 100);
    if (!amountMatches || payment.currency_id !== 'MXN' || payment.external_reference !== row.mp_external_reference) {
      await client.query("UPDATE pagos SET mp_status='amount_mismatch' WHERE id_pago=$1", [row.id_pago]);
      return { matched: true, mismatch: true };
    }

    if (payment.status === 'approved') {
      const otherPaid = Number((await client.query(
        "SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE id_inscripcion=$1 AND estado='completado' AND id_pago<>$2",
        [row.id_inscripcion, row.id_pago]
      )).rows[0].total);
      if (Math.round((otherPaid + Number(row.monto)) * 100) > Math.round(Number(row.monto_total) * 100)) {
        await client.query("UPDATE pagos SET mp_status='approved_review_required',mp_payment_id=$1 WHERE id_pago=$2", [paymentId, row.id_pago]);
        return { matched: true, mismatch: true };
      }
      await client.query(
        `UPDATE pagos SET estado='completado',mp_status='approved',mp_payment_id=$1,
         fecha_pago=CURRENT_TIMESTAMP WHERE id_pago=$2`,
        [paymentId, row.id_pago]
      );
      await client.query(`UPDATE inscripciones i SET estado=CASE
        WHEN COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_inscripcion=i.id_inscripcion AND p.estado='completado'),0)>=i.monto_total
        THEN 'confirmada' ELSE 'pendiente' END
        WHERE i.id_inscripcion=$1 AND i.estado IN ('pendiente','confirmada') AND i.concluida_at IS NULL`, [row.id_inscripcion]);
      return { matched: true, approved: true };
    }

    if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status)) {
      await client.query(
        `UPDATE pagos SET estado='cancelado',mp_status=$1,mp_payment_id=$2
         WHERE id_pago=$3 AND estado IN ('pendiente','completado')`,
        [payment.status, paymentId, row.id_pago]
      );
      await client.query(`UPDATE inscripciones i SET estado=CASE
        WHEN COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_inscripcion=i.id_inscripcion AND p.estado='completado'),0)>=i.monto_total
        THEN 'confirmada' ELSE 'pendiente' END
        WHERE i.id_inscripcion=$1 AND i.estado IN ('pendiente','confirmada') AND i.concluida_at IS NULL`, [row.id_inscripcion]);
      return { matched: true, cancelled: true };
    }

    await client.query('UPDATE pagos SET mp_status=$1 WHERE id_pago=$2', [String(payment.status || 'unknown').slice(0, 30), row.id_pago]);
    return { matched: true, pending: true };
  });
}

module.exports = { prepararPago, guardarPreferencia, cancelarPreparacion, procesarPagoVerificado };
