/**
 * Athlete monitoring calculations: ACWR, readiness trends, flags
 */

/**
 * Calculate Acute:Chronic Workload Ratio
 * Acute = last 7 days total distance, Chronic = last 28 days avg weekly distance
 * @returns {{ ratio: number, zone: 'green'|'amber'|'red', acute_km: number, chronic_km: number }}
 */
export function calculateACWR(workouts) {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const twentyEightDaysAgo = new Date(now);
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

  // Filter completed workouts with distance
  const completed = workouts.filter(w =>
    w.status === 'completed' && w.distance_km > 0
  );

  // Acute load: last 7 days
  const acuteWorkouts = completed.filter(w =>
    new Date(w.workout_date) >= sevenDaysAgo
  );
  const acuteKm = acuteWorkouts.reduce((sum, w) => sum + parseFloat(w.distance_km || 0), 0);

  // Chronic load: last 28 days, averaged per week
  const chronicWorkouts = completed.filter(w =>
    new Date(w.workout_date) >= twentyEightDaysAgo
  );
  const chronicTotalKm = chronicWorkouts.reduce((sum, w) => sum + parseFloat(w.distance_km || 0), 0);
  const chronicWeeklyKm = chronicTotalKm / 4; // 4 weeks

  // Avoid division by zero
  if (chronicWeeklyKm === 0) {
    return { ratio: acuteKm > 0 ? 2.0 : 0, zone: acuteKm > 0 ? 'red' : 'green', acute_km: acuteKm, chronic_km: 0 };
  }

  const ratio = Math.round((acuteKm / chronicWeeklyKm) * 100) / 100;

  let zone = 'green';
  if (ratio > 1.3) zone = 'red';
  else if (ratio > 1.1) zone = 'amber';

  return { ratio, zone, acute_km: Math.round(acuteKm * 10) / 10, chronic_km: Math.round(chronicWeeklyKm * 10) / 10 };
}

/**
 * Get full monitoring summary for an athlete
 */
export async function getAthleteMonitoringSummary(supabase, athleteId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const today = now.toISOString().split('T')[0];

  // Fetch all data in parallel
  const [readinessResult, workoutsResult, feedbackResult] = await Promise.all([
    // Last 30 days readiness
    supabase
      .from('daily_readiness')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('check_in_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('check_in_date', { ascending: true }),

    // Last 28 days workouts
    supabase
      .from('workouts')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('workout_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('workout_date', { ascending: true }),

    // Last 30 days feedback
    supabase
      .from('workout_feedback')
      .select('*, workouts(workout_date, title, workout_type, distance_km)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const readiness = readinessResult.data || [];
  const workouts = workoutsResult.data || [];
  const feedback = feedbackResult.data || [];

  // ACWR
  const acwr = calculateACWR(workouts);

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

  // Workout compliance (last 7 days)
  const plannedThisWeek = workouts.filter(w =>
    new Date(w.workout_date) >= sevenDaysAgo && w.workout_type !== 'rest'
  );
  const completedThisWeek = plannedThisWeek.filter(w => w.status === 'completed');
  const complianceRate = plannedThisWeek.length > 0
    ? Math.round((completedThisWeek.length / plannedThisWeek.length) * 100)
    : null;

  // Flags
  const flags = [];
  if (todayReadiness?.composite_score < 2.5) flags.push({ type: 'readiness', message: 'Low readiness score today' });
  if (todayReadiness?.pain_flag) flags.push({ type: 'pain', message: `Pain: ${todayReadiness.pain_location} (${todayReadiness.pain_severity}/10)` });
  if (acwr.zone === 'red') flags.push({ type: 'acwr', message: `High ACWR: ${acwr.ratio}` });
  if (acwr.zone === 'amber') flags.push({ type: 'acwr_warning', message: `Elevated ACWR: ${acwr.ratio}` });
  if (complianceRate !== null && complianceRate < 60) flags.push({ type: 'compliance', message: `Low compliance: ${complianceRate}%` });

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
  };
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

  const [readinessResult, workoutsResult, feedbackResult] = await Promise.all([
    // Today's readiness
    supabase
      .from('daily_readiness')
      .select('composite_score, pain_flag, pain_location, pain_severity')
      .eq('athlete_id', athleteId)
      .eq('check_in_date', today)
      .maybeSingle(),

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
  ]);

  const todayReadiness = readinessResult.data;
  const workouts = workoutsResult.data || [];
  const recentFeedback = feedbackResult.data || [];

  const acwr = calculateACWR(workouts);
  const avgRpe = recentFeedback.length > 0
    ? Math.round((recentFeedback.reduce((sum, f) => sum + f.rpe, 0) / recentFeedback.length) * 10) / 10
    : null;
  const rpeSparkline = recentFeedback.reverse().map(f => f.rpe);

  return {
    readiness_score: todayReadiness?.composite_score ? parseFloat(todayReadiness.composite_score) : null,
    pain_flag: todayReadiness?.pain_flag || false,
    pain_location: todayReadiness?.pain_location || null,
    acwr_ratio: acwr.ratio,
    acwr_zone: acwr.zone,
    avg_rpe: avgRpe,
    rpe_sparkline: rpeSparkline,
  };
}
