-- La invitación establece la contraseña de la identidad global. El token crudo nunca
-- se guarda: solo su SHA-256, con caducidad, y se consume dejando ambas columnas en NULL.
ALTER TABLE "usuarios"
  ADD COLUMN "token_invitacion_hash" TEXT,
  ADD COLUMN "token_invitacion_expira_en" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "usuarios_token_invitacion_hash_key"
  ON "usuarios"("token_invitacion_hash");
