import Anthropic from '@anthropic-ai/sdk';
import { formatPace } from '../utils/vdot.js';

let _anthropic;
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY HELPERS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Derive athlete level from weekly km
 * beginner: <20km/week, recreational: 20-50, intermediate: 50+
 */
export function deriveAthleteLevel(weeklyKm) {
  const km = parseFloat(weeklyKm) || 0;
  if (km < 20) return { level: 'beginner', label: 'Beginner (<20km/week)' };
  if (km <= 50) return { level: 'recreational', label: 'Recreational (20-50km/week)' };
  return { level: 'intermediate', label: 'Intermediate (50+km/week)' };
}

/**
 * Format seconds per km as "M:SS min/km" string for AI prompts
 */
function formatPaceMinKm(secPerKm) {
  if (!secPerKm) return '--:--';
  const s = Math.round(secPerKm);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/**
 * Format goal time seconds to "H:MM:SS" or "MM:SS"
 */
function formatGoalTime(seconds) {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Derive intensity enum from phase for DB storage
 */
export function intensityFromPhase(phase) {
  if (!phase) return 'easy';
  if (phase.includes('recovery')) return 'recovery';
  if (phase === 'base') return 'easy';
  if (phase === 'build') return 'moderate';
  if (phase === 'peak') return 'hard';
  if (phase === 'taper') return 'recovery';
  if (phase === 'race') return 'hard';
  return 'easy';
}

/**
 * Get all 7 day names, mark which are unavailable
 */
function getUnavailableDays(availableDays) {
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return allDays.filter(d => !(availableDays || []).includes(d));
}


/* ═══════════════════════════════════════════════════════════════
   LEGACY SINGLE-CALL PLAN GENERATOR (kept for backward compat)
   ═══════════════════════════════════════════════════════════════ */

export async function generateTrainingPlan(athlete, profile) {
  const weeksToRace = Math.ceil(
    (new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000)
  );
  const prompt = buildLegacyPrompt(athlete, profile, weeksToRace);
  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });
  return parseLegacyPlanResponse(response.content[0].text, weeksToRace);
}

function buildLegacyPrompt(athlete, profile, weeksToRace) {
  const paces = {
    easy: `${formatPace(athlete.pace_easy_min)} - ${formatPace(athlete.pace_easy_max)}`,
    tempo: formatPace(athlete.pace_tempo),
    lt: formatPace(athlete.pace_lt),
    race: formatPace(athlete.pace_race),
    vo2max: formatPace(athlete.pace_vo2max),
  };
  const goalTimeStr = formatGoalTime(athlete.goal_time_seconds);
  return `You are an elite running coach. Generate a ${weeksToRace}-week training plan in JSON. Athlete: ${profile.full_name}, ${athlete.weekly_km}km/week, VDOT ${athlete.vdot}, goal: ${athlete.goal_race} in ${goalTimeStr}. Paces: Easy ${paces.easy}, Tempo ${paces.tempo}, LT ${paces.lt}, Race ${paces.race}, Interval ${paces.vo2max}. Available days: ${athlete.available_days?.join(', ')}. Output JSON only.`;
}

function parseLegacyPlanResponse(text, weeksToRace) {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const plan = JSON.parse(jsonStr);
  if (!plan.weeks || !Array.isArray(plan.weeks)) throw new Error('Invalid plan structure');
  if (plan.weeks.length !== weeksToRace) console.warn(`Plan has ${plan.weeks.length} weeks, expected ${weeksToRace}`);
  return plan;
}


/* ═══════════════════════════════════════════════════════════════
   TWO-LAYER PLAN ARCHITECTURE
   Methodology: Daniels / Pfitzinger / Hansons / 80-20 / Gabbett ACWR
   ═══════════════════════════════════════════════════════════════ */

/**
 * Layer 1: Generate macro periodization skeleton
 * Uses PART 1 of the plan generation methodology document
 */
