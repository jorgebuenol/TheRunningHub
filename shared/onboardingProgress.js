/**
 * Onboarding progress computation — shared between client and server.
 * Pure JS, no dependencies.
 */

export const ONBOARDING_SECTIONS = [
  {
    id: 'personal_data',
    title: 'PERSONAL DATA',
    subtitle: 'Physical profile',
    requiredFields: ['age', 'weight_kg', 'height_cm'],
    optionalFields: ['body_fat_pct'],
  },
  {
    id: 'running_history',
    title: 'RUNNING HISTORY',
    subtitle: 'Volume & race times',
    requiredFields: ['weekly_km'],
    atLeastOneOf: ['time_5k', 'time_10k', 'time_half_marathon', 'time_marathon'],
    optionalFields: ['time_5k', 'time_10k', 'time_half_marathon', 'time_marathon'],
  },
  {
    id: 'goal',
    title: 'GOAL',
    subtitle: 'Target race',
    requiredFields: ['goal_race', 'goal_time_seconds', 'goal_race_date'],
    optionalFields: [],
  },
  {
    id: 'availability',
    title: 'AVAILABILITY',
    subtitle: 'Training schedule',
    requiredFields: ['available_days', 'available_time_start', 'available_time_end'],
    optionalFields: [],
    arrayMinLength: { available_days: 3 },
  },
  {
    id: 'health',
    title: 'HEALTH & INJURIES',
    subtitle: 'Medical info',
    requiredFields: [],
    optionalFields: ['injuries'],
    alwaysComplete: true,
  },
  {
    id: 'sleep',
    title: 'SLEEP HABITS',
    subtitle: 'Rest patterns',
    jsonbField: 'sleep_data',
    requiredKeys: ['avg_hours', 'quality'],
    optionalKeys: ['consistency'],
  },
  {
    id: 'nutrition',
    title: 'NUTRITION',
    subtitle: 'Diet & hydration',
    jsonbField: 'nutrition_data',
    requiredKeys: ['diet_type', 'hydration_liters'],
    optionalKeys: ['pre_run_nutrition', 'post_run_nutrition'],
  },
  {
    id: 'work_life',
    title: 'WORK & LIFE',
    subtitle: 'Lifestyle factors',
    jsonbField: 'work_life_data',
    requiredKeys: ['work_schedule', 'stress_level'],
    optionalKeys: ['commute_minutes'],
  },
  {
    id: 'recovery',
    title: 'RECOVERY',
    subtitle: 'Recovery methods',
    jsonbField: 'recovery_data',
    requiredKeys: ['methods'],
    optionalKeys: ['rest_day_activities'],
  },
  {
    id: 'current_training',
    title: 'CURRENT TRAINING',
    subtitle: 'Training background',
    jsonbField: 'current_training_data',
    requiredKeys: ['structure', 'experience_years', 'longest_run_km'],
    optionalKeys: ['runs_per_week'],
  },
  {
    id: 'technology',
    title: 'TECHNOLOGY & DEVICES',
    subtitle: 'Gear & integrations',
    requiredFields: [],
    optionalFields: ['gps_watch_model', 'intervals_icu_api_key', 'intervals_icu_athlete_id'],
    alwaysComplete: true,
  },
];

/** Check if a flat field has a meaningful value */
function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/** Check if a JSONB key has a meaningful value */
function isKeyFilled(obj, key) {
  if (!obj || typeof obj !== 'object') return false;
  const value = obj[key];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Get the completion status of a single section.
 * @param {object} athlete - The athlete record
 * @param {string} sectionId - Section ID from ONBOARDING_SECTIONS
 * @returns {'empty' | 'partial' | 'complete'}
 */
export function getSectionStatus(athlete, sectionId) {
  const section = ONBOARDING_SECTIONS.find(s => s.id === sectionId);
  if (!section) return 'empty';
  if (!athlete) return 'empty';

  // Sections with no required fields are always complete
  if (section.alwaysComplete) {
    // Check if any optional fields are filled for partial vs empty distinction
    const allFields = [...(section.optionalFields || [])];
    const filledCount = allFields.filter(f => isFilled(athlete[f])).length;
    return filledCount > 0 ? 'complete' : 'complete'; // always complete regardless
  }

  // JSONB-based sections
  if (section.jsonbField) {
    const obj = athlete[section.jsonbField] || {};
    const requiredKeys = section.requiredKeys || [];
    const optionalKeys = section.optionalKeys || [];
    const allKeys = [...requiredKeys, ...optionalKeys];

    const filledRequired = requiredKeys.filter(k => isKeyFilled(obj, k)).length;
    const filledTotal = allKeys.filter(k => isKeyFilled(obj, k)).length;

    if (filledRequired === requiredKeys.length) return 'complete';
    if (filledTotal > 0) return 'partial';
    return 'empty';
  }

  // Flat-field sections
  const requiredFields = section.requiredFields || [];
  const optionalFields = section.optionalFields || [];
  const allFields = [...requiredFields, ...optionalFields];

  // Check required fields
  let allRequiredFilled = true;
  for (const field of requiredFields) {
    const value = athlete[field];
    if (!isFilled(value)) {
      allRequiredFilled = false;
      continue;
    }
    // Check array min length
    if (section.arrayMinLength && section.arrayMinLength[field]) {
      if (!Array.isArray(value) || value.length < section.arrayMinLength[field]) {
        allRequiredFilled = false;
      }
    }
  }

  // Check atLeastOneOf constraint
  if (section.atLeastOneOf) {
    const hasOne = section.atLeastOneOf.some(f => isFilled(athlete[f]));
    if (!hasOne) allRequiredFilled = false;
  }

  if (allRequiredFilled && requiredFields.length > 0) return 'complete';
  // For atLeastOneOf sections, also check if main required fields are filled
  if (allRequiredFilled && section.atLeastOneOf) return 'complete';

  // Check if anything is filled at all
  const filledCount = allFields.filter(f => isFilled(athlete[f])).length;
  const atLeastOneFilled = section.atLeastOneOf
    ? section.atLeastOneOf.some(f => isFilled(athlete[f]))
    : false;

  if (filledCount > 0 || atLeastOneFilled) return 'partial';
  return 'empty';
}

/**
 * Get overall onboarding progress.
 * @param {object} athlete - The athlete record
 * @returns {{ completed: number, total: number, percent: number, sections: Record<string, string>, isComplete: boolean }}
 */
export function getOverallProgress(athlete) {
  const sections = {};
  let completed = 0;

  for (const section of ONBOARDING_SECTIONS) {
    const status = getSectionStatus(athlete, section.id);
    sections[section.id] = status;
    if (status === 'complete') completed++;
  }

  const total = ONBOARDING_SECTIONS.length;
  const percent = Math.round((completed / total) * 100);

  return {
    completed,
    total,
    percent,
    sections,
    isComplete: completed === total,
  };
}

/**
 * Check if onboarding is fully complete.
 * @param {object} athlete
 * @returns {boolean}
 */
export function isOnboardingComplete(athlete) {
  return getOverallProgress(athlete).isComplete;
}

/**
 * Get list of incomplete sections.
 * @param {object} athlete
 * @returns {Array<{ id: string, title: string }>}
 */
export function getMissingSections(athlete) {
  const progress = getOverallProgress(athlete);
  return ONBOARDING_SECTIONS
    .filter(s => progress.sections[s.id] !== 'complete')
    .map(s => ({ id: s.id, title: s.title }));
}
