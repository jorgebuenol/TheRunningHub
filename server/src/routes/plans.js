import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';
import { generateTrainingPlan, generateMacroPlan, generateCouchToRunMacro, generateWeeklyDetail, checkRedFlags, deriveAthleteLevel, intensityFromPhase } from '../services/planGenerator.js';
import { getAthleteMonitoringSummary } from '../services/monitoring.js';
import { addDays, startOfWeek } from '../utils/dates.js';
import { isOnboardingComplete, getMissingSections } from '../utils/onboardingProgress.js';

export const planRoutes = Router();

/* Day-of-week helpers — canonical format is lowercase string */
const DAY_NAMES_ORDERED = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const ABBREV_MAP = {
  mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday',
  thu: 'thursday', thur: 'thursday', thurs: 'thursday',
  fri: 'friday', sat: 'saturday', sun: 'sunday',
};

/**
 * Normalize any day_of_week value (number, string, abbreviation) to lowercase day name.
 * Returns null if the value cannot be normalized.
 */
function normalizeDayOfWeek(val) {
  if (val == null) return null;
  if (typeof val === 'number' && val >= 0 && val <= 6) return DAY_NAMES_ORDERED[val];
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (DAY_NAMES_ORDERED.includes(lower)) return lower;
    if (ABBREV_MAP[lower]) return ABBREV_MAP[lower];
    const num = parseInt(lower, 10);
    if (!isNaN(num) && num >= 0 && num <= 6) return DAY_NAMES_ORDERED[num];
  }
  return null;
}

/** Get the offset (0-6) for a day name string for date arithmetic */
function dayOffset(dayName) {
  const idx = DAY_NAMES_ORDERED.indexOf(dayName);
  return idx >= 0 ? idx : 0;
}

/* ─── Workout field sanitization ─── */
// Only these fields may be written to the workouts table
const VALID_WORKOUT_FIELDS = new Set([
  'distance_km', 'duration_minutes', 'pace_target_sec_km',
  'pace_range_min', 'pace_range_max', 'hr_zone',
  'title', 'description', 'workout_type', 'coach_notes',
  'intervals_detail', 'session_structure', 'rpe_target', 'status',
]);

// These JSONB columns are allowed to be objects
const JSONB_FIELDS = new Set(['intervals_detail', 'session_structure']);

/**
 * Sanitize a workout fields object before saving to Supabase.
 * - Strips unknown fields
 * - Converts any non-JSONB field that is an object/array to a JSON string
 * - Ensures JSONB fields are objects (not primitives)
 */
function sanitizeWorkoutFields(changes) {
  const clean = {};
  for (const [key, val] of Object.entries(changes)) {
    if (!VALID_WORKOUT_FIELDS.has(key)) continue;
    if (val === undefined) continue;

    if (JSONB_FIELDS.has(key)) {
      // JSONB columns: keep objects, stringify primitives, pass null through
      if (val === null) {
        clean[key] = null;
      } else if (typeof val === 'object') {
        clean[key] = val;
      } else {
        // Primitive in a JSONB column — wrap or skip
        clean[key] = null;
      }
    } else {
      // Non-JSONB columns: must be a primitive (string, number, boolean, null)
      if (val === null) {
        clean[key] = null;
      } else if (typeof val === 'object') {
        // Object in a text/numeric column — serialize to string
        clean[key] = JSON.stringify(val);
      } else {
        clean[key] = val;
      }
    }
  }
  return clean;
}

