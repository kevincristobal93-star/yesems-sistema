-- Aula virtual independiente del seguimiento; migración aditiva e idempotente.
BEGIN;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS aula_revision integer NOT NULL DEFAULT 0 CHECK (aula_revision >= 0);
CREATE TABLE IF NOT EXISTS public.aula_modulos (
  id_modulo integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_curso integer NOT NULL REFERENCES public.cursos(id_curso) ON DELETE RESTRICT,
  titulo varchar(150) NOT NULL CHECK (length(trim(titulo)) > 0),
  descripcion varchar(2000) NOT NULL DEFAULT '',
  orden integer NOT NULL CHECK (orden > 0),
  publicado boolean NOT NULL DEFAULT false,
  creado_por integer NOT NULL REFERENCES public.administradores(id_administrador) ON DELETE RESTRICT,
  actualizado_por integer NOT NULL REFERENCES public.administradores(id_administrador) ON DELETE RESTRICT,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aula_modulo_orden_unico UNIQUE (id_curso, orden) DEFERRABLE INITIALLY DEFERRED
);
COMMIT;
