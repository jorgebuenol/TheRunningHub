-- Migration 011: Convert day_of_week from INTEGER (0-6) to TEXT day names
-- Fixes intermittent "workouts_day_of_week_check" constraint violations
-- caused by AI sometimes returning inconsistent day_of_week formats.

-- Drop the old integer constraint
ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_day_of_week_check;

-- Convert existing integer values to lowercase day names
ALTER TABLE workouts ALTER COLUMN day_of_week TYPE TEXT
  USING CASE day_of_week
    WHEN 0 THEN 'monday'
    WHEN 1 THEN 'tuesday'
    WHEN 2 THEN 'wednesday'
    WHEN 3 THEN 'thursday'
    WHEN 4 THEN 'friday'
    WHEN 5 THEN 'saturday'
    WHEN 6 THEN 'sunday'
  END;

-- Add new constraint for valid day name strings
ALTER TABLE workouts ADD CONSTRAINT workouts_day_of_week_check
  CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'));
