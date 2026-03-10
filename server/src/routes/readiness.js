import { Router } from 'express';

export const readinessRoutes = Router();

// POST — submit daily readiness check-in
readinessRoutes.post('/', async (req, res, next) => {
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

    const readinessData = {
      athlete_id: athleteId,
      check_in_date: body.check_in_date || new Date().toISOString().split('T')[0],
      energy: body.energy,
      sleep_hours: body.sleep_hours,
      sleep_quality: body.sleep_quality,
      soreness: body.soreness,
      stress: body.stress,
      motivation: body.motivation,
      pain_flag: body.pain_flag || false,
      pain_location: body.pain_location || null,
      pain_severity: body.pain_severity || null,
      resting_hr: body.resting_hr || null,
      hrv: body.hrv || null,
      weight_kg: body.weight_kg || null,
      notes: body.notes || null,
    };

    // Upsert — allow updating same-day check-in
    const { data, error } = await req.supabase
      .from('daily_readiness')
      .upsert(readinessData, { onConflict: 'athlete_id,check_in_date' })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// GET — readiness history for an athlete (default last 30 days)
readinessRoutes.get('/athlete/:athleteId', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await req.supabase
      .from('daily_readiness')
      .select('*')
      .eq('athlete_id', req.params.athleteId)
      .gte('check_in_date', since.toISOString().split('T')[0])
      .order('check_in_date', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET — today's check-in for an athlete
readinessRoutes.get('/today/:athleteId', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await req.supabase
      .from('daily_readiness')
      .select('*')
      .eq('athlete_id', req.params.athleteId)
      .eq('check_in_date', today)
      .maybeSingle();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});
