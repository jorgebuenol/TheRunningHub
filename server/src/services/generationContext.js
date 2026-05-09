/**
 * Auto-context for the Smart Week Generation modal.
 *
 * Pulls a single 28-day window of workouts/feedback + 7-day window of readiness
 * in 5 parallel queries, then computes everything (previous_week, 4-week trend,
 * flags) in JS. Re-anchored to the START of the target week, so "ACWR going
 * into the new week" reflects load up to the day before the week begins, not
 * up to today.
 *
 * Algorithms here are copied/adapted from services/progress.js and
 * services/monitoring.js. They are intentionally NOT imported — the spec
 * requires this module to evolve independently.
 */

import { addDays, formatDateISO } from '../utils/dates.js';

const QUALITY_TYPES = new Set(['tempo', 'intervals', 'race_pace']);
const EASY_TYPES = new Set(['easy', 'recovery']);

/**
 * Hard sanity bounds for easy/recovery pace in sec/km (4:30 to 8:30).
 * Mirrors progress.js — keeps watch glitches and unit errors out of the average.
 */
const EASY_PACE_MIN_SEC = 270;
const EASY_PACE_MAX_SEC = 510;

function isEasyPaceSane(paceSecKm, athletePaceMin, athletePaceMax) {
  if (!paceSecKm || paceSecKm <= 0) return false;
  if (paceSecKm < EASY_PACE_MIN_SEC || paceSecKm > EASY_PACE_MAX_SEC) return false;
  if (athletePaceMin && athletePaceMax) {
    const lo = athletePaceMin - 60;
    const hi = athletePaceMax + 60;
    if (paceSecKm < lo || paceSecKm > hi) return false;
  }
  return true;
}

/** Keep one row per (date, type). When both 'completed' and 'planned' exist, prefer 'completed'. */
function deduplicateByDateType(workouts) {
  const map = new Map();
  for (const w of workouts) {
    const key = `${w.workout_date}:${w.workout_type}`;
    if (!map.has(key) || w.status === 'completed') map.set(key, w);
  }
  return Array.from(map.values());
}

function round1(n) { return Math.round(n * 10) / 10; }

/**
 * Build the full generation-context payload for a target week.
 *
 * @param supabase    Server-supabase client (request-scoped)
 * @param athleteId   athletes.id (NOT profiles.id)
 * @param plan        full training_plans row (we only read goal_race / goal_race_date)
 * @param targetWeek  the plan_weeks row the coach is generating
 * @param planWeeks   ordered array of all plan_weeks for the plan
 */
export async function buildGenerationContext(supabase, { athleteId, plan, targetWeek, planWeeks }) {
  const targetMonday = new Date(`${targetWeek.start_date}T00:00:00`);
  // Anchor for ACWR & "previous" calculations: the day before the target week begins.
  const anchorDate = addDays(targetMonday, -1);
  const windowStart = addDays(targetMonday, -28);
  const windowStartStr = formatDateISO(windowStart);
  const targetMondayStr = formatDateISO(targetMonday);
  const readinessStartStr = formatDateISO(addDays(targetMonday, -7));

  // 5 parallel queries — single round-trip
  const [athleteRes, workoutsRes, feedbackRes, readinessRes] = await Promise.all([
    supabase
      .from('athletes')
      .select('id, vdot, pace_easy_min, pace_easy_max, pace_tempo, pace_lt, pace_race, goal_race, goal_race_date, weekly_km, profiles!inner(full_name)')
      .eq('id', athleteId)
      .single(),
    supabase
      .from('workouts')
      .select('id, plan_week_id, workout_type, workout_date, day_of_week, distance_km, duration_minutes, actual_distance_km, actual_avg_pace, actual_duration_minutes, status, rescheduled_from_date')
      .eq('athlete_id', athleteId)
      .gte('workout_date', windowStartStr)
      .lt('workout_date', targetMondayStr)
      .order('workout_date', { ascending: true }),
    supabase
      .from('workout_feedback')
      .select('workout_id, rpe, created_at, workouts!inner(workout_date, workout_type)')
      .eq('athlete_id', athleteId)
      .gte('workouts.workout_date', windowStartStr)
      .lt('workouts.workout_date', targetMondayStr),
    supabase
      .from('daily_readiness')
      .select('check_in_date, pain_flag, pain_location, composite_score')
      .eq('athlete_id', athleteId)
      .gte('check_in_date', readinessStartStr)
      .lt('check_in_date', targetMondayStr),
  ]);

  if (athleteRes.error || !athleteRes.data) {
    throw new Error(`Athlete ${athleteId} not found`);
  }

  const athleteRow = athleteRes.data;
  const workouts = workoutsRes.data || [];
  const feedback = feedbackRes.data || [];
  const readiness = readinessRes.data || [];

  const athleteBlock = buildAthleteBlock(athleteRow, plan, targetMonday);
  const previousWeek = buildPreviousWeek(workouts, feedback, planWeeks, targetMonday, athleteRow);
  const trend = buildTrend(workouts, feedback, anchorDate, targetMonday, athleteRow);
  const currentWeek = buildCurrentWeek(targetWeek);
  const nextMilestone = buildNextMilestone(athleteRow, targetMonday);
  const flags = buildFlags({
    previousWeek,
    trend,
    readiness,
    planWeeks,
    targetWeek,
    athlete: athleteRow,
  });

  return {
    athlete: athleteBlock,
    previous_week: previousWeek,
    trend_last_4_weeks: trend,
    flags,
    current_week: currentWeek,
    next_milestone: nextMilestone,
  };
}

