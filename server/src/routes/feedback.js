import { Router } from 'express';

export const feedbackRoutes = Router();

// POST — submit post-workout feedback
feedbackRoutes.post('/', async (req, res, next) => {
  try {
    const body = req.body;

    // Get athlete_id from body or look up via profile
    let athleteId = body.athlete_id;
    if (!athleteId) {
      const { data: athlete } = await req.supabase
        .from('athletes')
        .select('id')
        .eq('profile_id', req.user.id)
        .single();
      if (!athlete) return res.status(404).json({ message: 'Athlete profile not found' });
      athleteId = athlete.id;
    }

    const feedbackData = {
      workout_id: body.workout_id,
      athlete_id: athleteId,
      rpe: body.rpe,
      completed: body.completed !== undefined ? body.completed : true,
      actual_distance_km: body.actual_distance_km || null,
      actual_duration_minutes: body.actual_duration_minutes || null,
      actual_pace_sec_km: body.actual_pace_sec_km || null,
      avg_hr: body.avg_hr || null,
      max_hr: body.max_hr || null,
      feeling: body.feeling || null,
      notes: body.notes || null,
    };

    // Upsert by workout_id
    const { data, error } = await req.supabase
      .from('workout_feedback')
      .upsert(feedbackData, { onConflict: 'workout_id' })
      .select()
      .single();

    if (error) throw error;

    // Also mark the workout as completed and copy actuals to workouts table
    if (feedbackData.completed) {
      await req.supabase
        .from('workouts')
        .update({
          status: 'completed',
          actual_distance_km: feedbackData.actual_distance_km,
          actual_duration_minutes: feedbackData.actual_duration_minutes,
          actual_avg_pace: feedbackData.actual_pace_sec_km,
          actual_avg_hr: feedbackData.avg_hr,
        })
        .eq('id', body.workout_id);
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// GET — feedback for a specific workout
feedbackRoutes.get('/workout/:workoutId', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('workout_feedback')
      .select('*')
      .eq('workout_id', req.params.workoutId)
      .maybeSingle();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET — recent feedback for an athlete
feedbackRoutes.get('/athlete/:athleteId', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const { data, error } = await req.supabase
      .from('workout_feedback')
      .select('*, workouts(workout_date, title, workout_type, distance_km, duration_minutes)')
      .eq('athlete_id', req.params.athleteId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});
