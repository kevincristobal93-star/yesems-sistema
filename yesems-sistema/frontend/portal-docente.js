(() => {
  const googleButton = document.querySelector('#google-access-button');
  const createAccountButton = document.querySelector('#create-account-button');
  const message = document.querySelector('#portal-message');
  if (!googleButton || !createAccountButton) return;

  const openAccess = register => {
    if (window.YesemsAccess) {
      message.textContent = '';
      window.YesemsAccess.open(null, register);
    } else {
      message.textContent = 'No se pudo cargar el acceso. Recarga la página e inténtalo de nuevo.';
    }
  };

  googleButton.addEventListener('click', () => openAccess(false));
  createAccountButton.addEventListener('click', () => openAccess(true));
})();
