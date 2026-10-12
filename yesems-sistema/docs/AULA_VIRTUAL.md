# Aula virtual · primera etapa

Implementación local de la estructura **curso → módulos → PDF**. No se ha publicado esta entrega en Render.

## Administrador

En el menú de administración, abrir **Aula virtual · Módulos** y seleccionar un curso existente. Se permite crear módulos (siempre como borrador), editar título y descripción, cambiar su orden con Subir/Bajar y publicar u ocultar. En cada módulo se pueden subir hasta 20 PDF, de máximo 5 MB, con un nombre visible para el alumno. Los cursos desactivados solo permiten consulta.

Un PDF se conserva como material del módulo mientras este sea borrador. Al publicar el módulo se habilita para alumnos autorizados; al ocultarlo, deja de mostrarse y no puede descargarse, pero no se borra. **Retirar PDF** realiza baja lógica (`activo=false`), por lo que conserva la referencia administrativa y no elimina el historial de contenido. Al reemplazar un PDF, la versión anterior se conserva y el administrador puede consultar versiones actuales, reemplazadas y retiradas en el historial del curso.

La revisión del aula y el bloqueo transaccional del curso evitan sobrescribir cambios concurrentes. Si otra sesión modificó el aula, se rechaza la escritura: copiar los textos pendientes, pulsar Actualizar aula y revisar antes de guardar de nuevo.

## Alumno

Desde Mi panel, el enlace **Entrar al aula** lleva a la inscripción correspondiente. El servidor verifica en cada petición:

- Cuenta activa, sesión vigente e inscripción propia.
- Inscripción no cancelada, curso activo y no provisional.
- Suma de pagos aprobados (`completado`) igual o superior al importe de la inscripción.
- Solo entrega módulos publicados y sus PDF activos: nunca títulos, descripciones ni materiales de borradores.

Una inscripción gratuita cumple el requisito económico sin pagos. Una inscripción completada conserva acceso mientras el curso siga activo. Un pago pendiente o parcial no habilita el aula, aunque la inscripción figure como confirmada. Consultar módulos no registra asistencia, progreso ni conclusión y no autoriza constancias.

## API y datos

Migraciones aditivas e idempotentes `010_classroom_modules.sql`, `011_classroom_documents.sql` y `012_classroom_document_versions.sql`, ejecutadas al iniciar backend: `cursos.aula_revision`, `aula_modulos` y `aula_documentos`, incluyendo la relación de versiones. Los módulos del aula son independientes de `curso_actividades`, que mantiene el seguimiento académico existente.

API administrativa bajo `/api/aula/admin/cursos`; consulta del alumno en `/api/aula/mia/:inscripcion`. Las mutaciones requieren revisión válida; el servidor obtiene el administrador de la sesión, no del formulario. Respuestas sin caché. Título máximo 150 caracteres, descripción 2000 y máximo 100 módulos por curso.

Los archivos no se exponen con URL pública permanente. En producción se cargan como recursos autenticados de Cloudinary y la API comprueba el permiso antes de servirlos. En pruebas locales aisladas se almacenan temporalmente fuera del repositorio. El servidor valida extensión, tipo, cabecera y final PDF antes de guardar; la consulta se entrega con `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`.

## Verificación reproducible

Desde `backend`:

```text
npm test -- --testPathIgnorePatterns=integration.test.js
node scripts/test-integration.js --suite=aula.integration.test.js
```

El segundo comando crea una base PostgreSQL temporal y usa Edge local para comprobar la interfaz. No utiliza la base de Render ni envía correos o archivos a servicios externos. Requiere los binarios locales de PostgreSQL y Microsoft Edge.

### Estado de comprobación local

- Suite unitaria ejecutada: 160 pruebas aprobadas y 3 omitidas.
- Comprobación de sintaxis JavaScript y `git diff --check`: sin errores.
- Con autorización del usuario se corrigieron las dos líneas desordenadas en `004_course_progress.sql`, dentro de `actividad_cumplimientos`, que impedían arrancar la base.
- Suite del aula: 6 pruebas aprobadas, incluyendo permisos, saldo aprobado, publicación, concurrencia, migración repetible, carga PDF, reemplazo con historial, descarga autorizada, ocultamiento y baja lógica. En Edge se comprobó creación, edición, publicación, orden, texto seguro, vista móvil de 390 px y limpieza del contenido al caducar la sesión.
- Regresión del recorrido previo: 21 pruebas de `progreso.integration.test.js` aprobadas.
- Ambos procesos terminaron con código 0 y eliminaron sus bases temporales. Jest mostró un aviso de cierre tardío en la suite del aula, sin impedir la finalización. No se consultó ni modificó producción.

## Siguiente etapa

Validar la carga y consulta de un PDF privado con las credenciales de Cloudinary del entorno autorizado y completar el recorrido del alumno en Render. El reemplazo conserva la versión anterior en la base y en el almacenamiento; la administración puede ver el historial sin exponer direcciones privadas en la respuesta. La posible medición de consultas sería independiente del progreso académico.
# Documentos admitidos en el aula

Solo el administrador puede subir o reemplazar materiales. Se admiten PDF, DOC/DOCX,
XLS/XLSX, PPT/PPTX, ODT/ODS/ODP, RTF, TXT, CSV, Markdown, EPUB, ZIP, JPG/JPEG, PNG y WebP,
con un máximo de 5 MB por archivo y 20 documentos activos por módulo.
El contenido tiene una validación básica de formato y tamaño, no un análisis antivirus.
Los archivos ZIP se almacenan sin extraerlos. Los formatos ejecutables no están permitidos.

Los PDF mantienen la vista previa; otros formatos se descargan para abrirlos con una
aplicación compatible. La extensión se conserva en almacenamiento y descarga, y se
deriva de la URL privada al listar materiales, sin exponer esa URL al alumno.
Los PDF anteriores, permisos, publicación de módulos e historial siguen funcionando
sin migraciones de base de datos. Los documentos de texto deben estar codificados en UTF-8.
