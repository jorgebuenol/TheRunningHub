-- Part 1: Add HR zone fields to athletes table
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS hr_max INTEGER;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS hr_resting INTEGER;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS hr_z1_max INTEGER;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS hr_z2_max INTEGER;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS hr_z3_max INTEGER;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS hr_z4_max INTEGER;

-- Part 2: Add HR-based workout target fields to workouts table
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'pace' CHECK (target_type IN ('pace', 'hr', 'rpe'));
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS hr_target_min INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS hr_target_max INTEGER;
