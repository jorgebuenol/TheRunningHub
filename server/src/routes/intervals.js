import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';
import { syncIntervalsIcuActivities } from '../services/intervalsSync.js';
import { pushWorkoutToIntervals, pushPlanWorkouts, IntervalsPushError } from '../services/intervalsPush.js';

export const intervalsRoutes = Router();

const INTERVALS_BASE = process.env.INTERVALS_ICU_BASE_URL || 'https://intervals.icu/api/v1';

/**
 * Pull last 7 days of Intervals.icu activities and write actuals onto the
 * matching plan workouts. Athlete-or-coach can trigger.
 */
intervalsRoutes.get('/sync/:athleteId', async (req, res, next) => {
  try {
    const result = await syncIntervalsIcuActivities(req.supabase, req.params.athleteId, { daysBack: 7 });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

/**
 * Verify a candidate (api_key, athlete_id) pair against Intervals.icu and,
 * on success, save them to the athletes table. Returns the athlete name as
 * reported by Intervals.icu so the UI can confirm the right account was linked.
 */
intervalsRoutes.post('/connect/:athleteId', async (req, res, next) => {
  try {
    const { athleteId } = req.params;
    const { api_key, athlete_id: icuAthleteId } = req.body || {};

    if (!api_key || !icuAthleteId) {
      return res.status(400).json({ message: 'API key and Athlete ID are required' });
    }

    const profile = await fetchIntervalsAthleteProfile(api_key, icuAthleteId);
    if (!profile) {
      return res.status(400).json({ message: 'Could not connect — check your credentials' });
    }

    const { error } = await req.supabase
      .from('athletes')
      .update({
        intervals_icu_api_key: api_key,
        intervals_icu_athlete_id: icuAthleteId,
      })
      .eq('id', athleteId);

    if (error) {
      console.error('Failed to save Intervals.icu credentials:', error);
      return res.status(500).json({ message: 'Failed to save credentials' });
    }

    res.json({ success: true, athlete_name: extractAthleteName(profile, icuAthleteId) });
  } catch (err) {
    next(err);
  }
});

/**
 * Connection status for the profile UI. Reports whether credentials are stored
 * and (if so) the live athlete name from Intervals.icu so the UI can render
 * "Connected ✓ <name>". `valid: false` means stored creds no longer authenticate
 * — the UI can show a "reconnect" prompt.
 */
intervalsRoutes.get('/status/:athleteId', async (req, res, next) => {
  try {
    const { data: athlete } = await req.supabase
      .from('athletes')
      .select('intervals_icu_api_key, intervals_icu_athlete_id')
      .eq('id', req.params.athleteId)
      .single();

    if (!athlete?.intervals_icu_api_key || !athlete?.intervals_icu_athlete_id) {
      return res.json({ connected: false });
    }

    const profile = await fetchIntervalsAthleteProfile(
      athlete.intervals_icu_api_key,
      athlete.intervals_icu_athlete_id,
    );

    if (!profile) {
      return res.json({
        connected: true,
        valid: false,
        athlete_id: athlete.intervals_icu_athlete_id,
      });
    }

    res.json({
      connected: true,
      valid: true,
      athlete_id: athlete.intervals_icu_athlete_id,
      athlete_name: extractAthleteName(profile, athlete.intervals_icu_athlete_id),
    });
  } catch (err) {
    next(err);
  }
});

async function fetchIntervalsAthleteProfile(apiKey, icuAthleteId) {
  const authHeader = 'Basic ' + Buffer.from(`API_KEY:${apiKey}`).toString('base64');
  try {
    const r = await fetch(`${INTERVALS_BASE}/athlete/${icuAthleteId}`, {
      headers: { Authorization: authHeader },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (err) {
    console.error('Intervals.icu profile fetch failed:', err.message);
    return null;
  }
}

function extractAthleteName(profile, fallback) {
  if (!profile) return fallback;
  if (profile.name) return profile.name;
  const first = profile.firstname || profile.first_name;
  const last = profile.lastname || profile.last_name;
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return fallback;
}

/**
 * Push a single workout to the athlete's Intervals.icu calendar so it syncs to Garmin.
 * Verifies threshold pace is configured first; if missing, returns 412 with the
 * exact error string the UI displays.
 */
intervalsRoutes.post('/push-workout/:workoutId', coachOnly, async (req, res, next) => {
  try {
    const result = await pushWorkoutToIntervals(req.supabase, req.params.workoutId);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    if (err instanceof IntervalsPushError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Push every non-rest workout in a plan. Used by the calendar's "Sync Plan to
 * Garmin" button. Verifies threshold pace once before iterating.
 */
intervalsRoutes.post('/push-plan/:planId', coachOnly, async (req, res, next) => {
  try {
    const result = await pushPlanWorkouts(req.supabase, req.params.planId);
    res.json(result);
  } catch (err) {
    if (err instanceof IntervalsPushError) {
      return res.status(err.status).json({ message: err.message });
    }
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

