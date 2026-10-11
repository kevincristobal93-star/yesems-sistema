# Evidencias — semana del 05 al 09 de octubre de 2026

Las capturas se generaron con el frontend real y una API local con datos ficticios. No se conectaron a Render, Gmail, Cloudinary ni PostgreSQL de producción y no contienen contraseñas, tokens ni información real de alumnos.

| Archivo | Evidencia |
| --- | --- |
| `01-busqueda-y-filtros.png` | Búsqueda de inscripciones por alumno y filtros del panel administrativo. El procedimiento de respaldo y recuperación se documenta en `../RESPALDOS_RECUPERACION.md`; no se afirma una copia real de producción. |
| `02-gmail-api-diagnostico.png` | Recuperación de contraseña y mensaje de diagnóstico seguro ante una configuración de correo no disponible en la demostración. No demuestra la recepción de un correo real. |
| `03-aula-virtual-modulos-pdf.png` | Administrador organizando módulos y materiales PDF de ejemplo. La imagen ilustra la interfaz; no acredita una carga a Cloudinary. |

## Imágenes para el reporte

3. Configuración y diagnóstico de Gmail API: [abrir imagen](02-gmail-api-diagnostico.png).
4. Aula virtual con módulos y PDF: [abrir imagen](03-aula-virtual-modulos-pdf.png).

Para regenerarlas desde `backend`, ejecutar `node scripts/capture-week-05-09-evidence.js`. Requiere Microsoft Edge local y bloquea comunicaciones externas.
