# Acceso y recuperación de cuenta

El diálogo compartido separa **Iniciar sesión** y **Crear cuenta**. Solo el
registro muestra nombre, apellidos y teléfono de contacto. Se conserva el
botón oficial de Google Identity Services y el acceso por código de correo.
No se ofrece Apple ni se promete verificación por SMS.

En `password.html` hay dos recorridos distintos:

- Cuenta vinculada a Google: volver al diálogo de acceso, o abrir la
  recuperación oficial en `https://accounts.google.com/signin/recovery`.
- Contraseña de YES EMS: solicitar el código por correo y establecer una
  contraseña nueva con el mecanismo existente. Necesita el proveedor de
  correo configurado; configurar Google no activa el envío de correo.

YES EMS no recibe ni cambia la contraseña de Google. No se vinculan cuentas
existentes automáticamente por coincidencia de correo. Los permisos y la
validación de identidad siguen a cargo del backend.

## Comprobación manual antes de publicar

1. Abrir el acceso desde cursos e inicio; verificar ambas opciones y el foco
   con teclado. Abrir registro: debe seleccionar Crear cuenta.
2. Probar Google con el origen autorizado y una cuenta de prueba. El selector
   es de Google; su presentación depende del navegador.
3. En recuperación, verificar que el enlace externo apunta a Google y que
   volver a entrar permanece disponible aunque el correo no esté configurado.
4. Probar códigos de YES EMS únicamente con un correo de prueba autorizado.
5. Revisar móvil, cambio de contraseña desde configuración y sesión existente.

La prueba de integración de acceso cubre el cambio entre opciones, el registro
por código, el curso seleccionado y los controles de recuperación en Edge,
con proveedores simulados y PostgreSQL temporal. No prueba un inicio de sesión
real contra Google ni envíos reales de correo.
