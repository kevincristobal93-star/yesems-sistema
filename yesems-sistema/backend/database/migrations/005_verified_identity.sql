BEGIN;
LOCK TABLE usuarios IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado_at timestamptz;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;
-- Reservas normalizadas: conservan duplicados históricos sin fusionar personas.
CREATE TABLE IF NOT EXISTS identidad_reservas (
  tipo text NOT NULL, valor text NOT NULL, id_usuario integer NOT NULL REFERENCES usuarios(id_usuario) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(tipo, valor)
);
INSERT INTO identidad_reservas SELECT 'email', lower(btrim(email)), min(id_usuario) FROM usuarios GROUP BY lower(btrim(email)) ON CONFLICT DO NOTHING;
INSERT INTO identidad_reservas SELECT 'curp', upper(btrim(curp)), min(id_usuario) FROM usuarios WHERE nullif(btrim(curp),'') IS NOT NULL GROUP BY upper(btrim(curp)) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION reservar_identidad_usuario() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE propietario integer; valor_nuevo text; campo text;
BEGIN
  FOREACH campo IN ARRAY ARRAY['email','curp'] LOOP
    IF TG_OP = 'UPDATE' THEN
      IF campo = 'email' AND NEW.email IS NOT DISTINCT FROM OLD.email THEN CONTINUE; END IF;
      IF campo = 'curp' AND NEW.curp IS NOT DISTINCT FROM OLD.curp THEN CONTINUE; END IF;
    END IF;
    valor_nuevo := CASE WHEN campo = 'email' THEN lower(btrim(NEW.email)) ELSE nullif(upper(btrim(NEW.curp)),'') END;
    IF valor_nuevo IS NULL THEN CONTINUE; END IF;
    INSERT INTO identidad_reservas(tipo,valor,id_usuario) VALUES(campo,valor_nuevo,NEW.id_usuario) ON CONFLICT DO NOTHING;
    SELECT id_usuario INTO propietario FROM identidad_reservas WHERE tipo=campo AND valor=valor_nuevo;
    IF propietario <> NEW.id_usuario THEN
      RAISE EXCEPTION 'Identidad ya registrada' USING ERRCODE='23505', CONSTRAINT='identidad_' || campo;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS identidad_usuario_unica ON usuarios;
CREATE TRIGGER identidad_usuario_unica AFTER INSERT OR UPDATE OF email,curp ON usuarios FOR EACH ROW EXECUTE FUNCTION reservar_identidad_usuario();
CREATE TABLE IF NOT EXISTS acceso_codigos (
  email text PRIMARY KEY, hash text NOT NULL, expira timestamptz NOT NULL,
  intentos integer NOT NULL DEFAULT 0, enviado timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS acceso_limites (
  clave text PRIMARY KEY, cantidad integer NOT NULL, expira timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS acceso_nonces (nonce text PRIMARY KEY, expira timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS acceso_envios (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, enviado timestamptz NOT NULL DEFAULT now());
COMMIT;
