/**
 * Athlete monitoring calculations: ACWR, readiness trends, flags
 */

/**
 * Deduplicate workouts by (workout_date, workout_type).
 * When both 'completed' and 'planned' exist for the same slot, keep 'completed'.
 */
function deduplicateByDateType(workouts) {
  const map = new Map();
  for (const w of workouts) {
    const key = `${w.workout_date}:${w.workout_type || ''}`;
    if (!map.has(key) || w.status === 'completed') map.set(key, w);
  }
  return Array.from(map.values());
}

/**
 * Calculate Acute:Chronic Workload Ratio
 * Acute = last 7 days total distance, Chronic = last 28 days avg weekly distance
 * Zones: green (0.8–1.3), yellow (1.3–1.5 or 0.5–0.8), red (>1.5 or <0.5)
 */
export function calculateACWR(workouts) {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const twentyEightDaysAgo = new Date(now);
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  const twentyOneDaysAgo = new Date(now);
  twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);

  // Deduplicate: prefer 'completed' over 'planned' for same date+type
  const deduped = deduplicateByDateType(workouts);

  const completed = deduped.filter(w =>
    w.status === 'completed' && parseFloat(w.actual_distance_km || w.distance_km || 0) > 0
  );

  const acuteWorkouts = completed.filter(w =>
    new Date(w.workout_date) >= sevenDaysAgo
  );
  const acuteKm = acuteWorkouts.reduce((sum, w) => sum + parseFloat(w.actual_distance_km || w.distance_km || 0), 0);

  const chronicWorkouts = completed.filter(w =>
    new Date(w.workout_date) >= twentyEightDaysAgo
  );
  const chronicTotalKm = chronicWorkouts.reduce((sum, w) => sum + parseFloat(w.actual_distance_km || w.distance_km || 0), 0);
  const chronicWeeklyKm = chronicTotalKm / 4;

  // Check if athlete has enough training history (>= 3 weeks of data)
  const hasThreeWeeksData = completed.some(w => new Date(w.workout_date) < twentyOneDaysAgo);

  // Suppress ACWR when insufficient data or chronic load too low
  if (!hasThreeWeeksData || chronicWeeklyKm < 5) {
    return {
      ratio: null, zone: 'insufficient', acute_km: round1(acuteKm), chronic_km: round1(chronicWeeklyKm),
      insufficient_data: true,
    };
  }

  const ratio = Math.round((acuteKm / chronicWeeklyKm) * 100) / 100;
  const zone = getACWRZone(ratio);

  return { ratio, zone, acute_km: round1(acuteKm), chronic_km: round1(chronicWeeklyKm), insufficient_data: false };
}