/* ─── Section builders ─── */

function buildAthleteBlock(athleteRow, plan, targetMonday) {
  const goalRaceDate = athleteRow.goal_race_date || plan?.race_date || null;
  let weeksToRace = null;
  if (goalRaceDate) {
    const race = new Date(`${goalRaceDate}T00:00:00`);
    const diffMs = race - targetMonday;
    weeksToRace = Math.max(0, Math.ceil(diffMs / (7 * 86400000)));
  }
  return {
    id: athleteRow.id,
    name: athleteRow.profiles?.full_name || null,
    vdot: athleteRow.vdot,
    pace_easy_min: athleteRow.pace_easy_min,
    pace_easy_max: athleteRow.pace_easy_max,
    pace_tempo: athleteRow.pace_tempo,
    pace_lt: athleteRow.pace_lt,
    pace_race: athleteRow.pace_race,
    goal_race: athleteRow.goal_race || plan?.goal_race || null,
    goal_race_date: goalRaceDate,
    weeks_to_race: weeksToRace,
  };
}

function buildPreviousWeek(workouts, feedback, planWeeks, targetMonday, athleteRow) {
  const prevMonday = addDays(targetMonday, -7);
  const prevSunday = addDays(targetMonday, -1);
  const prevMondayStr = formatDateISO(prevMonday);
  const prevSundayStr = formatDateISO(prevSunday);

  const weekWorkouts = workouts.filter(w => w.workout_date >= prevMondayStr && w.workout_date <= prevSundayStr);
  const deduped = deduplicateByDateType(weekWorkouts);

  const planWeek = planWeeks.find(pw => pw.start_date === prevMondayStr) || null;

  const planned = deduped.filter(w => w.workout_type !== 'rest');
  const completed = planned.filter(w => w.status === 'completed');
  const skipped = planned.filter(w => w.status === 'skipped');
  // Rescheduled: rows that landed in this week from a date outside it (rescheduled_from_date
  // is set and points outside the [prevMonday, prevSunday] window). We can't see workouts
  // that were moved OUT of this week without the rescheduled_to columns, so this is a
  // one-sided count — good enough for v1 coach-context.
  const rescheduledIn = weekWorkouts.filter(w =>
    w.rescheduled_from_date
    && (w.rescheduled_from_date < prevMondayStr || w.rescheduled_from_date > prevSundayStr)
  );

  const completedKm = weekWorkouts
    .filter(w => w.status === 'completed' && w.workout_type !== 'rest')
    .reduce((s, w) => s + parseFloat(w.actual_distance_km || 0), 0);

  const plannedKm = planWeek
    ? parseFloat(planWeek.km_target || 0)
    : deduped.reduce((s, w) => s + parseFloat(w.distance_km || 0), 0);

  const completionPct = plannedKm > 0 ? round1((completedKm / plannedKm) * 100) : null;

  // Easy pace average — sane bounds + athlete's personal zone
  const easyRuns = deduped.filter(w =>
    EASY_TYPES.has(w.workout_type)
    && w.status === 'completed'
    && isEasyPaceSane(w.actual_avg_pace, athleteRow.pace_easy_min, athleteRow.pace_easy_max)
  );
  const avgEasyPace = easyRuns.length > 0
    ? Math.round(easyRuns.reduce((s, w) => s + w.actual_avg_pace, 0) / easyRuns.length)
    : null;
  const easyPaceInTarget = avgEasyPace !== null
    && athleteRow.pace_easy_min && athleteRow.pace_easy_max
    && avgEasyPace >= athleteRow.pace_easy_min
    && avgEasyPace <= athleteRow.pace_easy_max;

  // RPE average from feedback
  const weekFeedback = feedback.filter(f =>
    f.workouts?.workout_date >= prevMondayStr && f.workouts?.workout_date <= prevSundayStr
  );
  const avgRpe = weekFeedback.length > 0
    ? round1(weekFeedback.reduce((s, f) => s + f.rpe, 0) / weekFeedback.length)
    : null;

  // Long run
  const plannedLongRun = deduped.find(w => w.workout_type === 'long_run');
  const completedLongRun = weekWorkouts.find(w => w.workout_type === 'long_run' && w.status === 'completed');
  const longRunCompleted = !!completedLongRun;
  const longRunPace = completedLongRun?.actual_avg_pace || null;

  // Quality sessions (tempo / intervals / race_pace)
  const qualityPlanned = deduped.filter(w => QUALITY_TYPES.has(w.workout_type));
  const qualityCompleted = qualityPlanned.filter(w => w.status === 'completed');

  return {
    week_number: planWeek?.week_number || null,
    phase: planWeek?.phase || null,
    planned_km: round1(plannedKm),
    completed_km: round1(completedKm),
    completion_pct: completionPct,
    workouts_completed: completed.length,
    workouts_planned: planned.length,
    workouts_skipped: skipped.length,
    workouts_rescheduled: rescheduledIn.length,
    avg_rpe: avgRpe,
    avg_easy_pace: avgEasyPace,
    easy_pace_in_target: easyPaceInTarget,
    long_run_planned: !!plannedLongRun,
    long_run_completed: longRunCompleted,
    long_run_pace: longRunPace,
    quality_sessions_completed: qualityCompleted.length,
    quality_sessions_planned: qualityPlanned.length,
  };
}

