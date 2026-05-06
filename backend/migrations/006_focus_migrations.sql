-- 006_focus_migrations.sql
-- Phase 0 closeout: idempotency table for localStorage→server focus migration
-- and archived column for subjects.

-- ── Focus migrations (one row per user, idempotency guard) ─────────────────
CREATE TABLE IF NOT EXISTS focus_migrations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes_imported integer NOT NULL DEFAULT 0,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE focus_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own focus_migrations"
  ON focus_migrations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_focus_migrations_user ON focus_migrations(user_id);

-- ── Subjects: add archived column ──────────────────────────────────────────
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_subjects_user_archived ON subjects(user_id, archived);
