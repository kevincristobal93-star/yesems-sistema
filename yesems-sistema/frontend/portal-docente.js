(() => {
  const openButton = document.querySelector('#open-access');
  if (!openButton) return;

  const openLogin = () => window.YesemsAccess?.open();
  openButton.addEventListener('click', openLogin);

  // El enlace del sitio público debe llevar directamente al acceso.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openLogin, { once: true });
  } else {
    openLogin();
  }
})();