function buildTrend(workouts, feedback, anchorDate, targetMonday, athleteRow) {
  // 4 weekly buckets ending the day before the target week starts.
  const buckets = [];
  for (let i = 0; i < 4; i++) {
    const monday = addDays(targetMonday, -(i + 1) * 7);
    const sunday = addDays(monday, 6);
    const monStr = formatDateISO(monday);
    const sunStr = formatDateISO(sunday);

    const wks = workouts.filter(w => w.workout_date >= monStr && w.workout_date <= sunStr);
    const deduped = deduplicateByDateType(wks);
    const fb = feedback.filter(f =>
      f.workouts?.workout_date >= monStr && f.workouts?.workout_date <= sunStr
    );

    const planned = deduped.filter(w => w.workout_type !== 'rest');
    const completed = planned.filter(w => w.status === 'completed');
    const completionPct = planned.length > 0 ? (completed.length / planned.length) * 100 : null;
    const totalKm = wks
      .filter(w => w.status === 'completed' && w.workout_type !== 'rest')
      .reduce((s, w) => s + parseFloat(w.actual_distance_km || 0), 0);

    const easyRuns = deduped.filter(w =>
      EASY_TYPES.has(w.workout_type)
      && w.status === 'completed'
      && isEasyPaceSane(w.actual_avg_pace, athleteRow.pace_easy_min, athleteRow.pace_easy_max)
    );
    const avgEasyPace = easyRuns.length > 0
      ? Math.round(easyRuns.reduce((s, w) => s + w.actual_avg_pace, 0) / easyRuns.length)
      : null;

    const avgRpe = fb.length > 0
      ? round1(fb.reduce((s, f) => s + f.rpe, 0) / fb.length)
      : null;

    buckets.push({ monday: monStr, totalKm, completionPct, avgEasyPace, avgRpe });
  }
  // buckets[0] = most recent (last week); buckets[3] = oldest

  const completionVals = buckets.map(b => b.completionPct).filter(v => v !== null);
  const avgCompletionPct = completionVals.length > 0
    ? Math.round(completionVals.reduce((s, v) => s + v, 0) / completionVals.length)
    : null;

  const totalKm = round1(buckets.reduce((s, b) => s + b.totalKm, 0));

  // ACWR: acute = last 7d completed, chronic = mean weekly across the 4 weeks.
  // Anchored to the day before the target week starts.
  const anchorStr = formatDateISO(anchorDate);
  const acuteStartStr = formatDateISO(addDays(anchorDate, -6));
  const acuteKm = workouts
    .filter(w => w.status === 'completed' && w.workout_type !== 'rest')
    .filter(w => w.workout_date >= acuteStartStr && w.workout_date <= anchorStr)
    .reduce((s, w) => s + parseFloat(w.actual_distance_km || 0), 0);
  const chronicWeeklyKm = totalKm / 4;
  const hasEnoughData = buckets.filter(b => b.totalKm > 0).length >= 3;
  let acwr = null;
  let acwrStatus = 'insufficient';
  if (hasEnoughData && chronicWeeklyKm >= 5) {
    acwr = Math.round((acuteKm / chronicWeeklyKm) * 100) / 100;
    if (acwr > 1.5 || acwr < 0.5) acwrStatus = 'red';
    else if (acwr > 1.3 || acwr < 0.8) acwrStatus = 'yellow';
    else acwrStatus = 'green';
  }

  // Trend direction: compare older half (buckets 2,3) vs newer half (buckets 0,1)
  // Lower easy pace = faster = improving (sec/km). Higher RPE = declining.
  const rpeTrend = directionFromHalves(
    buckets.slice(0, 2).map(b => b.avgRpe).filter(v => v !== null),
    buckets.slice(2, 4).map(b => b.avgRpe).filter(v => v !== null),
    0.5,    // RPE delta threshold
    'rpe',  // higher = declining
  );
  const easyPaceTrend = directionFromHalves(
    buckets.slice(0, 2).map(b => b.avgEasyPace).filter(v => v !== null),
    buckets.slice(2, 4).map(b => b.avgEasyPace).filter(v => v !== null),
    5,        // 5 sec/km
    'pace',   // lower = improving
  );

  const rpeVals = buckets.map(b => b.avgRpe).filter(v => v !== null);
  const avgRpe = rpeVals.length > 0
    ? round1(rpeVals.reduce((s, v) => s + v, 0) / rpeVals.length)
    : null;

  return {
    avg_completion_pct: avgCompletionPct,
    acwr,
    acwr_status: acwrStatus,
    avg_rpe: avgRpe,
    rpe_trend: rpeTrend,
    easy_pace_trend: easyPaceTrend,
    total_km: totalKm,
  };
}

