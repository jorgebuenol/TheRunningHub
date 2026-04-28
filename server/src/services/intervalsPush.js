/**
 * Push planned workouts from the RunHub plan onto an athlete's Intervals.icu
 * calendar so they sync down to Garmin Connect.
 *
 * Used by:
 *  - POST /api/intervals/push-workout/:workoutId  (manual "Sync to Garmin")
 *  - POST /api/plans/:planId/approve              (auto-push on approval, non-blocking)
 *
 * Threshold pace is required on the Intervals.icu side: without it, Intervals.icu
 * cannot translate our pace targets into Garmin-compatible workout steps. We
 * verify it before every push and surface a clear error to the coach.
 */

const INTERVALS_BASE = process.env.INTERVALS_ICU_BASE_URL || 'https://intervals.icu/api/v1';

const THRESHOLD_PACE_ERROR =
  'Athlete needs to configure Threshold Pace in Intervals.icu Settings → Run before workouts can sync to Garmin.';

export class IntervalsPushError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function authHeaderFor(apiKey) {
  return 'Basic ' + Buffer.from(`API_KEY:${apiKey}`).toString('base64');
}

/**
 * Resolve the athlete's Intervals.icu threshold pace (any non-null value counts).
 * Returns the raw value found, or null if missing. Intervals.icu surfaces this
 * field under several names depending on account vintage, so we check each.
 */
async function fetchThresholdPace(apiKey, icuAthleteId) {
  const res = await fetch(`${INTERVALS_BASE}/athlete/${icuAthleteId}`, {
    headers: { Authorization: authHeaderFor(apiKey) },
  });
  if (!res.ok) return null;
  const profile = await res.json();

  const direct =
    profile?.icu_threshold_pace ??
    profile?.threshold_pace ??
    profile?.pace_threshold ??
    profile?.icu_pace_threshold;
  if (direct) return direct;

  const settings = profile?.sportSettings || profile?.sport_settings;
  if (Array.isArray(settings)) {
    const run = settings.find(s => {
      const types = s?.types || [];
      return (
        (Array.isArray(types) && types.includes('Run')) ||
        s?.activity_type === 'Run' ||
        s?.sport === 'Run'
      );
    });
    const pace =
      run?.threshold_pace ??
      run?.pace_threshold ??
      run?.icu_threshold_pace ??
      (Array.isArray(run?.pace_thresholds) ? run.pace_thresholds[2] : null);
    if (pace) return pace;
  }
  return null;
}

