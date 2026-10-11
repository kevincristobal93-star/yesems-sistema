BEGIN;
ALTER TABLE public.aula_documentos
  ADD COLUMN IF NOT EXISTS reemplaza_id integer REFERENCES public.aula_documentos(id_documento) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS aula_documentos_reemplazo_unico
  ON public.aula_documentos(reemplaza_id) WHERE reemplaza_id IS NOT NULL;
COMMIT;
