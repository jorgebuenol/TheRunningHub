import { Router } from 'express';
import { getAthleteMonitoringSummary } from '../services/monitoring.js';
import { getAthleteProgress } from '../services/progress.js';

export const monitoringRoutes = Router();

// GET — full monitoring summary for an athlete
monitoringRoutes.get('/:athleteId', async (req, res, next) => {
  try {
    const summary = await getAthleteMonitoringSummary(req.supabase, req.params.athleteId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// GET — progress stats for charts (coach + athlete views)
monitoringRoutes.get('/:athleteId/progress', async (req, res, next) => {
  try {
    const progress = await getAthleteProgress(req.supabase, req.params.athleteId);
    res.json(progress);
  } catch (err) {
    next(err);
  }
});
