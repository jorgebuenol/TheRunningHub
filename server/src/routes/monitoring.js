import { Router } from 'express';
import { getAthleteMonitoringSummary } from '../services/monitoring.js';

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