export async function generateMacroPlan(athlete, profile, overrides = {}) {
  const weeksToRace = Math.max(4, Math.ceil(
    (new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000)
  ));

  const level = overrides.levelOverride || deriveAthleteLevel(athlete.weekly_km).level;
  const vdot = overrides.vdotOverride || athlete.vdot;
  const goalTimeStr = formatGoalTime(athlete.goal_time_seconds);
  const trainingDays = athlete.available_days?.length || 4;

  const prompt = `You are an expert running coach generating a training plan skeleton for a half marathon athlete.

ATHLETE:
- Level: ${level} (beginner = <20km/week, recreational = 20-50km/week, intermediate = 50+km/week)
- Current weekly km: ${athlete.weekly_km}
- Goal: ${athlete.goal_race} (${athlete.goal_time_seconds ? `time target: ${goalTimeStr}` : 'finish'})
- Available training days/week: ${trainingDays}
- Race date: ${athlete.goal_race_date}
- Total plan weeks: ${weeksToRace} (between 16-24)
- Location: Bogota, Colombia (2,600m altitude -- all paces are altitude-adjusted, ~+15 sec/km on threshold/interval zones)
${overrides.isRunWalk ? '- NOTE: This athlete uses a run/walk protocol. Start with 1:1 run/walk ratio in base phase, progress to continuous running.' : ''}

PHASE STRUCTURE RULES:
Apply these exact phase lengths based on plan duration and athlete level:

For BEGINNER (level: beginner):
- 16 weeks: Base 6wk / Build 6wk / Peak 3wk / Taper 1wk
- 20 weeks: Base 8wk / Build 7wk / Peak 4wk / Taper 1wk
- 24 weeks: Base 10wk / Build 8wk / Peak 5wk / Taper 1wk

For RECREATIONAL (level: recreational):
- 16 weeks: Base 4wk / Build 6wk / Peak 4wk / Taper 2wk
- 20 weeks: Base 5wk / Build 7wk / Peak 6wk / Taper 2wk
- 24 weeks: Base 6wk / Build 8wk / Peak 8wk / Taper 2wk

For INTERMEDIATE (level: intermediate):
- 16 weeks: Base 3wk / Build 6wk / Peak 5wk / Taper 2wk
- 20 weeks: Base 4wk / Build 7wk / Peak 7wk / Taper 2wk
- 24 weeks: Base 5wk / Build 8wk / Peak 9wk / Taper 2wk

If the total weeks don't match exactly 16/20/24, interpolate proportionally keeping the same phase ratios.

RECOVERY WEEKS:
- Beginners and injury-prone: insert a recovery week every 3rd week (vol -30%)
- Recreational and intermediate: every 4th week (vol -25%)
- Mark recovery weeks in the phase field as "base_recovery", "build_recovery", or "peak_recovery"

WEEKLY KM PROGRESSION:
- Week 1 volume = current weekly km × 0.82 (rounded to nearest whole number). Minimum 8 km.
  Example: athlete at 50 km/week → Week 1 = 41 km. Athlete at 30 km/week → Week 1 = 25 km.
- Increase max 15% per 3-week block for beginners, max 20% for recreational, max 25% for intermediate
- Recovery weeks: reduce volume 25-30% from the previous non-recovery week
- CRITICAL: After a recovery week, the NEXT week must return to the volume of the week BEFORE the recovery week (not jump to a new peak). Example: Week 3 = 35km, Week 4 (recovery) = 26km, Week 5 = 35km (returns to Week 3 level, does NOT jump to 40km).
- Taper: week 2-before-race = 60% of peak volume, race week = 40% of peak volume

RESPOND ONLY WITH THIS JSON (no explanation, no markdown):
{
  "weeks": [
    {
      "week_number": 1,
      "phase": "base",
      "km_target": 30,
      "intensity_focus": "Easy aerobic base. No quality work. Strides only.",
      "is_recovery": false
    }
  ]
}

phase values: "base", "build", "peak", "taper", "race", "base_recovery", "build_recovery", "peak_recovery"
Output ONLY the JSON array contents -- I will provide the opening {"weeks":[ prefix.`;

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{"weeks":[' },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    console.error(`Macro plan truncated (${response.usage?.output_tokens} tokens used)`);
    throw new Error('AI response was truncated. Please try again.');
  }

  console.log(`Macro plan tokens: ${response.usage?.input_tokens} in / ${response.usage?.output_tokens} out`);
  const content = '{"weeks":[' + response.content[0].text;
  return parseMacroResponse(content, weeksToRace, athlete.weekly_km);
}

function parseMacroResponse(text, weeksToRace, athleteWeeklyKm) {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < jsonStr.length - 1) jsonStr = jsonStr.substring(0, lastBrace + 1);

  const plan = JSON.parse(jsonStr);
  if (!plan.weeks || !Array.isArray(plan.weeks)) throw new Error('Invalid macro plan: missing weeks array');
  if (plan.weeks.length !== weeksToRace) console.warn(`Macro plan has ${plan.weeks.length} weeks, expected ${weeksToRace}`);

  const validPhases = ['base', 'build', 'peak', 'taper', 'race', 'base_recovery', 'build_recovery', 'peak_recovery'];
  for (const week of plan.weeks) {
    if (!week.week_number || !week.phase || !week.km_target) {
      console.warn(`Macro week ${week.week_number}: missing required fields`);
    }
    if (!validPhases.includes(week.phase)) {
      console.warn(`Macro week ${week.week_number}: invalid phase "${week.phase}"`);
    }
  }

  // Post-processing: enforce volume rules the AI might not follow perfectly
  if (athleteWeeklyKm && plan.weeks.length > 0) {
    enforceVolumeRules(plan.weeks, athleteWeeklyKm);
  }

  return plan;
}

