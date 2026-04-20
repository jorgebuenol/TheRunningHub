/**
 * HR zone default percentages — single source of truth.
 * Used by client (MyProfilePage, AthleteDetailPage) and server (planGenerator, chatContext).
 */

export const HR_ZONE_PERCENTAGES = {
  z1: 0.50,
  z2: 0.75,
  z3: 0.85,
  z4: 0.92,
};

/**
 * Calculate default HR zone thresholds from a max HR value.
 * @param {number|null} hrMax - Maximum heart rate
 * @returns {{ hr_z1_max: number, hr_z2_max: number, hr_z3_max: number, hr_z4_max: number } | {}}
 */
export function calcDefaultZones(hrMax) {
  if (!hrMax) return {};
  return {
    hr_z1_max: Math.round(hrMax * HR_ZONE_PERCENTAGES.z1),
    hr_z2_max: Math.round(hrMax * HR_ZONE_PERCENTAGES.z2),
    hr_z3_max: Math.round(hrMax * HR_ZONE_PERCENTAGES.z3),
    hr_z4_max: Math.round(hrMax * HR_ZONE_PERCENTAGES.z4),
  };
}

/**
 * Build HR zone display block for AI prompts.
 * Uses athlete's custom zones if set, falls back to defaults from hr_max.
 * @param {object} athlete - Athlete record
 * @returns {string} Formatted HR zones block (empty string if no HR data)
 */
export function buildHrZonesBlock(athlete) {
  if (!athlete.hr_max) return '';

  const defaults = calcDefaultZones(athlete.hr_max);
  const z1 = athlete.hr_z1_max || defaults.hr_z1_max;
  const z2 = athlete.hr_z2_max || defaults.hr_z2_max;
  const z3 = athlete.hr_z3_max || defaults.hr_z3_max;
  const z4 = athlete.hr_z4_max || defaults.hr_z4_max;

  return `
=== ATHLETE HR ZONES ===
Max HR: ${athlete.hr_max} bpm | Resting HR: ${athlete.hr_resting || '?'} bpm
Z1 Recovery: <${z1} bpm
Z2 Easy: ${z1}-${z2} bpm
Z3 Tempo: ${z2}-${z3} bpm
Z4 Threshold: ${z3}-${z4} bpm
Z5 VO2max: >${z4} bpm`;
}
