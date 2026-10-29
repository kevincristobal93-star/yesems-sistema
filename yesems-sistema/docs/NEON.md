# Conectar una base nueva en Neon

Este procedimiento empieza sin datos anteriores. No recupera alumnos, pagos,
inscripciones ni referencias a archivos de la base de Render. Cloudinary y las
credenciales de Google/correo no necesitan reemplazarse por cambiar de base.

1. Crear un proyecto PostgreSQL en Neon, preferentemente cerca del backend.
2. Abrir Connect y copiar la conexión **directa** (desactivar Connection pooling).
   El servidor ejecuta migraciones al arrancar; usar conexión directa evita
   restricciones de sesión del pooler. Mantener los parámetros TLS de Neon.
3. En el servicio backend de Render, Environment, sustituir DATABASE_URL por
   esa conexión. No pegarla en el chat, repositorio ni capturas.
4. Configurar NODE_ENV=production. Conservar las variables de Google, correo,
   Cloudinary y un JWT_SECRET seguro. DB_HOST/DB_USER/DB_NAME no se usan cuando
   DATABASE_URL está presente.
5. Para la base vacía, configurar INITIAL_ADMIN_NAME, INITIAL_ADMIN_LASTNAME,
   INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD con los datos del administrador.
6. Después de publicar el código y guardar las variables, esperar un arranque
   correcto. Las migraciones crean las tablas y pueden sembrar el catálogo
   inicial: no significa que se hayan recuperado los datos anteriores.
7. Comprobar ingreso del administrador, catálogo, registro, envío de códigos,
   inscripción y lectura/subida de materiales con datos controlados.
8. Eliminar INITIAL_ADMIN_PASSWORD del entorno después del primer arranque
   exitoso y comprobar que el administrador sigue pudiendo entrar.
9. Configurar respaldos por separado: BACKUP_DATABASE_URL debe ser la conexión
   directa de Neon; BACKUP_DIRECTORY una carpeta privada fuera del repositorio
   y BACKUP_ENCRYPTION_KEY una clave privada custodiada aparte. No hay respaldos
   automáticos habilitados por este cambio.

No borrar el backend, sus variables ni la base anterior como parte de este
procedimiento. No cambiar DNS ni las URLs públicas de la aplicación.

## Comportamiento de conexión

El pool usa hasta 5 conexiones, libera las inactivas a los 30 segundos y espera
hasta 10 segundos para conectar. Un error en un cliente inactivo se registra
sin credenciales y no termina el servidor. No se reintentan automáticamente
transacciones: hacerlo podría duplicar operaciones. Si las migraciones fallan,
el arranque sigue terminando con error para no atender con tablas incompletas.

Se conserva la configuración SSL existente. Los parámetros SSL de la URL
pueden prevalecer sobre el objeto ssl del driver; no quitar TLS de la URL.
