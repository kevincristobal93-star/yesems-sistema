-- Seguimiento real: migración aditiva e idempotente. No convierte conclusiones
-- antiguas en conclusiones verificadas y no modifica constancias existentes.
BEGIN;

ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS porcentaje_minimo integer
    CHECK (porcentaje_minimo BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS plan_publicado boolean NOT NULL DEFAULT false;

ALTER TABLE public.inscripciones
  ADD COLUMN IF NOT EXISTS concluida_por integer
    REFERENCES public.administradores(id_administrador) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS concluida_at timestamptz;

CREATE TABLE IF NOT EXISTS public.curso_actividades (
  id_actividad integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_curso integer NOT NULL REFERENCES public.cursos(id_curso) ON DELETE RESTRICT,
  titulo varchar(180) NOT NULL CHECK (length(trim(titulo)) > 0),
  tipo varchar(20) NOT NULL CHECK (tipo IN ('sesion', 'actividad')),
  modalidad varchar(20) NOT NULL
    CHECK (modalidad IN ('presencial', 'en_linea', 'hibrida', 'por_definir')),
  fecha date,
  orden integer NOT NULL CHECK (orden > 0),
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.actividad_cumplimientos (
  id_inscripcion integer NOT NULL
    REFERENCES public.inscripciones(id_inscripcion) ON DELETE RESTRICT,
  id_actividad integer NOT NULL
    REFERENCES public.curso_actividades(id_actividad) ON DELETE RESTRICT,
  cumplida boolean NOT NULL,
  observaciones varchar(1000),
  registrado_por integer NOT NULL
    REFERENCES public.administradores(id_administrador) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_inscripcion, id_actividad)
);

CREATE INDEX IF NOT EXISTS curso_actividades_curso_idx
  ON public.curso_actividades (id_curso, orden) WHERE activa = true;
CREATE INDEX IF NOT EXISTS inscripciones_conclusion_curso_idx
  ON public.inscripciones (id_curso) WHERE concluida_at IS NOT NULL;

COMMIT;
