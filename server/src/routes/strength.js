import { Router } from 'express';

export const strengthRoutes = Router();

// POST — create or upsert a strength session
strengthRoutes.post('/', async (req, res, next) => {
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

    const sessionData = {
      athlete_id: athleteId,
      session_date: body.session_date || new Date().toISOString().split('T')[0],
      duration_minutes: body.duration_minutes,
      intensity: body.intensity,
      activity_type: body.activity_type || 'strength',
      distance_km: body.distance_km || null,
      avg_pace_sec: body.avg_pace_sec || null,
      avg_hr: body.avg_hr || null,
      max_hr: body.max_hr || null,
      elevation_m: body.elevation_m || null,
      notes: body.notes || null,
    };

    // Upsert — allow updating same-day same-activity-type session
    const { data, error } = await req.supabase
      .from('strength_sessions')
      .upsert(sessionData, { onConflict: 'athlete_id,session_date,activity_type' })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// GET — strength sessions for an athlete with optional date range
strengthRoutes.get('/athlete/:athleteId', async (req, res, next) => {
  try {
    let query = req.supabase
      .from('strength_sessions')
      .select('*')
      .eq('athlete_id', req.params.athleteId)
      .order('session_date', { ascending: true });

    if (req.query.start) query = query.gte('session_date', req.query.start);
    if (req.query.end) query = query.lte('session_date', req.query.end);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// DELETE — remove a strength session
strengthRoutes.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from('strength_sessions')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
