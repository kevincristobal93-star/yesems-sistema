# Plan maestro — Atención educativa YES EMS

**Estado:** Fase 1 autorizada por el usuario; S1-01 implementada. Las siguientes tareas siguen pendientes de aprobación individual.
**Fuente de verdad:** este documento; se actualizará si una fase aprobada descubre que el código o las decisiones ya cambiaron.
**Auditoría inicial:** 25 de noviembre de 2026.
**Alcance inmediato:** ejecutar una tarea aprobada a la vez; pedir aprobación antes de continuar a la siguiente.

## 1. Decisión de arquitectura propuesta

Construir **Atención educativa dentro de la misma plataforma y API**, como un espacio claramente separado del panel académico actual. Tendrá navegación y vistas propias, pero reutilizará la autenticación, los usuarios/clientes, las inscripciones y los pagos existentes cuando corresponda. No se propone crear otra aplicación ni duplicar cuentas.

Las solicitudes de servicios y las asesorías serán registros propios, no inscripciones disfrazadas. Se relacionarán con `usuarios` y podrán referenciar un curso, una inscripción o un pago cuando sea pertinente. El panel administrativo actual debe conservar sus funciones: cursos y disponibilidad, inscripciones, pagos, constancias, seguimiento, aula virtual, respaldos y administración de cuentas.

## 2. Alcance y método del diagnóstico

Se inspeccionaron el estado de Git, la estructura, el backend (aplicación, rutas, controladores, modelos, middlewares, servicios y configuración), las migraciones, las vistas/estilos administrativos y la documentación. No se leyeron archivos `.env` ni valores de secretos. El árbol estaba limpio al iniciar esta auditoría.

Los estados significan:

- **[CONFIRMADO]** se observa directamente en el repositorio.
- **[NO APLICA]** la afirmación no coincide con el código actual.
- **[PARCIAL]** una parte coincide, pero necesita la precisión indicada.
- **[NO VERIFICABLE]** depende de una consola o configuración externa a la que no se tuvo acceso.

### 2.1 Seguridad y operación

| Punto auditado | Estado | Evidencia y precisión |
|---|---|---|
| Login de administradores sin límite de intentos | [CONFIRMADO] | `backend/src/routes/administrador.routes.js` conecta `POST /login` directamente al controlador. El login de usuarios sí pasa por `acceso.service.limit` en `usuario.routes.js`. |
| `/api/db-test` público y revela el nombre de la base | [CONFIRMADO] | `backend/src/app.js` no le aplica autenticación y devuelve el resultado de `current_database()`. También devuelve `error.message` si falla. |
| CORS abierto y sin Helmet/CSP | [CONFIRMADO] | `app.js` usa `cors()` sin lista de orígenes. `helmet` no está en `backend/package.json` y no se encontró una política CSP configurada. |
| Controladores administrativos devuelven `error.message` con 500 | [CONFIRMADO] | Hay varios casos, entre ellos resumen, reportes, administración de cuentas, login y pagos. El manejador general de Express sí oculta errores 500, pero no corrige respuestas creadas antes por esos controladores. |
| Token de administrador de 8 h, sin versión/revocación individual y guardado en `localStorage` | [PARCIAL] | `administrador.controller.js` firma con `expiresIn: '8h'`; `admin.js` lo guarda en `localStorage`. El administrador no tiene `token_version` ni revocación por token. **Sí** se consulta la cuenta y su estado activo en cada petición; desactivar la cuenta invalida el acceso, por lo que no es correcto decir que no existe ninguna revocación. `token_version` sí está implementado para usuarios. |
| `modalidad.routes.js` tiene CRUD sin autenticación pero no está montado | [CONFIRMADO] | El archivo declara GET/POST/PUT/DELETE sin middleware. `app.js` no importa ni monta ese router; por ahora esas rutas no son alcanzables a través de la aplicación. No montarlo sin protegerlo. |
| Scripts administrativos contienen host y correo operativos fijos | [CONFIRMADO] | `scripts/admin-unico-oscar.cjs` y `scripts/restablecer-admin.cjs` fijan el destino permitido y el correo objetivo. La conexión y contraseña se reciben por variables protegidas de proceso; no son credenciales escritas en el código. El host fijo funciona como salvaguarda del destino y no debe eliminarse sin reemplazo seguro. Este plan no reproduce los valores. |
| Ausencia de respaldos automáticos de producción | [NO VERIFICABLE] | El repositorio contiene `backup-database.js` y comandos manuales de crear/verificar/restaurar, pero no una tarea programada. La programación y retención que pudiera existir en el proveedor de base de datos/hosting no se puede comprobar desde Git. La prueba local documentada no demuestra que haya un respaldo productivo. |
| PostgreSQL usa `rejectUnauthorized: false` en producción | [CONFIRMADO] | `backend/src/config/db.js` configura esa opción cuando `NODE_ENV=production` y se proporciona `DATABASE_URL`. |

