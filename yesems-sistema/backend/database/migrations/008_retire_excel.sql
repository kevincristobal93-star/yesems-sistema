-- Baja lógica solicitada: conserva el curso y todo su historial académico/financiero.
-- El arranque ya no crea el curso de demostración. Repetir esta operación es seguro.
UPDATE public.cursos
SET activo = false
WHERE lower(trim(nombre)) = lower('Introducción a Excel') AND activo = true;
