-- 007: Extend plan_weeks phases to include recovery sub-phases
-- Methodology: recovery weeks every 3-4 weeks depending on athlete level

-- Drop existing phase CHECK constraint and replace with expanded list
ALTER TABLE plan_weeks DROP CONSTRAINT IF EXISTS plan_weeks_phase_check;
ALTER TABLE plan_weeks ADD CONSTRAINT plan_weeks_phase_check
  CHECK (phase IS NULL OR phase IN (
    'base', 'build', 'peak', 'taper', 'race',
    'base_recovery', 'build_recovery', 'peak_recovery'
  ));

-- Add is_recovery boolean for easier querying/filtering
ALTER TABLE plan_weeks ADD COLUMN IF NOT EXISTS is_recovery BOOLEAN NOT NULL DEFAULT FALSE;