### 2.2 Presentación y consistencia

| Punto auditado | Estado | Evidencia y precisión |
|---|---|---|
| 51 archivos CSS y ~18 en `admin.html` | [NO APLICA / PARCIAL] | Hay **54 archivos `.css`** en `frontend` al contar también el scaffold `src/`. `admin.html` enlaza **17 hojas CSS** (incluyendo tokens y las del sidebar/controles); varias son capas visuales del panel, pero no se debe asumir que las 17 se sobrescriben entre sí sin revisar sus selectores. |
| `tokens.css` contiene cinco azules marinos distintos | [CONFIRMADO] | Define `--navy` y cuatro variantes `--navy-*`; también mantiene colores de tinta/océano adicionales. |
| `admin.html` es una página larga de ocho secciones con footer de marketing | [PARCIAL] | Es una página larga con navegación por anclas, secciones de resumen/reportes/inscripciones/pagos/constancias/cursos/respaldos/seguimiento y footer institucional/promocional. El archivo tiene 12 etiquetas `<section>` contando secciones anidadas; “ocho” no es un recuento preciso. Aula virtual además abre una página administrativa separada. |
| Texto fijo “Datos en tiempo real” | [CONFIRMADO] | El hero de `admin.html` lo muestra, aunque la pantalla indica que los datos se actualizan/consultan desde el sistema; debe revisarse para no prometer actualización en vivo. |
| Sección de respaldos incluye instrucciones técnicas | [CONFIRMADO] | `admin.html` y `docs/RESPALDOS_RECUPERACION.md` describen la creación/verificación y recuperación manual. No se deben mostrar secretos ni rutas privadas en la interfaz. |
| Terminología mezclada docente/alumno/cliente | [CONFIRMADO] | La interfaz usa “docente”; el esquema y la autorización distinguen `cliente`/`alumno`, y aún existen identificadores/textos históricos de “alumno”. Hace falta decidir un término visible sin renombrar datos por accidente. |
| Cupo solicitado en admin e inscripción pese a la decisión de no usar cupos | [PARCIAL] | `admin.html`, `admin.js`, el controlador/modelo de cursos y el esquema todavía requieren/guardan `cupo`. `inscripcion.html` conserva el campo, pero `inscripcion.js` lo oculta si `control_cupo=false`; `curso.model.js` devuelve ese indicador como falso y el controlador de inscripción no rechaza por cantidad. `docs/CIERRE_SISTEMA.md` confirma la decisión de no limitar ni mostrar cupos. Hay que quitar el requisito/interfaz residual sin reactivar límites ni borrar valores históricos a ciegas. |
| URL de API copiada manualmente en ~8 JS | [NO APLICA] | Se encontraron **16 archivos JavaScript** del frontend con la URL del backend de Render escrita directamente. Conviene centralizarla y permitir configuración por entorno/despliegue. |
| `docs/` contiene evidencias, reportes Word y `.ps1` auxiliares | [CONFIRMADO] | Hay capturas/README de evidencias, dos reportes `.docx` y scripts PowerShell de generación de reportes. Son documentación/herramientas, no código que deba moverse o borrarse como parte de esta iniciativa. |

