# Cierre de la primera versión de YES EMS

Revisión del 16 de octubre de 2026 (hora de Ciudad de México).

## Publicación comprobada

- Sitio principal: https://yesems-web.onrender.com
- API utilizada por el frontend: https://yesems-sistema-1.onrender.com
- Commit publicado: `25c95aa`.
- Render confirmó ambos despliegues activos. La consulta HTTP confirmó el nuevo formulario directo de correo y contraseña y salud de API con estado 200.
- Los servicios `yesems-fronted` y `yesems-sistema` siguen activos. No se han retirado: falta comprobar dominios, enlaces externos y uso antes de decidir su baja.

## Pendientes que requieren datos del titular

1. Correo: el titular confirmó el 16 de octubre que ya recibe los códigos. Falta completar el recorrido de recuperación real. No registrar secretos en este archivo.
2. Oferta: confirmar precio y duración. Por decisión del titular no se utilizan cupos: conservar los valores históricos sin bloquear inscripciones ni mostrarlos como disponibilidad. No reactivar límites sin una nueva solicitud.
3. Materiales: seleccionar el primer curso y proporcionar contenido definitivo. Hay un módulo y cero documentos activos; no añadir materiales ficticios a producción.
4. Respaldos: el titular indica que no tiene almacenamiento elegido. Elegir almacenamiento privado duradero, configurar credenciales y clave fuera del repositorio, y definir responsable. No se han contratado servicios ni programado copias. Ver `RESPALDOS_RECUPERACION.md`. La base de datos y los archivos de Cloudinary requieren copias separadas.

## Prueba de aceptación en producción

Validación local del 16 de octubre: 66 pruebas de integración aprobadas en cinco suites (acceso, seguimiento/pagos/constancias, aula, panel y respaldo/restauración). También pasaron las 187 pruebas generales previas y las 22 pruebas del catálogo tras agregar el caso sin cupo. Se corrigió el aislamiento de la prueba de respaldo para usar una base origen propia dentro del clúster temporal. Esto acredita el mecanismo local, no un respaldo de producción ni la entrega real de proveedores.

Usar una cuenta de prueba autorizada y contenido identificado; no modificar cuentas o pagos reales para simular resultados.

| Paso | Evidencia de aceptación |
| --- | --- |
| Crear cuenta | Código recibido, perfil completado y contraseña creada; ninguna sesión completa antes de terminar |
| Iniciar sesión | Contraseña y Google permiten entrar a la misma cuenta, sin duplicarla |
| Recuperar contraseña | Código recibido, nueva contraseña válida y sesión anterior rechazada |
| Inscribirse | Curso y precio correctos; inscripción pendiente claramente identificada |
| Subir comprobante | Archivo guardado, fin del indicador de carga y estado en revisión |
| Revisar pago en admin | Aprobación o rechazo visibles en alumno; no duplicar saldo al repetir una operación |
| Publicar módulo | Material visible en alumno autorizado; lectura y descarga correctas tras recargar |
| Comprobar permisos | Un alumno no accede a material privado de otro curso sin autorización |
| Seguimiento y constancia | Marcar lectura no sustituye asistencia; constancia respeta los requisitos de pago y conclusión |
| Móvil y escritorio | Formularios, menús, lectura y acciones principales utilizables sin desbordamiento |
| Recuperación operativa | Copia cifrada fuera del servidor y restauración en base vacía, incluyendo recuperación de archivos |

Las pruebas locales usan correo y Google simulados. No sustituyen la entrega de correo, OAuth ni almacenamiento reales en producción. No considerar concluido el sistema hasta cerrar los pendientes y registrar el resultado de este recorrido.