// POST generate a new plan for an athlete
planRoutes.post('/generate/:athleteId', coachOnly, async (req, res, next) => {
  try {
    const { athleteId } = req.params;
    const { levelOverride, vdotOverride, magicMileSeconds, isRunWalk, isCouchToRun } = req.body || {};

    // Fetch athlete with profile
    const { data: athlete, error: athleteErr } = await req.supabase
      .from('athletes')
      .select('*, profiles(full_name, email)')
      .eq('id', athleteId)
      .single();

    if (athleteErr || !athlete) {
      return res.status(404).json({ message: 'Athlete not found' });
    }

    if (!athlete.goal_race || !athlete.goal_race_date) {
      return res.status(400).json({ message: 'Athlete must have a goal race and date set' });
    }

    // Check onboarding completion
    if (!isOnboardingComplete(athlete)) {
      const missing = getMissingSections(athlete);
      return res.status(400).json({
        message: 'Athlete profile must be 100% complete before generating a plan',
        missing_sections: missing,
      });
    }

    // If Magic Mile was provided, estimate VDOT from it
    let effectiveVdot = vdotOverride || athlete.vdot;
    if (magicMileSeconds && !vdotOverride) {
      // Jeff Galloway: mile time × 1.2 → estimated HM pace (sec/km)
      // Then map to approximate VDOT
      const hmPaceSecKm = (magicMileSeconds * 1.2) / 21.1;
      effectiveVdot = estimateVdotFromHmPace(hmPaceSecKm);
      console.log(`Magic Mile ${magicMileSeconds}s → est HM pace ${Math.round(hmPaceSecKm)}s/km → VDOT ${effectiveVdot}`);
    }

    // Build overrides object for AI prompt
    const overrides = { levelOverride, vdotOverride: effectiveVdot, isRunWalk };

    // Generate macro periodization skeleton
    let macroPlan;
    if (isCouchToRun) {
      // Couch to Run: deterministic macro (no AI call)
      const weeksToRaceCalc = Math.max(12, Math.ceil(
        (new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000)
      ));
      macroPlan = generateCouchToRunMacro(weeksToRaceCalc);
    } else {
      // Standard AI-generated macro
      try {
        macroPlan = await generateMacroPlan(athlete, athlete.profiles, overrides);
      } catch (aiErr) {
        const msg = aiErr.message || '';
        if (msg.includes('credit balance')) {
          return res.status(402).json({ message: 'Anthropic API credits exhausted. Please add credits at console.anthropic.com.' });
        }
        return res.status(500).json({ message: `AI generation failed: ${msg.substring(0, 150)}` });
      }
    }

    const weeksToRace = Math.ceil(
      (new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000)
    );

    // Derive level for DB storage
    const level = levelOverride || deriveAthleteLevel(athlete.weekly_km).level;

    // Create the training plan record
    const { data: plan, error: planErr } = await req.supabase
      .from('training_plans')
      .insert({
        athlete_id: athleteId,
        name: isCouchToRun
          ? `Couch to Run → ${athlete.goal_race} — ${athlete.profiles.full_name}`
          : `${athlete.goal_race} Plan — ${athlete.profiles.full_name}`,
        goal_race: athlete.goal_race,
        goal_time_seconds: athlete.goal_time_seconds,
        race_date: athlete.goal_race_date,
        total_weeks: weeksToRace,
        ai_model: 'claude-sonnet-4-20250514',
        status: 'draft',
      })
      .select()
      .single();

    if (planErr) throw planErr;

    // Calculate the Monday of the current week as plan start
    const planStart = getMonday(new Date());

    // Insert macro skeleton weeks (NO workouts — those are generated per-week)
    for (const week of macroPlan.weeks) {
      const weekStart = new Date(planStart);
      weekStart.setDate(weekStart.getDate() + (week.week_number - 1) * 7);

      const weekRow = {
        plan_id: plan.id,
        week_number: week.week_number,
        phase: week.phase,
        total_km: null,
        km_target: week.km_target,
        intensity: intensityFromPhase(week.phase),
        notes: week.intensity_focus || week.notes || null,
        is_generated: false,
        start_date: weekStart.toISOString().split('T')[0],
      };

      // Add is_recovery if column exists (requires migration 007)
      weekRow.is_recovery = week.is_recovery || false;

      let { error: weekErr } = await req.supabase
        .from('plan_weeks')
        .insert(weekRow);

      // Fallback: if is_recovery column doesn't exist yet, retry without it
      if (weekErr?.code === '42703' && weekErr?.message?.includes('is_recovery')) {
        console.warn('is_recovery column not found — run migration 007_recovery_phases.sql');
        delete weekRow.is_recovery;
        const retry = await req.supabase.from('plan_weeks').insert(weekRow);
        weekErr = retry.error;
      }

      if (weekErr) throw weekErr;
    }

    // Return the full plan
    const fullPlan = await fetchFullPlan(req.supabase, plan.id);
    res.status(201).json(fullPlan);
  } catch (err) {
    next(err);
  }
});

