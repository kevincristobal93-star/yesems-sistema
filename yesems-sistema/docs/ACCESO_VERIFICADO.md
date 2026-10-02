# Acceso verificado sin SMS

Actualización: también se admite Gmail API mediante `EMAIL_PROVIDER=gmail`.
Consultar [GMAIL_API.md](GMAIL_API.md) para autorización privada del remitente,
variables de Render y pruebas reales pendientes. Resend sigue disponible como
proveedor predeterminado; no es obligatorio para los códigos.

Implementación preparada para publicación con autorización del usuario. No se han creado cuentas de proveedor ni enviado correos reales; la activación de Google y Resend requiere configuración externa.

## Qué incluye

- Ventana compartida en cursos, registro e inicio de sesión: Google y código por correo, sin Apple ni SMS. Conserva el curso elegido al continuar.
- Las cuentas nuevas usan acceso sin contraseña. El teléfono se solicita como contacto; **no se considera verificado**. Las cuentas históricas conservan su contraseña y también pueden acceder demostrando control de su correo.
- Los códigos duran 10 minutos, tienen un solo uso, cinco intentos máximos y no se almacenan en claro. No aparecen en respuestas ni logs. Un reenvío invalida el código previo.
- Límites persistentes en PostgreSQL: un envío por correo por minuto, cinco por IP por hora; 30 verificaciones/intentos de contraseña por IP cada 15 minutos. No se confía automáticamente en cabeceras `X-Forwarded-For`. Detrás del proxy de Render el límite por IP puede agrupar usuarios: revisar la topología antes de configurar `trust proxy`, nunca habilitarlo indiscriminadamente.
- Presupuesto global conservador: máximo 90 intentos de envío en 24 horas y 2700 en 32 días. Incluye fallos para evitar sobreconsumo. No se contratan planes de pago ni se habilitan sobrecostos. Se necesita usar el plan gratuito del proveedor y contabilizar otros sistemas que compartan esa cuenta: el límite local no conoce sus envíos.
- Google usa la biblioteca oficial para comprobar firma, audiencia, emisor y vencimiento; además exige correo verificado y nonce propio de un solo uso. Se identifica por `sub`, no por nombre. Correos externos a Gmail/Workspace se verifican por código.
- Una cuenta histórica no vinculada a Google **no se fusiona automáticamente**: el usuario debe acceder por correo o contraseña. La vinculación explícita de cuentas existentes queda fuera de esta entrega.
- Nombres/apellidos iguales están permitidos. CURP y correo normalizados quedan reservados en PostgreSQL incluso con escrituras simultáneas, cuentas inactivas o cambios posteriores. La validación de CURP es de formato básico, no una consulta de identidad a RENAPO.

## Conservación de datos

### Recuperar o cambiar contraseña (alumnos/clientes)

- `password.html`: opción «Olvidé mi contraseña» desde el acceso; `password.html?modo=cambiar`: cambio desde Configuración con sesión vigente.
- Ambos requieren código de correo. Los códigos de recuperación, cambio autenticado e inicio de sesión son de propósitos distintos y no se pueden intercambiar. Comparten los límites gratuitos de envío.
- Solicitar recuperación devuelve el mismo mensaje para cualquier correo válido. No confirma públicamente si la cuenta existe; no crea cuentas ni cambia contraseñas hasta verificar el código.
- En el cambio autenticado, el servidor obtiene el correo de la cuenta de la sesión e ignora correos/IDs enviados por el navegador.
- Nueva contraseña: mínimo 12 caracteres, máximo 72 bytes UTF-8, confirmación doble y almacenamiento bcrypt. Nunca se envía la contraseña por correo ni se guarda en logs o URLs.
- La migración aditiva e idempotente `006_password_recovery.sql` agrega `token_version`. Cambiar la contraseña incrementa esa versión, revoca las sesiones anteriores y elimina los códigos pendientes de esa cuenta en la misma transacción. Después se exige iniciar sesión nuevamente, sin acceso automático.
- Las cuentas históricas mantienen su contraseña y sesiones hasta que el titular efectúa el cambio. Las cuentas creadas por Google/código también pueden establecer contraseña verificando su correo. No se modifica la recuperación de administradores, que usa una tabla y un acceso separados.
- Sin Resend configurado se muestra un aviso y no se simula el envío. Falta probar entrega real con dominio verificado antes de publicar.

