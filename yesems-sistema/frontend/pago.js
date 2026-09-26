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
    setText('#course-name', enrollment.curso_nombre);
    setText('#course-description', enrollment.curso_descripcion);
    setText('#student-folio', enrollment.folio);
    setText('#service-availability', availabilityLabel(enrollment));
    setText('#payment-amount', money.format(Number(enrollment.monto_total)));
    pageMessage.hidden = true;
    document.querySelector('#payment-layout').hidden = false;
    if (enrollment.pagos.some((payment) => payment.estado === 'pendiente')) showPending();
  } catch (error) { pageMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor.' : error.message; }
}
function showPending() { formMessage.classList.add('success'); formMessage.textContent = 'Ya registraste un pago pendiente de validación. Te avisaremos cuando sea revisado.'; form.querySelectorAll('input, select, button').forEach((element) => { element.disabled = true; }); }
const form = document.querySelector('#payment-form');
const receiptField = document.createElement('div');
receiptField.className = 'receipt-field';
receiptField.innerHTML = '<label for="receipt">Comprobante de pago</label><input id="receipt" type="file" accept="application/pdf,image/jpeg,image/png" /><p class="field-help">PDF, JPG o PNG · máximo 5 MB. Requerido excepto para pago en efectivo.</p>';
formMessage.before(receiptField);
const receiptInput = document.querySelector('#receipt');
form.addEventListener('submit', async (event) => {
  event.preventDefault(); formMessage.textContent = ''; formMessage.classList.remove('success');
  if (!form.checkValidity()) { formMessage.textContent = 'Selecciona un método de pago.'; form.reportValidity(); return; }
  const method = document.querySelector('#method').value;
  const receipt = receiptInput.files[0];
  if (method !== 'efectivo' && !receipt) { formMessage.textContent = 'Adjunta tu comprobante de pago para continuar.'; return; }
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
  } catch (error) { formMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor.' : error.message; submitButton.disabled = false; submitButton.textContent = 'Registrar pago pendiente'; }
});
document.querySelector('#logout-button').addEventListener('click', () => { localStorage.removeItem('yesems_token'); localStorage.removeItem('yesems_usuario'); window.location.href = './cursos.html'; });