// POST generate weekly detail for a single week
planRoutes.post('/:planId/weeks/:weekId/generate', coachOnly, async (req, res, next) => {
  try {
    const { planId, weekId } = req.params;

    // 1. Fetch the full plan with athlete data
    const fullPlan = await fetchFullPlan(req.supabase, planId);
    if (!fullPlan) return res.status(404).json({ message: 'Plan not found' });
    if (fullPlan.status !== 'draft') {
      return res.status(409).json({ message: 'Can only generate weeks for draft plans' });
    }

    // 2. Find the target week
    const targetWeek = fullPlan.plan_weeks?.find(w => w.id === weekId);
    if (!targetWeek) return res.status(404).json({ message: 'Week not found' });
    if (targetWeek.is_generated) {
      return res.status(409).json({ message: 'Week already generated. Use AI chat to adjust existing workouts.' });
    }

    const athlete = fullPlan.athletes;
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });

    // 3. Fetch monitoring data
    let monitoringData = null;
    try {
      monitoringData = await getAthleteMonitoringSummary(req.supabase, athlete.id);
    } catch (monErr) {
      console.warn('Could not fetch monitoring data:', monErr.message);
    }

    // 4. Build previous weeks summary
    const previousWeeksSummary = buildPreviousWeeksSummary(fullPlan.plan_weeks, targetWeek.week_number);

    // 4b. Red Flag Override Logic (PART 4 of methodology)
    const redFlags = checkRedFlags(monitoringData, previousWeeksSummary, athlete);
    let effectiveWeek = { ...targetWeek };

    if (redFlags.forceRecovery) {
      // Override phase to recovery variant
      const basePhase = effectiveWeek.phase?.replace('_recovery', '') || 'base';
      effectiveWeek.phase = `${basePhase}_recovery`;
      // Reduce km target
      if (redFlags.kmReduction > 0) {
        effectiveWeek.km_target = Math.round((effectiveWeek.km_target || 0) * (1 - redFlags.kmReduction));
      }
      console.log(`Red flags triggered recovery override: ${redFlags.warnings.length} warning(s), km reduced to ${effectiveWeek.km_target}`);
    }

    // 5. Build surrounding weeks context from macro plan
    const surrounding = (fullPlan.plan_weeks || [])
      .filter(w => Math.abs(w.week_number - targetWeek.week_number) <= 2 && w.week_number !== targetWeek.week_number)
      .map(w => ({ week_number: w.week_number, phase: w.phase, km_target: w.km_target, intensity: w.intensity }));

    // 6. Generate weekly detail via AI (pass red flag warnings into prompt)
    let weekDetail;
    try {
      weekDetail = await generateWeeklyDetail(
        athlete,
        athlete.profiles,
        {
          ...effectiveWeek,
          total_weeks: fullPlan.total_weeks,
          surrounding,
        },
        monitoringData,
        previousWeeksSummary,
        redFlags.warnings
      );
    } catch (aiErr) {
      const msg = aiErr.message || '';
      if (msg.includes('credit balance')) {
        return res.status(402).json({ message: 'Anthropic API credits exhausted. Please add credits at console.anthropic.com.' });
      }
      return res.status(500).json({ message: `AI generation failed: ${msg.substring(0, 150)}` });
    }

    // 7. Insert workouts — normalize day_of_week to lowercase string
    const workouts = weekDetail.workouts
      .map(w => {
        const normalizedDay = normalizeDayOfWeek(w.day_of_week);
        if (!normalizedDay) {
          console.warn(`Skipping workout "${w.title}": invalid day_of_week "${w.day_of_week}"`);
          return null;
        }
        const workoutDate = new Date(targetWeek.start_date);
        workoutDate.setDate(workoutDate.getDate() + dayOffset(normalizedDay));

        // Sanitize AI output — flatten objects in text columns, whitelist fields
        const safeFields = sanitizeWorkoutFields({
          workout_type: w.workout_type,
          title: w.title,
          description: w.description,
          distance_km: w.distance_km,
          duration_minutes: w.duration_minutes,
          pace_target_sec_km: w.pace_target_sec_km,
          pace_range_min: w.pace_range_min,
          pace_range_max: w.pace_range_max,
          hr_zone: w.hr_zone,
          intervals_detail: w.intervals_detail,
          coach_notes: w.coach_notes,
          session_structure: w.session_structure || null,
          rpe_target: w.rpe_target || null,
        });

        return {
          plan_week_id: weekId,
          athlete_id: athlete.id,
          day_of_week: normalizedDay,
          workout_date: workoutDate.toISOString().split('T')[0],
          ...safeFields,
        };
      })
      .filter(Boolean);

    // Insert with automatic retry on constraint violation
    let workoutsErr;
    const { error: insertErr } = await req.supabase
      .from('workouts')
      .insert(workouts);
    workoutsErr = insertErr;

    if (workoutsErr?.code === '23514') {
      console.warn(`Workout constraint violation (${workoutsErr.message}), retrying insert...`);
      const { error: retryErr } = await req.supabase
        .from('workouts')
        .insert(workouts);
      workoutsErr = retryErr;
    }

    if (workoutsErr) throw workoutsErr;

    // 8. Update week: mark as generated, set total_km, save week_summary + phase overrides
    const totalKm = workouts.reduce((sum, w) => sum + (parseFloat(w.distance_km) || 0), 0);
    const weekUpdate = {
      is_generated: true,
      total_km: Math.round(totalKm * 10) / 10,
    };
    // Save week_summary from AI response
    if (weekDetail.week_summary) {
      weekUpdate.notes = weekDetail.week_summary;
    }
    // If red flags forced a recovery override, persist the phase + km changes
    if (redFlags.forceRecovery) {
      weekUpdate.phase = effectiveWeek.phase;
      weekUpdate.km_target = effectiveWeek.km_target;
      weekUpdate.is_recovery = true;
      weekUpdate.intensity = intensityFromPhase(effectiveWeek.phase);
    }

    const { error: updateErr } = await req.supabase
      .from('plan_weeks')
      .update(weekUpdate)
      .eq('id', weekId);

    if (updateErr) throw updateErr;

    // 9. Return updated full plan
    const updatedPlan = await fetchFullPlan(req.supabase, planId);
    res.status(201).json(updatedPlan);
  } catch (err) {
    next(err);
  }
});

