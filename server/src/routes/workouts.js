import { Router } from 'express';

export const workoutRoutes = Router();

// PATCH update a workout (coach edits or athlete notes)
workoutRoutes.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body;

    // Athletes can only update athlete_notes and status
    const allowedAthleteFields = ['athlete_notes', 'status'];
    let updates = {};

    if (req.profile.role === 'coach') {
      updates = body;
    } else {
      for (const field of allowedAthleteFields) {
        if (body[field] !== undefined) updates[field] = body[field];
      }
    }

    const { data, error } = await req.supabase
      .from('workouts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET workouts for a date range
workoutRoutes.get('/range/:athleteId', async (req, res, next) => {
  try {
    const { athleteId } = req.params;
    const { start, end } = req.query;

    let query = req.supabase
      .from('workouts')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('workout_date', { ascending: true });

    if (start) query = query.gte('workout_date', start);
    if (end) query = query.lte('workout_date', end);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});
