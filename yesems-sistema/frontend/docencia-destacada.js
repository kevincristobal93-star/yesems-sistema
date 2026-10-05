// La tarifa del cartel es de lanzamiento; no ofrecerla como vigente tras el cierre.
(() => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type).value;
  if (`${value('year')}-${value('month')}-${value('day')}` <= '2026-10-15') return;
  document.getElementById('docencia-price-label').textContent = 'INVERSIÓN DEL PROGRAMA';
  document.getElementById('docencia-price').textContent = 'Consultar';
  document.getElementById('docencia-currency').textContent = '';
  document.getElementById('docencia-validity').textContent = 'El lanzamiento de $1,990 MXN terminó el 15 de octubre de 2026. Consulta la tarifa vigente.';
})();