### 2.3 Capacidades existentes y brecha funcional

**Ya existe:** cuentas en `usuarios`; cuentas administrativas separadas; catálogo y CRUD de cursos; disponibilidades/horarios; inscripciones; pagos asociados a inscripción; Mercado Pago asociado al flujo de inscripción; constancias; progreso académico/sesiones; aula y materiales; reportes; respaldo manual y almacenamiento de archivos mediante servicios existentes. El administrador ya cuenta con métricas, tablas y vistas propias.

**No se encontró un flujo general de Atención educativa** con catálogo de servicios, solicitud con folio y responsable, bitácora de seguimiento, documentos asociados a una solicitud y agenda de asesorías. Las disponibilidades/horarios de cursos no equivalen a una agenda de asesorías.

La tabla `pagos` exige actualmente `id_inscripcion NOT NULL`; no tiene `id_solicitud` ni tipo de anticipo/liquidación. Por tanto, los pagos de servicios requieren un cambio compatible y no deben mezclarse con pagos de curso sin una regla explícita.

La numeración de migraciones llega a `017_mercado_pago.sql`; hay dos archivos con prefijo `002`, así que antes de crear migraciones se debe seguir la secuencia efectiva del arranque, no renombrar archivos históricos. `run-migrations.js` ejecuta explícitamente hasta `017`; toda migración nueva tendrá que incorporarse de forma explícita y probarse en una base aislada.

## 3. Decisiones pendientes

No se asumirán estas respuestas. La propuesta de diseño puede avanzar con alternativas, pero la implementación que dependa de ellas espera confirmación.

| ID | Decisión requerida | Opción sugerida para evaluar |
|---|---|---|
| D-01 | Término visible único para las personas en la plataforma: “docente”, “cliente” u otro. | Mantener “docente” en la experiencia académica y usar “solicitante” en Atención educativa; confirmar con dirección. |
| D-02 | Paleta institucional final. | Consolidar los tokens actuales y usar el azul/amarillo institucional, previa aprobación visual. |
| D-03 | Dominios finales del frontend y API. | Mantener Render mientras no se confirme dominio propio; permitir dominios por configuración, no hardcode en cada página. |
| D-04 | Proveedor de correo para avisos y recordatorios. | El repositorio ya tiene servicio de correo con Gmail API; confirmar si se reutiliza o se cambia. |
| D-05 | Destino, frecuencia, retención y responsables de respaldos productivos, incluida la clave de cifrado. | Proveedor externo aprobado, copia cifrada, restauración de prueba y acceso separado a la clave. |
| D-06 | Quién atiende solicitudes: solo administradores o también asesores con permisos acotados. | Empezar con permisos administrativos existentes; no crear rol de asesor hasta definir alcance. |
| D-07 | Requisitos, precio, estados y tiempos de entrega por cada servicio. | Definirlos con dirección antes de abrir solicitudes reales. |
| D-08 | Duración, zona horaria, modalidad, cancelación y reprogramación de asesorías. | Usar `America/Mexico_City` como propuesta; confirmar horarios y reglas. |
| D-09 | Si las solicitudes aceptan anticipo y liquidación, qué métodos se admiten y cuándo se habilita el trabajo. | Registrar saldo explícito y no iniciar el servicio hasta alcanzar la condición que defina dirección. Confirmar si Mercado Pago se aplicará también a solicitudes. |
| D-10 | Tipos de documentos, privacidad, retención y visibilidad de archivos. | Archivos privados con autorización por solicitud; no publicar enlaces permanentes. |
| D-11 | Manejo de sesión administrativa y compatibilidad de clientes al pasar de `localStorage` a cookie segura, si se elige ese cambio. | Evaluar impacto conjunto en CORS, CSRF y frontend antes de decidir. |

## 4. Diseño propuesto: Atención educativa

### 4.1 Experiencia administrativa

Dentro del panel administrativo habrá un espacio separado llamado **Atención educativa**, con navegación propia o una sección claramente delimitada. No será otro sistema ni reemplazará la administración académica.

**Inicio**

