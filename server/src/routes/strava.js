import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';

export const stravaRoutes = Router();

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API = 'https://www.strava.com/api/v3';

/* ─── GET /connect/:athleteId — redirect athlete to Strava OAuth ─── */
stravaRoutes.get('/connect/:athleteId', async (req, res) => {
  const { athleteId } = req.params;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({ message: 'Strava not configured on server' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: athleteId, // pass athleteId through OAuth state
  });

  res.json({ url: `${STRAVA_AUTH_URL}?${params}` });
});

/* ─── GET /callback — Strava OAuth callback (exported standalone for unprotected mount) ─── */
export async function stravaCallbackHandler(req, res) {
  const { code, state: athleteId } = req.query;

  if (!code || !athleteId) {
    return res.status(400).json({ message: 'Missing code or state' });
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Strava token exchange failed:', err);
      return res.status(400).json({ message: 'Strava token exchange failed' });
    }

    const tokenData = await tokenRes.json();

    // Save tokens to athletes table
    const { error } = await req.supabase
      .from('athletes')
      .update({
        strava_access_token: tokenData.access_token,
        strava_refresh_token: tokenData.refresh_token,
        strava_token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
        strava_athlete_id: String(tokenData.athlete?.id || ''),
      })
      .eq('id', athleteId);

    if (error) {
      console.error('Failed to save Strava tokens:', error);
      return res.status(500).json({ message: 'Failed to save Strava connection' });
    }

    // Redirect to frontend profile page with success
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/profile?strava=connected`);
  } catch (err) {
    console.error('Strava callback error:', err);
    res.status(500).json({ message: 'Strava callback failed' });
  }
}

/* ─── Helper: refresh token if expired ─── */
async function refreshTokenIfNeeded(supabase, athlete) {
  const expiresAt = new Date(athlete.strava_token_expires_at);
  if (expiresAt > new Date()) {
    return athlete.strava_access_token; // still valid
  }

  const tokenRes = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: athlete.strava_refresh_token,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error('Failed to refresh Strava token');
  }

  const tokenData = await tokenRes.json();

  await supabase
    .from('athletes')
    .update({
      strava_access_token: tokenData.access_token,
      strava_refresh_token: tokenData.refresh_token,
      strava_token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
    })
    .eq('id', athlete.id);

  return tokenData.access_token;
}

/* ─── Strava activity type → workout type mapping ─── */
function mapStravaType(stravaType) {
  const map = {
    Run: 'easy',
    TrailRun: 'easy',
    VirtualRun: 'easy',
    Walk: 'walking',
    Hike: 'walking',
    Ride: 'cycling',
    VirtualRide: 'cycling',
    Swim: 'swimming',
    WeightTraining: 'strength',
    Yoga: 'pilates',
    Workout: 'cross_training',
  };
  return map[stravaType] || 'other';
}

/* ─── POST /sync/:athleteId — sync last 7 days from Strava ─── */
stravaRoutes.post('/sync/:athleteId', async (req, res) => {
  const { athleteId } = req.params;

  try {
    // Get athlete with Strava tokens
    const { data: athlete, error: athErr } = await req.supabase
      .from('athletes')
      .select('id, strava_access_token, strava_refresh_token, strava_token_expires_at, strava_athlete_id')
      .eq('id', athleteId)
      .single();

    if (athErr || !athlete) {
      return res.status(404).json({ message: 'Athlete not found' });
    }
    if (!athlete.strava_access_token) {
      return res.status(400).json({ message: 'Strava not connected' });
    }

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(req.supabase, athlete);

    // Fetch last 7 days of activities
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const activitiesRes = await fetch(
      `${STRAVA_API}/athlete/activities?after=${sevenDaysAgo}&per_page=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!activitiesRes.ok) {
      const errText = await activitiesRes.text();
      console.error('Strava activities fetch failed:', errText);
      return res.status(502).json({ message: 'Failed to fetch Strava activities' });
    }

    const activities = await activitiesRes.json();
    console.log(`Strava sync: fetched ${activities.length} activities for athlete ${athleteId}`);
    activities.forEach(a => console.log(`  - ${a.start_date_local?.split('T')[0]} | ${a.type} | ${a.name} | ${(a.distance/1000).toFixed(1)}km`));

    // Get athlete's workouts in the same date range
    const startDate = new Date(sevenDaysAgo * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const { data: workouts } = await req.supabase
      .from('workouts')
      .select('id, workout_date, workout_type, status')
      .eq('athlete_id', athleteId)
      .gte('workout_date', startDate)
      .lte('workout_date', endDate);

    console.log(`Strava sync: found ${workouts?.length || 0} workouts in date range ${startDate} to ${endDate}`);
    workouts?.forEach(w => console.log(`  - ${w.workout_date} | ${w.workout_type} | status: ${w.status}`));

    let synced = 0;
    const runTypes = ['easy', 'tempo', 'long_run', 'intervals', 'race_pace', 'recovery', 'race'];

    for (const activity of activities) {
      const actDate = activity.start_date_local?.split('T')[0];
      if (!actDate) continue;

      const stravaWorkoutType = mapStravaType(activity.type);
      const isRun = activity.type === 'Run' || activity.type === 'TrailRun' || activity.type === 'VirtualRun';

      // Try to match to a planned workout
      const match = workouts?.find(w => {
        if (w.workout_date !== actDate) return false;
        if (w.status === 'completed') return false;
        if (isRun && runTypes.includes(w.workout_type)) return true;
        if (w.workout_type === stravaWorkoutType) return true;
        return false;
      });

      if (match) {
        // Update existing workout with actuals
        const distKm = +(activity.distance / 1000).toFixed(2);
        const durationMin = +(activity.moving_time / 60).toFixed(1);
        const paceSecKm = activity.distance > 0
          ? Math.round(activity.moving_time / (activity.distance / 1000))
          : null;

        await req.supabase
          .from('workouts')
          .update({
            status: 'completed',
            actual_distance_km: distKm,
            actual_duration_minutes: durationMin,
            actual_avg_pace: paceSecKm,
            actual_avg_hr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
          })
          .eq('id', match.id);

        // Remove from pool so we don't double-match
        const idx = workouts.indexOf(match);
        if (idx !== -1) workouts.splice(idx, 1);

        synced++;
      } else {
        // No matching workout — log as a strength/activity session
        const distKm = activity.distance ? +(activity.distance / 1000).toFixed(2) : null;
        const durationMin = +(activity.moving_time / 60).toFixed(1);
        const intensity = activity.average_heartrate
          ? (activity.average_heartrate > 160 ? 'hard' : activity.average_heartrate > 140 ? 'moderate' : 'easy')
          : 'moderate';

        await req.supabase
          .from('strength_sessions')
          .insert({
            athlete_id: athleteId,
            session_date: actDate,
            activity_type: stravaWorkoutType === 'easy' ? 'easy_run' : stravaWorkoutType,
            duration_minutes: durationMin,
            distance_km: distKm,
            intensity,
            notes: `Synced from Strava: ${activity.name}`,
          });

        synced++;
      }
    }

    res.json({ synced, total: activities.length });
  } catch (err) {
    console.error('Strava sync error:', err);
    res.status(500).json({ message: err.message || 'Strava sync failed' });
  }
});

/* ─── POST /disconnect/:athleteId — remove Strava connection ─── */
stravaRoutes.post('/disconnect/:athleteId', async (req, res) => {
  const { athleteId } = req.params;

  const { error } = await req.supabase
    .from('athletes')
    .update({
      strava_access_token: null,
      strava_refresh_token: null,
      strava_token_expires_at: null,
      strava_athlete_id: null,
    })
    .eq('id', athleteId);

  if (error) {
    return res.status(500).json({ message: 'Failed to disconnect Strava' });
  }

  res.json({ message: 'Strava disconnected' });
});

/* ─── GET /status/:athleteId — check if Strava is connected ─── */
stravaRoutes.get('/status/:athleteId', async (req, res) => {
  const { athleteId } = req.params;

  const { data, error } = await req.supabase
    .from('athletes')
    .select('strava_athlete_id, strava_token_expires_at')
    .eq('id', athleteId)
    .single();

  if (error || !data) {
    return res.status(404).json({ message: 'Athlete not found' });
  }

  res.json({
    connected: !!data.strava_athlete_id,
    strava_athlete_id: data.strava_athlete_id || null,
  });
});
