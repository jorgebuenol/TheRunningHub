/**
 * Pace Sync — keeps workout pace_target/pace_range and description text
 * in sync with the athlete's current VDOT-derived paces.
 */

import { formatPace } from '../utils/vdot.js';

/** Map workout_type → which pace fields to use from athlete record */
const PACE_MAP = {
  easy:           (p) => ({ pace_target: null, pace_range_min: p.pace_easy_min, pace_range_max: p.pace_easy_max }),
  long_run:       (p) => ({ pace_target: null, pace_range_min: p.pace_easy_min, pace_range_max: p.pace_easy_max }),
  recovery:       (p) => ({ pace_target: null, pace_range_min: p.pace_easy_max, pace_range_max: p.pace_easy_max + 30 }),
  tempo:          (p) => ({ pace_target: p.pace_tempo, pace_range_min: p.pace_tempo - 5, pace_range_max: p.pace_tempo + 5 }),
  intervals:      (p) => ({ pace_target: p.pace_vo2max, pace_range_min: p.pace_vo2max - 5, pace_range_max: p.pace_vo2max + 5 }),
  race_pace:      (p) => ({ pace_target: p.pace_race, pace_range_min: p.pace_race - 5, pace_range_max: p.pace_race + 5 }),
  race:           (p) => ({ pace_target: p.pace_race, pace_range_min: p.pace_race - 10, pace_range_max: p.pace_race + 10 }),
};

/** Replace any hardcoded pace string like "(5:30 - 6:00 min/km)" or "(5:30/km)" in description */
function replacePaceInDescription(description, newMin, newMax) {
  if (!description) return description;
  const canonical = `${formatPace(newMin)} - ${formatPace(newMax)} min/km`;
  // Match patterns like (5:30 - 6:00 min/km) or (5:30 – 6:00/km)
  return description.replace(
    /\(\d+:\d{2}\s*[-–]\s*\d+:\d{2}\s*(?:min\/km|\/km)\)/g,
    `(${canonical})`
  );
}

/** Format date as YYYY-MM-DD in local timezone */
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Sync all future uncompleted workouts for an athlete with new paces.
 *
 * @param {object} supabase - Supabase client (service role)
 * @param {string} athleteId
 * @param {object} paces - { pace_easy_min, pace_easy_max, pace_tempo, pace_lt, pace_race, pace_vo2max }
 */
export async function syncAthletePaces(supabase, athleteId, paces) {
  if (!paces || !paces.pace_easy_min) return { updated: 0 };

  const todayStr = toDateStr(new Date());

  // Fetch all future uncompleted workouts
  const { data: workouts, error } = await supabase
    .from('workouts')
    .select('id, workout_type, description, pace_target, pace_range_min, pace_range_max')
    .eq('athlete_id', athleteId)
    .gte('workout_date', todayStr)
    .in('status', ['planned', 'pending']);

  if (error) throw error;
  if (!workouts?.length) return { updated: 0 };

  let updated = 0;

  for (const wo of workouts) {
    const mapper = PACE_MAP[wo.workout_type];
    if (!mapper) continue; // rest, cross_training — skip

    const newPaces = mapper(paces);
    const newDesc = replacePaceInDescription(wo.description, newPaces.pace_range_min, newPaces.pace_range_max);

    // Only update if something changed
    const changed =
      wo.pace_target !== newPaces.pace_target ||
      wo.pace_range_min !== newPaces.pace_range_min ||
      wo.pace_range_max !== newPaces.pace_range_max ||
      wo.description !== newDesc;

    if (!changed) continue;

    const { error: updateErr } = await supabase
      .from('workouts')
      .update({
        pace_target: newPaces.pace_target,
        pace_range_min: newPaces.pace_range_min,
        pace_range_max: newPaces.pace_range_max,
        description: newDesc,
      })
      .eq('id', wo.id);

    if (updateErr) {
      console.error(`Failed to sync pace for workout ${wo.id}:`, updateErr.message);
    } else {
      updated++;
    }
  }

  return { updated };
}
