/**
 * Progress stats: adherence, volume vs planned, pace trends, RPE, type breakdown
 */

function round1(n) { return Math.round(n * 10) / 10; }

/**
 * Deduplicate workouts by (workout_date, workout_type).
 * When both 'completed' and 'planned' exist for the same slot, keep 'completed'.
 * This prevents double-counting when archived/draft plan copies leave stale rows.
 */
function deduplicateByDateType(workouts) {
  const map = new Map();
  for (const wo of workouts) {
    const key = `${wo.workout_date}:${wo.workout_type}`;
    if (!map.has(key) || wo.status === 'completed') map.set(key, wo);
  }
  return Array.from(map.values());
}

/** Format date as YYYY-MM-DD in LOCAL timezone (not UTC) */
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Get full progress data for an athlete (used by both coach + athlete views)
 */
export async function getAthleteProgress(supabase, athleteId) {
  // 1. Fetch active plan with weeks
  const { data: plans } = await supabase
    .from('training_plans')
    .select('id, name, goal_race, race_date, total_weeks, status')
    .eq('athlete_id', athleteId)
    .in('status', ['approved', 'draft'])
    .order('updated_at', { ascending: false })
    .limit(1);

  const plan = plans?.[0] || null;
  if (!plan) {
    return { plan: null, adherence: null, weekly_volume: [], easy_pace_trend: [], weekly_rpe: [], type_breakdown: null, total_km_cycle: 0, weeks_to_race: null };
  }

  // 2. Fetch all plan weeks + workouts for this plan
  const { data: weeks } = await supabase
    .from('plan_weeks')
    .select('id, week_number, phase, km_target, total_km, start_date, is_generated')
    .eq('plan_id', plan.id)
    .order('week_number', { ascending: true });

  // 3. Fetch all workouts for this athlete in the last ~60 days (covers 8 weeks)
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoStr = toDateStr(sixtyDaysAgo);

  const { data: allWorkouts } = await supabase
    .from('workouts')
    .select('id, plan_week_id, workout_type, distance_km, actual_distance_km, actual_avg_pace, status, workout_date, day_of_week')
    .eq('athlete_id', athleteId)
    .gte('workout_date', sixtyDaysAgoStr)
    .order('workout_date', { ascending: true });

  const workouts = allWorkouts || [];

  // 4. Fetch workout feedback (RPE) for last 60 days
  const { data: feedbackRows } = await supabase
    .from('workout_feedback')
    .select('workout_id, rpe, workouts(workout_date)')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(200);

  const feedback = feedbackRows || [];

  // --- Build weekly buckets (last 8 weeks ending at CURRENT week, aligned Mon-Sun) ---
  // Always anchored to today — never to plan start date.
  const today = new Date();
  const todayStr = toDateStr(today);
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysSinceMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const weekBuckets = [];
  for (let w = 7; w >= 0; w--) {
    const mondayDate = new Date(thisMonday);
    mondayDate.setDate(thisMonday.getDate() - w * 7);
    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(mondayDate.getDate() + 6);

    // Use local timezone for date strings (avoids UTC shift bugs)
    const monStr = toDateStr(mondayDate);
    const sunStr = toDateStr(sundayDate);

    const weekWorkouts = workouts.filter(wo =>
      wo.workout_date >= monStr && wo.workout_date <= sunStr
    );
    // One row per (date, type): prefer 'completed' over 'planned'
    const weekWorkoutsDeduped = deduplicateByDateType(weekWorkouts);

    // Find matching plan week by start_date
    const planWeek = (weeks || []).find(pw => pw.start_date === monStr);

    const planned = weekWorkoutsDeduped.filter(wo => wo.workout_type !== 'rest');
    const completed = planned.filter(wo => wo.status === 'completed');

    // Use raw (non-deduped) week workouts so unplanned completed sessions are included.
    // Strict: only actual_distance_km counts as completed km. Never fall back to planned
    // distance_km — that inflates real running volume when actuals aren't synced.
    const completedKm = weekWorkouts
      .filter(wo => wo.status === 'completed' && wo.workout_type !== 'rest')
      .reduce((s, wo) => s + parseFloat(wo.actual_distance_km || 0), 0);

    const plannedKm = planWeek
      ? parseFloat(planWeek.km_target || 0)
      : weekWorkoutsDeduped.reduce((s, wo) => s + parseFloat(wo.distance_km || 0), 0);

    // Easy pace average (only completed easy runs with actual pace)
    const easyRuns = weekWorkoutsDeduped.filter(wo =>
      wo.workout_type === 'easy' && wo.status === 'completed' && wo.actual_avg_pace > 0
    );
    const avgEasyPace = easyRuns.length > 0
      ? Math.round(easyRuns.reduce((s, wo) => s + wo.actual_avg_pace, 0) / easyRuns.length)
      : null;

    // RPE average from feedback
    const weekFeedback = feedback.filter(f =>
      f.workouts?.workout_date >= monStr && f.workouts?.workout_date <= sunStr
    );
    const avgRpe = weekFeedback.length > 0
      ? round1(weekFeedback.reduce((s, f) => s + f.rpe, 0) / weekFeedback.length)
      : null;

    // Current week (w=0) labeled "Now" to show it covers up to today
    const baseLabel = mondayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const label = w === 0 ? 'Now' : baseLabel;
    const weekNum = planWeek?.week_number || null;

    weekBuckets.push({
      week: weekNum ? `W${weekNum}` : label,
      label,
      planned_km: round1(plannedKm),
      completed_km: round1(completedKm),
      avg_easy_pace: avgEasyPace,
      avg_rpe: avgRpe,
      adherence_count: { completed: completed.length, planned: planned.length },
      phase: planWeek?.phase || null,
    });
  }

  // --- ACWR line: rolling 7d acute / 28d chronic for each week endpoint ---
  // Deduplicate once across the full window to avoid double-counting stale rows
  const workoutsDeduped = deduplicateByDateType(workouts);
  for (let i = 0; i < weekBuckets.length; i++) {
    const weekEnd = new Date(thisMonday);
    weekEnd.setDate(thisMonday.getDate() - (7 - i) * 7 + 6);
    const weekEndStr = toDateStr(weekEnd);

    const acute7 = workoutsDeduped
      .filter(wo => {
        const d = new Date(wo.workout_date);
        const diff = (weekEnd - d) / 86400000;
        return diff >= 0 && diff < 7 && wo.status === 'completed';
      })
      .reduce((s, wo) => s + parseFloat(wo.actual_distance_km || wo.distance_km || 0), 0);

    const chronic28 = workoutsDeduped
      .filter(wo => {
        const d = new Date(wo.workout_date);
        const diff = (weekEnd - d) / 86400000;
        return diff >= 0 && diff < 28 && wo.status === 'completed';
      })
      .reduce((s, wo) => s + parseFloat(wo.actual_distance_km || wo.distance_km || 0), 0);

    const chronicWeekly = chronic28 / 4;
    // Suppress ACWR when chronic load is too low (< 5 km/wk) to avoid false alerts
    weekBuckets[i].acwr = chronicWeekly >= 5 ? round1(acute7 / chronicWeekly) : null;
  }

  // --- Adherence ---
  const thisWeekBucket = weekBuckets[weekBuckets.length - 1];
  const allTimePlanned = workoutsDeduped.filter(wo => wo.workout_type !== 'rest');
  const allTimeCompleted = allTimePlanned.filter(wo => wo.status === 'completed');

  // Streak: consecutive weeks ending at current week where adherence > 80%
  let streak = 0;
  for (let i = weekBuckets.length - 1; i >= 0; i--) {
    const b = weekBuckets[i];
    if (b.adherence_count.planned === 0) break;
    const rate = b.adherence_count.completed / b.adherence_count.planned;
    if (rate >= 0.8) streak++;
    else break;
  }

  // --- Easy pace trend label ---
  const paceWeeks = weekBuckets.filter(b => b.avg_easy_pace !== null);
  let paceTrendLabel = 'stable';
  if (paceWeeks.length >= 3) {
    const firstHalf = paceWeeks.slice(0, Math.floor(paceWeeks.length / 2));
    const secondHalf = paceWeeks.slice(Math.floor(paceWeeks.length / 2));
    const avgFirst = firstHalf.reduce((s, w) => s + w.avg_easy_pace, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, w) => s + w.avg_easy_pace, 0) / secondHalf.length;
    const diff = avgFirst - avgSecond; // lower pace = faster = improving
    if (diff > 5) paceTrendLabel = 'improving';
    else if (diff < -5) paceTrendLabel = 'declining';
  }

  // --- RPE overreaching detection ---
  const rpeWeeks = weekBuckets.filter(b => b.avg_rpe !== null);
  let rpeOverreaching = false;
  if (rpeWeeks.length >= 3 && paceWeeks.length >= 3) {
    const recentRpe = rpeWeeks.slice(-3);
    const rpeRising = recentRpe[2].avg_rpe > recentRpe[0].avg_rpe + 0.5;
    const paceFlatOrWorse = paceTrendLabel !== 'improving';
    rpeOverreaching = rpeRising && paceFlatOrWorse;
  }

  // --- Workout type breakdown for current phase ---
  const currentPhase = (weeks || []).find(pw => {
    if (!pw.start_date) return false;
    const end = new Date(pw.start_date);
    end.setDate(end.getDate() + 6);
    return pw.start_date <= todayStr && toDateStr(end) >= todayStr;
  });

  const phaseToUse = currentPhase?.phase || (weeks || []).filter(pw => pw.is_generated).pop()?.phase || null;
  const phaseWeeks = phaseToUse
    ? (weeks || []).filter(pw => pw.phase === phaseToUse)
    : [];
  const phaseWeekIds = new Set(phaseWeeks.map(pw => pw.id));

  const phaseWorkouts = workouts.filter(wo => phaseWeekIds.has(wo.plan_week_id));
  const typeBreakdown = {};
  const typeMap = { easy: 'easy', tempo: 'threshold', long_run: 'long_run', intervals: 'intervals', race_pace: 'threshold', recovery: 'easy', rest: 'rest', cross_training: 'cross_training', race: 'race' };

  for (const wo of phaseWorkouts) {
    const bucket = typeMap[wo.workout_type] || wo.workout_type;
    typeBreakdown[bucket] = (typeBreakdown[bucket] || 0) + 1;
  }

  // --- Total km in this training cycle ---
  const allPlanWeekIds = new Set((weeks || []).map(pw => pw.id));
  const cycleWorkouts = workouts.filter(wo => allPlanWeekIds.has(wo.plan_week_id) && wo.status === 'completed');
  // Also fetch older completed workouts for full cycle count
  const { data: olderWorkouts } = await supabase
    .from('workouts')
    .select('distance_km, actual_distance_km, status, plan_week_id')
    .eq('athlete_id', athleteId)
    .eq('status', 'completed')
    .lt('workout_date', sixtyDaysAgoStr);

  const allCycleWorkouts = [
    ...cycleWorkouts,
    ...(olderWorkouts || []).filter(wo => allPlanWeekIds.has(wo.plan_week_id)),
  ];
  const totalKmCycle = round1(allCycleWorkouts.reduce((s, wo) => s + parseFloat(wo.actual_distance_km || wo.distance_km || 0), 0));

  // --- Weeks to race ---
  let weeksToRace = null;
  if (plan.race_date) {
    const raceDate = new Date(plan.race_date + 'T00:00:00');
    const diffMs = raceDate - today;
    weeksToRace = Math.max(0, Math.ceil(diffMs / (7 * 86400000)));
  }

  // Determine current week number
  let currentWeekNumber = null;
  if (weeks?.length) {
    for (const pw of weeks) {
      if (!pw.start_date) continue;
      const end = new Date(pw.start_date);
      end.setDate(end.getDate() + 6);
      if (pw.start_date <= todayStr && toDateStr(end) >= todayStr) {
        currentWeekNumber = pw.week_number;
        break;
      }
    }
  }

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      goal_race: plan.goal_race,
      race_date: plan.race_date,
      total_weeks: plan.total_weeks,
      current_week: currentWeekNumber,
      status: plan.status,
    },
    adherence: {
      this_week: {
        completed: thisWeekBucket.adherence_count.completed,
        planned: thisWeekBucket.adherence_count.planned,
        rate: thisWeekBucket.adherence_count.planned > 0
          ? Math.round((thisWeekBucket.adherence_count.completed / thisWeekBucket.adherence_count.planned) * 100)
          : null,
      },
      all_time: {
        completed: allTimeCompleted.length,
        planned: allTimePlanned.length,
        rate: allTimePlanned.length > 0
          ? Math.round((allTimeCompleted.length / allTimePlanned.length) * 100)
          : null,
      },
      streak,
    },
    weekly_volume: weekBuckets,
    easy_pace_trend: weekBuckets.map(b => ({
      week: b.week,
      label: b.label,
      avg_pace_sec_km: b.avg_easy_pace,
    })),
    pace_trend_label: paceTrendLabel,
    weekly_rpe: weekBuckets.map(b => ({
      week: b.week,
      label: b.label,
      avg_rpe: b.avg_rpe,
    })),
    rpe_overreaching: rpeOverreaching,
    type_breakdown: phaseToUse ? {
      phase: phaseToUse,
      ...typeBreakdown,
    } : null,
    total_km_cycle: totalKmCycle,
    weeks_to_race: weeksToRace,
  };
}
