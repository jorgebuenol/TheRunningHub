-- ============================================
-- EXTENDED ATHLETE PROFILE FOR MULTI-SESSION ONBOARDING
-- ============================================

-- Sleep habits
ALTER TABLE athletes ADD COLUMN sleep_data JSONB DEFAULT '{}';

-- Nutrition info
ALTER TABLE athletes ADD COLUMN nutrition_data JSONB DEFAULT '{}';

-- Work & lifestyle
ALTER TABLE athletes ADD COLUMN work_life_data JSONB DEFAULT '{}';

-- Recovery practices
ALTER TABLE athletes ADD COLUMN recovery_data JSONB DEFAULT '{}';

-- Current training background
ALTER TABLE athletes ADD COLUMN current_training_data JSONB DEFAULT '{}';

-- Timestamp set when all 11 onboarding sections are complete
ALTER TABLE athletes ADD COLUMN onboarding_completed_at TIMESTAMPTZ DEFAULT NULL;
