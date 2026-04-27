/**
 * Intervals.icu activity sync.
 *
 * Pulls recent run activities from Intervals.icu and writes their actuals onto the
 * matching workout row (matched by date + run-type), marking the workout completed.
 *
 * Used by:
 *  - GET /api/intervals/sync/:athleteId  (manual trigger from calendar/profile)
 *  - daily cron in index.js              (8 AM Bogotá → 13:00 UTC)
 */

const INTERVALS_BASE = process.env.INTERVALS_ICU_BASE_URL || 'https://intervals.icu/api/v1';

const RUN_WORKOUT_TYPES = ['easy', 'tempo', 'long_run', 'intervals', 'race_pace', 'recovery', 'race'];
const RUN_ACTIVITY_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

/**
 * Sync the last `daysBack` days (default 7) of Intervals.icu activities for one athlete.
 * Returns { synced, matched, fetched, errors }.
 *
 * `synced`  — number of workouts updated with actuals
 * `matched` — same as synced (kept for symmetry with Strava response shape)
 * `fetched` — total activities returned by Intervals.icu in the window
 */
export async function syncIntervalsIcuActivities(supabase, athleteId, { daysBack = 7 } = {}) {
  const { data: athlete, error: athErr } = await supabase
    .from('athletes')
    .select('id, intervals_icu_api_key, intervals_icu_athlete_id')
    .eq('id', athleteId)
    .single();

  if (athErr || !athlete) {
    const err = new Error('Athlete not found');
    err.status = 404;
    throw err;
  }
  if (!athlete.intervals_icu_api_key || !athlete.intervals_icu_athlete_id) {
    const err = new Error('Intervals.icu not configured for this athlete');
    err.status = 400;
    throw err;
  }

  const authHeader = 'Basic ' + Buffer.from(`API_KEY:${athlete.intervals_icu_api_key}`).toString('base64');
  const icuAthleteId = athlete.intervals_icu_athlete_id;

  const oldest = new Date();
  oldest.setDate(oldest.getDate() - daysBack);
  const oldestStr = oldest.toISOString().split('T')[0];
  const newestStr = new Date().toISOString().split('T')[0];

  const icuRes = await fetch(
    `${INTERVALS_BASE}/athlete/${icuAthleteId}/activities?oldest=${oldestStr}&newest=${newestStr}`,
    { headers: { Authorization: authHeader } }
  );

  if (!icuRes.ok) {
    const errText = await icuRes.text();
    const err = new Error(`Intervals.icu fetch failed: ${errText.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }

  const activities = await icuRes.json();
  const runs = activities.filter(a => RUN_ACTIVITY_TYPES.has(a.type));

  let matched = 0;
  for (const activity of runs) {
    const activityDate = activity.start_date_local?.split('T')[0];
    if (!activityDate) continue;

    // Find a non-completed run workout on this date for this athlete.
    const { data: candidates } = await supabase
      .from('workouts')
      .select('id, workout_type, status')
      .eq('athlete_id', athleteId)
      .eq('workout_date', activityDate)
      .neq('workout_type', 'rest')
      .neq('status', 'completed');

    const workout = (candidates || []).find(w => RUN_WORKOUT_TYPES.includes(w.workout_type))
      || (candidates || [])[0];

    if (!workout) continue;

    const distanceKm = activity.distance ? +(activity.distance / 1000).toFixed(2) : null;
    const durationMin = activity.moving_time ? +(activity.moving_time / 60).toFixed(1) : null;
    // sec/km from total distance and time — robust against units in average_speed
    const paceSecKm = activity.distance > 0 && activity.moving_time
      ? Math.round(activity.moving_time / (activity.distance / 1000))
      : null;

    await supabase
      .from('workouts')
      .update({
        status: 'completed',
        actual_distance_km: distanceKm,
        actual_duration_minutes: durationMin,
        actual_avg_pace: paceSecKm,
        actual_avg_hr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
        intervals_icu_activity_id: String(activity.id),
      })
      .eq('id', workout.id);

    matched++;
  }

  return { synced: matched, matched, fetched: activities.length, runs: runs.length };
}
