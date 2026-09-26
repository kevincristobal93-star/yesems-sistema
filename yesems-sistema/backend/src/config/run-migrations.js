const bcrypt = require('bcrypt');
const pool = require('./db');

async function runDatabaseMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.administradores (id_administrador integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, nombre varchar(100) NOT NULL, apellido varchar(100) NOT NULL, email varchar(150) NOT NULL UNIQUE, password_hash varchar(255) NOT NULL, activo boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public.categorias (id_categoria integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, nombre varchar(100) NOT NULL UNIQUE, descripcion text, activo boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public.usuarios (id_usuario integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, nombre varchar(100) NOT NULL, apellido varchar(100) NOT NULL, email varchar(150) NOT NULL UNIQUE, password_hash varchar(255), telefono varchar(20), fecha_nacimiento date, curp varchar(18), folio varchar(50) UNIQUE, rol varchar(20) NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'alumno', 'admin')), activo boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public.cursos (id_curso integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id_categoria integer NOT NULL REFERENCES public.categorias(id_categoria) ON UPDATE CASCADE ON DELETE RESTRICT, nombre varchar(150) NOT NULL, descripcion text, duracion_horas integer NOT NULL CHECK (duracion_horas > 0), precio numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (precio >= 0), cupo integer NOT NULL CHECK (cupo > 0), activo boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public.horarios (id_horario integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id_curso integer NOT NULL REFERENCES public.cursos(id_curso) ON UPDATE CASCADE ON DELETE CASCADE, dia_semana varchar(20), hora_inicio time, hora_fin time, fecha_inicio date, fecha_fin date, aula varchar(100), modalidad varchar(30) NOT NULL DEFAULT 'por_definir', enlace varchar(500), notas text, informacion_adicional varchar(250), CONSTRAINT chk_horario_horas CHECK (hora_inicio IS NULL OR hora_fin IS NULL OR hora_fin > hora_inicio), CONSTRAINT chk_horario_fechas CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio));
    CREATE TABLE IF NOT EXISTS public.inscripciones (id_inscripcion integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id_usuario integer NOT NULL REFERENCES public.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT, id_curso integer NOT NULL REFERENCES public.cursos(id_curso) ON UPDATE CASCADE ON DELETE RESTRICT, id_horario integer REFERENCES public.horarios(id_horario) ON UPDATE CASCADE ON DELETE SET NULL, fecha_inscripcion timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, estado varchar(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')), monto_total numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (monto_total >= 0));
    CREATE TABLE IF NOT EXISTS public.pagos (id_pago integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id_inscripcion integer NOT NULL REFERENCES public.inscripciones(id_inscripcion) ON UPDATE CASCADE ON DELETE RESTRICT, monto numeric(10,2) NOT NULL CHECK (monto > 0), metodo_pago varchar(30) NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia', 'tarjeta', 'otro')), fecha_pago timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, estado varchar(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completado', 'cancelado')), referencia varchar(100), comprobante_url varchar(255));
    CREATE TABLE IF NOT EXISTS public.constancias (id_constancia integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id_inscripcion integer NOT NULL UNIQUE REFERENCES public.inscripciones(id_inscripcion) ON UPDATE CASCADE ON DELETE RESTRICT, folio varchar(100) NOT NULL UNIQUE, fecha_emision date NOT NULL DEFAULT CURRENT_DATE, archivo_url varchar(255), estado varchar(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'autorizada', 'rechazada')));
    CREATE TABLE IF NOT EXISTS public.modalidades (id_modalidad integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, nombre varchar(100) NOT NULL UNIQUE, descripcion text, activo boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS comprobante_url varchar(255);
    ALTER TABLE public.horarios ADD COLUMN IF NOT EXISTS modalidad varchar(30) NOT NULL DEFAULT 'por_definir';
    ALTER TABLE public.horarios ADD COLUMN IF NOT EXISTS enlace varchar(500);
    ALTER TABLE public.horarios ADD COLUMN IF NOT EXISTS notas text;
    ALTER TABLE public.horarios ADD COLUMN IF NOT EXISTS informacion_adicional varchar(250);
    ALTER TABLE public.horarios ALTER COLUMN dia_semana DROP NOT NULL;
    ALTER TABLE public.horarios ALTER COLUMN hora_inicio DROP NOT NULL;
    ALTER TABLE public.horarios ALTER COLUMN hora_fin DROP NOT NULL;
    ALTER TABLE public.horarios DROP CONSTRAINT IF EXISTS chk_horario_horas;
    ALTER TABLE public.horarios ADD CONSTRAINT chk_horario_horas CHECK (hora_inicio IS NULL OR hora_fin IS NULL OR hora_fin > hora_inicio);
    UPDATE public.horarios SET informacion_adicional = COALESCE(informacion_adicional, aula) WHERE aula IS NOT NULL;
  `);
}

async function seedCatalog() {
  await pool.query(`
    INSERT INTO public.categorias (nombre, descripcion)
    VALUES ('Tecnología', 'Cursos relacionados con tecnología, programación y sistemas.')
    ON CONFLICT (nombre) DO NOTHING;
    INSERT INTO public.cursos (id_categoria, nombre, descripcion, duracion_horas, precio, cupo, activo)
    SELECT id_categoria, 'Introducción a Excel', 'Curso básico de hojas de cálculo', 20, 500.00, 25, true
    FROM public.categorias
    WHERE nombre = 'Tecnología'
      AND NOT EXISTS (SELECT 1 FROM public.cursos WHERE nombre = 'Introducción a Excel');
  `);
}

async function bootstrapInitialAdmin() {
  const { INITIAL_ADMIN_NAME, INITIAL_ADMIN_LASTNAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD } = process.env;
  if (![INITIAL_ADMIN_NAME, INITIAL_ADMIN_LASTNAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD].every(Boolean)) return;

  const total = (await pool.query('SELECT COUNT(*)::int AS total FROM administradores WHERE activo = true')).rows[0].total;
  if (total > 0) return;
  const passwordHash = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 10);
  await pool.query(
    'INSERT INTO administradores (nombre, apellido, email, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
    [INITIAL_ADMIN_NAME, INITIAL_ADMIN_LASTNAME, INITIAL_ADMIN_EMAIL.trim().toLowerCase(), passwordHash]
  );
  console.log('Administrador inicial preparado. Elimina INITIAL_ADMIN_PASSWORD de Render después del primer despliegue.');
}

async function runStartupMigrations() {
  await runDatabaseMigrations();
  await seedCatalog();
  await bootstrapInitialAdmin();
}

module.exports = { runStartupMigrations };