// GET a plan with all weeks and workouts
planRoutes.get('/:planId', async (req, res, next) => {
  try {
    const fullPlan = await fetchFullPlan(req.supabase, req.params.planId);
    if (!fullPlan) return res.status(404).json({ message: 'Plan not found' });
    res.json(fullPlan);
  } catch (err) {
    next(err);
  }
});

// POST approve a draft plan
planRoutes.post('/:planId/approve', coachOnly, async (req, res, next) => {
  try {
    const { planId } = req.params;

    const { data: plan, error: fetchErr } = await req.supabase
      .from('training_plans')
      .select('id, status')
      .eq('id', planId)
      .single();

    if (fetchErr || !plan) return res.status(404).json({ message: 'Plan not found' });
    if (plan.status !== 'draft') return res.status(409).json({ message: `Cannot approve a plan with status "${plan.status}". Only draft plans can be approved.` });

    const { error: updateErr } = await req.supabase
      .from('training_plans')
      .update({ status: 'approved' })
      .eq('id', planId);

    if (updateErr) throw updateErr;

    const fullPlan = await fetchFullPlan(req.supabase, planId);
    res.json(fullPlan);
  } catch (err) {
    next(err);
  }
});

// POST unpublish an approved plan (clone as archived, revert to draft)
planRoutes.post('/:planId/unpublish', coachOnly, async (req, res, next) => {
  try {
    const { planId } = req.params;

    const fullPlan = await fetchFullPlan(req.supabase, planId);
    if (!fullPlan) return res.status(404).json({ message: 'Plan not found' });
    if (fullPlan.status !== 'approved') return res.status(409).json({ message: 'Only approved plans can be unpublished' });

    // 1. Deep-clone the current plan as an archived version
    const { data: archivedPlan, error: cloneErr } = await req.supabase
      .from('training_plans')
      .insert({
        athlete_id: fullPlan.athlete_id,
        name: fullPlan.name,
        goal_race: fullPlan.goal_race,
        goal_time_seconds: fullPlan.goal_time_seconds,
        race_date: fullPlan.race_date,
        total_weeks: fullPlan.total_weeks,
        ai_model: fullPlan.ai_model,
        status: 'archived',
        parent_plan_id: planId,
        version: fullPlan.version,
      })
      .select()
      .single();

    if (cloneErr) throw cloneErr;

    // 2. Clone weeks and workouts
    for (const week of fullPlan.plan_weeks || []) {
      const { data: clonedWeek, error: weekErr } = await req.supabase
        .from('plan_weeks')
        .insert({
          plan_id: archivedPlan.id,
          week_number: week.week_number,
          phase: week.phase,
          total_km: week.total_km,
          km_target: week.km_target,
          intensity: week.intensity,
          is_generated: week.is_generated,
          is_recovery: week.is_recovery || false,
          start_date: week.start_date,
          notes: week.notes,
        })
        .select()
        .single();

      if (weekErr) throw weekErr;

      if (week.workouts?.length > 0) {
        const clonedWorkouts = week.workouts.map(w => ({
          plan_week_id: clonedWeek.id,
          athlete_id: fullPlan.athlete_id,
          day_of_week: w.day_of_week,
          workout_date: w.workout_date,
          workout_type: w.workout_type,
          title: w.title,
          description: w.description,
          distance_km: w.distance_km,
          duration_minutes: w.duration_minutes,
          pace_target_sec_km: w.pace_target_sec_km,
          pace_range_min: w.pace_range_min,
          pace_range_max: w.pace_range_max,
          hr_zone: w.hr_zone,
          intervals_detail: w.intervals_detail,
          coach_notes: w.coach_notes,
          session_structure: w.session_structure || null,
          rpe_target: w.rpe_target || null,
        }));

        const { error: workoutsErr } = await req.supabase
          .from('workouts')
          .insert(clonedWorkouts);

        if (workoutsErr) throw workoutsErr;
      }
    }

    // 3. Set original plan back to draft, increment version
    const { error: revertErr } = await req.supabase
      .from('training_plans')
      .update({ status: 'draft', version: (fullPlan.version || 1) + 1 })
      .eq('id', planId);

    if (revertErr) throw revertErr;

    const updatedPlan = await fetchFullPlan(req.supabase, planId);
    res.json(updatedPlan);
  } catch (err) {
    next(err);
  }
});

