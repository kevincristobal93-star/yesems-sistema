-- Imágenes que administración decide mostrar en el catálogo público.
-- No se mezclan con los documentos privados de los módulos del aula.
CREATE TABLE IF NOT EXISTS public.curso_imagenes_publicas (
  id_imagen integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_curso integer NOT NULL REFERENCES public.cursos(id_curso) ON DELETE CASCADE,
  titulo varchar(150) NOT NULL,
  archivo_url text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 5242880),
  extension varchar(4) NOT NULL CHECK (extension IN ('jpg','jpeg','png','webp')),
  activo boolean NOT NULL DEFAULT true,
  creado_por integer NOT NULL REFERENCES public.administradores(id_administrador),
  creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curso_imagenes_publicas_curso_activo_idx
  ON public.curso_imagenes_publicas(id_curso, id_imagen) WHERE activo;
