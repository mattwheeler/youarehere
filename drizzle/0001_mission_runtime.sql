CREATE TABLE IF NOT EXISTS mission_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  scenario_id TEXT NOT NULL,
  seed_id TEXT NOT NULL,
  experience_mode TEXT NOT NULL CHECK (experience_mode IN ('live', 'practice')),
  status TEXT NOT NULL CHECK (status IN ('active', 'awaiting_approval', 'complete', 'retryable_error')),
  stage TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  permissions_json TEXT NOT NULL,
  world_json TEXT NOT NULL,
  events_json TEXT NOT NULL,
  continuation_json TEXT,
  pending_action_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mission_sessions_expires_at_idx
  ON mission_sessions (expires_at);

CREATE INDEX IF NOT EXISTS mission_sessions_status_idx
  ON mission_sessions (status, updated_at);

CREATE TABLE IF NOT EXISTS mission_actions (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES mission_sessions(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_hash TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  session_version INTEGER NOT NULL CHECK (session_version > 1),
  idempotency_key TEXT NOT NULL UNIQUE,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  decided_at INTEGER,
  executed_at INTEGER,
  UNIQUE (session_id, call_id)
);

CREATE INDEX IF NOT EXISTS mission_actions_session_status_idx
  ON mission_actions (session_id, status);

CREATE INDEX IF NOT EXISTS mission_actions_expires_at_idx
  ON mission_actions (expires_at);

CREATE TRIGGER IF NOT EXISTS mission_actions_require_current_session
BEFORE INSERT ON mission_actions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM mission_sessions
    WHERE id = NEW.session_id
      AND version = NEW.session_version - 1
      AND pending_action_id IS NULL
      AND expires_at > NEW.created_at
  ) THEN RAISE(ABORT, 'mission_session_conflict') END;
END;

CREATE TRIGGER IF NOT EXISTS mission_actions_require_current_execution
BEFORE UPDATE OF status ON mission_actions
WHEN NEW.status = 'executed' AND OLD.status <> 'executed'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM mission_sessions
    WHERE id = NEW.session_id
      AND version = NEW.session_version
      AND pending_action_id = NEW.id
      AND expires_at > NEW.executed_at
  ) THEN RAISE(ABORT, 'mission_execution_conflict') END;
END;
