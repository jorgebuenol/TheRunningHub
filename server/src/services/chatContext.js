import Anthropic from '@anthropic-ai/sdk';
import { calculateACWR } from './monitoring.js';
import { formatPace } from '../utils/vdot.js';

let _anthropic;
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/**
 * Build rich context string about an athlete for Claude's system prompt
 */
export async function buildAthleteContext(supabase, athleteId) {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const twentyEightDaysAgo = new Date(now);
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

  // Fetch all data in parallel
  const [athleteRes, readinessRes, workoutsRes, feedbackRes, planRes] = await Promise.all([
    // Athlete profile
    supabase
      .from('athletes')
      .select('*, profiles(full_name, email)')
      .eq('id', athleteId)
      .single(),

    // Last 7 days readiness
    supabase
      .from('daily_readiness')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('check_in_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('check_in_date', { ascending: false }),

    // Last 28 days workouts
    supabase
      .from('workouts')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('workout_date', twentyEightDaysAgo.toISOString().split('T')[0])
      .order('workout_date', { ascending: false }),

    // Last 14 days feedback
    supabase
      .from('workout_feedback')
      .select('*, workouts(workout_date, title, workout_type, distance_km)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(14),

    // Active plan with current week
    supabase
      .from('training_plans')
      .select('*, plan_weeks(*, workouts(*))')
      .eq('athlete_id', athleteId)
      .eq('status', 'approved')
      .limit(1),
  ]);

  const athlete = athleteRes.data;
  if (!athlete) return 'Athlete not found.';

  const readiness = readinessRes.data || [];
  const workouts = workoutsRes.data || [];
  const feedback = feedbackRes.data || [];
  const activePlan = planRes.data?.[0];

  // Calculate ACWR
  const acwr = calculateACWR(workouts);

  // Build context string
  const parts = [];

  parts.push(`You are an elite running coach AI assistant. You have access to detailed information about an athlete and should provide personalized coaching advice based on this data. The athlete trains in Bogotá, Colombia (altitude ~2,640m).`);

  // Athlete profile
  parts.push(`\n## ATHLETE PROFILE`);
  parts.push(`- Name: ${athlete.profiles?.full_name}`);
  parts.push(`- Age: ${athlete.age}, Weight: ${athlete.weight_kg}kg, Height: ${athlete.height_cm}cm`);
  parts.push(`- VDOT: ${athlete.vdot}, Weekly KM: ${athlete.weekly_km}`);
  parts.push(`- Goal: ${athlete.goal_race} in ${athlete.goal_time_seconds ? formatGoalTime(athlete.goal_time_seconds) : 'No target'}`);
  parts.push(`- Race date: ${athlete.goal_race_date || 'Not set'}`);
  if (athlete.injuries) parts.push(`- Injuries/Limitations: ${athlete.injuries}`);

  // Training paces
  parts.push(`\n## TRAINING PACES (per km)`);
  parts.push(`- Easy: ${formatPace(athlete.pace_easy_min)}-${formatPace(athlete.pace_easy_max)}`);
  parts.push(`- Tempo: ${formatPace(athlete.pace_tempo)}`);
  parts.push(`- Threshold: ${formatPace(athlete.pace_lt)}`);
  parts.push(`- Race: ${formatPace(athlete.pace_race)}`);
  parts.push(`- Interval: ${formatPace(athlete.pace_vo2max)}`);

  // ACWR
  parts.push(`\n## WORKLOAD STATUS`);
  parts.push(`- ACWR: ${acwr.ratio} (${acwr.zone.toUpperCase()}) — Acute: ${acwr.acute_km}km, Chronic avg: ${acwr.chronic_km}km/week`);

  // Recent readiness
  if (readiness.length > 0) {
    parts.push(`\n## RECENT READINESS (last 7 days)`);
    for (const r of readiness) {
      parts.push(`- ${r.check_in_date}: Score=${r.composite_score} | Energy=${r.energy}/5, Sleep=${r.sleep_hours}h (Q:${r.sleep_quality}/5), Soreness=${r.soreness}/5, Stress=${r.stress}/5, Motivation=${r.motivation}/5${r.pain_flag ? ` | ⚠️ PAIN: ${r.pain_location} (${r.pain_severity}/10)` : ''}`);
    }
  }

  // Recent workouts with feedback
  if (workouts.length > 0) {
    const last14 = workouts.filter(w => new Date(w.workout_date) >= fourteenDaysAgo);
    parts.push(`\n## RECENT WORKOUTS (last 14 days)`);
    for (const w of last14.slice(0, 10)) {
      const fb = feedback.find(f => f.workout_id === w.id);
      let line = `- ${w.workout_date}: ${w.title} (${w.workout_type}) — ${w.distance_km || 0}km, ${w.status}`;
      if (fb) {
        line += ` | RPE: ${fb.rpe}/10, Feeling: ${fb.feeling}`;
        if (fb.notes) line += `, Note: "${fb.notes}"`;
      }
      parts.push(line);
    }
  }

  // Current plan week
  if (activePlan?.plan_weeks) {
    const currentWeek = getCurrentPlanWeek(activePlan);
    if (currentWeek) {
      parts.push(`\n## CURRENT PLAN WEEK`);
      parts.push(`- Week ${currentWeek.week_number} (${currentWeek.phase}): ${currentWeek.total_km}km target`);
      if (currentWeek.notes) parts.push(`- Focus: ${currentWeek.notes}`);
    }
  }

  parts.push(`\n## INSTRUCTIONS`);
  parts.push(`Respond as a knowledgeable, supportive running coach. Consider the athlete's current readiness, workload, and recent performance when giving advice. Be specific and data-driven. Answer in the language the coach writes to you in (likely Spanish or English).`);

  return parts.join('\n');
}

/**
 * Send a chat message with athlete context
 */
export async function sendChatMessage(supabase, athleteId, message, history = []) {
  const context = await buildAthleteContext(supabase, athleteId);

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: context,
    messages,
  });

  return {
    role: 'assistant',
    content: response.content[0].text,
  };
}