/**
 * Compare the average of `newer` to the average of `older` and return a label.
 * @param newer  recent half values
 * @param older  older half values
 * @param threshold  required delta to call it improving/declining
 * @param mode   'rpe' (higher=worse) or 'pace' (higher=worse, lower=better)
 */
function directionFromHalves(newer, older, threshold, mode) {
  if (newer.length === 0 || older.length === 0) return 'stable';
  const newerAvg = newer.reduce((s, v) => s + v, 0) / newer.length;
  const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
  const diff = newerAvg - olderAvg;  // +ve means newer is higher
  if (mode === 'rpe') {
    if (diff > threshold) return 'declining';   // RPE rising
    if (diff < -threshold) return 'improving';
    return 'stable';
  }
  // pace mode — lower is better
  if (diff < -threshold) return 'improving';    // newer pace is faster
  if (diff > threshold) return 'declining';
  return 'stable';
}

function buildCurrentWeek(targetWeek) {
  return {
    week_number: targetWeek.week_number,
    phase: targetWeek.phase || null,
    is_recovery: !!targetWeek.is_recovery,
    planned_km_target: targetWeek.km_target ? parseFloat(targetWeek.km_target) : null,
    start_date: targetWeek.start_date,
  };
}

function buildNextMilestone(athleteRow, targetMonday) {
  const date = athleteRow.goal_race_date;
  if (!date) return null;
  const race = new Date(`${date}T00:00:00`);
  const diffMs = race - targetMonday;
  const weeksAway = Math.max(0, Math.ceil(diffMs / (7 * 86400000)));
  return {
    type: 'race',
    name: athleteRow.goal_race || 'Goal Race',
    date,
    weeks_away: weeksAway,
  };
}

