BEGIN;
ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS duracion_aproximada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cupo_confirmado boolean NOT NULL DEFAULT true;

-- Confirmación comercial del 5 de octubre: solo cursos completos.
-- No modifica importes ni pagos de inscripciones históricas.
CREATE TABLE IF NOT EXISTS public.migraciones_aplicadas (
  clave varchar(100) PRIMARY KEY, aplicada_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
WITH nueva AS (
  INSERT INTO public.migraciones_aplicadas (clave) VALUES ('009_confirmed_courses')
  ON CONFLICT DO NOTHING RETURNING clave
)
UPDATE public.cursos SET precio=1000, duracion_horas=60,
  duracion_aproximada=true, cupo_confirmado=false, oferta_provisional=false,
  descripcion=replace(descripcion, 'Propuesta de nivel inicial:', 'Curso de nivel inicial:')
WHERE catalogo_clave IN ('yesems-celulares','yesems-sublimacion','yesems-laser','yesems-impresion3d')
  AND EXISTS (SELECT 1 FROM nueva);
COMMIT;