/**
 * Post-process macro plan weeks to enforce volume rules:
 * 1. Week 1 = weekly_km * 0.82, minimum 8km
 * 2. After recovery week, return to pre-recovery volume (not jump to new peak)
 */
function enforceVolumeRules(weeks, athleteWeeklyKm) {
  const weeklyKm = parseFloat(athleteWeeklyKm) || 0;
  if (weeklyKm <= 0) return;

  // Rule 1: Week 1 starting volume = 82% of current weekly km, min 8
  const targetWeek1 = Math.max(8, Math.round(weeklyKm * 0.82));
  const week1 = weeks[0];
  if (week1 && week1.km_target) {
    const maxAllowed = Math.round(weeklyKm * 0.90); // Allow up to 90% as sanity cap
    if (week1.km_target > maxAllowed) {
      console.log(`Volume fix: Week 1 ${week1.km_target}km → ${targetWeek1}km (82% of ${weeklyKm}km)`);
      // Scale the ratio — if AI had week1 too high, proportionally adjust early weeks
      const ratio = targetWeek1 / week1.km_target;
      week1.km_target = targetWeek1;

      // Also scale weeks 2-3 proportionally if they're non-recovery and too high
      for (let i = 1; i < Math.min(3, weeks.length); i++) {
        if (!weeks[i].phase?.includes('recovery')) {
          const scaled = Math.round(weeks[i].km_target * ratio);
          if (scaled < weeks[i].km_target) {
            console.log(`Volume fix: Week ${weeks[i].week_number} ${weeks[i].km_target}km → ${scaled}km (scaled)`);
            weeks[i].km_target = scaled;
          }
        }
      }
    }
  }

  // Rule 2: After a recovery week, next week returns to pre-recovery volume
  for (let i = 1; i < weeks.length - 1; i++) {
    const isRecovery = weeks[i].phase?.includes('recovery') || weeks[i].is_recovery;
    if (!isRecovery) continue;

    // Find the non-recovery week before this recovery week
    let preRecoveryKm = null;
    for (let j = i - 1; j >= 0; j--) {
      if (!weeks[j].phase?.includes('recovery') && !weeks[j].is_recovery) {
        preRecoveryKm = weeks[j].km_target;
        break;
      }
    }

    if (preRecoveryKm == null) continue;

    // The week after recovery should not exceed the pre-recovery week
    const nextWeek = weeks[i + 1];
    if (nextWeek && !nextWeek.phase?.includes('recovery') && !nextWeek.is_recovery) {
      if (nextWeek.km_target > preRecoveryKm * 1.05) { // Allow 5% tolerance
        console.log(`Volume fix: Week ${nextWeek.week_number} post-recovery ${nextWeek.km_target}km → ${preRecoveryKm}km (return to pre-recovery)`);
        nextWeek.km_target = preRecoveryKm;
      }
    }
  }
}


