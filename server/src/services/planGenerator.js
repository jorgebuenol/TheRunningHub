import Anthropic from '@anthropic-ai/sdk';
import { formatPace } from '../utils/vdot.js';

let _anthropic;
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/**
 * Generate a structured training plan using Claude
 */
export async function generateTrainingPlan(athlete, profile) {
  const weeksToRace = Math.ceil(
    (new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000)
  );

  const prompt = buildPrompt(athlete, profile, weeksToRace);

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0].text;
  return parsePlanResponse(content, weeksToRace);
}

function buildPrompt(athlete, profile, weeksToRace) {
  const paces = {
    easy: `${formatPace(athlete.pace_easy_min)} - ${formatPace(athlete.pace_easy_max)}`,
    tempo: formatPace(athlete.pace_tempo),
    lt: formatPace(athlete.pace_lt),
    race: formatPace(athlete.pace_race),
    vo2max: formatPace(athlete.pace_vo2max),
  };

  const goalTimeMin = Math.floor(athlete.goal_time_seconds / 60);
  const goalTimeSec = athlete.goal_time_seconds % 60;
  const goalTimeStr = goalTimeSec > 0
    ? `${goalTimeMin}:${String(goalTimeSec).padStart(2, '0')}`
    : `${goalTimeMin}:00`;

  return `You are an elite running coach creating a personalized training plan for a runner in Bogotá, Colombia (altitude ~2,640m).

ATHLETE PROFILE:
- Name: ${profile.full_name}
- Age: ${athlete.age}
- Weight: ${athlete.weight_kg}kg, Height: ${athlete.height_cm}cm
- Body fat: ${athlete.body_fat_pct}%
- Current weekly mileage: ${athlete.weekly_km}km
- VDOT: ${athlete.vdot}
- Available days: ${athlete.available_days?.join(', ')}
- Training window: ${athlete.available_time_start} - ${athlete.available_time_end}
- Injuries/limitations: ${athlete.injuries || 'None'}
- GPS watch: ${athlete.gps_watch_model || 'Unknown'}

TRAINING PACES (per km):
- Easy: ${paces.easy}
- Tempo: ${paces.tempo}
- Lactate Threshold: ${paces.lt}
- Race Pace: ${paces.race}
- Interval: ${paces.vo2max}

GOAL:
- Race: ${athlete.goal_race}
- Target time: ${goalTimeStr}
- Race date: ${athlete.goal_race_date}
- Weeks to race: ${weeksToRace}

Generate a ${weeksToRace}-week training plan. Consider altitude training effects in Bogotá.

RESPOND IN STRICT JSON FORMAT:
{
  "weeks": [
    {
      "week_number": 1,
      "phase": "base|build|peak|taper|race",
      "total_km": 40,
      "notes": "Week focus description",
      "workouts": [
        {
          "day_of_week": 0,
          "workout_type": "easy|tempo|long_run|intervals|race_pace|recovery|rest|cross_training|race",
          "title": "Easy Run",
          "description": "Steady easy run to build aerobic base",
          "distance_km": 8,
          "duration_minutes": 48,
          "pace_target_sec_km": 360,
          "pace_range_min": 350,
          "pace_range_max": 370,
          "hr_zone": "Z2",
          "intervals_detail": null,
          "coach_notes": "Keep heart rate below 145bpm"
        }
      ]
    }
  ]
}

day_of_week: 0=Monday, 1=Tuesday, ..., 6=Sunday
Only include workouts on the athlete's available days.
Rest days should still be listed with workout_type "rest".
For interval workouts, include intervals_detail as: {"reps": 6, "distance_m": 800, "pace_sec_km": 240, "rest_seconds": 120, "rest_type": "jog"}
ONLY output valid JSON. No markdown, no explanation.`;
}

function parsePlanResponse(text, weeksToRace) {
  // Extract JSON from response (handle potential markdown wrapping)
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const plan = JSON.parse(jsonStr);

  // Validate structure
  if (!plan.weeks || !Array.isArray(plan.weeks)) {
    throw new Error('Invalid plan structure: missing weeks array');
  }

  // Ensure week count matches
  if (plan.weeks.length !== weeksToRace) {
    console.warn(`Plan has ${plan.weeks.length} weeks, expected ${weeksToRace}`);
  }

  return plan;
}
