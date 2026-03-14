import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';
import { getBestVDOT, getTrainingPaces } from '../utils/vdot.js';
import { isOnboardingComplete } from '../utils/onboardingProgress.js';
import { syncAthletePaces } from '../services/paceSync.js';

export const athleteRoutes = Router();

// GET own athlete profile (athlete self-service) — must be before /:id
athleteRoutes.get('/me', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('athletes')
      .select('*, training_plans(id, name, status, race_date, goal_race)')
      .eq('profile_id', req.user.id)
      .single();

    if (error || !data) {
      // Auto-create athlete record for self-signed-up users
      console.log('Auto-create athlete for user:', req.user.id, 'profile exists:', !!req.profile);

      const { data: newAthlete, error: insertErr } = await req.supabase
        .from('athletes')
        .insert({ profile_id: req.user.id })
        .select()
        .single();

      if (insertErr) {
        console.error('Auto-create athlete insert failed:', insertErr);
        return res.status(500).json({ message: 'Could not create athlete profile.', detail: insertErr.message });
      }

      console.log('Auto-created athlete:', newAthlete.id);
      return res.json(newAthlete);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET all athletes (coach only)
athleteRoutes.get('/', coachOnly, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('athletes')
      .select(`
        *,
        profiles(full_name, email, avatar_url),
        training_plans(id, name, status, race_date, goal_race)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET single athlete
athleteRoutes.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('athletes')
      .select(`
        *,
        profiles(full_name, email, avatar_url),
        training_plans(id, name, status, race_date, goal_race, total_weeks, created_at)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Athlete not found' });

    // Check access: coach or own profile
    if (req.profile.role !== 'coach' && data.profile_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST create athlete profile (coach creates new athlete with auth account)
athleteRoutes.post('/', coachOnly, async (req, res, next) => {
  try {
    const body = req.body;
    let profileId;

    // If email & password provided, create a new Supabase auth user first
    if (body.email && body.password) {
      const { data: authData, error: authErr } = await req.supabase.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          full_name: body.full_name || 'New Athlete',
          role: 'athlete',
        },
      });

      if (authErr) throw new Error(`Auth error: ${authErr.message}`);
      profileId = authData.user.id;

      // Small delay to let the trigger create the profile row
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify profile was created by trigger, create manually if not
      const { data: existingProfile } = await req.supabase
        .from('profiles')
        .select('id')
        .eq('id', profileId)
        .single();

      if (!existingProfile) {
        await req.supabase.from('profiles').insert({
          id: profileId,
          email: body.email,
          full_name: body.full_name || 'New Athlete',
          role: 'athlete',
        });
      }
    } else {
      profileId = body.profile_id || req.user.id;
    }

    // Calculate VDOT from race times
    const raceTimes = {
      time_5k: body.time_5k,
      time_10k: body.time_10k,
      time_half_marathon: body.time_half_marathon,
      time_marathon: body.time_marathon,
    };

    const vdot = getBestVDOT(raceTimes);
    const paces = getTrainingPaces(vdot);

    const athleteData = {
      profile_id: profileId,
      age: body.age,
      weight_kg: body.weight_kg,
      height_cm: body.height_cm,
      body_fat_pct: body.body_fat_pct,
      weekly_km: body.weekly_km,
      time_5k: body.time_5k,
      time_10k: body.time_10k,
      time_half_marathon: body.time_half_marathon,
      time_marathon: body.time_marathon,
      vdot,
      goal_race: body.goal_race,
      goal_time_seconds: body.goal_time_seconds,
      goal_race_date: body.goal_race_date,
      available_days: body.available_days || [],
      available_time_start: body.available_time_start,
      available_time_end: body.available_time_end,
      injuries: body.injuries,
      gps_watch_model: body.gps_watch_model,
      intervals_icu_api_key: body.intervals_icu_api_key,
      intervals_icu_athlete_id: body.intervals_icu_athlete_id,
      ...paces,
    };

    const { data, error } = await req.supabase
      .from('athletes')
      .insert(athleteData)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH update athlete
athleteRoutes.patch('/:id', async (req, res, next) => {
  try {
    const body = req.body;

    // Verify access: coach or own profile
    const { data: athleteRecord } = await req.supabase
      .from('athletes')
      .select('profile_id')
      .eq('id', req.params.id)
      .single();

    if (!athleteRecord) {
      return res.status(404).json({ message: 'Athlete not found' });
    }
    if (req.profile.role !== 'coach' && athleteRecord.profile_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Build updates from allowed flat fields
    const allowedFlatFields = [
      'age', 'weight_kg', 'height_cm', 'body_fat_pct', 'weekly_km',
      'time_5k', 'time_10k', 'time_half_marathon', 'time_marathon',
      'goal_race', 'goal_time_seconds', 'goal_race_date',
      'available_days', 'available_time_start', 'available_time_end',
      'injuries', 'gps_watch_model',
      'intervals_icu_api_key', 'intervals_icu_athlete_id',
    ];
    const allowedJsonbFields = [
      'sleep_data', 'nutrition_data', 'work_life_data',
      'recovery_data', 'current_training_data',
    ];

    let updates = {};
    for (const field of allowedFlatFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    for (const field of allowedJsonbFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Recalculate VDOT if race times changed
    let newPaces = null;
    if (updates.time_5k || updates.time_10k || updates.time_half_marathon || updates.time_marathon) {
      const { data: current } = await req.supabase
        .from('athletes')
        .select('time_5k, time_10k, time_half_marathon, time_marathon')
        .eq('id', req.params.id)
        .single();

      const raceTimes = {
        time_5k: updates.time_5k ?? current?.time_5k,
        time_10k: updates.time_10k ?? current?.time_10k,
        time_half_marathon: updates.time_half_marathon ?? current?.time_half_marathon,
        time_marathon: updates.time_marathon ?? current?.time_marathon,
      };

      const vdot = getBestVDOT(raceTimes);
      newPaces = getTrainingPaces(vdot);
      updates = { ...updates, vdot, ...newPaces };
    }

    const { data, error } = await req.supabase
      .from('athletes')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Sync paces to all future uncompleted workouts
    if (newPaces) {
      await syncAthletePaces(req.supabase, req.params.id, newPaces);
    }

    // Update onboarding_completed_at based on current state
    const complete = isOnboardingComplete(data);
    if (complete && !data.onboarding_completed_at) {
      await req.supabase.from('athletes')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', req.params.id);
      data.onboarding_completed_at = new Date().toISOString();
    } else if (!complete && data.onboarding_completed_at) {
      await req.supabase.from('athletes')
        .update({ onboarding_completed_at: null })
        .eq('id', req.params.id);
      data.onboarding_completed_at = null;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST sync paces — recalculates from current VDOT and updates all future workouts
athleteRoutes.post('/:id/sync-paces', coachOnly, async (req, res, next) => {
  try {
    const { data: athlete, error } = await req.supabase
      .from('athletes')
      .select('id, vdot, pace_easy_min, pace_easy_max, pace_tempo, pace_lt, pace_race, pace_vo2max')
      .eq('id', req.params.id)
      .single();

    if (error || !athlete) return res.status(404).json({ message: 'Athlete not found' });
    if (!athlete.vdot) return res.status(400).json({ message: 'No VDOT set for this athlete' });

    const paces = {
      pace_easy_min: athlete.pace_easy_min,
      pace_easy_max: athlete.pace_easy_max,
      pace_tempo: athlete.pace_tempo,
      pace_lt: athlete.pace_lt,
      pace_race: athlete.pace_race,
      pace_vo2max: athlete.pace_vo2max,
    };

    const result = await syncAthletePaces(req.supabase, req.params.id, paces);
    res.json({ message: `Synced ${result.updated} workouts`, ...result });
  } catch (err) {
    next(err);
  }
});

// DELETE athlete (coach only) — cascade deletes all related data
athleteRoutes.delete('/:id', coachOnly, async (req, res, next) => {
  try {
    const athleteId = req.params.id;

    // 1. Fetch athlete to get profile_id
    const { data: athlete, error: fetchErr } = await req.supabase
      .from('athletes')
      .select('id, profile_id, profiles(full_name)')
      .eq('id', athleteId)
      .single();

    if (fetchErr || !athlete) {
      return res.status(404).json({ message: 'Athlete not found' });
    }

    const profileId = athlete.profile_id;

    // 2. Delete athletes row — CASCADE handles training_plans, plan_weeks, workouts, feedback, readiness
    const { error: deleteErr } = await req.supabase
      .from('athletes')
      .delete()
      .eq('id', athleteId);

    if (deleteErr) throw deleteErr;

    // 3. Delete profile row
    await req.supabase
      .from('profiles')
      .delete()
      .eq('id', profileId);

    // 4. Delete auth user account
    const { error: authErr } = await req.supabase.auth.admin.deleteUser(profileId);
    if (authErr) {
      console.warn(`Athlete data deleted but auth user removal failed: ${authErr.message}`);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