1. Cuatro indicadores: solicitudes abiertas, asesorías agendadas, entregas pendientes e inscripciones activas.
2. Tabla “Seguimiento de solicitudes”: folio, solicitante, servicio, fecha compromiso y estado.
3. Panel de detalle de la solicitud seleccionada: datos de contexto, pago/saldo, responsable, documentos y línea de seguimiento.
4. Tarjeta “Próxima atención”: asesoría, persona, hora, modalidad y enlace si existe.
5. Búsqueda por nombre, correo, folio o servicio; estados vacíos y errores claros.

**Servicios iniciales**

- Cursos y capacitación.
- Planeaciones didácticas.
- Instrumentos de evaluación.
- Asesoría docente.

El administrador podrá activar/desactivar servicios y configurar datos requeridos, modalidad y reglas aprobadas. No se expondrá un formulario arbitrario basado directamente en JSON sin validación.

### 4.2 Modelo de datos conceptual

Todas las entidades nuevas conservan claves foráneas, restricciones, índices y marcas de fecha. Los nombres son propuesta y se validarán contra el esquema real antes de escribir SQL.

| Entidad | Campos/concepto principal | Relaciones y reglas |
|---|---|---|
| `servicios` | clave, nombre, descripción, activo, requisitos/configuración validada | Semilla inicial para los cuatro servicios anteriores. |
| `solicitudes` | folio `SOL-AAAA-0001`, servicio, usuario solicitante, estado, prioridad, fecha de entrega, responsable, datos validados, monto total | `id_usuario` referencia `usuarios`; FK opcional a curso/inscripción cuando corresponda. Folio único generado de forma concurrente-segura. |
| `solicitud_eventos` | solicitud, actor, estado anterior/nuevo, comentario, fecha | Bitácora append-only; cambios de estado y asignaciones se registran en la misma transacción que la solicitud. |
| `solicitud_documentos` | solicitud, nombre seguro, tipo/tamaño, clave de almacenamiento, autor, fecha | Metadatos en BD; contenido en almacenamiento privado existente o proveedor aprobado. Descargar solo tras verificar autorización. |
| `asesorias` | solicitante, asesor, solicitud opcional, inicio/fin, modalidad, estado y notas | FK a usuario; cita puede originarse de una solicitud o ser independiente. Revisar zona horaria, cruces y reprogramación. |
| `pagos` | vínculo de inscripción o solicitud, monto, método, estado, tipo | `id_inscripcion` se vuelve nullable y se agrega `id_solicitud`; CHECK XOR obliga a que haya exactamente un vínculo. `tipo` distingue curso, anticipo y liquidación. Preservar pagos actuales sin reclasificarlos ni perder referencias Mercado Pago. |

Folio sugerido: secuencia por año con restricción `UNIQUE`; la asignación debe ocurrir en transacción para evitar duplicados. `datos` JSONB solo guardará campos definidos y validados por servicio; identidad y datos de contacto permanecen en `usuarios`.

### 4.3 Estados y seguridad de negocio

Propuesta inicial de estados comunes: `recibida`, `en_revision`, `requiere_informacion`, `pendiente_pago`, `aprobada`, `en_proceso`, `revision_entrega`, `completada` y `cancelada`. No todos aplicarán a cada servicio. El servidor mantendrá una matriz de transiciones permitidas por servicio; no aceptará cambios de estado arbitrarios desde el navegador.

Cada transición se ejecutará en transacción con bloqueo de la fila de solicitud (`SELECT ... FOR UPDATE` o equivalente) y escribirá su evento en bitácora. No reutilizar `withEnrollmentLock` para bloquear una solicitud distinta. Validar permisos, propietario, estado previo y condiciones de pago en backend; el frontend solo refleja el resultado.

### 4.4 API y vistas propuestas

