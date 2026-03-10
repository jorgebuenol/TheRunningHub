-- ============================================
-- PLAN REVIEW WORKFLOW — STATUS + VERSION HISTORY
-- ============================================

-- 1. Update training_plans status CHECK: replace 'active' with 'draft' + 'approved'
ALTER TABLE training_plans DROP CONSTRAINT IF EXISTS training_plans_status_check;
UPDATE training_plans SET status = 'approved' WHERE status = 'active';
ALTER TABLE training_plans ADD CONSTRAINT training_plans_status_check
  CHECK (status IN ('draft', 'approved', 'completed', 'archived'));
ALTER TABLE training_plans ALTER COLUMN status SET DEFAULT 'draft';

-- 2. Version tracking columns
ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS parent_plan_id UUID REFERENCES training_plans(id) ON DELETE SET NULL;
ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 3. RLS: athletes only see approved/completed plans (not drafts or archived)
DROP POLICY IF EXISTS "Athletes see own plans" ON training_plans;
CREATE POLICY "Athletes see own plans"
  ON training_plans FOR SELECT
  USING (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
    AND status IN ('approved', 'completed')
  );
