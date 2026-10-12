BEGIN;

ALTER TABLE public.aula_modulos
  ADD COLUMN IF NOT EXISTS archivado_at timestamptz;

ALTER TABLE public.aula_documentos
  ADD COLUMN IF NOT EXISTS descripcion varchar(1000) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.aula_modulo_progreso (
  id_inscripcion integer NOT NULL REFERENCES public.inscripciones(id_inscripcion) ON DELETE RESTRICT,
  id_modulo integer NOT NULL REFERENCES public.aula_modulos(id_modulo) ON DELETE RESTRICT,
  completado_at timestamptz,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_inscripcion, id_modulo)
);

COMMIT;
