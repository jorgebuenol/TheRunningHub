/**
 * Server-side VDOT calculator (mirrors client logic)
 *
 * Jack Daniels Running Formula — calculates VDOT from race performance
 * and derives training paces stored in DB columns.
 */

const VDOT_MIN = 10;
const VDOT_MAX = 85;

function oxygenCost(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

function vo2Fraction(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

export function calculateVDOT(distanceMeters, timeSeconds) {
  if (!distanceMeters || !timeSeconds || timeSeconds <= 0) return 0;

  const minPace = 1.5;  // m/s
  const maxPace = 7.0;  // m/s
  const pace = distanceMeters / timeSeconds;
  if (pace < minPace || pace > maxPace) return 0;

  const timeMinutes = timeSeconds / 60;
  const velocity = distanceMeters / timeMinutes;
  const vo2 = oxygenCost(velocity);
  const fraction = vo2Fraction(timeMinutes);
  const vdot = vo2 / fraction;

  if (vdot < VDOT_MIN || vdot > VDOT_MAX || !isFinite(vdot)) return 0;
  return vdot;
}

export function getBestVDOT(raceTimes) {
  const distances = { time_5k: 5000, time_10k: 10000, time_half_marathon: 21097.5, time_marathon: 42195 };
  let bestVdot = 0;
  for (const [key, distance] of Object.entries(distances)) {
    const time = raceTimes[key];
    if (time && time > 0) {
      const vdot = calculateVDOT(distance, time);
      if (vdot > bestVdot) bestVdot = vdot;
    }
  }
  return Math.round(bestVdot * 10) / 10;
}

function velocityAtIntensity(vdot, intensityPct) {
  const targetVO2 = vdot * intensityPct;
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.60 - targetVO2;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

function velocityToPaceSecPerKm(v) {
  if (v <= 0) return 0;
  return Math.round((1000 / v) * 60);
}

/**
 * Calculate training paces from VDOT with Bogotá altitude adjustment.
 *
 * Corrected Daniels intensity zones:
 *   Easy:       58–67% VO2max (no altitude adjustment)
 *   Tempo (M):  77% VO2max   (+altitudeAdjustSec)
 *   Threshold:  82% VO2max   (+altitudeAdjustSec)
 *   Race:       90% VO2max   (+altitudeAdjustSec)
 *   Interval:   97% VO2max   (+altitudeAdjustSec)
 *
 * @param {number} vdot - VDOT value
 * @param {number} altitudeAdjustSec - seconds/km to add for altitude (default 15 for Bogotá 2640m). Pass 0 for sea level.
 */
export function getTrainingPaces(vdot, altitudeAdjustSec = 15) {
  if (!vdot || vdot <= 0) return null;

  // Easy range: 58–67% VO2max — NO altitude adjustment
  const easySlowV = velocityAtIntensity(vdot, 0.58);
  const easyFastV = velocityAtIntensity(vdot, 0.67);

  // Harder paces: add altitude adjustment (default +15 sec/km for Bogotá ~2,640m)
  const alt = altitudeAdjustSec || 0;

  return {
    pace_easy_min: velocityToPaceSecPerKm(easyFastV),
    pace_easy_max: velocityToPaceSecPerKm(easySlowV),
    pace_tempo:    velocityToPaceSecPerKm(velocityAtIntensity(vdot, 0.77)) + alt,
    pace_lt:       velocityToPaceSecPerKm(velocityAtIntensity(vdot, 0.82)) + alt,
    pace_race:     velocityToPaceSecPerKm(velocityAtIntensity(vdot, 0.90)) + alt,
    pace_vo2max:   velocityToPaceSecPerKm(velocityAtIntensity(vdot, 0.97)) + alt,
  };
}

export function formatPace(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return '--:--';
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
