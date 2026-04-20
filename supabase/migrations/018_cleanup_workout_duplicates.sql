-- Migration 018: Clean up duplicate workouts caused by the unpublish/archive plan clone.
-- For each (athlete_id, workout_date, workout_type) pair that has both a 'planned' and a
-- 'completed' row, we:
--   1. Capture the (planned_id, completed_id) pairs into a temp table.
--   2. Copy actual values from the completed row → planned row (preserving planned distance_km).
--   3. Set the planned row status to 'completed'.
--   4. Re-point any workout_feedback rows from the completed ID → planned ID.
--   5. Delete the now-redundant completed rows.

BEGIN;

-- Step 1: Capture duplicate pairs before touching anything.
CREATE TEMP TABLE _dup_pairs AS
SELECT
  p.id AS planned_id,
  c.id AS completed_id
FROM workouts p
JOIN workouts c
  ON  c.athlete_id   = p.athlete_id
  AND c.workout_date = p.workout_date
  AND c.workout_type = p.workout_type
  AND c.status       = 'completed'
  AND p.status       = 'planned'
  AND c.id           <> p.id;

-- Step 2 & 3: Merge actuals into the planned row and mark it completed.
UPDATE workouts AS p
SET
  status                  = 'completed',
  actual_distance_km      = COALESCE(c.actual_distance_km, p.actual_distance_km),
  actual_duration_minutes = COALESCE(c.actual_duration_minutes, p.actual_duration_minutes),
  actual_avg_pace         = COALESCE(c.actual_avg_pace, p.actual_avg_pace),
  actual_avg_hr           = COALESCE(c.actual_avg_hr, p.actual_avg_hr)
FROM _dup_pairs dp
JOIN workouts c ON c.id = dp.completed_id
WHERE p.id = dp.planned_id;

-- Step 4: Re-point feedback from the completed row → the surviving planned row.
UPDATE workout_feedback
SET workout_id = dp.planned_id
FROM _dup_pairs dp
WHERE workout_id = dp.completed_id;

-- Step 5: Delete the redundant completed rows.
DELETE FROM workouts
WHERE id IN (SELECT completed_id FROM _dup_pairs);

DROP TABLE _dup_pairs;

COMMIT;