- `GET /api/atencion/resumen`: indicadores y próxima atención con una consulta agregada que evite multiplicar filas al unir pagos/eventos.
- `GET/POST /api/solicitudes`: administración, protegido para personal autorizado; búsqueda/filtros/paginación y alta.
- `GET /api/solicitudes/:id`, `PATCH /api/solicitudes/:id`, `POST /api/solicitudes/:id/eventos`: detalle, asignación/transición y bitácora con validación en servidor.
- `GET /api/solicitudes/mias`, `POST /api/solicitudes/mias`: solicitudes del usuario autenticado; nunca aceptar un `id_usuario` arbitrario del cliente.
- `GET/POST/PATCH /api/asesorias`: agenda y reprogramación/cancelación según permisos.
- Rutas de documentos con carga y descarga autenticadas; límites de tamaño/tipo, nombre generado, autorización por propietario/rol y URL temporal si el almacenamiento lo requiere.
- Vista administrativa separada, integrada con la sesión administrativa. Vista del cliente **Mis solicitudes** en su panel actual, con folio, estado, línea de tiempo, próximos pasos y documentos permitidos.
- Un único módulo de configuración del frontend para la URL de API. No cambiar todos los consumidores de golpe: migrar por pantalla y verificar despliegues.

### 4.5 Fechas, dinero y avisos

- Mostrar fecha compromiso absoluta y relativa: “vence en 3 días”, “vence hoy” o “vencida”; calcular zona horaria de forma explícita.
- Mostrar monto total, pagos confirmados, anticipo y saldo pendiente. Un pago pendiente no reduce saldo confirmado.
- Avisos de asesoría, cambios de estado, documentos requeridos y vencimientos solo después de definir proveedor de correo, frecuencia, responsable de reintentos y preferencias de notificación.
- No prometer actualización en tiempo real si la vista solo consulta bajo demanda; indicar cuándo se actualizó.

## 5. Fases de trabajo

**Reglas de ejecución:** estas tareas son una propuesta, no permiso para ejecutarlas. Antes de cada fase se solicitará aprobación; antes de cada migración, aprobación explícita. Una tarea por turno: implementar, probar, actualizar este documento, commit claro y push. Se conservarán cambios locales ajenos, no se usará `git reset --hard`, no se borrarán datos y no se publicará ningún secreto. Las migraciones serán aditivas/reversibles cuando sea viable, y se probarán en base aislada.

Cada tarea tiene ID, archivos previstos (pueden ajustarse tras inspección), prueba de aceptación y riesgo.

### Fase 1 — Seguridad y limpieza

