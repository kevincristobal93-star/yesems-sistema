BEGIN;

ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS oferta_provisional boolean NOT NULL DEFAULT false;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS catalogo_clave varchar(80);
CREATE UNIQUE INDEX IF NOT EXISTS cursos_catalogo_clave_unique ON public.cursos (catalogo_clave);

-- Serializa la carga inicial. No sobrescribe cursos editados o desactivados.
LOCK TABLE public.cursos IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.categorias (nombre, descripcion)
VALUES ('Tecnología y emprendimiento', 'Capacitación técnica y proyectos para emprender.')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.cursos
  (id_categoria, catalogo_clave, nombre, descripcion, duracion_horas, precio, cupo, oferta_provisional)
SELECT cat.id_categoria, propuesta.clave, propuesta.nombre, propuesta.descripcion,
       propuesta.horas, 0, propuesta.cupo, true
FROM public.categorias cat
CROSS JOIN (VALUES
  ('yesems-celulares', 'Reparación de celulares',
   'Propuesta de nivel inicial: herramientas, seguridad, diagnóstico básico, mantenimiento y sustitución de componentes. Plus: elaborar una ficha de diagnóstico y un presupuesto de reparación para iniciar tu oferta de servicios. Prácticas sujetas a equipo y supervisión por confirmar.', 32, 12),
  ('yesems-sublimacion', 'Sublimación y diseño (crea tu marca)',
   'Propuesta de nivel inicial: diseño para productos, preparación de archivos, color, materiales y proceso de sublimación. Plus: crear una identidad visual básica y un pequeño catálogo de productos con cálculo de costos y precio de venta.', 24, 12),
  ('yesems-laser', 'Corte y grabado láser',
   'Propuesta de nivel inicial: diseño vectorial, preparación de archivos, materiales compatibles y operación segura con supervisión. Plus: diseñar un producto personalizado y preparar su cotización considerando materiales y tiempo de producción.', 24, 10),
  ('yesems-impresion3d', 'Impresión 3D',
   'Propuesta de nivel inicial: modelado básico, preparación de archivos, laminado, parámetros de impresión y solución de fallas comunes. Plus: diseñar un prototipo funcional y calcular su costo de producción para ofrecer productos personalizados.', 32, 10)
) AS propuesta(clave, nombre, descripcion, horas, cupo)
WHERE cat.nombre = 'Tecnología y emprendimiento'
  AND NOT EXISTS (
    SELECT 1 FROM public.cursos c
    WHERE c.catalogo_clave = propuesta.clave OR lower(trim(c.nombre)) = lower(propuesta.nombre)
  )
ON CONFLICT (catalogo_clave) DO NOTHING;

-- El cero es un marcador interno, NO una oferta gratuita. El indicador bloquea
-- inscripciones y muestra precio por confirmar hasta la validación administrativa.
COMMIT;