Referencia de seguridad utilizada: [recuperación de contraseña de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

La migración `005_verified_identity.sql` es aditiva e idempotente. No elimina ni fusiona cuentas, pagos, inscripciones o constancias. Conserva los duplicados históricos y permite editar sus campos ajenos a identidad; bloquea nuevos duplicados y cambios que colisionen. El acceso por correo ambiguo requiere revisión administrativa.

Las reservas de identificadores no se liberan automáticamente al cambiar correo o CURP: cualquier corrección de identidad debe revisarse manualmente. No borrar reservas a ciegas.

Consulta de diagnóstico (solo IDs, sin imprimir CURP o correos):

```sql
SELECT 'email' AS tipo, array_agg(id_usuario ORDER BY id_usuario) AS cuentas
FROM usuarios GROUP BY lower(btrim(email)) HAVING count(*) > 1
UNION ALL
SELECT 'curp', array_agg(id_usuario ORDER BY id_usuario)
FROM usuarios WHERE nullif(btrim(curp),'') IS NOT NULL
GROUP BY upper(btrim(curp)) HAVING count(*) > 1;
```

## Configuración necesaria antes de publicar

1. Crear un cliente web de Google Identity Services, configurar marca/consentimiento, enlaces de privacidad y orígenes JavaScript autorizados (dominio real del frontend y localhost de pruebas). Usar únicamente perfil/correo, sin permisos de Gmail. Copiar su ID público a `GOOGLE_CLIENT_ID` del backend. No se requiere un secreto de cliente para este flujo de ID token.
2. Crear una cuenta **Free** de Resend. Verificar un dominio/remitente mediante sus registros DNS. No contratar planes ni activar facturación adicional. Configurar `RESEND_API_KEY` y `AUTH_EMAIL_FROM` únicamente en el backend. Usar un remitente real autorizado, no uno inventado.
3. Conservar `JWT_SECRET` privado, estable y suficientemente aleatorio. No pegar claves en mensajes, frontend, capturas ni Git.
4. Ejecutar las pruebas locales y revisar conflictos históricos. La migración se ejecuta al arrancar el backend. Respaldar la base antes de publicar y revisar el resultado en los logs sin exponer datos.
5. Publicar backend y frontend coordinadamente: el registro antiguo `/usuarios/registrar` devuelve 403 y no permite crear cuentas sin verificar. **Si los proveedores no están configurados, no habrá registro nuevo disponible**; seguirá existiendo el inicio con contraseña de cuentas anteriores. No se simulan envíos ni se permite saltar la verificación.
6. Verificar un registro real y un acceso con Google con cuentas de prueba autorizadas, además de fallos y reenvíos. La respuesta de `/api/acceso/config` solo expone disponibilidad y el ID público de Google.

Variables (valores a configurar localmente/Render, nunca completar en el repositorio):

```dotenv
GOOGLE_CLIENT_ID=
RESEND_API_KEY=
AUTH_EMAIL_FROM=
```

## Pruebas

Verificación completa previa a publicación del 01/10/2026: **93 pruebas unitarias y 38 pruebas de integración aprobadas** (3 suites de integración, incluido navegador). Esta repetición completa resuelve la comprobación global que había quedado pendiente por timeout. Jest emitió un aviso de cierre tardío de operaciones asíncronas; terminó con código 0 y el ejecutor cerró y eliminó el clúster temporal. Se conservan a continuación los resultados de las ejecuciones anteriores como historial.

Actualización del 01/10/2026 (recuperación de contraseña): **93 pruebas unitarias aprobadas**, con 3 opcionales de reportes omitidas. La ejecución específica de recuperación aprobó **6 pruebas de integración** (13 casos ajenos al filtro omitidos), incluyendo el formulario real en Edge, cambio autenticado, revocación de sesiones, separación de propósitos, vencimiento/intentos y consumo concurrente de un código. Correo simulado; no se envió ningún mensaje real. El clúster temporal fue eliminado al terminar. La regresión global de esta etapa no se presenta como aprobada: una ejecución anterior agotó el tiempo de preparación de navegador; la ejecución específica posterior terminó correctamente, con un aviso de Jest sobre cierre tardío de operaciones asíncronas.

Comando de la ejecución específica:

```powershell
node scripts/test-integration.js --suite=acceso.integration.test.js --testNamePattern="recuper|cambio autenticado|código de acceso" --verbose
```

Resultado local del 30/09/2026: **89 pruebas unitarias aprobadas** (3 pruebas opcionales de reportes omitidas), **32 pruebas de integración aprobadas** en tres suites. Incluyen el recorrido anterior de asistencia/constancias, 12 casos API/BD de acceso y un caso de registro completo en Edge con revisión de escritorio/móvil. Auditoría de dependencias: **0 vulnerabilidades** después de actualizar `brace-expansion` a una versión compatible corregida. Google y Resend permanecen simulados en estas pruebas; falta comprobación real con las cuentas del centro.

Desde `backend`:

```powershell
node node_modules/jest/bin/jest.js --runInBand --testPathIgnorePatterns=integration.test.js
node scripts/test-integration.js
```

El ejecutor crea PostgreSQL temporal en loopback, anula las credenciales externas heredadas y elimina solo sus temporales. `acceso.integration.test.js` simula Resend y Google (no verifica credenciales reales), comprueba límites, expiración, replay, unicidad concurrente, conservación de históricos y registro mediante navegador Edge en escritorio/móvil. La prueba de seguimiento usa ahora una cuenta histórica como fixture; el registro nuevo se verifica en su suite dedicada.

Fuentes de configuración: [Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Resend](https://resend.com/docs/dashboard/domains/introduction), [plan gratuito](https://resend.com/pricing).