| Hecho | ID / tarea | Archivos previstos | Prueba de aceptación | Riesgo |
|---|---|---|---|---|
| [x] | S1-01 Limitar intentos de `administradores/login` reutilizando el limitador existente, sin bloquear usuarios legítimos permanentemente. | `backend/src/routes/administrador.routes.js`, `backend/src/middlewares/admin-login-limit.middleware.js`, `backend/test/admin-login-limit.middleware.test.js` | 30 intentos por IP y 10 por correo normalizado en 15 minutos; claves con HMAC; respuestas genéricas. En producción, usar `CF-Connecting-IP` validada y omitir el bucket IP si falta, evitando agrupar a todos bajo la IP del proxy. | Bajo/medio: el límite por cuenta puede provocar una pausa temporal si se agotan los intentos. |
| [ ] | S1-02 Eliminar o proteger `/api/db-test`; en producción no revelar nombre de BD ni errores internos. | `backend/src/app.js`, pruebas de API | Sin token/entorno permitido recibe 404/401; una respuesta autorizada no incluye nombre ni conexión. | Medio: herramientas operativas pueden depender del endpoint. |
| [ ] | S1-03 Restringir CORS a orígenes aprobados e introducir cabeceras seguras/CSP en modo gradual. | `backend/src/app.js`, `backend/package.json`, pruebas/config de despliegue | Origen permitido funciona; origen no permitido no lee respuestas; CSP no rompe recursos revisados. | Alto: puede bloquear frontend legítimo o estilos/scripts inline existentes. Requiere D-03. |
| [ ] | S1-04 Normalizar errores 500 para que solo se registren internamente y se responda mensaje genérico. | Controladores/modelos que devuelven `error.message`, `backend/src/utils/http-error.js`, pruebas | Pruebas confirman que respuestas 500 no contienen SQL, rutas, mensajes del driver ni datos de conexión; 4xx de negocio conservan mensaje útil. | Medio: algunos mensajes actualmente consumidos por UI cambiarán. |
| [ ] | S1-05 Incorporar versión/revocación individual a sesiones admin y definir estrategia de almacenamiento de sesión. | `backend/database/migrations/018_admin_token_version.sql` (nombre provisional), migrador, modelo/controlador/middleware admin, `frontend/admin*.js`, pruebas | Token previo deja de funcionar tras revocación/cambio; desactivar administrador sigue bloqueando; migración y restauración probadas en BD aislada. | Alto: migración y transición coordinada del login. D-11; solicitar autorización antes de SQL. |
| [ ] | S1-06 Mantener `modalidad.routes.js` fuera de `app.js` hasta proteger CRUD; decidir si se protege o elimina tras buscar consumidores. | `backend/src/routes/modalidad.routes.js`, `backend/src/app.js`, pruebas | No hay ruta pública CRUD; si se monta, CRUD exige admin; pruebas cubren acceso anónimo y autenticado. | Bajo mientras siga sin montar; medio si aparece un consumidor oculto. |
| [ ] | S1-07 Revisar scripts de administración con valores operativos fijos sin debilitar la protección del destino productivo. | `backend/scripts/admin-unico-oscar.cjs`, `backend/scripts/restablecer-admin.cjs`, scripts PowerShell y pruebas | Destino y operador configurables/validados, secretos solo en entrada protegida; modo de validación no modifica BD; no se registran valores sensibles. | Alto: son scripts con operaciones administrativas/destructivas; cualquier cambio exige revisión y confirmación explícita. |
| [ ] | S1-08 Resolver residual de cupos sin reactivar límites: quitar el campo obligatorio/visible y mantener compatibilidad histórica hasta decidir una migración separada. | `frontend/admin.html`, `admin.js`, `inscripcion.html/js`, `catalogo-view.js`, `backend/src/controllers/curso.controller.js`, `curso.model.js`, pruebas | Admin puede crear/editar sin cupo; UI no muestra límite; inscripciones no se bloquean por cupo; datos históricos no se borran ni restringen. | Alto: esquema actual exige `cupo`; requiere decidir cómo asignar un valor legacy sin afectar datos. |
| [ ] | S1-09 Corregir copy que promete “tiempo real” y reducir acoplamiento CSS del panel mediante consolidación incremental, sin rediseño funcional. | `frontend/admin.html`, hojas CSS de admin, pruebas visuales/responsive | El copy describe actualización real; panel conserva navegación y apariencia aprobada en desktop/móvil; no se rompen IDs/handlers. | Medio/alto: cascada acumulada; requiere capturas/regresión visual. |
| [ ] | S1-10 Definir respaldo productivo con destino/frecuencia/retención acordados y ejecutar restauración de ensayo. | `backend/scripts/backup-database.js`, `backend/test/backup.integration.test.js`, documentación y configuración externa aprobada | Copia cifrada verificable, restore en base vacía aislada y registro de resultado; credenciales/claves no van a Git. | Alto: depende de D-05 y permisos de proveedor; nunca probar sobre producción. |

### Fase 2 — Shell separado e Inicio con datos existentes