/**
 * Build context for plan review chat — includes athlete profile + full plan.
 * For large plans (10+ weeks), uses a condensed format to keep context manageable.
 */
export async function buildPlanReviewContext(supabase, athleteId, planId) {
  // Fetch athlete and plan in parallel
  const [athleteRes, planRes] = await Promise.all([
    supabase
      .from('athletes')
      .select('*, profiles(full_name, email)')
      .eq('id', athleteId)
      .single(),
    supabase
      .from('training_plans')
      .select('*, plan_weeks(*, workouts(*))')
      .eq('id', planId)
      .single(),
  ]);

  const athlete = athleteRes.data;
  if (!athlete) return 'Athlete not found.';

  const plan = planRes.data;
  if (!plan) return 'Plan not found.';

  // Sort weeks and workouts
  if (plan.plan_weeks) {
    plan.plan_weeks.sort((a, b) => a.week_number - b.week_number);
    for (const week of plan.plan_weeks) {
      if (week.workouts) {
        const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        week.workouts.sort((a, b) => dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week));
      }
    }
  }

  const weeks = plan.plan_weeks || [];
  const generatedWeeks = weeks.filter(w => w.is_generated);
  const skeletonWeeks = weeks.filter(w => !w.is_generated);
  const totalWorkouts = generatedWeeks.reduce((sum, w) => sum + (w.workouts?.length || 0), 0);
  const isLargePlan = totalWorkouts > 50;
  // Plan is mostly skeleton if more un-generated weeks than generated
  const isMostlySkeleton = skeletonWeeks.length > generatedWeeks.length;

  const dayAbbrev = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  const parts = [];

  parts.push(`You are an elite running coach AI assistant helping review and adjust a training plan. The athlete trains in Bogotá, Colombia (altitude ~2,640m).`);

  // Athlete profile
  parts.push(`\n## ATHLETE PROFILE`);
  parts.push(`- Name: ${athlete.profiles?.full_name}`);
  parts.push(`- Age: ${athlete.age}, Weight: ${athlete.weight_kg}kg, Height: ${athlete.height_cm}cm`);
  parts.push(`- VDOT: ${athlete.vdot}, Weekly KM: ${athlete.weekly_km}`);
  parts.push(`- Goal: ${athlete.goal_race} in ${athlete.goal_time_seconds ? formatGoalTime(athlete.goal_time_seconds) : 'No target'}`);
  parts.push(`- Race date: ${athlete.goal_race_date || 'Not set'}`);
  if (athlete.injuries) parts.push(`- Injuries/Limitations: ${athlete.injuries}`);

  // Training paces
  parts.push(`\n## TRAINING PACES (per km)`);
  parts.push(`- Easy: ${formatPace(athlete.pace_easy_min)}-${formatPace(athlete.pace_easy_max)}`);
  parts.push(`- Tempo: ${formatPace(athlete.pace_tempo)}`);
  parts.push(`- Threshold: ${formatPace(athlete.pace_lt)}`);
  parts.push(`- Race: ${formatPace(athlete.pace_race)}`);
  parts.push(`- Interval: ${formatPace(athlete.pace_vo2max)}`);

  // Full plan
  parts.push(`\n## TRAINING PLAN: ${plan.name}`);
  parts.push(`Status: ${plan.status} | ${plan.total_weeks} weeks | Version ${plan.version || 1}`);
  parts.push(`Generated weeks: ${generatedWeeks.length} | Skeleton weeks: ${skeletonWeeks.length} | Total workouts: ${totalWorkouts}`);

  for (const week of weeks) {
    const generated = week.is_generated;
    const kmLabel = generated ? week.total_km : week.km_target;
    parts.push(`\n### WEEK ${week.week_number} — ${(week.phase || '').toUpperCase()} (${kmLabel}km) [${generated ? 'GENERATED' : 'SKELETON'}]`);
    parts.push(`  week_id:${week.id} | km_target:${week.km_target} | intensity:${week.intensity || 'N/A'}`);
    if (week.notes) parts.push(`  Focus: ${week.notes}`);

    if (generated && week.workouts?.length) {
      for (const w of week.workouts) {
        let line = `  ${dayAbbrev[w.day_of_week] || '?'} | id:${w.id} | ${w.workout_type} | ${w.title}`;
        if (w.distance_km) line += ` | ${w.distance_km}km`;
        if (w.duration_minutes) line += ` | ${w.duration_minutes}min`;
        if (w.pace_range_min && w.pace_range_max) line += ` | ${formatPace(w.pace_range_min)}-${formatPace(w.pace_range_max)}/km`;
        if (w.hr_zone) line += ` | ${w.hr_zone}`;
        if (!isLargePlan) {
          if (w.coach_notes) line += ` | Notes: ${w.coach_notes}`;
          if (w.intervals_detail) line += ` | Intervals: ${JSON.stringify(w.intervals_detail)}`;
        }
        parts.push(line);
      }
    }
  }

  // Different instructions based on plan state
  parts.push(`\n## INSTRUCTIONS`);
  parts.push(`You are reviewing this training plan with the coach. Provide specific, data-driven advice.
When the coach requests changes, provide your reasoning AND include a structured JSON block with the modifications.

This plan has TWO types of weeks:
- **SKELETON weeks**: High-level plan only (phase, km_target, intensity). No workouts yet. Use "week_id" to adjust these.
- **GENERATED weeks**: Full workout details. Use "workout_id" to adjust individual workouts.

${isMostlySkeleton ? `This plan is mostly in SKELETON state. The coach is likely adjusting the macro plan structure (weekly km targets, phases, intensity). Use week-level adjustments.\n\n` : ''}For SKELETON week adjustments (changing the macro plan):
\`\`\`json
{
  "adjustments": [
    {
      "week_id": "the-exact-week-uuid-from-above",
      "changes": {
        "km_target": 45,
        "phase": "build",
        "intensity": "moderate",
        "notes": "Adjusted per coach request"
      }
    }
  ]
}
\`\`\`
Valid week fields: km_target, phase, intensity, notes.
Valid phases: base, build, peak, taper, race, base_recovery, build_recovery, peak_recovery.
Valid intensities: easy, moderate, hard, recovery.

For GENERATED week adjustments (changing individual workouts):
\`\`\`json
{
  "adjustments": [
    {
      "workout_id": "the-exact-workout-uuid-from-above",
      "changes": {
        "distance_km": 6,
        "pace_target_sec_km": 330,
        "coach_notes": "Adjusted per coach request"
      }
    }
  ]
}
\`\`\`
Valid workout fields: distance_km, duration_minutes, pace_target_sec_km, pace_range_min, pace_range_max, hr_zone, title, description, workout_type, coach_notes, intervals_detail.

IMPORTANT:
- Use the exact week_id or workout_id values from the plan data above.
- Do NOT mix week_id and workout_id in the same adjustment object.
- Only include fields that change.
${isLargePlan ? `- This is a large plan. Split into BATCHES of max 15 adjustments per JSON block. Say "continue" for more.\n` : ''}
Answer in the language the coach writes to you in (likely Spanish or English).`);

  return parts.join('\n');
}

