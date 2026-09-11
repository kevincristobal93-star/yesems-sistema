const API_URL = 'http://127.0.0.1:4000/api';
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
async function loadPayment() {
  try {
    const response = await fetch(`${API_URL}/pagos/mio/${encodeURIComponent(inscriptionId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No se pudo cargar la inscripción.');
    enrollment = data.inscripcion;
    setText('#course-name', enrollment.curso_nombre);
    setText('#course-description', enrollment.curso_descripcion);
    setText('#student-folio', enrollment.folio);
    setText('#payment-amount', money.format(Number(enrollment.monto_total)));
    pageMessage.hidden = true;
    document.querySelector('#payment-layout').hidden = false;
    if (enrollment.pagos.some((payment) => payment.estado === 'pendiente')) showPending();
  } catch (error) { pageMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor.' : error.message; }
}
function showPending() { formMessage.classList.add('success'); formMessage.textContent = 'Ya registraste un pago pendiente de validación. Te avisaremos cuando sea revisado.'; form.querySelectorAll('input, select, button').forEach((element) => { element.disabled = true; }); }
const form = document.querySelector('#payment-form');
form.addEventListener('submit', async (event) => {
  event.preventDefault(); formMessage.textContent = ''; formMessage.classList.remove('success');
  if (!form.checkValidity()) { formMessage.textContent = 'Selecciona un método de pago.'; form.reportValidity(); return; }
  submitButton.disabled = true; submitButton.textContent = 'Registrando pago...';
  try {
    const response = await fetch(`${API_URL}/pagos/mio`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id_inscripcion: inscriptionId, metodo_pago: document.querySelector('#method').value, referencia: document.querySelector('#reference').value }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.mensaje || data.error || 'No se pudo registrar el pago.');
    showPending();
  } catch (error) { formMessage.textContent = error instanceof TypeError ? 'No se pudo conectar con el servidor.' : error.message; submitButton.disabled = false; submitButton.textContent = 'Registrar pago pendiente'; }
});
document.querySelector('#logout-button').addEventListener('click', () => { localStorage.removeItem('yesems_token'); localStorage.removeItem('yesems_usuario'); window.location.href = './cursos.html'; });
