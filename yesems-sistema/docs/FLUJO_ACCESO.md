# Acceso y registro de alumnos

La ventana compartida de `acceso.js` ofrece Google, código por correo y correo con contraseña. El formulario anterior de `index.html` queda oculto cuando carga la ventana compartida. El acceso administrativo conserva su entrada independiente.

## Cuenta nueva

1. Verificar identidad mediante código de seis dígitos o Google.
2. Completar nombre, apellidos y teléfono que falten. Los datos registrados se conservan tanto en la pantalla como en el servidor.
3. Crear y confirmar contraseña de YES EMS, también al registrarse mediante Google.
4. Entrar al panel. Si había un curso seleccionado, se conserva en el parámetro `curso`; crear cuenta no confirma inscripción ni pago.

Antes de crear contraseña, el servidor entrega únicamente un permiso de alta de diez minutos, no una sesión para acceder al panel. Si el alumno abandona, debe verificar otra vez su identidad. Los datos de perfil aún no enviados no se guardan.

## Cuenta existente

Una cuenta con contraseña puede entrar con contraseña, código o Google vinculado/verificado según las reglas del servidor. No se crea un segundo alumno. Una cuenta sin contraseña debe terminar el alta. Las cuentas desactivadas no pueden acceder.

## Recuperación

Desde la ventana compartida se solicita un código, se introduce junto con la nueva contraseña y su confirmación, y se regresa al inicio de sesión. El servidor invalida las sesiones anteriores. Un error al introducir la contraseña permite reintentar o elegir recuperación. La recuperación de la cuenta de Google enlaza a Google.

La página `password.html` conserva compatibilidad con enlaces existentes y el cambio de contraseña desde una sesión iniciada.

## Verificación local

- `npm test -- --silent` en `backend`.
- `npm run test:integration -- --suite=acceso.integration.test.js --forceExit` en `backend`: PostgreSQL temporal y navegador, con correo y Google simulados; no utiliza cuentas ni datos de producción.
- Los proveedores reales requieren una comprobación posterior al despliegue.
