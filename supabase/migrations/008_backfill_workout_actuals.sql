-- Backfill actual performance data from workout_feedback into workouts table.
-- Previously, feedback POST only set workouts.status = 'completed' without
-- copying actual_distance_km, actual_duration_minutes, actual_avg_pace, actual_avg_hr.

UPDATE workouts w
SET
  actual_distance_km    = f.actual_distance_km,
  actual_duration_minutes = f.actual_duration_minutes,
  actual_avg_pace       = COALESCE(
    f.actual_pace_sec_km,
    CASE WHEN f.actual_distance_km > 0 AND f.actual_duration_minutes > 0
         THEN ROUND((f.actual_duration_minutes * 60.0) / f.actual_distance_km)
         ELSE NULL
    END
  ),
  actual_avg_hr         = f.avg_hr
FROM workout_feedback f
WHERE w.id = f.workout_id
  AND w.status = 'completed'
  AND w.actual_distance_km IS NULL
  AND f.actual_distance_km IS NOT NULL;
