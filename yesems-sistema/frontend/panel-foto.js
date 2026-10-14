(() => {
  'use strict';
  const api = 'https://yesems-sistema-1.onrender.com/api/usuarios/mio/foto';
  const token = localStorage.getItem('yesems_token');
  const card = document.querySelector('.profile-card');
  if (!token || !card) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = './panel-foto.css'; document.head.append(css);
  const controls = document.createElement('div'); controls.className = 'profile-photo-controls';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.hidden = true;
  input.setAttribute('aria-label', 'Elegir foto de perfil');
  const upload = document.createElement('button'); upload.type = 'button'; upload.textContent = 'Subir foto';
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Quitar foto'; remove.hidden = true;
  const help = document.createElement('small'); help.textContent = 'JPG, PNG o WebP · fotos de hasta 10 MB se optimizan al subir';
  const status = document.createElement('p'); status.className = 'profile-photo-status'; status.setAttribute('role', 'status');
  controls.append(input, upload, remove, help, status);
  card.append(controls);

  const avatars = ['#profile-avatar', '#header-avatar', '#drawer-avatar'].map(selector => document.querySelector(selector)).filter(Boolean);
  const initial = avatars[0]?.textContent || 'A';
  let photoUrl = null;
  let changeVersion = 0;

  function showPhoto(blob) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(blob);
    for (const avatar of avatars) {
      const img = document.createElement('img'); img.src = photoUrl; img.alt = '';
      avatar.replaceChildren(img);
    }
    remove.hidden = false;
  }

  function showInitial() {
    for (const avatar of avatars) avatar.textContent = initial;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    remove.hidden = true;
  }

  async function preparePhoto(file) {
    if (file.size <= 2 * 1024 * 1024) return file;
    if (!('createImageBitmap' in window)) throw Error('Esta foto es demasiado grande. Selecciona una de hasta 2 MB.');
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw Error('No se pudo preparar la foto.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
      if (!blob || blob.size > 2 * 1024 * 1024) throw Error('La foto sigue siendo demasiado grande. Elige una imagen más pequeña.');
      return new File([blob], 'perfil.jpg', { type: 'image/jpeg' });
    } finally { bitmap.close(); }
  }

  async function request(method, body) {
    const response = await fetch(api, {
      method, headers: { Authorization: `Bearer ${token}` }, body,
      cache: 'no-store', signal: AbortSignal.timeout(30000),
    });
    if (response.status === 204 && method === 'GET') return null;
    if (response.status === 401) throw Error('Tu sesión expiró. Inicia sesión nuevamente.');
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw Error(result?.mensaje || 'No fue posible actualizar tu foto. Intenta de nuevo.');
    }
    return response;
  }

  async function load() {
    const version = changeVersion;
    try {
      const response = await request('GET');
      if (response) {
        const blob = await response.blob();
        if (version === changeVersion) showPhoto(blob);
      }
    } catch (error) { status.textContent = error.message; }
  }

  upload.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
      status.textContent = 'Selecciona una imagen JPG, PNG o WebP de hasta 10 MB.';
      return;
    }
    changeVersion++;
    upload.disabled = true; remove.disabled = true; status.textContent = 'Guardando foto…';
    try {
      const prepared = await preparePhoto(file);
      const body = new FormData(); body.append('foto', prepared);
      await request('PUT', body);
      showPhoto(prepared);
      status.textContent = 'Tu foto se guardó correctamente.';
    } catch (error) { status.textContent = error.message; }
    finally { upload.disabled = false; remove.disabled = false; }
  });
  remove.addEventListener('click', async () => {
    changeVersion++;
    upload.disabled = true; remove.disabled = true; status.textContent = 'Quitando foto…';
    try {
      await request('DELETE');
      showInitial(); status.textContent = 'Tu foto se quitó correctamente.';
    } catch (error) { status.textContent = error.message; }
    finally { upload.disabled = false; remove.disabled = false; }
  });
  window.addEventListener('pagehide', () => { if (photoUrl) URL.revokeObjectURL(photoUrl); });
  load();
})();
