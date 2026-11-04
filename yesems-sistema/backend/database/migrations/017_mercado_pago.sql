ALTER TABLE public.pagos
  DROP CONSTRAINT IF EXISTS pagos_metodo_pago_check;

ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_metodo_pago_check
  CHECK (metodo_pago IN ('efectivo', 'transferencia', 'tarjeta', 'otro', 'mercado_pago'));

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS mp_external_reference varchar(100),
  ADD COLUMN IF NOT EXISTS mp_preference_id varchar(100),
  ADD COLUMN IF NOT EXISTS mp_payment_id varchar(100),
  ADD COLUMN IF NOT EXISTS mp_checkout_url text,
  ADD COLUMN IF NOT EXISTS mp_status varchar(30);

CREATE UNIQUE INDEX IF NOT EXISTS pagos_mp_external_reference_unique
  ON public.pagos (mp_external_reference) WHERE mp_external_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pagos_mp_payment_id_unique
  ON public.pagos (mp_payment_id) WHERE mp_payment_id IS NOT NULL;
