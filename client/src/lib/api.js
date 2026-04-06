import { supabase } from './supabase.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
  };
}

async function request(path, options = {}) {
  const headers = await getAuthHeaders();
  const { timeout, ...fetchOptions } = options;

  // AbortController for timeout (default 30s, AI calls get longer)
  const controller = new AbortController();
  const timeoutMs = timeout || 30000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers: { ...headers, ...fetchOptions.headers },
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      const err = new Error(error.message || 'API request failed');
      if (error.missing_sections) err.missing_sections = error.missing_sections;
      throw err;
    }

    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. The AI is taking too long — try a smaller adjustment (e.g. one specific week).');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // Athletes
  getAthletes: () => request('/api/athletes'),
  getAthlete: (id) => request(`/api/athletes/${id}`),
  getMyProfile: () => request('/api/athletes/me'),
  createAthlete: (data) => request('/api/athletes', { method: 'POST', body: JSON.stringify(data) }),
  updateAthlete: (id, data) => request(`/api/athletes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAthlete: (id) => request(`/api/athletes/${id}`, { method: 'DELETE' }),

  // Training Plans
  generatePlan: (athleteId, overrides = {}) => request(`/api/plans/generate/${athleteId}`, {
    method: 'POST',
    body: JSON.stringify(overrides),
    timeout: 120000,
  }),
  getPlan: (planId) => request(`/api/plans/${planId}`),
  generateWeekDetail: (planId, weekId) => request(`/api/plans/${planId}/weeks/${weekId}/generate`, { method: 'POST', timeout: 120000 }),
  deletePlan: (planId) => request(`/api/plans/${planId}`, { method: 'DELETE' }),
  deleteWeek: (planId, weekId) => request(`/api/plans/${planId}/weeks/${weekId}`, { method: 'DELETE' }),
  getAthletePlans: (athleteId) => request(`/api/plans/athlete/${athleteId}`),
  updateWorkout: (workoutId, data) => request(`/api/workouts/${workoutId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  rescheduleWorkout: (workoutId, newDate) => request(`/api/workouts/${workoutId}/reschedule`, { method: 'POST', body: JSON.stringify({ new_date: newDate }) }),
  getWorkoutsInRange: (athleteId, start, end) => request(`/api/workouts/range/${athleteId}?start=${start}&end=${end}`),

  // Plan Review Workflow
  approvePlan: (planId) => request(`/api/plans/${planId}/approve`, { method: 'POST' }),
  unpublishPlan: (planId) => request(`/api/plans/${planId}/unpublish`, { method: 'POST' }),
  applyPlanAdjustments: (planId, adjustments) =>
    request(`/api/plans/${planId}/apply-adjustments`, { method: 'POST', body: JSON.stringify({ adjustments }) }),
  getPlanVersions: (planId) => request(`/api/plans/${planId}/versions`),
  sendPlanReviewMessage: (planId, athleteId, message, history = []) =>
    request('/api/chat/plan-review', { method: 'POST', body: JSON.stringify({ planId, athleteId, message, history }), timeout: 120000 }),

  // Intervals.icu
  syncToIntervals: (athleteId, planId) => request(`/api/intervals/push/${athleteId}/${planId}`, { method: 'POST' }),
  pullFromIntervals: (athleteId) => request(`/api/intervals/pull/${athleteId}`, { method: 'POST' }),

  // Dashboard
  getDashboard: () => request('/api/dashboard'),

  // Readiness
  submitReadiness: (data) => request('/api/readiness', { method: 'POST', body: JSON.stringify(data) }),
  getReadiness: (athleteId, days = 30) => request(`/api/readiness/athlete/${athleteId}?days=${days}`),
  getTodayReadiness: (athleteId) => request(`/api/readiness/today/${athleteId}`),

  // Workout Feedback
  submitFeedback: (data) => request('/api/feedback', { method: 'POST', body: JSON.stringify(data) }),
  getWorkoutFeedback: (workoutId) => request(`/api/feedback/workout/${workoutId}`),
  getAthleteFeedback: (athleteId, limit = 20) => request(`/api/feedback/athlete/${athleteId}?limit=${limit}`),

  // Monitoring
  getMonitoring: (athleteId) => request(`/api/monitoring/${athleteId}`),
  getProgress: (athleteId) => request(`/api/monitoring/${athleteId}/progress`),

  // Strength Sessions
  createStrengthSession: (data) => request('/api/strength', { method: 'POST', body: JSON.stringify(data) }),
  updateStrengthSession: (id, data) => request(`/api/strength/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getStrengthSessions: (athleteId, start, end) => {
    let url = `/api/strength/athlete/${athleteId}`;
    if (start && end) url += `?start=${start}&end=${end}`;
    return request(url);
  },
  deleteStrengthSession: (id) => request(`/api/strength/${id}`, { method: 'DELETE' }),

  // AI Chat
  sendChatMessage: (athleteId, message, history = []) =>
    request('/api/chat', { method: 'POST', body: JSON.stringify({ athleteId, message, history }), timeout: 120000 }),

  // Strava
  stravaConnect: (athleteId) => request(`/api/strava/connect/${athleteId}`),
  stravaSync: (athleteId) => request(`/api/strava/sync/${athleteId}`, { method: 'POST' }),
  stravaDisconnect: (athleteId) => request(`/api/strava/disconnect/${athleteId}`, { method: 'POST' }),
  stravaStatus: (athleteId) => request(`/api/strava/status/${athleteId}`),

  // Dashboard
  getNewAthleteCount: () => request('/api/dashboard/new-count'),

  // Weekly Summary
  getWeeklySummary: () => request('/api/weekly-summary'),
  sendWeeklySummaryEmail: () => request('/api/weekly-summary/send-email', { method: 'POST' }),
};
