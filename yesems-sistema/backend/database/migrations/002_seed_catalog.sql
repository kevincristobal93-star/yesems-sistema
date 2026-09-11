INSERT INTO public.categorias (nombre, descripcion)
VALUES
    ('Tecnología', 'Cursos relacionados con tecnología, programación y sistemas.'),
    ('Administración', 'Cursos relacionados con administración y gestión.'),
    ('Contabilidad', 'Cursos relacionados con contabilidad y finanzas.'),
    ('Diseño', 'Cursos relacionados con diseño gráfico y herramientas digitales.'),
    ('Idiomas', 'Cursos para el aprendizaje y desarrollo de idiomas.')
ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion;

INSERT INTO public.cursos (id_categoria, nombre, descripcion, duracion_horas, precio, cupo, activo)
SELECT c.id_categoria, 'Introducción a Excel', 'Curso básico de hojas de cálculo', 20, 500.00, 25, true
FROM public.categorias c
WHERE c.nombre = 'Tecnología'
  AND NOT EXISTS (
      SELECT 1 FROM public.cursos curso WHERE curso.nombre = 'Introducción a Excel'
  );
