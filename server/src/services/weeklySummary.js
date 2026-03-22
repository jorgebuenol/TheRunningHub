import { calculateACWR } from './monitoring.js';

export function getWeekBounds() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  const start = monday.toISOString().split('T')[0];
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const end = sunday.toISOString().split('T')[0];
  return { start, end };
}

export function formatPace(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return null;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export async function getAthleteWeeklySummary(supabase, { id: athleteId, name, email }) {
  const { start, end } = getWeekBounds();

  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  const acwrStart = twentyEightDaysAgo.toISOString().split('T')[0];

  const [thisWeekResult, acwrResult, readinessResult] = await Promise.all([
    supabase
      .from('workouts')
      .select('*, workout_feedback(rpe, feeling)')
      .eq('athlete_id', athleteId)
      .gte('workout_date', start)
      .lte('workout_date', end)
      .order('workout_date', { ascending: true }),

    supabase
      .from('workouts')
      .select('workout_date, distance_km, actual_distance_km, status')
      .eq('athlete_id', athleteId)
      .gte('workout_date', acwrStart),

    supabase
      .from('daily_readiness')
      .select('check_in_date, pain_location, pain_severity')
      .eq('athlete_id', athleteId)
      .gte('check_in_date', start)
      .lte('check_in_date', end)
      .eq('pain_flag', true),
  ]);

  const workouts = thisWeekResult.data || [];
  const planned = workouts.filter(w => w.workout_type !== 'rest');
  const completed = workouts.filter(w => w.status === 'completed');

  const completedRuns = completed.map(w => {
    const fb = w.workout_feedback?.[0] || null;
    return {
      date: w.workout_date,
      title: w.title,
      type: w.workout_type,
      planned_distance_km: w.distance_km ? round1(parseFloat(w.distance_km)) : null,
      planned_pace_sec_km: w.pace_target_sec_km ? parseFloat(w.pace_target_sec_km) : null,
      planned_hr_zone: w.hr_zone,
      actual_distance_km: w.actual_distance_km ? round1(parseFloat(w.actual_distance_km)) : null,
      actual_pace_sec_km: w.actual_avg_pace ? parseFloat(w.actual_avg_pace) : null,
      actual_avg_hr: w.actual_avg_hr,
      rpe: fb?.rpe || null,
      feeling: fb?.feeling || null,
    };
  });

  const rpeValues = completedRuns.map(r => r.rpe).filter(Boolean);
  const avgRpe = rpeValues.length > 0
    ? round1(rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length)
    : null;

  // Use actual distance for completed workouts in ACWR
  const acwrWorkouts = (acwrResult.data || []).map(w => ({
    workout_date: w.workout_date,
    status: w.status,
    distance_km: (w.status === 'completed' && w.actual_distance_km)
      ? w.actual_distance_km
      : w.distance_km,
  }));
  const acwr = calculateACWR(acwrWorkouts);

  const painFlags = readinessResult.data || [];
  const celebrations = await computeCelebrations(supabase, athleteId, completedRuns, planned, start);

  return {
    athleteId,
    name,
    email,
    week_start: start,
    week_end: end,
    adherence: {
      completed: completed.length,
      planned: planned.length,
      percent: planned.length > 0 ? Math.round((completed.length / planned.length) * 100) : null,
    },
    completed_runs: completedRuns,
    avg_rpe: avgRpe,
    acwr,
    pain_flags: painFlags,
    celebrations,
  };
}

async function computeCelebrations(supabase, athleteId, completedRuns, plannedThisWeek, weekStart) {
  const celebrations = [];
  if (completedRuns.length === 0) return celebrations;

  const [{ count: totalCompleted }, prevDistResult, prevPaceResult] = await Promise.all([
    supabase
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('status', 'completed'),

    supabase
      .from('workouts')
      .select('actual_distance_km')
      .eq('athlete_id', athleteId)
      .eq('status', 'completed')
      .lt('workout_date', weekStart)
      .gt('actual_distance_km', 0),

    supabase
      .from('workouts')
      .select('actual_avg_pace')
      .eq('athlete_id', athleteId)
      .eq('status', 'completed')
      .lt('workout_date', weekStart)
      .gt('actual_avg_pace', 0),
  ]);

  // First workout(s) ever
  if (totalCompleted !== null && totalCompleted <= completedRuns.length) {
    celebrations.push({ type: 'first_workout' });
  }

  // Longest run ever
  const thisWeekMaxDist = Math.max(0, ...completedRuns.map(r => parseFloat(r.actual_distance_km || 0)));
  if (thisWeekMaxDist > 0) {
    const prevDistances = (prevDistResult.data || []).map(w => parseFloat(w.actual_distance_km || 0));
    const prevMax = prevDistances.length > 0 ? Math.max(...prevDistances) : 0;
    if (prevMax > 0 && thisWeekMaxDist > prevMax) {
      celebrations.push({ type: 'longest_run', value_km: round1(thisWeekMaxDist) });
    }
  }

  // Best pace ever (lower sec/km = faster)
  const thisWeekPaces = completedRuns
    .map(r => parseFloat(r.actual_pace_sec_km || 0))
    .filter(p => p > 60 && p < 1200);

  if (thisWeekPaces.length > 0) {
    const thisWeekBest = Math.min(...thisWeekPaces);
    const prevPaces = (prevPaceResult.data || [])
      .map(w => parseFloat(w.actual_avg_pace || 0))
      .filter(p => p > 0);
    if (prevPaces.length > 0 && thisWeekBest < Math.min(...prevPaces)) {
      celebrations.push({ type: 'best_pace', value_sec_km: Math.round(thisWeekBest) });
    }
  }

  // 100% adherence week
  if (plannedThisWeek.length > 0 && completedRuns.length >= plannedThisWeek.length) {
    celebrations.push({ type: 'perfect_week' });
  }

  return celebrations;
}

export async function getAllAthletesSummary(supabase) {
  const { data: athletes, error } = await supabase
    .from('athletes')
    .select('id, profiles(full_name, email)')
    .order('created_at', { ascending: true });

  if (error) throw error;

  const summaries = await Promise.all(
    (athletes || []).map(a =>
      getAthleteWeeklySummary(supabase, {
        id: a.id,
        name: a.profiles?.full_name,
        email: a.profiles?.email,
      })
    )
  );

  return summaries;
}