function getACWRZone(ratio) {
  if (ratio > 1.5 || ratio < 0.5) return 'red';
  if (ratio > 1.3 || ratio < 0.8) return 'yellow';
  return 'green';
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Get full monitoring summary for an athlete
 */
export async function getAthleteMonitoringSummary(supabase, athleteId) {
  const now = new Date();
  const fortyTwoDaysAgo = new Date(now);
  fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const today = now.toISOString().split('T')[0];

  const [readinessResult, workoutsResult, feedbackResult, activitiesResult] = await Promise.all([
    // Last 30 days readiness
    supabase
      .from('daily_readiness')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('check_in_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('check_in_date', { ascending: true }),

    // Last 42 days workouts (6 weeks for weekly km history)
    supabase
      .from('workouts')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('workout_date', fortyTwoDaysAgo.toISOString().split('T')[0])
      .order('workout_date', { ascending: true }),

    // Last 42 days feedback
    supabase
      .from('workout_feedback')
      .select('*, workouts(workout_date, title, workout_type, distance_km)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(50),

    // Last 42 days logged activities (strength_sessions with distance)
    supabase
      .from('strength_sessions')
      .select('session_date, distance_km, activity_type, duration_minutes')
      .eq('athlete_id', athleteId)
      .gte('session_date', fortyTwoDaysAgo.toISOString().split('T')[0]),
  ]);

  const readiness = readinessResult.data || [];
  const workouts = workoutsResult.data || [];
  const feedback = feedbackResult.data || [];
  const loggedActivities = activitiesResult.data || [];

  // Merge logged activities with distance into workouts for ACWR
  const activitiesWithDistance = loggedActivities
    .filter(a => a.distance_km && parseFloat(a.distance_km) > 0)
    .map(a => ({ workout_date: a.session_date, distance_km: a.distance_km, status: 'completed' }));
  const acwr = calculateACWR([...workouts, ...activitiesWithDistance]);

  // Readiness trend (last 7 days)
  const recentReadiness = readiness.filter(r =>
    new Date(r.check_in_date) >= sevenDaysAgo
  );
  const avgReadiness = recentReadiness.length > 0
    ? Math.round((recentReadiness.reduce((sum, r) => sum + parseFloat(r.composite_score), 0) / recentReadiness.length) * 100) / 100
    : null;

  // Readiness sparkline data (30 days)
  const readinessSparkline = generateSparklineData(readiness, 'composite_score', 30);

  // RPE sparkline (last 14 feedbacks)
  const rpeSparkline = feedback
    .slice(0, 14)
    .reverse()
    .map(f => f.rpe);

  // Today's readiness
  const todayReadiness = readiness.find(r => r.check_in_date === today);

  // Pain flags (active in last 7 days)
  const painFlags = recentReadiness.filter(r => r.pain_flag);

  // Workout compliance (last 7 days) — deduplicate before counting
  const recentDeduped = deduplicateByDateType(
    workouts.filter(w => new Date(w.workout_date) >= sevenDaysAgo)
  );
  const plannedThisWeek = recentDeduped.filter(w => w.workout_type !== 'rest');
  const completedThisWeek = plannedThisWeek.filter(w => w.status === 'completed');
  const complianceRate = plannedThisWeek.length > 0
    ? Math.round((completedThisWeek.length / plannedThisWeek.length) * 100)
    : null;

  // --- New: Weekly KM history (last 6 weeks, including logged activities) ---
  const weeklyKmHistory = getWeeklyKmHistory(workouts, loggedActivities);

  // --- New: RPE 7-day trend ---
  const rpe7dTrend = build7dRpeTrend(feedback, now);

  // --- New: Readiness 7-day trend ---
  const readiness7dTrend = build7dReadinessTrend(readiness, now);

  // --- New: RPE 7d average ---
  const rpe7dValues = rpe7dTrend.filter(d => d.rpe !== null).map(d => d.rpe);
  const rpe7dAvg = rpe7dValues.length > 0
    ? Math.round((rpe7dValues.reduce((a, b) => a + b, 0) / rpe7dValues.length) * 10) / 10
    : null;

  // Flags (updated criteria — suppress false positives for new athletes)
  const flags = [];
  if (!acwr.insufficient_data) {
    if (acwr.zone === 'red') flags.push({ type: 'acwr', message: `ACWR ${acwr.ratio} — ${acwr.ratio > 1.5 ? 'Very high' : 'Very low'} load` });
    else if (acwr.zone === 'yellow') flags.push({ type: 'acwr_warning', message: `ACWR ${acwr.ratio} — ${acwr.ratio > 1.3 ? 'Elevated' : 'Low'} load` });
  }
  if (todayReadiness?.composite_score < 2.5) flags.push({ type: 'readiness', message: 'Low readiness score today' });
  if (painFlags.length > 0) flags.push({ type: 'pain', message: `Pain: ${[...new Set(painFlags.map(p => p.pain_location))].join(', ')}` });
  const highRpeDays = rpe7dTrend.filter(d => d.rpe !== null && d.rpe > 8).length;
  if (highRpeDays >= 3) flags.push({ type: 'rpe', message: `High RPE (>8) for ${highRpeDays} of last 7 days` });
  // Only flag low compliance after at least 1 full week of planned workouts
  const allPlannedWorkouts = deduplicateByDateType(workouts).filter(w => w.workout_type !== 'rest');
  const oldestPlannedDate = allPlannedWorkouts.length > 0 ? new Date(allPlannedWorkouts[0].workout_date) : null;
  const planHasFullWeek = oldestPlannedDate && (now - oldestPlannedDate) / 86400000 >= 7;
  if (planHasFullWeek && complianceRate !== null && complianceRate < 60) flags.push({ type: 'compliance', message: `Low compliance: ${complianceRate}%` });

  // HR zone exceedance: flag workouts where actual HR significantly exceeded target
  const hrExceeded = feedback.filter(f => {
    if (!f.avg_hr) return false;
    const w = f.workouts;
    if (!w) return false;
    // Check if workout has hr_target_max (new field) or map hr_zone to approximate max
    const targetMax = w.hr_target_max;
    if (targetMax && f.avg_hr > targetMax + 10) return true; // >10 bpm over target
    return false;
  });
  if (hrExceeded.length >= 2) {
    flags.push({ type: 'hr_exceeded', message: `HR exceeded target zone in ${hrExceeded.length} recent workouts` });
  }

  return {
    acwr,
    readiness: {
      today: todayReadiness || null,
      average_7d: avgReadiness,
      sparkline: readinessSparkline,
      history: readiness,
    },
    feedback: {
      recent: feedback,
      rpe_sparkline: rpeSparkline,
    },
    compliance: {
      rate: complianceRate,
      completed: completedThisWeek.length,
      planned: plannedThisWeek.length,
    },
    pain_flags: painFlags,
    flags,
    // New fields for Load page
    weekly_km_history: weeklyKmHistory,
    rpe_7d_trend: rpe7dTrend,
    readiness_7d_trend: readiness7dTrend,
    rpe_7d_avg: rpe7dAvg,
  };
}

/**
 * Weekly KM history for the last 6 weeks (bar chart data)
 */
function getWeeklyKmHistory(workouts, loggedActivities = []) {
  const today = new Date();
  const history = [];

  for (let w = 5; w >= 0; w--) {
    const endOffset = w * 7;
    const startOffset = endOffset + 6;

    const end = new Date(today);
    end.setDate(today.getDate() - endOffset);
    const start = new Date(today);
    start.setDate(today.getDate() - startOffset);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const weekWorkouts = deduplicateByDateType(
      workouts.filter(wk => wk.workout_date >= startStr && wk.workout_date <= endStr)
    ).filter(wk => wk.status === 'completed');

    let km = weekWorkouts.reduce((sum, wk) => sum + parseFloat(wk.actual_distance_km || wk.distance_km || 0), 0);

    // Add km from logged activities (strength_sessions with distance)
    const weekActivities = loggedActivities.filter(a =>
      a.session_date >= startStr &&
      a.session_date <= endStr &&
      a.distance_km && parseFloat(a.distance_km) > 0
    );
    km += weekActivities.reduce((sum, a) => sum + parseFloat(a.distance_km), 0);

    const label = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    history.push({ week: label, km: round1(km) });
  }

  return history;
}

/**
 * 7-day RPE trend from feedback (line chart data)
 */
function build7dRpeTrend(feedback, now) {
  const trend = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().split('T')[0];

    const dayFeedback = feedback.filter(f => f.workouts?.workout_date === dateStr);
    const avgRpe = dayFeedback.length > 0
      ? Math.round((dayFeedback.reduce((sum, f) => sum + f.rpe, 0) / dayFeedback.length) * 10) / 10
      : null;

    trend.push({
      date: dateStr,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      rpe: avgRpe,
    });
  }
  return trend;
}

/**
 * 7-day readiness trend (line chart data)
 */
function build7dReadinessTrend(readiness, now) {
  const trend = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().split('T')[0];

    const day = readiness.find(r => r.check_in_date === dateStr);
    trend.push({
      date: dateStr,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      energy: day ? day.energy : null,
      sleep_quality: day ? day.sleep_quality : null,
      composite: day ? parseFloat(day.composite_score) : null,
    });
  }
  return trend;
}

/**
 * Generate sparkline data array from records
 */
function generateSparklineData(records, field, days) {
  const now = new Date();
  const data = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const record = records.find(r => {
      const recordDate = r.check_in_date || r.workout_date;
      return recordDate === dateStr;
    });

    data.push(record ? parseFloat(record[field]) : null);
  }

  return data;
}

