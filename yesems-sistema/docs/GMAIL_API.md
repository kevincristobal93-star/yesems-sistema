# Códigos de YES EMS mediante Gmail API

## Qué se implementó

El backend admite Gmail API o Resend como proveedor de correo. Gmail usa HTTPS,
no puertos SMTP. El código sigue generándose/verificándose en YES EMS, dura
10 minutos, tiene un solo uso y cinco intentos. Se conservan los límites de IP,
reenvío y presupuesto global (90 intentos/24 h y 2700/32 días). Son límites de
la aplicación, no una garantía de disponibilidad ni las cuotas de Google.

Solo una cuenta remitente del centro autoriza `gmail.send`. Nunca se pide acceso
al Gmail de los alumnos. No se cambia la contraseña de Google. Como se reutiliza
el servicio de envío, también quedan disponibles los códigos de acceso por correo.

El proveedor se elige explícitamente mediante `EMAIL_PROVIDER=gmail`; sin esta
variable se conserva Resend. No hay cambio automático de proveedor ni reintentos
de envío que puedan duplicar mensajes. Un fallo invalida el código almacenado.
La respuesta pública solo indica disponibilidad de configuración, no que Google
haya aceptado las credenciales ni que el mensaje haya llegado a bandeja de entrada.

## Preparación en Google (por el titular)

1. Elegir una cuenta Gmail dedicada al centro y protegerla con verificación en
   dos pasos. No compartir su contraseña, códigos ni tokens con el asistente.
2. En Google Cloud, crear un proyecto separado, por ejemplo **YES EMS Correo**.
   Así no se modifica el consentimiento de «Continuar con Google» de los alumnos.
3. En **APIs y servicios → Biblioteca**, habilitar **Gmail API**.
4. Configurar Google Auth Platform: nombre y contacto del centro, audiencia
   externa si es Gmail personal, y agregar únicamente el remitente como usuario
   de prueba para la primera validación.
5. En acceso a datos, solicitar exclusivamente:
   `https://www.googleapis.com/auth/gmail.send`.
   No pedir lectura, modificación o acceso completo al buzón.
6. Crear un cliente OAuth de tipo **Aplicación web**, distinto al del login.
   Para la autorización manual mediante la herramienta oficial de Google,
   registrar este URI de redirección exacto, sin barra al final:
   `https://developers.google.com/oauthplayground`.
7. Abrir [OAuth Playground](https://developers.google.com/oauthplayground/).
   En el engrane, usar endpoints Google, flujo Server-side, Access type Offline,
   Force prompt Consent Screen y **Use your own OAuth credentials**. Introducir
   ahí el ID y secreto del nuevo cliente (no en el chat). Esta herramienta de
   Google procesa esas credenciales para intercambiar el código.
8. En Step 1 introducir solo el scope `gmail.send` anterior, autorizar con la
   cuenta remitente y comprobar el proyecto/permisos antes de aceptar.
9. En Step 2 intercambiar el código por tokens. Guardar privadamente el
   **refresh_token**, no el access_token de corta duración. No crear ni compartir
   enlaces del Playground que incluyan credenciales. Si no aparece refresh_token,
   revisar Offline/Consent y repetir la autorización controlada por el titular.

### Importante antes de usarlo en producción

En proyectos externos en estado **Testing**, Google expira normalmente los
refresh tokens con este permiso a los **7 días**. Sirve para la prueba inicial,
no para dar por terminado el despliegue. Preparar el estado de producción y
cumplir la verificación que Google solicite para el permiso sensible `gmail.send`.
Las posibles excepciones dependen del uso; no asumir que todas las apps están
exentas. Si Google bloquea el flujo, revisar su requisito, no omitirlo.

Google también puede revocar tokens al cambiar credenciales, retirar permisos
o aplicar políticas de seguridad. Se debe reautorizar por el titular en tal caso.

## Variables privadas en Render

Servicio backend **yesems-sistema-1 → Environment**:

| Variable | Valor que coloca el titular |
| --- | --- |
| `EMAIL_PROVIDER` | `gmail` |
| `GMAIL_CLIENT_ID` | ID del nuevo cliente OAuth de correo |
| `GMAIL_CLIENT_SECRET` | Secreto de ese cliente |
| `GMAIL_REFRESH_TOKEN` | Token obtenido autorizando al remitente |
| `GMAIL_SENDER_EMAIL` | Dirección Gmail exacta de la cuenta autorizada, sin nombre ni `< >` |

No reemplazar `GOOGLE_CLIENT_ID`: ese es el cliente del inicio de sesión.
No agregar estas variables al frontend, repositorio ni capturas. Si se prueban
localmente, usar `.env` ignorado por Git. No se necesitan nuevas migraciones.
Publicar primero el código compatible con este proveedor, luego guardar y
desplegar la configuración privada. No marcarlo activo antes de esa publicación.

## Comprobación manual final

1. Solicitar un código desde `password.html` usando una cuenta de prueba propia.
2. Confirmar entrega real (también spam), remitente y asunto correctos.
3. Ingresar código/nueva contraseña y comprobar inicio con la nueva contraseña.
4. Verificar que el código no se reutiliza y que una sesión anterior deja de servir.
5. En Configuración, probar cambio autenticado: solo envía al correo del titular.
6. No usar alumnos reales ni cambiar sus contraseñas para probar. No probar
   revocaciones con el token de producción. Una prueba simulada no acredita entrega.

Si falla: revisar API habilitada, cliente/secreto, remitente autorizado, token,
scope y estado Testing/producción. El backend devuelve un error genérico sin
imprimir tokens, códigos, cuerpos ni respuestas OAuth privadas.

## Referencias oficiales

- [Envío MIME mediante Gmail API](https://developers.google.com/workspace/gmail/api/guides/sending).
- [Permiso de envío y verificación](https://developers.google.com/workspace/gmail/api/auth/scopes).
- [OAuth y caducidad de refresh tokens](https://developers.google.com/identity/protocols/oauth2).
- [OAuth Playground](https://developers.google.com/oauthplayground/).
