(function(root) {
  function estado(item) {
    if (!item) return 'Datos pendientes';
    if ((item.estado || item.estado_inscripcion) === 'cancelada') return 'Inscripción cancelada';
    if (item.progreso?.conclusion_validada) return 'Curso concluido';
    const pagos = Array.isArray(item.pagos) ? item.pagos : null;
    const pagado = pagos ? pagos.filter(p => p.estado === 'completado').reduce((s,p) => s + Number(p.monto),0) : item.total_pagado;
    const monto = item.monto_total;
    if (monto != null && pagado != null && Number.isFinite(Number(monto)) && Number.isFinite(Number(pagado)) && Number(monto) >= 0 && Math.round(Number(pagado)*100) >= Math.round(Number(monto)*100)) return 'Inscripción confirmada';
    if (pagos ? pagos.some(p => p.estado === 'pendiente') : item.tiene_pago_pendiente) return 'Pago en revisión';
    return 'Pago pendiente';
  }
  const api = { estado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InscripcionEstado = api;
})(typeof window !== 'undefined' ? window : globalThis);
