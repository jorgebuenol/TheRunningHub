import { Router } from 'express';
import { coachOnly } from '../middleware/auth.js';
import { sendChatMessage, sendPlanReviewMessage } from '../services/chatContext.js';

export const chatRoutes = Router();

// POST — send a chat message with athlete context
chatRoutes.post('/', coachOnly, async (req, res, next) => {
  try {
    const { athleteId, message, history } = req.body;

    if (!athleteId || !message) {
      return res.status(400).json({ message: 'athleteId and message are required' });
    }

    const reply = await sendChatMessage(req.supabase, athleteId, message, history || []);
    res.json(reply);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('credit balance')) {
      return res.status(402).json({ message: 'Anthropic API credits exhausted. Please add credits at console.anthropic.com.' });
    }
    next(err);
  }
});

// POST — plan review chat with structured adjustments
chatRoutes.post('/plan-review', coachOnly, async (req, res, next) => {
  try {
    const { planId, athleteId, message, history } = req.body;

    if (!planId || !athleteId || !message) {
      return res.status(400).json({ message: 'planId, athleteId, and message are required' });
    }

    const reply = await sendPlanReviewMessage(req.supabase, athleteId, planId, message, history || []);
    res.json(reply);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('credit balance')) {
      return res.status(402).json({ message: 'Anthropic API credits exhausted. Please add credits at console.anthropic.com.' });
    }
    next(err);
  }
});
