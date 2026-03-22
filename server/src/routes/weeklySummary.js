import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';
import { getAllAthletesSummary } from '../services/weeklySummary.js';
import { sendWeeklySummaryEmail } from './email.js';

export const weeklySummaryRoutes = Router();

// GET /api/weekly-summary — returns all athletes' weekly summary data
weeklySummaryRoutes.get('/', coachOnly, async (req, res, next) => {
  try {
    const summaries = await getAllAthletesSummary(req.supabase);
    res.json({ summaries, generated_at: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// POST /api/weekly-summary/send-email — manually trigger the weekly email
weeklySummaryRoutes.post('/send-email', coachOnly, async (req, res, next) => {
  try {
    const summaries = await getAllAthletesSummary(req.supabase);
    await sendWeeklySummaryEmail(summaries);
    res.json({ success: true, athletes_count: summaries.length });
  } catch (err) {
    next(err);
  }
});
