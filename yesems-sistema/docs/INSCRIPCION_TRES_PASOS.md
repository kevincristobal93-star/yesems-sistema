# Inscripción y ficha del alumno

- Solo se admiten nuevos pagos en efectivo o transferencia, tanto en la interfaz como en la API. Los pagos históricos de otros métodos se conservan.
- El comprobante es obligatorio en ambos casos. Se registra pendiente y solo administración puede aprobarlo tras cotejar la recepción del dinero.
- Datos personales → revisión de ficha y curso → pago. Guardar la ficha no crea una inscripción ni reserva un lugar.
- «Guardar y continuar después» conserva los datos válidos en la cuenta; al regresar se recuperan del servidor. CURP y fecha no se guardan en localStorage desde estas pantallas.
- En «Mi cuenta» se pueden corregir nombre, apellidos, teléfono, fecha de nacimiento y CURP. Correo, rol y folio no se modifican desde esa ficha. Las constancias ya emitidas no se regeneran.
- Una cuenta sin inscripción muestra el siguiente paso de completar datos. Una inscripción muestra pago pendiente, pago en revisión o inscripción confirmada según los importes efectivamente aprobados. Un abono parcial no confirma la inscripción.
- Transferencias: consultar con YES EMS la cuenta oficial y referencia antes de enviar dinero. No se inventaron datos bancarios.

Pruebas locales: `node scripts/test-enrollment-ux.js` usa API ficticia y bloquea conexiones externas. La suite `progreso.integration.test.js` verifica permisos, perfil, pagos y constancias con PostgreSQL temporal.
