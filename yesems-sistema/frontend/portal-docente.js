(() => {
  const googleButton = document.querySelector('#google-access-button');
  if (!googleButton) return;

  googleButton.addEventListener('click', () => {
    if (window.YesemsAccess) {
      window.YesemsAccess.open();
      return;
    }
    const message = document.querySelector('#form-message');
    if (message) message.textContent = 'No se pudo cargar el acceso con Google. Recarga la página e inténtalo de nuevo.';
  });
})();
