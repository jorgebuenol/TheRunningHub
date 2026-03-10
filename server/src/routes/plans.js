import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';
import { generateTrainingPlan } from '../services/planGenerator.js';
import { addDays, startOfWeek } from '../utils/dates.js';
import { isOnboardingComplete, getMissingSections } from '../utils/onboardingProgress.js';

export const planRoutes = Router();

// POST generate a new plan for an athlete
planRoutes.post('/generate/:athleteId', coachOnly, async (req, res, next) => {
  try {
    const { athleteId } = req.params;

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

    // Generate plan with AI
    let aiPlan;
    try {
      aiPlan = await generateTrainingPlan(athlete, athlete.profiles);
    } catch (aiErr) {
      const msg = aiErr.message || '';
      if (msg.includes('credit balance')) {
        return res.status(402).json({ message: 'Anthropic API credits exhausted. Please add credits at console.anthropic.com.' });
      }
      return res.status(500).json({ message: `AI generation failed: ${msg.substring(0, 150)}` });
    }

    const weeksToRace = Math.ceil(
      (new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000)
    );

    // Create the training plan record
    const { data: plan, error: planErr } = await req.supabase
      .from('training_plans')
      .insert({
        athlete_id: athleteId,
        name: `${athlete.goal_race} Plan — ${athlete.profiles.full_name}`,
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

    // Insert weeks and workouts
    for (const week of aiPlan.weeks) {
      const { data: planWeek, error: weekErr } = await req.supabase
        .from('plan_weeks')
        .insert({
          plan_id: plan.id,
          week_number: week.week_number,
          phase: week.phase,
          total_km: week.total_km,
          notes: week.notes,
        })
        .select()
        .single();

      if (weekErr) throw weekErr;

      // Insert workouts for this week
      if (week.workouts?.length > 0) {
        const workouts = week.workouts.map(w => {
          const weekStart = new Date(planStart);
          weekStart.setDate(weekStart.getDate() + (week.week_number - 1) * 7);
          const workoutDate = new Date(weekStart);
          workoutDate.setDate(workoutDate.getDate() + w.day_of_week);

          return {
            plan_week_id: planWeek.id,
            athlete_id: athleteId,
            day_of_week: w.day_of_week,
            workout_date: workoutDate.toISOString().split('T')[0],
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
          };
        });

        const { error: workoutsErr } = await req.supabase
          .from('workouts')
          .insert(workouts);

        if (workoutsErr) throw workoutsErr;
      }
    }

    // Return the full plan
    const fullPlan = await fetchFullPlan(req.supabase, plan.id);
    res.status(201).json(fullPlan);
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

    // Apply each adjustment
    const affectedWeekIds = new Set();
    for (const adj of adjustments) {
      if (!adj.workout_id || !adj.changes) continue;

      // Get the workout to find its week
      const { data: workout } = await req.supabase
        .from('workouts')
        .select('plan_week_id')
        .eq('id', adj.workout_id)
        .single();

      if (workout) affectedWeekIds.add(workout.plan_week_id);

      const { error: updateErr } = await req.supabase
        .from('workouts')
        .update(adj.changes)
        .eq('id', adj.workout_id);

      if (updateErr) throw updateErr;
    }

    // Recalculate total_km for affected weeks
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
        week.workouts.sort((a, b) => a.day_of_week - b.day_of_week);
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
