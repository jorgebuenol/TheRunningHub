-- Migration 014: Add Strava OAuth columns to athletes table
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS strava_access_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS strava_token_expires_at TIMESTAMPTZ;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS strava_athlete_id TEXT;
