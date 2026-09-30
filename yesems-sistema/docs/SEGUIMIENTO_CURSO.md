# Seguimiento real, conclusión y constancias

Implementación local para revisión. No se han publicado estos cambios ni se han usado datos de producción para las pruebas.

## Regla acordada

El mínimo lo define la administración **por curso**, entre 1 y 100 %; no hay un porcentaje predeterminado. Se registra el cumplimiento de sesiones o actividades para cursos presenciales, en línea, híbridos o con modalidad pendiente de definir. No se crean aulas ni una plataforma de clases virtuales.

Cada sesión o actividad activa tiene el mismo peso:

`avance = actividades cumplidas / actividades activas del plan × 100`

El porcentaje mostrado se redondea a dos decimales. Para aprobar se compara la proporción exacta: 2 de 3 actividades no cumplen un mínimo de 67 %. Sin actividades no se muestra un porcentaje ilustrativo ni se permite concluir.

Una inscripción puede concluir solamente cuando:

1. No está cancelada.
2. El plan completo está publicado y tiene al menos una actividad.
3. Tiene un mínimo definido y alcanza ese porcentaje de cumplimiento.
4. La suma de pagos con estado `completado` cubre `monto_total`. Pagos pendientes o cancelados no cuentan. Una inscripción de importe cero no necesita pagos.
5. Un administrador autenticado revisa los datos y confirma la conclusión.

La validación guarda `concluida_por` y `concluida_at`. La solicitud y la autorización de constancia vuelven a comprobar todos los requisitos en el servidor. Un curso concluido con 4/5 actividades sigue mostrando **80 %**, no 100 %.

## Operación en las pantallas

1. Admin → **Sesiones y avance** → seleccionar curso.
2. Guardar el porcentaje mínimo; agregar el plan completo con título, tipo, modalidad y fecha opcional de cada actividad.
3. Publicar el plan. Antes de la primera conclusión puede reabrirse como borrador para corregirlo; durante el borrador no se puede concluir ni registrar asistencia.
4. Seleccionar un alumno, marcar actividades cumplidas y guardar. Las observaciones son visibles para el alumno; no escribir notas confidenciales. No se permite marcar fechas futuras como cumplidas (día de México).
5. Revisar el saldo, las actividades pendientes y los motivos de bloqueo. Validar pagos desde **Pagos pendientes** cuando corresponda.
6. Pulsar **Validar conclusión** cuando esté disponible. Un plan con alguna conclusión validada ya no se puede cambiar; tampoco se altera el cumplimiento ni los pagos de esa inscripción concluida.
7. Alumno → panel → **Tus cursos y pagos**: ver cumplidas, pendientes, porcentaje, detalle de actividades y requisitos. Pulsar **Solicitar constancia** cuando los cumpla.
8. Admin → **Constancias** → **Autorizar y generar PDF** (o rechazar). El alumno podrá descargar el documento autorizado desde su panel.

El plan es común para todas las inscripciones del mismo curso, no por generación/grupo. Para un nuevo plan después de haber validado conclusiones, crear otro curso. Esta versión no incluye evaluaciones con calificaciones, ponderaciones distintas, corrección de conclusiones emitidas ni revocación de PDFs. Una solicitud rechazada conserva su estado y se muestra un aviso para contactar a administración; no existe reenvío automático.

## Datos y compatibilidad

Migración: `backend/database/migrations/004_course_progress.sql`.

- Agrega `cursos.porcentaje_minimo` y `plan_publicado`.
- Agrega `inscripciones.concluida_por` y `concluida_at`.
- Crea `curso_actividades` y `actividad_cumplimientos`, con claves foráneas e índices.
- Es transaccional, aditiva y repetible. No elimina ni reinicia inscripciones, pagos o constancias. Retirar una actividad del plan es baja lógica.
- El inicio del backend ejecuta la migración después de preparar el esquema base. Una falla de migración impide arrancar el servidor.
- No transforma inscripciones antiguas `completada` en conclusiones verificadas: deben regularizar plan, pagos y cumplimiento antes de pedir documentos nuevos.
- Una inscripción histórica sin conclusión nueva ni constancia autorizada admite regularizar sus pagos. Los documentos históricos autorizados siguen disponibles para su dueño y administradores, aunque no tengan seguimiento nuevo.

Los cambios de plan, pago, cumplimiento, conclusión y constancia comparten bloqueos transaccionales en orden curso → inscripción. Esto evita autorizar con un saldo o un plan que cambia al mismo tiempo y evita solicitudes duplicadas concurrentes.

## Permisos y API

Todas las rutas llevan el prefijo `/api`. Un token de alumno no sirve como token administrativo. Se comprueba que la cuenta siga activa; un error de base de datos no se presenta como contraseña/token incorrecto.