| Hecho | ID / tarea | Archivos previstos | Prueba de aceptación | Riesgo |
|---|---|---|---|---|
| [ ] | S2-01 Diseñar el shell/navegación de Atención educativa dentro de la misma plataforma, conservando los módulos actuales del admin. | `frontend/admin.html`, `admin.js`, `dashboard-sidebar.js/css`, nuevos CSS/JS si hacen falta, boceto aprobado | Acceso admin mantiene enlaces de cursos, pagos, constancias, seguimiento, aula, respaldos y configuración; nueva área no sustituye ni duplica. | Medio: cambios de navegación pueden alterar anclas e historial. |
| [ ] | S2-02 Crear configuración única de API y migrar una pantalla a la vez desde las 16 URLs embebidas. | Nuevo `frontend/config.js`, páginas/JS consumidores, pruebas | Todas las pantallas conservan el mismo backend por defecto; una sola fuente configurable; no hay URL duplicada en pantallas migradas. | Medio: riesgo de apuntar una pantalla al entorno equivocado. |
| [ ] | S2-03 Implementar Inicio de Atención con cuatro KPIs, tabla, panel de detalle y Próxima atención; mostrar placeholders honestos para datos aún no disponibles. | Vistas/JS/CSS de Atención, `backend/src/routes`, controller/model nuevo de resumen | Prueba con datos ficticios: conteos correctos, un resumen sin duplicados y estado vacío; inscripciones activas consultan datos existentes. | Medio: agregaciones incorrectas pueden contar pagos/eventos repetidos. |

### Fase 3 — Servicios, solicitudes, bitácora y documentos

| Hecho | ID / tarea | Archivos previstos | Prueba de aceptación | Riesgo |
|---|---|---|---|---|
| [ ] | S3-01 Aprobar y crear catálogo de servicios con los cuatro servicios iniciales. | Migración siguiente disponible (provisionalmente `019+`), migrador, modelo, seed idempotente | Migración sube y baja/restaura en BD temporal; servicios se siembran sin duplicarse. | Alto: afecta esquema; requiere confirmación específica de migración. |
| [ ] | S3-02 Crear solicitudes con folio anual único, requisitos validados, prioridad, fecha, responsable y vínculo opcional a datos académicos existentes. | Migración/modelo/controller/routes, pruebas de integración | Folios concurrentes únicos; datos inválidos rechazados; solicitante no puede suplantar usuario; curso/inscripción opcionales solo se vinculan si pertenecen al solicitante. | Alto: datos personales y consistencia transaccional. |
| [ ] | S3-03 Implementar transiciones por servicio y bitácora inmutable, con autorización y bloqueo de fila. | Servicio de dominio/modelo/controller, rutas admin/cliente y pruebas | Transición no permitida falla sin mutar; transición permitida actualiza solicitud y crea evento atómicamente; acceso de cliente solo a su solicitud. | Alto: estados inválidos pueden liberar trabajos o pagos indebidamente. |
| [ ] | S3-04 Integrar documentos privados y la vista “Mis solicitudes”. | `storage.service.js`/`aula-files.service.js` según revisión, rutas y vistas de panel | Pruebas de propietario/admin, MIME/tamaño/nombre, descarga y URL temporal; un cliente no puede leer documentos ajenos. | Alto: exposición de documentos sensibles. |
| [ ] | S3-05 Revisar migración de pagos para permitir exclusivamente vínculo a inscripción XOR solicitud y tipo de pago. | Migración aditiva, `pago.model.js`, `mercado-pago.model.js`, controladores/rutas, pruebas | CHECK rechaza cero o dos vínculos; pagos actuales y webhook/checkout de inscripciones mantienen conducta; saldo no cuenta pagos pendientes. | Muy alto: pagos y referencias financieras; confirmar migración y compatibilidad antes de ejecutar. |

### Fase 4 — Asesorías, agenda y avisos

| Hecho | ID / tarea | Archivos previstos | Prueba de aceptación | Riesgo |
|---|---|---|---|---|
| [ ] | S4-01 Crear asesorías y operaciones de agenda con estado, duración, modalidad y reglas de solapamiento. | Migración, modelo/controller/routes, UI de agenda, pruebas | Conflictos de horario rechazados en transacción; zona horaria y reprogramación verificadas; solo roles autorizados asignan asesor. | Alto: horario equivocado causa citas perdidas. Requiere D-06/D-08. |
| [ ] | S4-02 Añadir recordatorios/correos y eventos de vencimiento con reintentos e idempotencia. | `mail.service.js` o proveedor aprobado, servicio de notificaciones, job/config de despliegue, pruebas | Un aviso por evento, reintento seguro, correo sin datos innecesarios; entorno de prueba no envía a usuarios reales. | Alto: proveedor, cuota y ejecución programada externos. Requiere D-04/D-05. |

