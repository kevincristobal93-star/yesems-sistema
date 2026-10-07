# Diagnóstico seguro de envío de correo

Los fallos de envío registran una línea `[mail-diagnostic]` en los logs del backend de Render. Solicitar un código una sola vez y buscar esa línea a la hora de la solicitud. Si aparece un límite de intentos, no se llega al proveedor y no se genera esta línea: esperar a que venza el límite existente.

Campos: `reference` (UUID aleatorio, también devuelto como `referencia` en la respuesta de error), `provider`, `stage`, `status` HTTP y `code` de una lista cerrada. No se registran correos, códigos, contraseñas, tokens, cabeceras, cuerpos de respuesta ni descripciones originales del proveedor. No se modifica el mensaje público del error.

- `oauth_refresh`: falló la renovación de la autorización, antes del envío por Gmail.
- `gmail_send`: la renovación funcionó, pero Gmail no confirmó el envío.
- `resend_send`: fallo del proveedor alternativo si está seleccionado.
- `validation`: configuración incompleta o mensaje no válido.
- `timeout` o `network_error`: fallo de conexión; `invalid_response`: respuesta exitosa sin los datos necesarios; `provider_error`: error del proveedor no incluido en la lista segura o respuesta no JSON.

El campo público `correo_diagnostico: mail-v1` de `/api/acceso/config` permite comprobar la publicación. `correo: true` solo indica presencia de configuración, no autorización real ni entrega.

Este cambio no elimina límites ni renueva credenciales automáticamente. Las pruebas utilizan respuestas simuladas; el diagnóstico real requiere una solicitud autorizada desde la página y revisar sus logs en Render.
