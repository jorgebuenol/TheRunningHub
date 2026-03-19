-- Add rescheduled_from_date to track when a workout was moved by the athlete
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS rescheduled_from_date DATE;
