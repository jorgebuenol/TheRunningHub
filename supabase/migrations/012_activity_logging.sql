-- Migration 012: Expand strength_sessions → full activity logging
-- Adds activity_type, distance, pace, HR, elevation, and notes columns.
-- Changes UNIQUE constraint to allow multiple different activities per day.

-- Add new columns
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'strength';
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS distance_km NUMERIC(5,2);
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS avg_pace_sec INTEGER;
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS avg_hr INTEGER;
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS max_hr INTEGER;
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS elevation_m INTEGER;

-- Drop old unique (one session per day) → new unique (one per day per activity type)
ALTER TABLE strength_sessions DROP CONSTRAINT IF EXISTS strength_sessions_athlete_id_session_date_key;
ALTER TABLE strength_sessions ADD CONSTRAINT strength_sessions_athlete_date_type_key
  UNIQUE(athlete_id, session_date, activity_type);

-- Valid activity types
ALTER TABLE strength_sessions ADD CONSTRAINT strength_sessions_activity_type_check
  CHECK (activity_type IN ('easy_run','long_run','race','strength','pilates','cycling','swimming','walking','other'));
