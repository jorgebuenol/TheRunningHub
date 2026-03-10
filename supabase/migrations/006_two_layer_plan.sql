-- 006: Two-layer plan architecture
-- Adds macro plan fields to plan_weeks for skeleton/detail split
-- km_target: planned weekly volume from macro periodization
-- intensity: overall week focus (easy/moderate/hard/recovery)
-- is_generated: FALSE for skeleton weeks, TRUE once weekly detail AI generates workouts
-- start_date: Monday of the week (needed for skeleton weeks with no workouts)

ALTER TABLE plan_weeks ADD COLUMN IF NOT EXISTS km_target NUMERIC(5,1);
ALTER TABLE plan_weeks ADD COLUMN IF NOT EXISTS intensity TEXT
  CHECK (intensity IS NULL OR intensity IN ('easy', 'moderate', 'hard', 'recovery'));
ALTER TABLE plan_weeks ADD COLUMN IF NOT EXISTS is_generated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plan_weeks ADD COLUMN IF NOT EXISTS start_date DATE;

-- Backfill existing plan_weeks that already have workouts
UPDATE plan_weeks pw
SET is_generated = TRUE,
    km_target = pw.total_km,
    start_date = (
      SELECT MIN(w.workout_date)
      FROM workouts w
      WHERE w.plan_week_id = pw.id
    )
WHERE EXISTS (
  SELECT 1 FROM workouts w WHERE w.plan_week_id = pw.id
);
