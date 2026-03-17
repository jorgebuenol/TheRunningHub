-- Allow multiple activities of the same type on the same day
-- The unique constraint was preventing athletes from logging e.g. two strength sessions in one day
ALTER TABLE strength_sessions DROP CONSTRAINT IF EXISTS strength_sessions_athlete_date_type_key;