// POST apply AI-suggested adjustments to a draft plan
// Supports both week-level (week_id → plan_weeks) and workout-level (workout_id → workouts) adjustments
planRoutes.post('/:planId/apply-adjustments', coachOnly, async (req, res, next) => {
  try {
    const { planId } = req.params;
    const { adjustments } = req.body;

    if (!adjustments || !Array.isArray(adjustments) || adjustments.length === 0) {
      return res.status(400).json({ message: 'adjustments array is required' });
    }

    // Verify plan is draft
    const { data: plan, error: fetchErr } = await req.supabase
      .from('training_plans')
      .select('id, status')
      .eq('id', planId)
      .single();

    if (fetchErr || !plan) return res.status(404).json({ message: 'Plan not found' });
    if (plan.status !== 'draft') return res.status(409).json({ message: 'Can only adjust draft plans' });

    const VALID_WEEK_FIELDS = ['km_target', 'phase', 'intensity', 'notes'];
    const affectedWeekIds = new Set();

    for (const adj of adjustments) {
      if (!adj.changes) continue;

      // Week-level adjustment (skeleton weeks)
      if (adj.week_id) {
        const weekChanges = {};
        for (const [key, val] of Object.entries(adj.changes)) {
          if (VALID_WEEK_FIELDS.includes(key)) weekChanges[key] = val;
        }
        if (Object.keys(weekChanges).length === 0) continue;

        const { error: updateErr } = await req.supabase
          .from('plan_weeks')
          .update(weekChanges)
          .eq('id', adj.week_id)
          .eq('plan_id', planId);

        if (updateErr) throw updateErr;
      }
      // Workout-level adjustment (generated weeks)
      else if (adj.workout_id) {
        const { data: workout } = await req.supabase
          .from('workouts')
          .select('plan_week_id')
          .eq('id', adj.workout_id)
          .single();

        if (workout) affectedWeekIds.add(workout.plan_week_id);

        // Sanitize: whitelist fields + flatten nested objects in non-JSONB columns
        const safeChanges = sanitizeWorkoutFields(adj.changes);
        if (Object.keys(safeChanges).length === 0) continue;

        const { error: updateErr } = await req.supabase
          .from('workouts')
          .update(safeChanges)
          .eq('id', adj.workout_id);

        if (updateErr) throw updateErr;
      }
    }

    // Recalculate total_km for affected weeks (workout-level changes only)
    for (const weekId of affectedWeekIds) {
      const { data: weekWorkouts } = await req.supabase
        .from('workouts')
        .select('distance_km')
        .eq('plan_week_id', weekId);

      const totalKm = (weekWorkouts || []).reduce(
        (sum, w) => sum + (parseFloat(w.distance_km) || 0), 0
      );

      await req.supabase
        .from('plan_weeks')
        .update({ total_km: Math.round(totalKm * 10) / 10 })
        .eq('id', weekId);
    }

    const fullPlan = await fetchFullPlan(req.supabase, planId);
    res.json(fullPlan);
  } catch (err) {
    next(err);
  }
});

