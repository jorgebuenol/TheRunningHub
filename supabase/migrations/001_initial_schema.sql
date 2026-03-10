-- ============================================
-- THE RUN HUB COACH PLATFORM — DATABASE SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'athlete' CHECK (role IN ('coach', 'athlete')),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ATHLETES
-- ============================================
CREATE TABLE athletes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  age INTEGER,
  weight_kg NUMERIC(5,2),
  height_cm NUMERIC(5,1),
  body_fat_pct NUMERIC(4,1),
  weekly_km NUMERIC(5,1),

  -- Race times in seconds
  time_5k INTEGER,
  time_10k INTEGER,
  time_half_marathon INTEGER,
  time_marathon INTEGER,

  -- VDOT calculated
  vdot NUMERIC(5,2),

  -- Goal
  goal_race TEXT CHECK (goal_race IN ('5K', '10K', 'Half Marathon', 'Marathon')),
  goal_time_seconds INTEGER,
  goal_race_date DATE,

  -- Availability
  available_days TEXT[] DEFAULT '{}',
  available_time_start TIME,
  available_time_end TIME,

  -- Health & gear
  injuries TEXT,
  gps_watch_model TEXT,

  -- Training paces (seconds per km)
  pace_easy_min INTEGER,
  pace_easy_max INTEGER,
  pace_tempo INTEGER,
  pace_lt INTEGER,
  pace_race INTEGER,
  pace_vo2max INTEGER,

  -- Intervals.icu
  intervals_icu_api_key TEXT,
  intervals_icu_athlete_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(profile_id)
);

-- ============================================
-- TRAINING PLANS
-- ============================================
CREATE TABLE training_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal_race TEXT NOT NULL,
  goal_time_seconds INTEGER,
  race_date DATE,
  total_weeks INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  ai_prompt TEXT,
  ai_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PLAN WEEKS
-- ============================================
CREATE TABLE plan_weeks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  phase TEXT CHECK (phase IN ('base', 'build', 'peak', 'taper', 'race')),
  total_km NUMERIC(5,1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WORKOUTS
-- ============================================
CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_week_id UUID NOT NULL REFERENCES plan_weeks(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  workout_date DATE,
  workout_type TEXT NOT NULL CHECK (workout_type IN (
    'easy', 'tempo', 'long_run', 'intervals', 'race_pace',
    'recovery', 'rest', 'cross_training', 'race'
  )),
  title TEXT NOT NULL,
  description TEXT,
  distance_km NUMERIC(5,2),
  duration_minutes INTEGER,
  pace_target_sec_km INTEGER,
  pace_range_min INTEGER,
  pace_range_max INTEGER,
  hr_zone TEXT,
  intervals_detail JSONB,
  coach_notes TEXT,
  athlete_notes TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'skipped', 'modified')),

  -- Actual performance data (from Intervals.icu)
  actual_distance_km NUMERIC(5,2),
  actual_duration_minutes INTEGER,
  actual_avg_pace INTEGER,
  actual_avg_hr INTEGER,
  intervals_icu_activity_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

-- NOTE: Coach policies use auth.jwt() metadata to avoid infinite recursion
-- (profiles table cannot reference itself in RLS policies)

-- Profiles: users see own, coach sees all
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Coach can view all profiles"
  ON profiles FOR SELECT
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Coach can manage all profiles"
  ON profiles FOR ALL
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

-- Athletes: own data or coach
CREATE POLICY "Athletes see own data"
  ON athletes FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Coach manages all athletes"
  ON athletes FOR ALL
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

CREATE POLICY "Athletes update own data"
  ON athletes FOR UPDATE
  USING (profile_id = auth.uid());

-- Training plans: athlete sees own, coach sees all
CREATE POLICY "Athletes see own plans"
  ON training_plans FOR SELECT
  USING (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Coach manages all plans"
  ON training_plans FOR ALL
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

-- Plan weeks: follow plan access
CREATE POLICY "View plan weeks via plan"
  ON plan_weeks FOR SELECT
  USING (
    plan_id IN (
      SELECT tp.id FROM training_plans tp
      JOIN athletes a ON tp.athlete_id = a.id
      WHERE a.profile_id = auth.uid()
    )
    OR (SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach'
  );

CREATE POLICY "Coach manages plan weeks"
  ON plan_weeks FOR ALL
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

-- Workouts: athlete sees own, coach manages all
CREATE POLICY "Athletes see own workouts"
  ON workouts FOR SELECT
  USING (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Athletes can add notes"
  ON workouts FOR UPDATE
  USING (
    athlete_id IN (SELECT id FROM athletes WHERE profile_id = auth.uid())
  );

CREATE POLICY "Coach manages all workouts"
  ON workouts FOR ALL
  USING ((SELECT (auth.jwt() -> 'user_metadata' ->> 'role')) = 'coach');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'athlete')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER athletes_updated_at BEFORE UPDATE ON athletes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER training_plans_updated_at BEFORE UPDATE ON training_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workouts_updated_at BEFORE UPDATE ON workouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
