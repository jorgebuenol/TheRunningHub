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

// Conservative batch size for the bulk events endpoint. ICU doesn't publish a
// hard limit; 50 keeps each request small and bounds the blast radius on retry.
const BULK_CHUNK_SIZE = 50;

function buildEventPayload(workout) {
  return {
    external_id: workout.id,
    category: 'WORKOUT',
    start_date_local: `${workout.workout_date}T00:00:00`,
    type: 'Run',
    name: workout.title,
    description: buildEventDescription(workout),
    moving_time: workout.duration_minutes ? workout.duration_minutes * 60 : undefined,
    workout_doc: {},
  };
}

/**
 * Upsert a batch of events on ICU using `external_id = workout.id` as the dedupe
 * key. Same external_id POSTed again updates in place; date change moves the
 * event (verified empirically — see server/scripts/probe-intervals-icu.js).
 */
async function bulkUpsertEvents(athlete, workouts) {
  if (!workouts.length) return [];

  const url = `${INTERVALS_BASE}/athlete/${athlete.intervals_icu_athlete_id}/events/bulk?upsert=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeaderFor(athlete.intervals_icu_api_key),
    },
    body: JSON.stringify(workouts.map(buildEventPayload)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new IntervalsPushError(
      `Intervals.icu rejected the workouts: ${text.slice(0, 200)}`,
      502,
    );
  }

  const events = await res.json();
  return Array.isArray(events) ? events : [];
}

async function persistSyncedEventIds(supabase, workouts, events) {
  // Bulk response carries external_id per event; map back so we can record the
  // ICU id on each workout row (kept for audit only — dedupe lives on ICU now).
  const byExternalId = new Map();
  for (const e of events) {
    if (e?.external_id != null) byExternalId.set(String(e.external_id), e);
  }
  const syncedAt = new Date().toISOString();
  const results = [];

  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i];
    const matched = byExternalId.get(String(w.id)) ?? events[i];
    const eventId = matched?.id != null ? String(matched.id) : null;

    await supabase
      .from('workouts')
      .update({
        intervals_icu_event_id: eventId,
        synced_to_intervals_at: syncedAt,
      })
      .eq('id', w.id);

    results.push({ workout_id: w.id, icu_event_id: eventId });
  }
  return results;
}

async function pushBatch(supabase, workouts, athlete) {
  const events = await bulkUpsertEvents(athlete, workouts);
  return persistSyncedEventIds(supabase, workouts, events);
}

/**
 * Delete ICU events by external_id. No-op if athlete has no creds or the list
 * is empty — used from cascade-delete paths where the local rows are about to
 * disappear and we want the calendar to follow.
 */
async function bulkDeleteEvents(athlete, externalIds) {
  if (!externalIds.length) return;
  const url = `${INTERVALS_BASE}/athlete/${athlete.intervals_icu_athlete_id}/events/bulk-delete`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeaderFor(athlete.intervals_icu_api_key),
    },
    body: JSON.stringify(externalIds.map(id => ({ external_id: id }))),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new IntervalsPushError(
      `Intervals.icu rejected the delete: ${text.slice(0, 200)}`,
      502,
    );
  }
}

/**
 * Push a single workout. Verifies credentials and threshold pace before posting.
 * Throws IntervalsPushError on validation / API failures so callers can map status.
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

  console.log('[intervals.push]', { athleteId: athlete.id, workoutCount: 1, upsert: true });
  const [result] = await pushBatch(supabase, [workout], athlete);
  return result;
}

/**
 * Push every non-rest workout for a plan. Verifies threshold pace once at the
 * plan level (instead of per-workout) and short-circuits if it's missing —
 * the coach gets a single clear 412 instead of N identical errors.
 *
 * Upserts via /events/bulk?upsert=true keyed on `external_id = workout.id`, so
 * repeated calls and added weeks no longer duplicate. Chunked at BULK_CHUNK_SIZE
 * to keep request payloads bounded.
 */
export async function pushPlanWorkouts(supabase, planId) {
  const { data: athleteRows } = await supabase
    .from('training_plans')
    .select('athletes!inner(id, intervals_icu_api_key, intervals_icu_athlete_id)')
    .eq('id', planId)
    .single();

  const athlete = athleteRows?.athletes;
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

  const { data: workouts } = await supabase
    .from('workouts')
    .select('*, plan_weeks!inner(plan_id)')
    .eq('plan_weeks.plan_id', planId)
    .neq('workout_type', 'rest')
    .order('workout_date');

  const list = workouts || [];
  console.log('[intervals.push]', { athleteId: athlete.id, workoutCount: list.length, upsert: true });

  const results = [];
  for (let i = 0; i < list.length; i += BULK_CHUNK_SIZE) {
    const chunk = list.slice(i, i + BULK_CHUNK_SIZE);
    try {
      const chunkResults = await pushBatch(supabase, chunk, athlete);
      for (const r of chunkResults) results.push({ ...r, status: 'ok' });
    } catch (err) {
      for (const w of chunk) {
        results.push({ workout_id: w.id, status: 'error', error: err.message });
      }
    }
  }
  const synced = results.filter(r => r.status === 'ok').length;
  return { synced, total: results.length, results };
}

/**
 * Remove every ICU event tied to a plan's workouts. Called from the plan
 * DELETE route before the local cascade so the calendar follows the data.
 * Best-effort: returns silently if the athlete has no ICU creds or the plan
 * has no synced workouts.
 */
export async function removePlanFromIntervals(supabase, planId) {
  const { data: planRow } = await supabase
    .from('training_plans')
    .select('athletes!inner(id, intervals_icu_api_key, intervals_icu_athlete_id)')
    .eq('id', planId)
    .single();

  const athlete = planRow?.athletes;
  if (!athlete?.intervals_icu_api_key || !athlete?.intervals_icu_athlete_id) return;

  const { data: workouts } = await supabase
    .from('workouts')
    .select('id, plan_weeks!inner(plan_id)')
    .eq('plan_weeks.plan_id', planId);

  const ids = (workouts || []).map(w => w.id);
  if (!ids.length) return;

  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    await bulkDeleteEvents(athlete, ids.slice(i, i + BULK_CHUNK_SIZE));
  }
}

/**
 * Remove ICU events for a single plan-week's workouts. Same contract as
 * removePlanFromIntervals but scoped to one week, used from the week DELETE
 * route.
 */
export async function removeWeekFromIntervals(supabase, weekId) {
  const { data: weekRow } = await supabase
    .from('plan_weeks')
    .select('plan_id, training_plans!inner(athletes!inner(id, intervals_icu_api_key, intervals_icu_athlete_id))')
    .eq('id', weekId)
    .single();

  const athlete = weekRow?.training_plans?.athletes;
  if (!athlete?.intervals_icu_api_key || !athlete?.intervals_icu_athlete_id) return;

  const { data: workouts } = await supabase
    .from('workouts')
    .select('id')
    .eq('plan_week_id', weekId);

  const ids = (workouts || []).map(w => w.id);
  if (!ids.length) return;

  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    await bulkDeleteEvents(athlete, ids.slice(i, i + BULK_CHUNK_SIZE));
  }
}
