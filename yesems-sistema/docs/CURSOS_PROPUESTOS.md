# Propuestas de cursos

Datos sugeridos para revisión institucional; no constituyen fechas, tarifas ni modalidades confirmadas.

| Curso | Horas sugeridas | Cupo sugerido | Plus propuesto |
| --- | --- | --- | --- |
| Reparación de celulares | 32 | 12 | Diagnóstico documentado y presupuesto de reparación |
| Sublimación y diseño (crea tu marca) | 24 | 12 | Identidad visual y catálogo con cálculo de costos |
| Corte y grabado láser | 24 | 10 | Producto personalizado y cotización |
| Impresión 3D | 32 | 10 | Prototipo funcional y costo de producción |

Las duraciones corresponden a propuestas introductorias, no a una certificación de dominio profesional. No se prometen herramientas, consumibles, licencias o equipos incluidos.

## Funcionamiento

- Migración `007_proposed_courses.sql`: agrega `oferta_provisional` y una clave de catálogo estable. Inserta solo propuestas que no existan; no reemplaza datos, ediciones o bajas. Se ejecuta durante el arranque, como las migraciones previas.
- Cursos existentes conservan `oferta_provisional=false`. Las nuevas propuestas usan precio interno 0 por compatibilidad con el esquema, pero muestran **Costo por confirmar**, nunca una oferta gratuita.
- Catálogo público y del alumno: duración/cupo sugeridos, advertencia de propuesta y enlace de información al WhatsApp ya usado por el sitio.
- Ambas rutas de inscripción rechazan propuestas con HTTP 409 antes de crear inscripciones. El precio provisional no permite iniciar pagos.
- Administración → Cursos → Editar: revisar nombre, descripción, precio, horas y cupo. Configurar disponibilidad. Desmarcar **Oferta provisional** y confirmar para abrir inscripciones. Un precio final 0 significa curso gratuito; el formulario lo advierte.
- Editar desde un cliente antiguo sin enviar el indicador conserva su valor; un alumno no puede cambiarlo.

## Revisión antes de Render

1. Validar estos datos con YES EMS, especialmente precio, requisitos, equipo, modalidad y fechas.
2. Publicar backend y frontend juntos; comprobar que la migración 007 finalice al arrancar, sin reiniciar la base.
3. Comprobar las cuatro tarjetas en ambos catálogos y que no anuncien $0 ni permitan inscripción antes de validación.
4. Verificar que el contacto de WhatsApp vigente sea el de YES EMS.

Las pruebas deben usar el runner PostgreSQL temporal (`npm run test:integration`), nunca datos de producción. La publicación no forma parte de esta entrega local.

## Verificación ejecutada — 2 de octubre de 2026

- `npm test -- --silent`: 116 pruebas aprobadas; 45 de integración omitidas por diseño fuera del entorno aislado.
- `npm run test:integration -- --suite=progreso.integration.test.js`: 17 aprobadas, incluyendo repetición de la migración, conservación de ediciones/bajas, bloqueo de ambas rutas, permisos y apertura tras validación administrativa. Incluye el recorrido de progreso y constancia/PDF existente.
- `node scripts/test-course-catalog.js`: navegador local aprobado; catálogo público/alumno, búsqueda, ancho móvil, enlace directo bloqueado para propuestas y disponible para curso validado. API ficticia; conexiones externas bloqueadas.
- `git diff --check`: sin errores de espacios.

No se aplicó esta migración a producción ni se enviaron mensajes de WhatsApp.
