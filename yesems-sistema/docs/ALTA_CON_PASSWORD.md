# Cuenta verificada y contraseña de YES EMS

## Flujos

- Google valida su credencial, audiencia, correo y reto de un solo uso. Si la cuenta aún no tiene contraseña local, devuelve un permiso limitado y presenta el correo verificado de solo lectura. Se solicita únicamente crear y confirmar la contraseña de YES EMS; la ficha de inscripción se completa posteriormente.
- Por correo: se solicita y consume un código; después se captura la contraseña y, para una nueva cuenta, nombre, apellidos y teléfono de contacto. No se solicita contraseña antes de verificar el correo.
- Una cuenta existente con contraseña conserva el acceso con Google vinculado, contraseña o código verificado. No se duplica la cuenta ni se reemplaza su contraseña al acceder con Google.
- Las cuentas anteriores creadas con Google sin contraseña entran al nuevo paso en su siguiente acceso. Las sesiones previamente emitidas no se convierten automáticamente; al completar la contraseña se invalidan mediante `token_version`.

## Seguridad

`POST /api/acceso/password/crear` recibe `setup_token`, contraseña y confirmación. El correo y usuario no se aceptan del cliente: se obtienen de la identidad verificada. No cambia ni solicita la contraseña de Google.

El permiso firmado dura 10 minutos, tiene audiencia y propósito exclusivos, se conserva solo en memoria en el navegador y no se acepta como sesión en las API del alumno. El endpoint comprueba cuenta activa, rol permitido, verificación y versión de sesión; bloquea la fila durante la creación y nunca sobrescribe una contraseña existente. Dos solicitudes concurrentes no pueden completarlo dos veces.

La contraseña se valida con la política existente (12 caracteres como mínimo y 72 bytes como máximo) y se almacena con bcrypt. Al guardarla se incrementa la versión de sesión y se eliminan códigos anteriores. Solo entonces se emite una sesión normal. Cerrar el diálogo borra el permiso y los campos de contraseña; se puede volver a verificar la cuenta para continuar.

La verificación puede reservar una cuenta incompleta en PostgreSQL antes de crear la contraseña, pero no emite acceso normal. Se conserva su identidad y puede retomarse sin duplicados. Las cuentas Google y locales existentes con el mismo correo no se vinculan automáticamente: se mantiene la protección previa.

## Alcance operativo

No necesita migración: reutiliza `password_hash`, `token_version` y la identidad verificada existentes. Publicar backend antes del frontend.

Este cambio no corrige por sí solo los fallos de Gmail API ni elimina límites de envío. La recepción real del correo debe comprobarse por separado con una cuenta de prueba autorizada, sin publicar tokens ni códigos.

Las pruebas de Google y correo utilizan proveedores simulados y PostgreSQL temporal; no prueban la autorización real de Google ni la entrega a Gmail.
