import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env'), override: true });
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { athleteRoutes } from './routes/athletes.js';
import { planRoutes } from './routes/plans.js';
import { workoutRoutes } from './routes/workouts.js';
import { intervalsRoutes } from './routes/intervals.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { readinessRoutes } from './routes/readiness.js';
import { feedbackRoutes } from './routes/feedback.js';
import { monitoringRoutes } from './routes/monitoring.js';
import { chatRoutes } from './routes/chat.js';
import { strengthRoutes } from './routes/strength.js';
import { stravaRoutes, stravaCallbackHandler } from './routes/strava.js';
import { emailRoutes } from './routes/email.js';
import { weeklySummaryRoutes } from './routes/weeklySummary.js';
import { authMiddleware } from './middleware/auth.js';
import { getAllAthletesSummary } from './services/weeklySummary.js';
import { sendWeeklySummaryEmail } from './routes/email.js';
import { syncIntervalsIcuActivities } from './services/intervalsSync.js';
import cron from 'node-cron';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim()),
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'runhub-api' });
});

// Welcome email — no user auth required (called right after signup)
app.use('/api/email', emailRoutes);

// Strava OAuth callback — no user auth required (redirect from Strava)
app.get('/api/strava/callback', (req, _res, next) => {
  req.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  next();
}, stravaCallbackHandler);

// Protected routes
app.use('/api/strava', authMiddleware, stravaRoutes);
app.use('/api/athletes', authMiddleware, athleteRoutes);
app.use('/api/plans', authMiddleware, planRoutes);
app.use('/api/workouts', authMiddleware, workoutRoutes);
app.use('/api/intervals', authMiddleware, intervalsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/readiness', authMiddleware, readinessRoutes);
app.use('/api/feedback', authMiddleware, feedbackRoutes);
app.use('/api/monitoring', authMiddleware, monitoringRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/strength', authMiddleware, strengthRoutes);
app.use('/api/weekly-summary', authMiddleware, weeklySummaryRoutes);

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`[RUNHUB API] Running on port ${PORT}`);
});

// Automated weekly summary: every Sunday at 21:00 UTC (4:00 PM Bogotá, UTC-5)
cron.schedule('0 21 * * 0', async () => {
  console.log('[CRON] Sending weekly summary email...');
  try {
    const supabase = (await import('@supabase/supabase-js')).createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    const summaries = await getAllAthletesSummary(supabase);
    await sendWeeklySummaryEmail(summaries);
    console.log(`[CRON] Weekly summary sent for ${summaries.length} athletes`);
  } catch (err) {
    console.error('[CRON] Weekly summary failed:', err.message);
  }
}, { timezone: 'UTC' });

// Daily Intervals.icu auto-sync: 13:00 UTC = 8:00 AM Bogotá (UTC-5)
cron.schedule('0 13 * * *', async () => {
  console.log('[CRON] Running Intervals.icu auto-sync...');
  try {
    const supabase = (await import('@supabase/supabase-js')).createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    const { data: athletes } = await supabase
      .from('athletes')
      .select('id, name')
      .not('intervals_icu_api_key', 'is', null)
      .not('intervals_icu_athlete_id', 'is', null);

    let totalSynced = 0;
    for (const athlete of athletes || []) {
      try {
        const result = await syncIntervalsIcuActivities(supabase, athlete.id, { daysBack: 7 });
        totalSynced += result.synced;
        console.log(`[CRON] ${athlete.name || athlete.id}: synced ${result.synced}/${result.fetched}`);
      } catch (err) {
        console.error(`[CRON] ${athlete.name || athlete.id}: ${err.message}`);
      }
    }
    console.log(`[CRON] Intervals.icu auto-sync done: ${totalSynced} workouts updated across ${athletes?.length || 0} athletes`);
  } catch (err) {
    console.error('[CRON] Intervals.icu auto-sync failed:', err.message);
  }
}, { timezone: 'UTC' });
