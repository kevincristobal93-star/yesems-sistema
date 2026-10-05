const API_URL = 'https://yesems-sistema-1.onrender.com/api';
const token = localStorage.getItem('yesems_token');
const inscriptionId = new URLSearchParams(window.location.search).get('inscripcion');
const pageMessage = document.querySelector('#page-message');
const formMessage = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
document.querySelector('#footer-year').textContent = new Date().getFullYear();
let enrollment = null;

if (!token || !inscriptionId || !/^\d+$/.test(inscriptionId)) {
  window.location.replace('./cursos.html');
} else { loadPayment(); }

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
function setText(id, value) { document.querySelector(id).textContent = value || '—'; }
function availabilityLabel(item) {
  if (!item.disponibilidad_modalidad) return 'Por confirmar';
  const mode = { en_linea: 'En línea', presencial: 'Presencial', hibrida: 'Híbrida', por_definir: 'Por definir' }[item.disponibilidad_modalidad] || 'Por definir';
  const time = item.disponibilidad_hora_inicio && item.disponibilidad_hora_fin ? `${String(item.disponibilidad_hora_inicio).slice(0, 5)} – ${String(item.disponibilidad_hora_fin).slice(0, 5)}` : '';
  return [mode, item.disponibilidad_dia, time, item.disponibilidad_informacion].filter(Boolean).join(' · ');
}
async function loadPayment() {
  try {
    const response = await fetch(`${API_URL}/pagos/mio/${encodeURIComponent(inscriptionId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No se pudo cargar la inscripción.');
    enrollment = data.inscripcion;
    setText('#enrollment-status', InscripcionEstado.estado(enrollment));
    setText('#course-name', enrollment.curso_nombre);
    setText('#course-description', enrollment.curso_descripcion);
    setText('#student-folio', enrollment.folio);
    setText('#service-availability', availabilityLabel(enrollment));
    setText('#payment-amount', money.format(Number(enrollment.monto_total)));
    pageMessage.hidden = true;
    document.querySelector('#payment-layout').hidden = false;
    const paid=enrollment.pagos.filter(p=>p.estado==='completado').reduce((sum,p)=>sum+Number(p.monto),0);
    if (paid>=Number(enrollment.monto_total) || enrollment.estado_inscripcion==='cancelada') {
      formMessage.textContent=enrollment.estado_inscripcion==='cancelada'?'Esta inscripción está cancelada.':'Tu pago ya está confirmado.';
      form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
      return;
    }
    setText('#payment-amount',money.format(Math.max(0,Number(enrollment.monto_total)-paid)));
    if(enrollment.pagos.some(p=>p.estado==='cancelado')) formMessage.textContent='Un comprobante anterior no fue aprobado. Consulta a YES EMS y sube el comprobante corregido.';
    if (enrollment.pagos.some((payment) => payment.estado === 'pendiente')) showPending();
  } catch (error) { pageMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor.' : error.message; }
}
function showPending() { setText('#enrollment-status', 'Pago en revisión'); formMessage.classList.add('success'); formMessage.textContent = 'Comprobante recibido. Tu inscripción aún no está confirmada: administración debe verificar el dinero recibido. Consulta el resultado en Mi panel.'; form.querySelectorAll('input, select, button').forEach((element) => { element.disabled = true; }); }
const form = document.querySelector('#payment-form');
const cashInstructions=document.createElement('section');
cashInstructions.className='receipt-field';
cashInstructions.innerHTML='<h3>Pago en efectivo en YES EMS</h3><ol><li>Acude a YES EMS e indica tu curso y folio de alumno.</li><li>Realiza el pago y solicita tu comprobante.</li><li>Regresa aquí y adjunta una fotografía o escaneo legible.</li></ol><p>Subir un comprobante no aprueba el pago: la administración debe cotejarlo con el dinero recibido.</p><a href="./panel.html">Completar después · Volver al panel</a>';
form.before(cashInstructions);
const transferInstructions=document.createElement('section');
transferInstructions.className='receipt-field';
transferInstructions.hidden=true;
transferInstructions.innerHTML='<h3>Transferencia bancaria</h3><ol><li>Solicita a YES EMS los datos bancarios oficiales y confirma el importe antes de transferir.</li><li>Realiza la transferencia y conserva el comprobante bancario.</li><li>Adjunta el comprobante e indica la referencia de la operación.</li></ol><p>El administrador confirmará el pago solo después de comprobar que el dinero llegó a la cuenta. No envíes contraseñas, NIP ni códigos bancarios.</p><a href="./panel.html">Completar después · Volver al panel</a>';
form.before(transferInstructions);
const methodSelect=document.querySelector('#method');
methodSelect.querySelector('[value="efectivo"]').textContent='Efectivo en YES EMS';
methodSelect.value='efectivo';
methodSelect.addEventListener('change',()=>{cashInstructions.hidden=methodSelect.value!=='efectivo';transferInstructions.hidden=methodSelect.value!=='transferencia';});
submitButton.textContent='Enviar comprobante a revisión';
const receiptField = document.createElement('div');
receiptField.className = 'receipt-field';
receiptField.innerHTML = '<label for="receipt">Comprobante de pago</label><input id="receipt" type="file" accept="application/pdf,image/jpeg,image/png" required /><p class="field-help">Adjunta el recibo de efectivo de YES EMS o tu comprobante bancario. PDF, JPG o PNG legible · máximo 5 MB. Obligatorio en ambos métodos.</p>';
formMessage.before(receiptField);
const receiptInput = document.querySelector('#receipt');
form.addEventListener('submit', async (event) => {
  event.preventDefault(); formMessage.textContent = ''; formMessage.classList.remove('success');
  if (!form.checkValidity()) { formMessage.textContent = 'Selecciona un método y adjunta tu comprobante.'; form.reportValidity(); return; }
  const method = document.querySelector('#method').value;
  if (!['efectivo','transferencia'].includes(method)) { formMessage.textContent = 'Solo se acepta efectivo o transferencia.'; return; }
  const receipt = receiptInput.files[0];
  if (!receipt) { formMessage.textContent = 'Adjunta tu comprobante de pago para continuar.'; return; }
  if (receipt && receipt.size > 5 * 1024 * 1024) { formMessage.textContent = 'El comprobante no puede superar 5 MB.'; return; }
  submitButton.disabled = true; submitButton.textContent = 'Registrando pago...';
  try {
    const paymentData = new FormData();
    paymentData.append('id_inscripcion', inscriptionId);
    paymentData.append('metodo_pago', method);
    paymentData.append('referencia', document.querySelector('#reference').value.trim());
    if (receipt) paymentData.append('comprobante', receipt);
    const response = await fetch(`${API_URL}/pagos/mio`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: paymentData });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No se pudo registrar el pago.');
    showPending();
  } catch (error) { formMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor.' : error.message; submitButton.disabled = false; submitButton.textContent = 'Enviar comprobante a revisión'; }
});
document.querySelector('#logout-button').addEventListener('click', () => { localStorage.removeItem('yesems_token'); localStorage.removeItem('yesems_usuario'); window.location.href = './cursos.html'; });