// GET version history for a plan
planRoutes.get('/:planId/versions', coachOnly, async (req, res, next) => {
  try {
    const { planId } = req.params;

    const { data, error } = await req.supabase
      .from('training_plans')
      .select('id, version, status, created_at, updated_at, name')
      .or(`id.eq.${planId},parent_plan_id.eq.${planId}`)
      .order('version', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// DELETE a draft plan (cascades to weeks → workouts → feedback)
planRoutes.delete('/:planId', coachOnly, async (req, res, next) => {
  try {
    const { planId } = req.params;

    const { data: plan, error: fetchErr } = await req.supabase
      .from('training_plans')
      .select('id, status')
      .eq('id', planId)
      .single();

    if (fetchErr || !plan) return res.status(404).json({ message: 'Plan not found' });
    if (plan.status !== 'draft') {
      return res.status(409).json({ message: 'Only draft plans can be deleted. Unpublish the plan first.' });
    }

    const { error: deleteErr } = await req.supabase
      .from('training_plans')
      .delete()
      .eq('id', planId);

    if (deleteErr) throw deleteErr;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE a single week from a draft plan (cascades to workouts)
planRoutes.delete('/:planId/weeks/:weekId', coachOnly, async (req, res, next) => {
  try {
    const { planId, weekId } = req.params;

    const fullPlan = await fetchFullPlan(req.supabase, planId);
    if (!fullPlan) return res.status(404).json({ message: 'Plan not found' });
    if (fullPlan.status !== 'draft') {
      return res.status(409).json({ message: 'Can only delete weeks from draft plans' });
    }

    const weeks = fullPlan.plan_weeks || [];
    const targetWeek = weeks.find(w => w.id === weekId);
    if (!targetWeek) return res.status(404).json({ message: 'Week not found in this plan' });

    if (weeks.length <= 1) {
      return res.status(400).json({ message: 'Cannot delete the last week. Delete the entire plan instead.' });
    }

    // Delete the week (CASCADE removes workouts)
    const { error: deleteErr } = await req.supabase
      .from('plan_weeks')
      .delete()
      .eq('id', weekId);

    if (deleteErr) throw deleteErr;

    // Renumber remaining weeks and recalculate start_dates
    const remaining = weeks
      .filter(w => w.id !== weekId)
      .sort((a, b) => a.week_number - b.week_number);

    const planStart = remaining[0]?.start_date
      ? new Date(remaining[0].start_date)
      : getMonday(new Date());

    for (let i = 0; i < remaining.length; i++) {
      const newNum = i + 1;
      const newStart = new Date(planStart);
      newStart.setDate(newStart.getDate() + i * 7);

      await req.supabase
        .from('plan_weeks')
        .update({
          week_number: newNum,
          start_date: newStart.toISOString().split('T')[0],
        })
        .eq('id', remaining[i].id);
    }

    // Update total_weeks on the plan
    await req.supabase
      .from('training_plans')
      .update({ total_weeks: remaining.length })
      .eq('id', planId);

    const updatedPlan = await fetchFullPlan(req.supabase, planId);
    res.json(updatedPlan);
  } catch (err) {
    next(err);
  }
});

// GET all plans for an athlete
planRoutes.get('/athlete/:athleteId', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('training_plans')
      .select('*')
      .eq('athlete_id', req.params.athleteId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

async function fetchFullPlan(supabase, planId) {
  const { data: plan, error } = await supabase
    .from('training_plans')
    .select(`
      *,
      athletes(*, profiles(full_name, email)),
      plan_weeks(
        *,
        workouts(*)
      )
    `)
    .eq('id', planId)
    .single();

  if (error) return null;

  // Sort weeks and workouts
  if (plan?.plan_weeks) {
    plan.plan_weeks.sort((a, b) => a.week_number - b.week_number);
    for (const week of plan.plan_weeks) {
      if (week.workouts) {
        week.workouts.sort((a, b) => dayOffset(a.day_of_week) - dayOffset(b.day_of_week));
      }
    }
  }

  return plan;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Estimate VDOT from HM pace (sec/km) using the altitude-adjusted pace table
 * Returns the closest VDOT value from the appendix
 */
function estimateVdotFromHmPace(paceSecKm) {
  const table = [
    { vdot: 25, hmPace: 450 }, // 7:30
    { vdot: 30, hmPace: 400 }, // 6:40
    { vdot: 35, hmPace: 360 }, // 6:00
    { vdot: 40, hmPace: 330 }, // 5:30
    { vdot: 45, hmPace: 306 }, // 5:06
    { vdot: 50, hmPace: 287 }, // 4:47
    { vdot: 55, hmPace: 272 }, // 4:32
    { vdot: 60, hmPace: 258 }, // 4:18
  ];

  // Find the closest match
  let closest = table[0];
  let minDiff = Math.abs(paceSecKm - table[0].hmPace);
  for (const row of table) {
    const diff = Math.abs(paceSecKm - row.hmPace);
    if (diff < minDiff) {
      minDiff = diff;
      closest = row;
    }
  }
  return closest.vdot;
}

/**
 * Build a compact summary of previously generated weeks for AI context
 */
function buildPreviousWeeksSummary(planWeeks, currentWeekNumber) {
  return (planWeeks || [])
    .filter(w => w.week_number < currentWeekNumber && w.is_generated)
    .map(w => {
      const plannedKm = w.km_target || 0;
      const actualKm = w.total_km || 0;
      const workouts = w.workouts || [];
      const completed = workouts.filter(wo => wo.status === 'completed').length;
      const total = workouts.filter(wo => wo.workout_type !== 'rest').length;
      return {
        week_number: w.week_number,
        phase: w.phase,
        km_target: plannedKm,
        actual_km: actualKm,
        compliance: total > 0 ? Math.round((completed / total) * 100) : null,
      };
    });
}