/**
 * Layer 2: Generate detailed workouts for a single week
 * Uses PART 2 of the plan generation methodology document
 * Includes intensity distribution rules, workout templates, adaptation rules
 */
export async function generateWeeklyDetail(athlete, profile, weekContext, monitoringData, previousWeeksSummary, redFlagWarnings = []) {
  const level = deriveAthleteLevel(athlete.weekly_km).level;
  const vdot = athlete.vdot || 25;
  const goalTimeStr = formatGoalTime(athlete.goal_time_seconds);
  const trainingDays = athlete.available_days?.length || 4;
  const unavailableDays = getUnavailableDays(athlete.available_days);

  // Build pace strings
  const paces = {
    easy: `${formatPaceMinKm(athlete.pace_easy_min)} - ${formatPaceMinKm(athlete.pace_easy_max)}`,
    marathon: formatPaceMinKm(athlete.pace_tempo),
    threshold: formatPaceMinKm(athlete.pace_lt),
    interval: formatPaceMinKm(athlete.pace_vo2max),
    racePace: formatPaceMinKm(athlete.pace_race),
    recovery: formatPaceMinKm((athlete.pace_easy_max || 0) + 30),
  };

  // Build previous week data block
  const prevWeek = previousWeeksSummary?.length > 0
    ? previousWeeksSummary[previousWeeksSummary.length - 1]
    : null;

  const prevWeekBlock = prevWeek ? `Completed km: ${prevWeek.actual_km || 'N/A'} (planned: ${prevWeek.km_target || 'N/A'})
Adherence: ${prevWeek.compliance != null ? prevWeek.compliance + '%' : 'N/A'}
Average session RPE: ${monitoringData?.rpe_7d_avg != null ? monitoringData.rpe_7d_avg + ' / 10' : 'N/A'}
ACWR: ${monitoringData?.acwr?.ratio != null ? monitoringData.acwr.ratio + '  [safe zone: 0.8-1.3; caution: 1.3-1.5; danger: >1.5]' : 'N/A'}
Average readiness score: ${monitoringData?.readiness?.average_7d != null ? monitoringData.readiness.average_7d + ' / 5' : 'N/A'}
Reported pain/injury flags: ${monitoringData?.pain_flags?.length > 0 ? monitoringData.pain_flags.map(f => `${f.pain_location} (severity ${f.pain_severity || '?'})`).join(', ') : 'None'}
Notes from athlete: ${prevWeek.athlete_notes || 'None'}` : `No previous week data available.`;

  // Build red flag warnings string
  const redFlagStr = redFlagWarnings.length > 0
    ? '\nRED FLAG OVERRIDES (apply these BEFORE normal generation rules):\n' + redFlagWarnings.map(w => `- ${w}`).join('\n')
    : '';

  const prompt = `You are an expert running coach for The Run Hub Bogota. Generate a detailed 7-day training week.

=== ATHLETE PROFILE ===
Name: ${profile.full_name}
Level: ${level} (beginner / recreational / intermediate)
Current VDOT: ${vdot} (calculated from recent race or time trial)
Training days available: ${trainingDays} days/week (preferred days: ${athlete.available_days?.join(', ') || 'any'})
Goal: ${athlete.goal_race} -- ${goalTimeStr} half marathon
Injuries/limitations: ${athlete.injuries || 'None'}

=== ATHLETE TRAINING PACES (Bogota altitude-adjusted, already +15 sec/km on threshold+) ===
Easy (E) pace: ${paces.easy} min/km  [HR: 65-79% max, fully conversational]
Marathon (M) pace: ${paces.marathon} min/km
Threshold (T) pace: ${paces.threshold} min/km  [HR: 88-92% max, comfortably hard]
Interval (I) pace: ${paces.interval} min/km  [HR: 98-100% max, very hard]
Race pace (HM goal): ${paces.racePace} min/km
Recovery pace: ${paces.recovery} min/km  [30 sec/km slower than easy]

=== THIS WEEK ===
Week number: ${weekContext.week_number} of ${weekContext.total_weeks}
Phase: ${weekContext.phase} (base / build / peak / taper / base_recovery / build_recovery / peak_recovery)
Weekly km target: ${weekContext.km_target} km
Special notes from coach: ${weekContext.notes || 'None'}

=== PREVIOUS WEEK DATA (for adaptation) ===
${prevWeekBlock}
${redFlagStr}

=== PLAN GENERATION RULES ===

**INTENSITY DISTRIBUTION (apply strictly by phase):**

BASE phase:
- 80-100% of sessions = Easy (E) pace
- 0 quality sessions (only strides at end of easy runs, 4-6 x 20sec)
- 1 long run per week at E pace (20-25% of weekly km)
- Beginners: NO strides until week 3+

BUILD phase:
- 70-80% Easy, 10-15% Threshold, 5-10% Intervals (recreational/intermediate only)
- 1-2 quality sessions per week (NEVER on consecutive days)
- Beginners: 1 quality session max (tempo/fartlek only -- NO VO2max intervals)
- Recreational: 1 threshold session + 1 long run per week
- Intermediate: 1 threshold + 1 interval session + 1 long run per week
- Long run: E pace with optional final 2-3 km at M pace (from week 3+ of build)

PEAK phase:
- 65-75% Easy, 10-15% Threshold, 5-10% Race pace
- 2 quality sessions per week (threshold + race pace work)
- Beginners: 1 quality only (race pace segments in long run)
- Intermediate: threshold + VO2max intervals (until 6 weeks before race), then threshold + race pace
- Race pace work intensifies: 3-5 km at HM pace -> 8-10 km at HM pace
- Long run: progression run (E pace -> final 3-5 km at M or HM pace)

TAPER phase:
- 75-85% Easy, 5-10% Threshold/Race pace
- Volume drops 40-60% from peak
- Quality: 1 short race pace session (20-30 min) per week
- Long run reduced to 50-60% of peak long run
- No new stimuli. Maintain sharpness only.

RECOVERY WEEK (any phase marked _recovery):
- Volume: 25-30% below previous non-recovery week
- Intensity: Easy only. Drop ALL quality sessions.
- 1 easy long run (shorter than usual)
- Strides are OK on 1 easy day
- Purpose: absorb training, reduce fatigue, restore readiness

**WORKOUT TYPE TEMPLATES:**

Easy Run: "[X] km at easy pace (${paces.easy} min/km). Fully conversational. HR 65-79% max. Include 5 min walk warm-up and cool-down."

Recovery Run: "[X] km at recovery pace (${paces.recovery} min/km). Very easy. 20-35 min max. For active recovery only."

Long Run: "[X] km at easy pace (${paces.easy} min/km). Build to 25% of weekly volume. Stay conversational throughout. Carry water/gel if >75 min."

Strides: "After easy run: 4-6 x 20-second accelerations at controlled fast pace (NOT sprint). 90 sec walk recovery between each. Focus on form, not speed."

Tempo Run (continuous): "Warm up 10-15 min easy. [X] min at threshold pace (${paces.threshold} min/km). Cool down 10 min easy. RPE 7/10. Comfortably hard -- can say a few words."

Cruise Intervals: "Warm up 10 min easy. [N x X min] at threshold pace (${paces.threshold} min/km) with [Y] min easy jog recovery. Cool down 10 min easy. RPE 7/10."

VO2max Intervals: "Warm up 15 min easy. [N x X min or Xm] at interval pace (${paces.interval} min/km). Equal time recovery jog between reps. Cool down 15 min easy. RPE 9/10. Hard but controlled."

Race Pace Segments: "Within easy/long run: [N x X km] at goal race pace (${paces.racePace} min/km) with [Y] min easy jog between. Practice race day rhythm."

Fartlek: "30-40 min easy run with [N x 1 min] surges at 'comfortably hard' effort (RPE 7). 2 min easy between surges. Unstructured -- good intro to quality work for beginners."

Rest Day: "Complete rest or gentle 20-30 min walk. No running."

**ADAPTATION RULES (apply based on previous week data):**

If ACWR > 1.5: REDUCE this week's km by 15-20%. Eliminate highest-intensity session. Add recovery run instead.
If ACWR < 0.8: Can increase 5-10% above plan target if readiness is good.
If avg RPE was >=2pts above target for 2+ sessions: Reduce intensity one zone down this week.
If avg RPE was >=2pts below target for full week: Consider slight volume increase (+5%).
If readiness avg < 3/5 for 3+ days: Insert extra rest day. Reduce volume 10-15%.
If pain/injury flag reported: NOTE the flag in the relevant workout. Suggest alternative (pool run, cycling) if pain is ongoing.
If adherence < 70%: Don't increase volume. Investigate cause in coach notes.
If adherence > 95% and ACWR is safe: Can progress normally.

**STRUCTURE RULES:**
- NEVER schedule quality sessions on consecutive days
- Long run always on weekend (Saturday or Sunday)
- Recovery run after quality session the next day (not rest, unless readiness is very low)
- Beginner: max 2 quality days/week total (strides count as 0.5)
- No more than 3 consecutive days of running without a rest or cross-training day
- Rest days on days athlete marked as unavailable: ${unavailableDays.join(', ') || 'None'}

=== OUTPUT FORMAT ===
Respond ONLY with JSON. No explanation. No markdown. I will provide the opening prefix.

Each workout must have these exact fields:
{
  "week_summary": "One sentence describing the week's focus and key workout",
  "total_km": 35,
  "workouts": [
    {
      "day_of_week": "monday",
      "workout_type": "easy|tempo|long_run|intervals|race_pace|recovery|rest|cross_training|race",
      "title": "Descriptive title",
      "description": "Full workout description with warm-up, main set, cool-down, paces, and durations as per the templates above",
      "distance_km": 8,
      "duration_minutes": 48,
      "pace_target_sec_km": 360,
      "pace_range_min": 350,
      "pace_range_max": 370,
      "hr_zone": "Z2",
      "rpe_target": 4,
      "intervals_detail": null,
      "coach_notes": "Practical coaching tip for this specific session"
    }
  ]
}

day_of_week: MUST be a lowercase string — "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday". Never use numbers, never capitalize, never abbreviate.
workout_type values: "easy", "tempo", "long_run", "intervals", "race_pace", "recovery", "rest", "cross_training", "race"
All 7 days must be included. Rest days have distance_km: 0, duration_minutes: 0, pace_target_sec_km: null, rpe_target: null.
pace_target_sec_km, pace_range_min, pace_range_max are integers (seconds per km).
For interval workouts, set intervals_detail: {"reps": N, "distance_m": X, "pace_sec_km": Y, "rest_seconds": Z, "rest_type": "jog|walk|stand"}
Total distance across all workouts should be approximately ${weekContext.km_target}km (within 10%).
Output ONLY the JSON array contents -- I will provide the opening prefix.`;

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 5000,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{"week_summary":"' },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    console.error(`Weekly detail truncated (${response.usage?.output_tokens} tokens used)`);
    throw new Error('AI response was truncated. Please try again.');
  }

  console.log(`Weekly detail tokens: ${response.usage?.input_tokens} in / ${response.usage?.output_tokens} out`);
  const content = '{"week_summary":"' + response.content[0].text;
  return parseWeeklyDetailResponse(content);
}

