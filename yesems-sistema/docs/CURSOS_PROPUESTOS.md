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
- Catálogo público y del alumno: iconos SVG propios por curso (celular, camiseta, láser e impresora), duración/cupo sugeridos y botón **Ver más información**. Abre un diálogo con descripción íntegra, plus, duración, cupo, precio y advertencia de propuesta; ya no redirige a WhatsApp.
- Las tarjetas se elevan y su cabecera cambia a amarillo al pasar el cursor. Se respeta `prefers-reduced-motion`. El detalle funciona con teclado, cierra con Escape y devuelve el foco al botón.
- Migración `008_retire_excel.sql`: desactiva **Introducción a Excel** sin eliminar su registro, inscripciones, pagos o constancias. El arranque deja de sembrar ese curso de demostración. En bases nuevas no se crea.
- Ambas rutas de inscripción rechazan propuestas con HTTP 409 antes de crear inscripciones. El precio provisional no permite iniciar pagos.
- Administración → Cursos → Editar: revisar nombre, descripción, precio, horas y cupo. Configurar disponibilidad. Desmarcar **Oferta provisional** y confirmar para abrir inscripciones. Un precio final 0 significa curso gratuito; el formulario lo advierte.
- Editar desde un cliente antiguo sin enviar el indicador conserva su valor; un alumno no puede cambiarlo.

## Revisión antes de Render

1. Validar estos datos con YES EMS, especialmente precio, requisitos, equipo, modalidad y fechas.
2. Publicar backend y frontend juntos; comprobar que las migraciones 007 y 008 finalicen al arrancar, sin reiniciar la base.
3. Comprobar las cuatro tarjetas en ambos catálogos y que no anuncien $0 ni permitan inscripción antes de validación.
4. Comprobar el detalle y los iconos de los cuatro cursos, y que Excel no figure en el catálogo. Su historial debe seguir disponible para inscripciones existentes.

Las pruebas deben usar el runner PostgreSQL temporal (`npm run test:integration`), nunca datos de producción. La publicación no forma parte de esta entrega local.

## Verificación ejecutada — 2 de octubre de 2026

- `npm test -- --silent`: 122 pruebas aprobadas; 46 de integración omitidas por diseño fuera del entorno aislado.
- `npm run test:integration -- --suite=progreso.integration.test.js`: 18 aprobadas, incluyendo repetición de migraciones, conservación de ediciones/bajas, historial de Excel, bloqueo de ambas rutas, permisos y apertura tras validación administrativa. Incluye el recorrido de progreso y constancia/PDF existente.
- `node scripts/test-course-catalog.js --screenshots`: navegador local aprobado; iconos, hover real (elevación y color amarillo), contenido completo, cierre con Escape/botón, restitución de foco, búsqueda, ancho móvil y movimiento reducido. API ficticia; conexiones externas bloqueadas. Las capturas se guardan en un directorio temporal nuevo, cuya ruta imprime el script.
- `git diff --check`: sin errores de espacios.

La migración 007 y la primera versión del catálogo ya se publicaron en el commit 6754c16. Esta revisión (migración 008, iconos, detalle y animación) se verificó localmente, todavía sin publicar. No se enviaron mensajes de WhatsApp.