/* ─── Flag rules ─── */

function buildFlags({ previousWeek, trend, readiness, planWeeks, targetWeek, athlete }) {
  const flags = [];

  // easy_pace_too_fast — last week avg easy pace below athlete's pace_easy_min (faster than target floor)
  if (
    previousWeek.avg_easy_pace !== null
    && athlete.pace_easy_min
    && previousWeek.avg_easy_pace < athlete.pace_easy_min
  ) {
    const diff = athlete.pace_easy_min - previousWeek.avg_easy_pace;
    flags.push({
      type: 'easy_pace_too_fast',
      severity: 'warn',
      detail: `Avg easy pace ${formatPace(previousWeek.avg_easy_pace)} vs target floor ${formatPace(athlete.pace_easy_min)} (${diff} sec/km too fast)`,
    });
  }

  // low_completion — < 70% completion last week
  if (previousWeek.completion_pct !== null && previousWeek.completion_pct < 70) {
    flags.push({
      type: 'low_completion',
      severity: 'warn',
      detail: `Completed ${previousWeek.completed_km}km of ${previousWeek.planned_km}km (${previousWeek.completion_pct}%)`,
    });
  }

  // acwr_red / acwr_yellow
  if (trend.acwr_status === 'red') {
    flags.push({
      type: 'acwr_red',
      severity: 'danger',
      detail: `ACWR ${trend.acwr} — ${trend.acwr > 1.5 ? 'spike risk' : 'undertrained'}`,
    });
  } else if (trend.acwr_status === 'yellow') {
    flags.push({
      type: 'acwr_yellow',
      severity: 'warn',
      detail: `ACWR ${trend.acwr} — ${trend.acwr > 1.3 ? 'elevated load' : 'low load'}`,
    });
  }

  // high_rpe — last week avg > 7.5
  if (previousWeek.avg_rpe !== null && previousWeek.avg_rpe > 7.5) {
    flags.push({
      type: 'high_rpe',
      severity: 'warn',
      detail: `Avg RPE ${previousWeek.avg_rpe}/10 last week`,
    });
  }

  // pain_reported — any pain_flag in last 7 days
  const painCheckins = readiness.filter(r => r.pain_flag);
  if (painCheckins.length > 0) {
    const locations = [...new Set(painCheckins.map(r => r.pain_location).filter(Boolean))];
    flags.push({
      type: 'pain_reported',
      severity: 'danger',
      detail: locations.length > 0
        ? `Pain reported (${locations.join(', ')}) on ${painCheckins.length} of last 7 days`
        : `Pain flag on ${painCheckins.length} of last 7 days`,
    });
  }

  // missed_long_run
  if (previousWeek.long_run_planned && !previousWeek.long_run_completed) {
    flags.push({
      type: 'missed_long_run',
      severity: 'info',
      detail: 'Long run was scheduled but not completed last week',
    });
  }

  // recovery_week_due — 3+ consecutive non-recovery plan_weeks ending immediately before target
  const consecutiveNonRecovery = countConsecutiveNonRecovery(planWeeks, targetWeek);
  if (consecutiveNonRecovery >= 3) {
    flags.push({
      type: 'recovery_week_due',
      severity: 'info',
      detail: `${consecutiveNonRecovery} non-recovery weeks in a row leading into this one`,
    });
  }

  return flags;
}

function countConsecutiveNonRecovery(planWeeks, targetWeek) {
  // Walk backwards from target.week_number-1 across plan_weeks ordered ascending.
  // Stop at first recovery phase or when no prior week exists.
  const sorted = [...planWeeks].sort((a, b) => a.week_number - b.week_number);
  let count = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const w = sorted[i];
    if (w.week_number >= targetWeek.week_number) continue;
    if (w.is_recovery || (w.phase && w.phase.endsWith('_recovery')) || w.phase === 'taper') break;
    count++;
  }
  return count;
}

function formatPace(secPerKm) {
  if (!secPerKm) return '--:--';
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
