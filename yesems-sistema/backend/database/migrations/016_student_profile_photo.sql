CREATE TABLE IF NOT EXISTS public.usuario_fotos (
  id_usuario integer PRIMARY KEY REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
  mime_type varchar(20) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  contenido bytea NOT NULL CHECK (octet_length(contenido) <= 2097152),
  actualizado_at timestamptz NOT NULL DEFAULT now()
);
