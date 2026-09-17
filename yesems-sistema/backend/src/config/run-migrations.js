const pool = require('./db');

async function runServiceAvailabilityMigration() {
  await pool.query(`
    ALTER TABLE public.horarios
      ADD COLUMN IF NOT EXISTS modalidad varchar(30) NOT NULL DEFAULT 'por_definir',
      ADD COLUMN IF NOT EXISTS enlace varchar(500),
      ADD COLUMN IF NOT EXISTS notas text,
      ADD COLUMN IF NOT EXISTS informacion_adicional varchar(250);
    ALTER TABLE public.horarios
      ALTER COLUMN dia_semana DROP NOT NULL,
      ALTER COLUMN hora_inicio DROP NOT NULL,
      ALTER COLUMN hora_fin DROP NOT NULL;
    ALTER TABLE public.horarios DROP CONSTRAINT IF EXISTS chk_horario_horas;
    ALTER TABLE public.horarios
      ADD CONSTRAINT chk_horario_horas
      CHECK (hora_inicio IS NULL OR hora_fin IS NULL OR hora_fin > hora_inicio);
    UPDATE public.horarios
    SET informacion_adicional = COALESCE(informacion_adicional, aula)
    WHERE aula IS NOT NULL;
  `);
}

module.exports = { runServiceAvailabilityMigration };
