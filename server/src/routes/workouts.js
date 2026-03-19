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

// POST reschedule a workout to a different day within the same week (athlete only)
workoutRoutes.post('/:id/reschedule', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { new_date } = req.body; // 'YYYY-MM-DD'

    if (req.profile.role !== 'athlete') {
      return res.status(403).json({ message: 'Only athletes can reschedule workouts' });
    }

    if (!new_date) {
      return res.status(400).json({ message: 'new_date is required' });
    }

    // Fetch the workout
    const { data: workout, error: fetchErr } = await req.supabase
      .from('workouts')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !workout) {
      return res.status(404).json({ message: 'Workout not found' });
    }

    // Must be the athlete's own workout
    if (workout.athlete_id !== req.profile.id) {
      return res.status(403).json({ message: 'You can only reschedule your own workouts' });
    }

    // Cannot reschedule completed workouts
    if (workout.status === 'completed') {
      return res.status(400).json({ message: 'Cannot reschedule a completed workout' });
    }

    // Cannot reschedule rest days
    if (workout.workout_type === 'rest') {
      return res.status(400).json({ message: 'Cannot reschedule rest days' });
    }

    // Validate new_date is within the same week (Mon-Sun) as the workout
    const workoutDate = new Date(workout.workout_date + 'T00:00:00');
    const newDate = new Date(new_date + 'T00:00:00');

    // Get Monday of workout's week
    const day = workoutDate.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(workoutDate);
    monday.setUTCDate(monday.getUTCDate() + mondayOffset);
    monday.setUTCHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    if (newDate < monday || newDate > sunday) {
      return res.status(400).json({ message: 'Can only reschedule within the same week' });
    }

    // Determine new day_of_week
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const newDayOfWeek = dayNames[newDate.getUTCDay()];

    const originalDate = workout.rescheduled_from_date || workout.workout_date;

    const { data, error } = await req.supabase
      .from('workouts')
      .update({
        workout_date: new_date,
        day_of_week: newDayOfWeek,
        rescheduled_from_date: originalDate,
      })
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
