-- ============================================
-- ATHLETE MONITORING SYSTEM — MIGRATION
-- ============================================

-- ============================================
-- DAILY READINESS CHECK-IN
-- ============================================
CREATE TABLE daily_readiness (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Subjective scores (1-5)
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
  sleep_hours NUMERIC(3,1),
  sleep_quality INTEGER NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  soreness INTEGER NOT NULL CHECK (soreness BETWEEN 1 AND 5),
  stress INTEGER NOT NULL CHECK (stress BETWEEN 1 AND 5),
  motivation INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 5),

  -- Pain tracking
  pain_flag BOOLEAN DEFAULT FALSE,
  pain_location TEXT,
  pain_severity INTEGER CHECK (pain_severity IS NULL OR pain_severity BETWEEN 1 AND 10),

  -- Biometrics
  resting_hr INTEGER,
  hrv INTEGER,
  weight_kg NUMERIC(5,2),

  -- Notes
  notes TEXT,

  -- Composite readiness score (auto-calculated)
  composite_score NUMERIC(3,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One check-in per athlete per day
  UNIQUE(athlete_id, check_in_date)
);

-- ============================================
-- WORKOUT FEEDBACK
-- ============================================
CREATE TABLE workout_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,

  -- RPE (Rate of Perceived Exertion)
  rpe INTEGER NOT NULL CHECK (rpe BETWEEN 1 AND 10),
  completed BOOLEAN NOT NULL DEFAULT TRUE,

  -- Actual performance
  actual_distance_km NUMERIC(5,2),
  actual_duration_minutes INTEGER,
  actual_pace_sec_km INTEGER,
  avg_hr INTEGER,
  max_hr INTEGER,

  -- Subjective
  feeling TEXT CHECK (feeling IN ('great', 'good', 'ok', 'bad', 'terrible')),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One feedback per workout
  UNIQUE(workout_id)
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE daily_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_feedback ENABLE ROW LEVEL SECURITY;

-- Daily readiness: athlete sees/writes own, coach sees all
CREATE POLICY "Athletes see own readiness"
  ON daily_readiness FOR SELECT
  USING (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Athletes insert own readiness"
  ON daily_readiness FOR INSERT
  WITH CHECK (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Athletes update own readiness"
  ON daily_readiness FOR UPDATE
  USING (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Coach sees all readiness"
  ON daily_readiness FOR SELECT
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

CREATE POLICY "Coach manages all readiness"
  ON daily_readiness FOR ALL
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

-- Workout feedback: athlete sees/writes own, coach sees all
CREATE POLICY "Athletes see own feedback"
  ON workout_feedback FOR SELECT
  USING (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Athletes insert own feedback"
  ON workout_feedback FOR INSERT
  WITH CHECK (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Athletes update own feedback"
  ON workout_feedback FOR UPDATE
  USING (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Coach sees all feedback"
  ON workout_feedback FOR SELECT
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

CREATE POLICY "Coach manages all feedback"
  ON workout_feedback FOR ALL
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

-- ============================================
-- COMPOSITE SCORE TRIGGER
-- ============================================
-- Formula: (energy * 0.25) + (sleep_quality * 0.25) + ((6 - soreness) * 0.20) + ((6 - stress) * 0.15) + (motivation * 0.15)
-- Range: 1.0 – 5.0

CREATE OR REPLACE FUNCTION calculate_composite_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.composite_score := ROUND(
    (NEW.energy * 0.25) +
    (NEW.sleep_quality * 0.25) +
    ((6 - NEW.soreness) * 0.20) +
    ((6 - NEW.stress) * 0.15) +
    (NEW.motivation * 0.15),
    2
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER readiness_composite_score
  BEFORE INSERT OR UPDATE ON daily_readiness
  FOR EACH ROW EXECUTE FUNCTION calculate_composite_score();

-- Updated_at triggers
CREATE TRIGGER daily_readiness_updated_at BEFORE UPDATE ON daily_readiness
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
