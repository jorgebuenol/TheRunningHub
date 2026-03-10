import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';
import { getDashboardFlags } from '../services/monitoring.js';
import { getOverallProgress } from '../utils/onboardingProgress.js';

export const dashboardRoutes = Router();

// GET coach dashboard data
dashboardRoutes.get('/', coachOnly, async (req, res, next) => {
  try {
    // Fetch all athletes with profiles and active plans (include all fields for onboarding progress)
    const { data: athletes, error } = await req.supabase
      .from('athletes')
      .select(`
        *,
        profiles(full_name, email, avatar_url),
        training_plans(id, name, status, race_date, total_weeks, created_at)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // For each athlete, get their most recent workout
    const dashboard = await Promise.all(
      (athletes || []).map(async (athlete) => {
        const { data: recentWorkout } = await req.supabase
          .from('workouts')
          .select('workout_date, workout_type, title, status')
          .eq('athlete_id', athlete.id)
          .eq('status', 'completed')
          .order('workout_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        const activePlan = athlete.training_plans?.find(p => p.status === 'approved');
        const weeksToRace = athlete.goal_race_date
          ? Math.ceil((new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000))
          : null;

        // Count completed workouts this week
        const weekStart = getMonday(new Date()).toISOString().split('T')[0];
        const { count: workoutsThisWeek } = await req.supabase
          .from('workouts')
          .select('id', { count: 'exact', head: true })
          .eq('athlete_id', athlete.id)
          .eq('status', 'completed')
          .gte('workout_date', weekStart);

        // Get monitoring flags
        const monitoring = await getDashboardFlags(req.supabase, athlete.id);

        // Compute onboarding progress
        const onboarding = getOverallProgress(athlete);

        return {
          id: athlete.id,
          name: athlete.profiles?.full_name,
          email: athlete.profiles?.email,
          avatar: athlete.profiles?.avatar_url,
          vdot: athlete.vdot,
          weekly_km: athlete.weekly_km,
          goal_race: athlete.goal_race,
          goal_race_date: athlete.goal_race_date,
          weeks_to_race: weeksToRace,
          active_plan: activePlan || null,
          last_activity: recentWorkout || null,
          workouts_this_week: workoutsThisWeek || 0,
          monitoring,
          onboarding,
        };
      })
    );

    res.json({
      total_athletes: dashboard.length,
      athletes: dashboard,
    });
  } catch (err) {
    next(err);
  }
});

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
