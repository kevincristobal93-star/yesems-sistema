# Respaldos y recuperación

## Alcance real

La herramienta crea copias completas de PostgreSQL con `pg_dump`, cifradas con AES-256-GCM, y puede verificar su integridad y restaurarlas en una base vacía de prueba. No existe una restauración pública desde el navegador. No guarda credenciales en Git ni registra URLs de conexión.

**No es todavía un respaldo automático de Render.** Para activarlo se necesita la conexión autorizada, una clave de cifrado privada y una ubicación duradera fuera de Render. El disco efímero de un servicio gratuito no es una ubicación de respaldo.

La copia contiene tablas, cuentas, inscripciones, pagos, asistencia y referencias a archivos. **No incluye los archivos binarios de Cloudinary ni los de `backend/uploads`.** Respalda esos archivos por separado en almacenamiento privado antes de considerar completa la recuperación del sistema. Tampoco incluye variables de entorno: deben conservarse en un gestor de secretos.

## Preparación

Instala las herramientas PostgreSQL de una versión compatible (pg_dump no puede ser más antiguo que el servidor). Desde la carpeta `backend`, configura estas variables mediante un gestor de secretos o una sesión privada. No pegues secretos en el chat ni los incluyas en el repositorio:

- `PG_BIN`: carpeta de `pg_dump` y `pg_restore`, si no están en PATH.
- `BACKUP_DATABASE_URL`: conexión autorizada de lectura al origen. Para servidores remotos utiliza TLS y, preferentemente, `sslmode=verify-full` con certificados configurados.
- `BACKUP_DIRECTORY`: ruta absoluta a una carpeta privada fuera del repositorio y de cualquier carpeta publicada por un servidor web.
- `BACKUP_ENCRYPTION_KEY`: 32 bytes aleatorios expresados con 64 caracteres hexadecimales. Generarla en un gestor de contraseñas/secretos y conservarla por separado; sin ella no es posible recuperar la copia.

La herramienta no carga `.env` por sí misma. En Windows, limita con permisos NTFS quién puede acceder a la carpeta y a los temporales; los modos POSIX por sí solos no garantizan esos permisos.

## Crear y verificar

```text
npm run backup:create
npm run backup:verify -- "RUTA_PRIVADA/archivo.yesemsbak"
```

El nombre incluye fecha UTC y un identificador aleatorio. Las copias no se sobrescriben ni se borran automáticamente. Si falla el respaldo, se elimina solamente el archivo parcial creado por esa ejecución. La verificación comprueba el cifrado y que PostgreSQL reconozca el archivo; no sustituye una prueba de restauración.

## Recuperar sin sobrescribir producción

1. Crea una base PostgreSQL vacía llamada, por ejemplo, `yesems_restore_ensayo`. Nunca uses la base activa.
2. Configura `RESTORE_DATABASE_URL` para esa base y conserva la clave correspondiente al respaldo.
3. Ejecuta:

```text
npm run backup:restore -- "RUTA_PRIVADA/archivo.yesemsbak" yesems_restore_ensayo
```

El nombre de confirmación debe coincidir. Se rechazan destinos con objetos y nombres distintos de `yesems_restore_...`. No se usa `--clean`, no se elimina ninguna base y pg_restore trabaja en una transacción. La copia se autentica antes de conectar al destino; los temporales descifrados se eliminan al terminar.

4. Comprueba cantidades y muestras de cursos, alumnos, pagos y constancias. Comprueba también que sus archivos existan en el almacenamiento recuperado.
5. La herramienta incrementa versiones de sesión y elimina códigos de acceso restaurados. **Antes de poner una recuperación en producción, cambia JWT_SECRET por un secreto nuevo** para invalidar también tokens creados después de la fecha de la copia. Si falla la limpieza de sesiones, la operación se reporta como fallida: no pongas ese destino en producción.
6. El cambio de conexión de producción requiere aprobación y una ventana de mantenimiento; no está automatizado. Guarda la base anterior hasta validar todo.

## Automatización pendiente de configuración

Una vez elegido el almacenamiento privado: programa `backup:create` diariamente con un usuario autorizado, copia el archivo cifrado fuera del equipo, conserva la clave por separado y prueba recuperación periódicamente. Mantén varias generaciones y revisa errores/capacidad. No se ha creado una tarea programada ni se ha copiado producción durante esta implementación.

## Filtros

Administrador: búsqueda por alumno, curso, folio o referencia; curso, estado, fechas y método de pago donde corresponda. Las inscripciones consultan la lista completa autorizada, no solo las seis recientes. Alumno: búsqueda y filtros en sus propias inscripciones. Se filtran en el navegador los registros recibidos; para grandes volúmenes convendrá añadir paginación del servidor. Los filtros no amplían permisos ni publican datos personales.