| Operación | Ruta | Permiso |
| --- | --- | --- |
| Catálogo para seguimiento, incluidos inactivos | `GET /seguimiento/cursos` | Admin |
| Plan y alumnos de un curso | `GET /seguimiento/cursos/:id` | Admin |
| Regla por curso | `PATCH /seguimiento/cursos/:id/regla` | Admin |
| Crear actividad | `POST /seguimiento/cursos/:id/actividades` | Admin |
| Editar / retirar actividad | `PUT /seguimiento/actividades/:id`, `DELETE /seguimiento/actividades/:id` | Admin |
| Publicar / reabrir plan | `POST /seguimiento/cursos/:id/publicar`, `POST /seguimiento/cursos/:id/reabrir` | Admin |
| Avance de una inscripción | `GET /seguimiento/inscripciones/:id` | Admin |
| Registrar cumplimiento | `PUT /seguimiento/inscripciones/:id/actividades/:actividad` | Admin |
| Validar conclusión | `POST /seguimiento/inscripciones/:id/concluir` | Admin |
| Avance propio | `GET /seguimiento/mio/:id` | Alumno propietario |
| Solicitar / descargar constancia propia | `POST /constancias/mia`, `GET /constancias/mia/:id/descargar` | Alumno propietario |
| Listar, autorizar, rechazar o descargar constancias | Resto de `/constancias` | Admin |

Las rutas genéricas de usuarios, inscripciones y pagos también requieren administrador; las rutas `/mio`, `/mia`, `/mias` limitan los datos al propietario. IDs inválidos se rechazan antes de enviarlos a PostgreSQL. No basta cambiar el estado de una inscripción por una ruta genérica para concluirla.

### Documentos privados

Los nuevos archivos en Cloudinary se suben como `raw/authenticated`, con identificador aleatorio. La API valida permisos, genera una URL firmada por 60 segundos y transmite el archivo sin entregar esa firma al navegador. La descarga rechaza otros hosts, rutas locales fuera de la carpeta de documentos, respuestas remotas demasiado grandes y falsos PDFs. Referencia: [control de acceso de Cloudinary](https://cloudinary.com/documentation/control_access_to_media).

**Importante:** los archivos subidos anteriormente como públicos no se privatizan solos. Conservar sus enlaces mantiene compatibilidad, pero quien ya conozca una URL pública podría usarla fuera de la API. Migrarlos a almacenamiento autenticado e invalidar sus URLs antiguas requiere revisión y autorización explícita antes de actuar sobre producción.

## Pruebas locales

Desde `yesems-sistema/backend`, con dependencias instaladas:

```powershell
npm test
npm run test:integration
```

`npm test` ejecuta unitarias sin conectarse a la base definida en `.env`; las suites de integración se omiten salvo que el ejecutor aislado las habilite.

`test:integration` necesita los binarios de PostgreSQL. En Windows busca `C:\Program Files\PostgreSQL\18\bin`; puede indicarse otra carpeta mediante `PG_BIN`. Crea un clúster temporal que sólo escucha en loopback, usa un puerto libre, cuentas ficticias y un secreto aleatorio de prueba. Deshabilita Cloudinary y el administrador inicial del entorno para esta ejecución. Las cargas de comprobantes y los PDFs se escriben en el temporal, no en `backend/uploads`. Al terminar apaga el clúster y elimina únicamente el temporal validado.

La prueba de navegador necesita Microsoft Edge y Node con WebSocket global (probado con Node 24). Intercepta las peticiones de la interfaz hacia la API de pruebas local; no utiliza la API publicada en Render. Las pruebas del proveedor Cloudinary son unitarias con SDK/red simulados, no una subida real.

## Antes de desplegar en Render (con aprobación)

1. Revisar los cambios y los resultados; respaldar PostgreSQL y conservar los PDFs/comprobantes históricos antes de una migración de producción.
2. Confirmar `DATABASE_URL` del **backend**, `JWT_SECRET`, `NODE_ENV=production` y las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Nunca poner claves en HTML/JS público, Git o capturas.
3. No activar variables `TEST_*` ni `YES_EMS_ISOLATED_TEST` en producción. El almacenamiento local de una instancia sin disco persistente no garantiza conservación tras redeploy; configurar Cloudinary para nuevos archivos y planificar la transferencia de los históricos locales.
4. Publicar backend y frontend compatibles tras la aprobación; revisar en logs que la migración 004 termina y que `/api/health` responde. Verificar que la URL API del frontend corresponda al backend correcto.
5. La administración debe definir el mínimo y el plan real de cada curso. No hay actividades ni asistencias inventadas automáticamente.
6. En un entorno de pruebas de Render, con datos ficticios, verificar upload y descarga de un nuevo PDF autenticado en Cloudinary, que su URL sin firma no abra en incógnito y que el archivo siga disponible tras redeploy. Este paso externo no está cubierto por mocks locales.
7. Probar navegador móvil/escritorio con dos cuentas de alumno y una de admin, incluyendo un alumno sin pago, otro que no alcanza el mínimo y descarga de un documento histórico. No modificar datos reales para probar.
