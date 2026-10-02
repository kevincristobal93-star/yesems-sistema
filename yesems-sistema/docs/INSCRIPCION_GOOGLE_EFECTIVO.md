# Google → inscripción → pago en efectivo

## Recorrido

1. El servidor verifica el token de Google, su audiencia y el reto de un solo
   uso. Una cuenta nueva no necesita teléfono ni CURP para entrar. Solo se toman
   nombres del token verificado; no se asume que sean el nombre legal definitivo.
2. Se abre el panel, conservando el curso seleccionado en la URL. El panel
   consulta las inscripciones reales y muestra «Completa tu inscripción».
3. El alumno puede continuar o cerrar con «Completar después». Queda un acceso
   permanente en el panel. Si existe una inscripción, continúa su pago; no crea
   otra. Si no eligió curso, pasa al catálogo.
4. El formulario de inscripción recupera datos guardados y pide nombre,
   apellidos, teléfono, fecha de nacimiento y CURP. La confirmación guarda los
   datos y crea la inscripción en una transacción. Los borradores sin confirmar
   no se guardan en el navegador.
5. El pago muestra las instrucciones para acudir a YES EMS, pagar en efectivo,
   recibir el comprobante y subir su escaneo o fotografía. PDF/JPG/PNG, hasta
   5 MB. Se conservan las otras opciones de pago existentes.
6. El servidor exige comprobante también en efectivo. El pago se crea pendiente,
   no confirmado. El administrador abre el archivo y coteja el monto con el
   registro de cobro antes de aprobar. La comprobación del efectivo es humana.
7. Un pago rechazado permite reenviar otro comprobante. La comunicación del
   motivo sigue siendo manual; no se añadió mensajería ni un campo de motivo.

## Compatibilidad y seguridad

- No se eliminan ni migran datos: el esquema existente admite este flujo.
- Cuentas de correo existentes no se vinculan a Google automáticamente.
- Inscripciones canceladas no se reanudan como activas. Un pago completo o en
  revisión no genera una solicitud de pago duplicada.
- Los recibos antiguos sin archivo se conservan: la administración debe revisar
  esos casos y cancelar un pago pendiente si necesita una nueva presentación.
- Pago validado no significa curso concluido ni habilita por sí solo constancias.
- No se cambia la contraseña de Google ni se modifica la recuperación de YES EMS.

## Verificación y despliegue

- `npm test -- --silent`: pruebas unitarias.
- `node scripts/test-access-layout.js`: Edge con respuestas locales simuladas;
  panel, posponer, retomar, precarga y comprobante obligatorio.
- `npm run test:integration`: PostgreSQL temporal, proveedores simulados;
  Google sin datos adicionales, rechazo de efectivo sin archivo, duplicados y
  recorrido pago/avance/conclusión/constancia/PDF.
- Revisar en Render Google con una cuenta de prueba autorizada, y persistencia
  del comprobante con Cloudinary configurado. No basta la prueba simulada para
  confirmar configuración de Google o almacenamiento externo.
- No hay cambios de variables ni migraciones nuevas. Desplegar frontend y backend
  juntos cuando se autorice la publicación.
