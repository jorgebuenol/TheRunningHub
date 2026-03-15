-- Migration 013: Expand workout_type check constraint to include activity types
-- Allows strength, pilates, cycling, swimming, walking, other in workouts table

ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_workout_type_check;

ALTER TABLE workouts ADD CONSTRAINT workouts_workout_type_check
  CHECK (workout_type IN (
    'easy', 'tempo', 'long_run', 'intervals', 'race_pace',
    'recovery', 'rest', 'cross_training', 'race',
    'strength', 'pilates', 'cycling', 'swimming', 'walking', 'other'
  ));