function formatPace(secPerKm) {
  if (!secPerKm) return null;
  const total = Math.round(secPerKm);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function midpoint(min, max) {
  if (min && max) return Math.round((min + max) / 2);
  return min || max || null;
}

/**
 * Build the Intervals.icu event description text per the spec.
 * Interval workouts get a multi-line "warm-up / NxRep / cool-down" block.
 * Other workouts get a single targets line.
 */
export function buildEventDescription(workout) {
  if (workout.workout_type === 'intervals' && workout.intervals_detail) {
    return buildIntervalDescription(workout);
  }

  const pace = formatPace(workout.pace_target_sec_km || midpoint(workout.pace_range_min, workout.pace_range_max));

  if (workout.target_type === 'hr' && workout.hr_target_min && workout.hr_target_max) {
    const km = workout.distance_km;
    if (km) return `- ${km}km ${workout.hr_target_min}-${workout.hr_target_max} HR`;
    if (workout.duration_minutes) {
      return `- ${workout.duration_minutes}m ${workout.hr_target_min}-${workout.hr_target_max} HR`;
    }
  }

  // Time-based (no distance) — emit duration line. Treat as the spec's "time" target.
  if (!workout.distance_km && workout.duration_minutes) {
    return pace
      ? `- ${workout.duration_minutes}m ${pace}/km Pace`
      : `- ${workout.duration_minutes}m Easy`;
  }

  if (workout.distance_km) {
    return pace
      ? `- ${workout.distance_km}km ${pace}/km Pace`
      : `- ${workout.distance_km}km Easy`;
  }

  return workout.description || workout.title || '';
}

function buildIntervalDescription(workout) {
  const intv = workout.intervals_detail || {};
  const reps = Number(intv.reps) || 0;
  const distanceKm = intv.distance_m ? Number(intv.distance_m) / 1000 : null;
  const intervalPace = formatPace(intv.pace_sec_km);
  const recoveryMin = intv.rest_seconds ? Math.round(intv.rest_seconds / 60) : null;

  const lines = ['- 10m Easy'];
  if (reps > 0 && distanceKm && intervalPace) {
    lines.push(`${reps}x`);
    lines.push(`- ${distanceKm}km ${intervalPace}/km Pace`);
    if (recoveryMin) lines.push(`- ${recoveryMin}m Easy`);
  }
  lines.push('- 10m Easy');
  return lines.join('\n');
}

/**
 * Push a single workout. Throws IntervalsPushError on credential / threshold-pace
 * problems and on Intervals.icu API failures so callers can map status codes.
 *
 * Returns { workout_id, icu_event_id }. The workouts row is updated with the
 * event ID and synced_to_intervals_at on success.
 */
export async function pushWorkoutToIntervals(supabase, workoutId) {
  const { data: workout, error: wErr } = await supabase
    .from('workouts')
    .select('*, athletes!inner(id, intervals_icu_api_key, intervals_icu_athlete_id)')
    .eq('id', workoutId)
    .single();

  if (wErr || !workout) throw new IntervalsPushError('Workout not found', 404);
  if (workout.workout_type === 'rest') {
    throw new IntervalsPushError('Cannot sync a rest day', 400);
  }

  const athlete = workout.athletes;
  if (!athlete?.intervals_icu_api_key || !athlete?.intervals_icu_athlete_id) {
    throw new IntervalsPushError('Athlete has no Intervals.icu credentials configured', 400);
  }

  const thresholdPace = await fetchThresholdPace(
    athlete.intervals_icu_api_key,
    athlete.intervals_icu_athlete_id,
  );
  if (!thresholdPace) {
    throw new IntervalsPushError(THRESHOLD_PACE_ERROR, 412);
  }

  const payload = {
    category: 'WORKOUT',
    start_date_local: `${workout.workout_date}T00:00:00`,
    type: 'Run',
    name: workout.title,
    description: buildEventDescription(workout),
    moving_time: workout.duration_minutes ? workout.duration_minutes * 60 : undefined,
    workout_doc: {},
  };

  const res = await fetch(
    `${INTERVALS_BASE}/athlete/${athlete.intervals_icu_athlete_id}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderFor(athlete.intervals_icu_api_key),
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new IntervalsPushError(
      `Intervals.icu rejected the workout: ${text.slice(0, 200)}`,
      502,
    );
  }

  const event = await res.json();
  const eventId = event?.id != null ? String(event.id) : null;

  await supabase
    .from('workouts')
    .update({
      intervals_icu_event_id: eventId,
      synced_to_intervals_at: new Date().toISOString(),
    })
    .eq('id', workoutId);

  return { workout_id: workoutId, icu_event_id: eventId };
}

/**
 * Push every non-rest workout for a plan. Used by the auto-push on approval.
 * Best-effort: returns per-workout results. Callers decide how to surface errors.
 */
export async function pushPlanWorkouts(supabase, planId) {
  const { data: workouts } = await supabase
    .from('workouts')
    .select('id, plan_weeks!inner(plan_id)')
    .eq('plan_weeks.plan_id', planId)
    .neq('workout_type', 'rest');

  const ids = (workouts || []).map(w => w.id);
  const results = [];
  for (const id of ids) {
    try {
      const r = await pushWorkoutToIntervals(supabase, id);
      results.push({ ...r, status: 'ok' });
    } catch (err) {
      results.push({ workout_id: id, status: 'error', error: err.message });
    }
  }
  return results;
}