/**
 * Send a plan review chat message.
 * Uses higher max_tokens for large plans and includes a server-side timeout.
 */
export async function sendPlanReviewMessage(supabase, athleteId, planId, message, history = []) {
  const context = await buildPlanReviewContext(supabase, athleteId, planId);

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  // Larger max_tokens for plans with many adjustments
  const maxTokens = context.length > 15000 ? 8000 : 4000;

  // Wrap Anthropic call in a timeout to prevent hanging
  const apiPromise = getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: context,
    messages,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI response timed out. Try a more specific request like "adjust week 3" instead of an entire phase.')), 90000)
  );

  const response = await Promise.race([apiPromise, timeoutPromise]);

  const text = response.content[0].text;
  const adjustments = parseAdjustments(text);

  return {
    role: 'assistant',
    content: text,
    adjustments,
  };
}

/**
 * Parse structured adjustments from Claude's response text
 */
function parseAdjustments(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return parsed.adjustments || null;
  } catch {
    return null;
  }
}

function formatGoalTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${min}:00`;
}

function getCurrentPlanWeek(plan) {
  if (!plan.plan_weeks?.length) return null;

  // Find the week that contains today based on week_number and plan creation
  const now = new Date();
  const planStart = new Date(plan.created_at);
  const weeksSincePlanStart = Math.floor((now - planStart) / (7 * 24 * 60 * 60 * 1000)) + 1;

  return plan.plan_weeks.find(w => w.week_number === weeksSincePlanStart) || plan.plan_weeks[0];
}