function parseWeeklyDetailResponse(text) {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < jsonStr.length - 1) jsonStr = jsonStr.substring(0, lastBrace + 1);

  const result = JSON.parse(jsonStr);

  if (!result.workouts || !Array.isArray(result.workouts)) {
    throw new Error('Invalid weekly detail: missing workouts array');
  }

  // Validate workout types
  const validTypes = ['easy', 'tempo', 'long_run', 'intervals', 'race_pace', 'recovery', 'rest', 'cross_training', 'race'];
  for (const w of result.workouts) {
    if (!validTypes.includes(w.workout_type)) {
      console.warn(`Weekly detail: invalid workout_type "${w.workout_type}" for "${w.title}"`);
    }
  }

  return result;
}


/* ═══════════════════════════════════════════════════════════════
   RED FLAG DETECTION (PART 4)
   Pre-generation safety checks based on monitoring data
   ═══════════════════════════════════════════════════════════════ */

/**
 * Check athlete monitoring data for red flags before generating a week
 * Returns override instructions to inject into the AI prompt
 */
export function checkRedFlags(monitoringData, previousWeeksSummary, athlete) {
  const warnings = [];
  let forceRecovery = false;
  let kmReduction = 0;

  if (!monitoringData) return { forceRecovery, warnings, kmReduction };

  // 1. ACWR > 1.5 — mandatory recovery
  if (monitoringData.acwr?.ratio > 1.5) {
    warnings.push('ACWR is ' + monitoringData.acwr.ratio + ' (DANGER >1.5). Mandatory volume reduction 15-20%. Eliminate highest-intensity session. Replace with recovery run.');
    forceRecovery = true;
    kmReduction = 0.2; // 20% reduction
  }

  // 2. Readiness < 2/5 average — forced recovery
  if (monitoringData.readiness?.average_7d != null && monitoringData.readiness.average_7d < 2) {
    warnings.push('Readiness average is ' + monitoringData.readiness.average_7d + '/5 (critically low). Insert full recovery week. Reduce volume 30-50%.');
    forceRecovery = true;
    kmReduction = Math.max(kmReduction, 0.4); // 40% reduction
  }

  // 3. Pain same location 3+ days
  if (monitoringData.pain_flags?.length >= 3) {
    const locations = {};
    for (const f of monitoringData.pain_flags) {
      const loc = (f.pain_location || 'unknown').toLowerCase();
      locations[loc] = (locations[loc] || 0) + 1;
    }
    for (const [loc, count] of Object.entries(locations)) {
      if (count >= 3) {
        warnings.push(`Pain in ${loc} reported ${count} times in 7 days. Include injury note. Suggest alternative (pool run, cycling) for high-impact sessions. Reduce long run by 20%.`);
      }
    }
  }

  // 4. RPE 9-10 on easy runs
  if (monitoringData.feedback?.recent) {
    const easyHighRpe = monitoringData.feedback.recent.filter(
      f => f.workouts?.workout_type === 'easy' && f.rpe >= 9
    );
    if (easyHighRpe.length >= 2) {
      warnings.push('RPE consistently 9-10 on easy runs. Paces may be too fast. Prescribe HR-only easy runs this week (ignore pace, stay in Z1-Z2 by feel).');
    }
  }

  // 5. Low compliance 2+ weeks
  if (monitoringData.compliance?.rate != null && monitoringData.compliance.rate < 60) {
    const prevLowCompliance = previousWeeksSummary?.some(w => w.compliance != null && w.compliance < 60);
    if (prevLowCompliance) {
      warnings.push('Adherence below 60% for 2+ weeks. Do NOT increase volume. Keep at current level or reduce slightly. Flag for coach conversation.');
    }
  }

  // 6. Recurring injury from athlete profile matching pain flags
  if (athlete?.injuries && monitoringData.pain_flags?.length > 0) {
    const injuryText = athlete.injuries.toLowerCase();
    for (const flag of monitoringData.pain_flags) {
      const loc = (flag.pain_location || '').toLowerCase();
      if (loc && injuryText.includes(loc)) {
        warnings.push(`Recurring injury: ${loc} matches athlete history ("${athlete.injuries}"). Reduce long run by 20%. Add activation/prehab note for ${loc}.`);
        break;
      }
    }
  }

  return { forceRecovery, warnings, kmReduction };
}
