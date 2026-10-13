BEGIN;

ALTER TABLE public.aula_documentos
  ADD COLUMN IF NOT EXISTS tipo_material varchar(24) NOT NULL DEFAULT 'documento',
  ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS principal_id integer REFERENCES public.aula_documentos(id_documento) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS aula_documentos_principal_idx
  ON public.aula_documentos(principal_id) WHERE activo;

UPDATE public.aula_documentos
SET tipo_material = CASE
  WHEN lower(regexp_replace(archivo_url, '^.*[.]', '')) = 'pdf' THEN 'pdf'
  WHEN lower(regexp_replace(archivo_url, '^.*[.]', '')) IN ('jpg','jpeg','png','webp') THEN 'imagen'
  ELSE 'documento'
END
WHERE tipo_material = 'documento' AND orden = 0;

UPDATE public.aula_documentos d SET orden = d.id_documento WHERE orden = 0;

CREATE TABLE IF NOT EXISTS public.aula_videos (
  id_video integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_modulo integer NOT NULL REFERENCES public.aula_modulos(id_modulo) ON DELETE RESTRICT,
  principal_id integer REFERENCES public.aula_documentos(id_documento) ON DELETE SET NULL,
  titulo varchar(150) NOT NULL CHECK (length(trim(titulo)) > 0),
  descripcion varchar(1000) NOT NULL DEFAULT '',
  url text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_por integer NOT NULL REFERENCES public.administradores(id_administrador) ON DELETE RESTRICT,
  creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aula_videos_modulo_idx ON public.aula_videos(id_modulo) WHERE activo;

COMMIT;
