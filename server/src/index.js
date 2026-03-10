import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env'), override: true });
import express from 'express';
import cors from 'cors';
import { athleteRoutes } from './routes/athletes.js';
import { planRoutes } from './routes/plans.js';
import { workoutRoutes } from './routes/workouts.js';
import { intervalsRoutes } from './routes/intervals.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { readinessRoutes } from './routes/readiness.js';
import { feedbackRoutes } from './routes/feedback.js';
import { monitoringRoutes } from './routes/monitoring.js';
import { chatRoutes } from './routes/chat.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'runhub-api' });
});

// Protected routes
app.use('/api/athletes', authMiddleware, athleteRoutes);
app.use('/api/plans', authMiddleware, planRoutes);
app.use('/api/workouts', authMiddleware, workoutRoutes);
app.use('/api/intervals', authMiddleware, intervalsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/readiness', authMiddleware, readinessRoutes);
app.use('/api/feedback', authMiddleware, feedbackRoutes);
app.use('/api/monitoring', authMiddleware, monitoringRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);

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