### Fase 5 — Anticipos/saldos, reportes y exportación

| Hecho | ID / tarea | Archivos previstos | Prueba de aceptación | Riesgo |
|---|---|---|---|---|
| [ ] | S5-01 Mostrar total, anticipos, pagos aplicados y saldo por solicitud; soportar registro/validación manual según política. | Modelos/controladores de pagos, UI Atención, pruebas | Casos anticipo, liquidación, cancelación y pago pendiente producen saldo correcto; no se duplica al unir solicitudes. | Alto: interpretación contable. Requiere D-09. |
| [ ] | S5-02 Si se aprueba, extender checkout/webhook de Mercado Pago a solicitud con referencias idempotentes separadas. | `mercado-pago.service.js`, `mercado-pago.model.js`, rutas/controller, pruebas de webhook | Solo pago aprobado actualiza saldo; webhook repetido es idempotente; no habilita trabajo con pago pendiente. | Muy alto: dinero real, fraude/reintentos; requiere prueba sandbox y aprobación expresa. |
| [ ] | S5-03 Crear reportes y exportación con filtros de periodo, servicio, estado, responsable y saldo. | Modelo/controller, UI, pruebas | Totales/exportación coinciden con consultas de referencia; respeta permisos y no incluye datos personales no necesarios. | Medio/alto: agregados y privacidad. |

### Fase 6 — Opcional, posterior a aprobación

| Hecho | ID / tarea | Archivos previstos | Prueba de aceptación | Riesgo |
|---|---|---|---|---|
| [ ] | O6-01 Consulta pública de folio + dato verificador, con respuesta mínima y límite de intentos. | Rutas/servicio/tests/UI pública | No revela datos sensibles ni permite enumeración; rate limit probado. | Alto: privacidad y abuso. |
| [ ] | O6-02 Roles granulares para asesores y segundo factor para personal. | Esquema/auth/middlewares/UI/pruebas | Matriz permiso-caso probada; recuperación segura y auditoría. | Alto: impacto en todas las sesiones admin. |
| [ ] | O6-03 CI con Jest, recibos PDF e invitaciones de calendario `.ics`. | Configuración CI, pruebas y servicios de documentos | Pipeline bloquea cambios con fallos; PDFs/ICS válidos sin datos de prueba reales. | Medio. |

## 6. Registro de progreso

Fase 1 está en curso. Solo se implementó S1-01, aprobada por el usuario; no se aplicaron migraciones ni se inició otra tarea.

| Fecha | Tarea | Commit | Pruebas / resultado |
|---|---|---|---|
| 2026-11-25 | Auditoría inicial y creación de este plan | — | Revisión estática del repositorio; sin cambios de aplicación ni migraciones. Pendiente revisión/aprobación del usuario. |
| 2026-11-25 | S1-01 Límite de intentos en login administrador | `feat: throttle admin login` | Middleware añadido a `POST /administradores/login`: 30 por IP y 10 por correo en 15 min, usando claves HMAC y respuestas genéricas. 6 pruebas específicas pasan y `node --check` pasa. La suite completa conserva 6 fallos en `test/inscripcion-frontend.test.js`, ajenos a esta tarea; 21 suites pasan y 7 están omitidas. Sin migraciones. |

## 7. Criterios de cierre por tarea

- Revisar `git status` y los archivos relacionados; conservar cambios locales ajenos.
- Editar con `apply_patch`; no leer/copiar secretos desde `.env` ni registrar tokens, correos reales o URLs privadas.
- Ejecutar `node --check` en JavaScript modificado y `npm test` del backend; añadir pruebas para endpoints y reglas nuevas. Las pruebas de integración solo usarán una base temporal aislada.
- No crear, ejecutar ni aplicar migraciones hasta recibir autorización explícita para esa migración.
- Actualizar las casillas de tarea y el registro de progreso con resultados reales; commit/push solo de archivos de la tarea aprobada.
- Explicar el resultado en lenguaje sencillo y detenerse para pedir aprobación antes de la siguiente fase.
