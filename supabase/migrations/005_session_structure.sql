-- 005: Add structured session breakdown and RPE target to workouts
-- session_structure stores warm-up / main set / cool-down as JSONB
-- rpe_target stores the coach-assigned target RPE (1-10) for the session

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS session_structure JSONB;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS rpe_target INTEGER CHECK (rpe_target IS NULL OR rpe_target BETWEEN 1 AND 10);
