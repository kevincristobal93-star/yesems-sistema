# Evidencias de validación — 30 de septiembre de 2026

## Resultado

El módulo de asistencia y progreso fue validado localmente con PostgreSQL temporal y datos ficticios. La validación real de Cloudinary está pendiente de configurar las credenciales locales; no se presenta como aprobada.

| Validación ejecutada | Resultado | Evidencia |
| --- | --- | --- |
| Pruebas unitarias | 85 aprobadas, 0 fallidas; 3 pruebas opcionales de navegador de reportes omitidas en esta ejecución | [Resultados Jest](unitarias.json) |
| Integración API y paneles con PostgreSQL aislado | 19 aprobadas, 0 fallidas (15 de API y 4 de navegador Edge) | [Resultados Jest](integracion.json) |
| Panel administrativo, escritorio y móvil | Plan, cumplimiento real y conclusión comprobados | [Escritorio](admin-avance-desktop.png) · [Móvil](admin-avance-mobile.png) |
| Panel del alumno, escritorio y móvil | Avance real y requisitos de constancia comprobados | [Escritorio](alumno-avance-desktop.png) · [Móvil](alumno-avance-mobile.png) |
| Almacenamiento real en Cloudinary | Pendiente: faltan variables locales | Script `backend/scripts/validar-cloudinary.js` preparado |

Las capturas proceden del navegador durante las pruebas, no son maquetas. Los cursos y alumnos utilizados son ficticios. No se modificaron datos de producción. El clúster temporal de PostgreSQL se detuvo y eliminó al terminar.

## Recorrido verificado

Se probó registro e inscripción, pago validado, registro de cumplimiento, cálculo de avance, conclusión administrativa, solicitud de constancia, autorización y descarga de un PDF real.

En la prueba de API, tres de cuatro actividades cumplidas producen 75 %. En la prueba de los paneles, una de dos actividades produce 50 % y permite concluir cuando el mínimo configurado del curso es 50 %, con pago completo y validación administrativa. Concluir no transforma artificialmente el avance en 100 %.

También se verificaron rechazos por pago parcial o pendiente, requisitos insuficientes, plan vacío, inscripción cancelada, fechas futuras, actividades de otro curso, tokens inválidos, cuentas desactivadas y acceso a datos de otro alumno. Se comprobaron solicitudes concurrentes, bloqueo de modificaciones después de concluir y conservación de inscripciones y constancias históricas mediante migraciones aditivas.

## Reproducir las pruebas

Desde `yesems-sistema/backend`, en PowerShell:

```powershell
node node_modules/jest/bin/jest.js --runInBand --testPathIgnorePatterns=integration.test.js --json --outputFile=../docs/evidencias/2026-09-30/unitarias.json
$env:TEST_BROWSER_ARTIFACTS_DIR = Join-Path (Get-Location) '../docs/evidencias/2026-09-30'
node scripts/test-integration.js --json --outputFile=../docs/evidencias/2026-09-30/integracion.json
```

La integración necesita los binarios locales de PostgreSQL y Microsoft Edge. El ejecutor prepara su propia base temporal, sin usar la base de producción.

## Cloudinary: pendiente de ejecutar

Configurar únicamente en `backend/.env` las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`, preferentemente de un entorno de pruebas. No subir este archivo ni compartir sus valores en capturas.

```powershell
# Comprobación local, sin subir archivos:
npm run test:cloudinary
# Prueba real, después de configurar las variables:
npm run test:cloudinary -- --run
```

La prueba real carga exclusivamente un PDF ficticio en una carpeta nueva de pruebas, verifica descarga autenticada e integridad, comprueba que el acceso sin firma esté bloqueado y prueba el servicio de descarga del backend. Finalmente intenta eliminar únicamente el recurso creado por esa ejecución. Guarda resultados JSON sin credenciales en la carpeta de evidencias de la fecha de ejecución. Si la limpieza falla, el resultado lo informa para revisión manual.

Las siete pruebas unitarias del identificador de limpieza forman parte de las 85 aprobadas; no sustituyen una carga real a Cloudinary.

## Publicación

Estos resultados corresponden al entorno local. Esta validación no realiza commits, publicación en GitHub ni despliegues en Render. Antes de publicar se deben revisar los cambios y completar la prueba real de Cloudinary; después, comprobar el recorrido en el entorno desplegado con una cuenta de prueba autorizada.
