BEGIN;
CREATE TABLE IF NOT EXISTS public.aula_documentos (
 id_documento integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_modulo integer NOT NULL REFERENCES public.aula_modulos(id_modulo) ON DELETE RESTRICT,
 titulo varchar(150) NOT NULL CHECK(length(trim(titulo)) > 0),
 archivo_url text NOT NULL,
 bytes integer NOT NULL CHECK(bytes > 0 AND bytes <= 5242880),
 activo boolean NOT NULL DEFAULT true,
 creado_por integer NOT NULL REFERENCES public.administradores(id_administrador) ON DELETE RESTRICT,
 creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aula_documentos_modulo_idx ON public.aula_documentos(id_modulo);
COMMIT;
