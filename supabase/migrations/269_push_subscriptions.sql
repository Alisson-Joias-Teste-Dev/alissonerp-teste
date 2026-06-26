CREATE TABLE IF NOT EXISTS alissonerp.push_subscriptions (
  id          SERIAL PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario
  ON alissonerp.push_subscriptions(usuario_id);