/**
 * Get quick monitoring flags for dashboard (lightweight version)
 */
export async function getDashboardFlags(supabase, athleteId) {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

  const [readinessResult, workoutsResult, feedbackResult, activitiesResult] = await Promise.all([
    // Last 7 days readiness (expanded from just today)
    supabase
      .from('daily_readiness')
      .select('composite_score, pain_flag, pain_location, pain_severity, check_in_date')
      .eq('athlete_id', athleteId)
      .gte('check_in_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('check_in_date', { ascending: false }),

    // Last 28 days workouts for ACWR
    supabase
      .from('workouts')
      .select('workout_date, distance_km, status')
      .eq('athlete_id', athleteId)
      .gte('workout_date', twentyEightDaysAgo.toISOString().split('T')[0]),

    // Last 7 days RPE
    supabase
      .from('workout_feedback')
      .select('rpe, created_at')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(7),

    // Last 28 days logged activities with distance
    supabase
      .from('strength_sessions')
      .select('session_date, distance_km')
      .eq('athlete_id', athleteId)
      .gte('session_date', twentyEightDaysAgo.toISOString().split('T')[0]),
  ]);

  const readiness7d = readinessResult.data || [];
  const todayReadiness = readiness7d.find(r => r.check_in_date === today);
  const workouts = workoutsResult.data || [];
  const recentFeedback = feedbackResult.data || [];
  const loggedActivities = activitiesResult.data || [];

  // Merge logged activities with distance into workouts for ACWR
  const activitiesWithDistance = loggedActivities
    .filter(a => a.distance_km && parseFloat(a.distance_km) > 0)
    .map(a => ({ workout_date: a.session_date, distance_km: a.distance_km, status: 'completed' }));
  const acwr = calculateACWR([...workouts, ...activitiesWithDistance]);
  const avgRpe = recentFeedback.length > 0
    ? Math.round((recentFeedback.reduce((sum, f) => sum + f.rpe, 0) / recentFeedback.length) * 10) / 10
    : null;
  const rpeSparkline = [...recentFeedback].reverse().map(f => f.rpe);
  const painFlag7d = readiness7d.some(r => r.pain_flag);
  const rpeHighDays = recentFeedback.filter(f => f.rpe > 8).length;

  return {
    readiness_score: todayReadiness?.composite_score ? parseFloat(todayReadiness.composite_score) : null,
    pain_flag: todayReadiness?.pain_flag || false,
    pain_flag_7d: painFlag7d,
    pain_location: todayReadiness?.pain_location || null,
    acwr_ratio: acwr.insufficient_data ? null : acwr.ratio,
    acwr_zone: acwr.insufficient_data ? null : acwr.zone,
    acwr_insufficient: acwr.insufficient_data || false,
    avg_rpe: avgRpe,
    rpe_sparkline: rpeSparkline,
    rpe_high_days: rpeHighDays,
  };
}
