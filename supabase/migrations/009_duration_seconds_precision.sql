-- Allow fractional minutes so athletes can log durations with seconds precision
-- e.g. 45 min 30 sec = 45.5 minutes

ALTER TABLE workouts
  ALTER COLUMN actual_duration_minutes TYPE NUMERIC USING actual_duration_minutes::NUMERIC;

ALTER TABLE workout_feedback
  ALTER COLUMN actual_duration_minutes TYPE NUMERIC USING actual_duration_minutes::NUMERIC;
