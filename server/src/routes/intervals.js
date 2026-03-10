import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';

export const intervalsRoutes = Router();

const INTERVALS_BASE = process.env.INTERVALS_ICU_BASE_URL || 'https://intervals.icu/api/v1';

/**
 * Push workouts from a plan to Intervals.icu calendar
 */
intervalsRoutes.post('/push/:athleteId/:planId', coachOnly, async (req, res, next) => {
  try {
    const { athleteId, planId } = req.params;

    // Get athlete with Intervals.icu credentials
    const { data: athlete } = await req.supabase
      .from('athletes')
      .select('intervals_icu_api_key, intervals_icu_athlete_id')
      .eq('id', athleteId)
      .single();

    if (!athlete?.intervals_icu_api_key || !athlete?.intervals_icu_athlete_id) {
      return res.status(400).json({ message: 'Athlete has no Intervals.icu credentials configured' });
    }

    // Get all workouts for the plan
    const { data: workouts } = await req.supabase
      .from('workouts')
      .select('*, plan_weeks!inner(plan_id)')
      .eq('plan_weeks.plan_id', planId)
      .neq('workout_type', 'rest')
      .order('workout_date');

    if (!workouts?.length) {
      return res.status(400).json({ message: 'No workouts to sync' });
    }

    const authHeader = 'Basic ' + Buffer.from(`API_KEY:${athlete.intervals_icu_api_key}`).toString('base64');
    const icuAthleteId = athlete.intervals_icu_athlete_id;
    const results = [];

    for (const workout of workouts) {
      const icuEvent = {
        start_date_local: workout.workout_date,
        type: 'Run',
        category: mapWorkoutType(workout.workout_type),
        name: workout.title,
        description: buildDescription(workout),
        moving_time: workout.duration_minutes ? workout.duration_minutes * 60 : undefined,
        distance: workout.distance_km ? workout.distance_km * 1000 : undefined,
      };

      try {
        const icuRes = await fetch(
          `${INTERVALS_BASE}/athlete/${icuAthleteId}/events`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
            },
            body: JSON.stringify(icuEvent),
          }
        );

        if (icuRes.ok) {
          const icuData = await icuRes.json();
          results.push({ workout_id: workout.id, icu_id: icuData.id, status: 'ok' });
        } else {
          const errText = await icuRes.text();
          results.push({ workout_id: workout.id, status: 'error', error: errText });
        }
      } catch (err) {
        results.push({ workout_id: workout.id, status: 'error', error: err.message });
      }
    }

    res.json({ synced: results.filter(r => r.status === 'ok').length, total: workouts.length, results });
  } catch (err) {
    next(err);
  }
});

/**
 * Pull completed activities from Intervals.icu
 */
intervalsRoutes.post('/pull/:athleteId', coachOnly, async (req, res, next) => {
  try {
    const { athleteId } = req.params;

    const { data: athlete } = await req.supabase
      .from('athletes')
      .select('intervals_icu_api_key, intervals_icu_athlete_id')
      .eq('id', athleteId)
      .single();

    if (!athlete?.intervals_icu_api_key || !athlete?.intervals_icu_athlete_id) {
      return res.status(400).json({ message: 'Athlete has no Intervals.icu credentials configured' });
    }

    const authHeader = 'Basic ' + Buffer.from(`API_KEY:${athlete.intervals_icu_api_key}`).toString('base64');
    const icuAthleteId = athlete.intervals_icu_athlete_id;

    // Fetch recent activities (last 30 days)
    const oldest = new Date();
    oldest.setDate(oldest.getDate() - 30);
    const oldestStr = oldest.toISOString().split('T')[0];
    const newestStr = new Date().toISOString().split('T')[0];

    const icuRes = await fetch(
      `${INTERVALS_BASE}/athlete/${icuAthleteId}/activities?oldest=${oldestStr}&newest=${newestStr}`,
      { headers: { Authorization: authHeader } }
    );

    if (!icuRes.ok) {
      return res.status(502).json({ message: 'Failed to fetch from Intervals.icu' });
    }

    const activities = await icuRes.json();
    let matched = 0;

    for (const activity of activities) {
      if (activity.type !== 'Run') continue;

      const activityDate = activity.start_date_local?.split('T')[0];
      if (!activityDate) continue;

      // Find matching planned workout
      const { data: workout } = await req.supabase
        .from('workouts')
        .select('id')
        .eq('athlete_id', athleteId)
        .eq('workout_date', activityDate)
        .neq('workout_type', 'rest')
        .maybeSingle();

      if (workout) {
        await req.supabase
          .from('workouts')
          .update({
            status: 'completed',
            actual_distance_km: activity.distance ? activity.distance / 1000 : null,
            actual_duration_minutes: activity.moving_time ? Math.round(activity.moving_time / 60) : null,
            actual_avg_pace: activity.average_speed ? Math.round(1000 / (activity.average_speed / 60)) : null,
            actual_avg_hr: activity.average_heartrate || null,
            intervals_icu_activity_id: String(activity.id),
          })
          .eq('id', workout.id);

        matched++;
      }
    }

    res.json({ activities_found: activities.length, workouts_matched: matched });
  } catch (err) {
    next(err);
  }
});

function mapWorkoutType(type) {
  const map = {
    easy: 'EASY',
    tempo: 'TEMPO',
    long_run: 'LONG',
    intervals: 'INTERVALS',
    race_pace: 'RACE_PACE',
    recovery: 'RECOVERY',
    cross_training: 'OTHER',
    race: 'RACE',
  };
  return map[type] || 'WORKOUT';
}

function buildDescription(workout) {
  const parts = [];
  if (workout.description) parts.push(workout.description);
  if (workout.distance_km) parts.push(`Distance: ${workout.distance_km}km`);
  if (workout.pace_range_min && workout.pace_range_max) {
    const minPace = formatPaceSimple(workout.pace_range_min);
    const maxPace = formatPaceSimple(workout.pace_range_max);
    parts.push(`Pace: ${minPace} - ${maxPace} /km`);
  }
  if (workout.hr_zone) parts.push(`HR Zone: ${workout.hr_zone}`);
  if (workout.coach_notes) parts.push(`Coach: ${workout.coach_notes}`);
  return parts.join('\n');
}

function formatPaceSimple(secPerKm) {
  if (!secPerKm) return '--:--';
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
