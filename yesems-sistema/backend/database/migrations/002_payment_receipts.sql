ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS comprobante_url varchar(255);
