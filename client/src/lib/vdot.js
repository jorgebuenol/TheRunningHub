/**
 * VDOT Calculator — Jack Daniels Running Formula
 *
 * Calculates VDOT from race performance and derives training paces.
 * All paces returned as seconds per kilometer.
 * Times input/output in total seconds.
 *
 * Return keys use pace_ prefix to match DB column names:
 *   pace_easy_min, pace_easy_max, pace_tempo, pace_lt, pace_race, pace_vo2max
 */

// Reasonable VDOT bounds (recreational jogger to world-class elite)
const VDOT_MIN = 10;
const VDOT_MAX = 85;

// Oxygen cost of running at velocity v (meters/min)
function oxygenCost(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

// Fraction of VO2max sustained over time t (minutes)
function vo2Fraction(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

/**
 * Calculate VDOT from a race result.
 * Returns 0 for unreasonable inputs.
 * @param {number} distanceMeters - Race distance in meters
 * @param {number} timeSeconds - Finishing time in seconds
 * @returns {number} VDOT value (clamped to 10–85 range, or 0 if invalid)
 */
export function calculateVDOT(distanceMeters, timeSeconds) {
  if (!distanceMeters || !timeSeconds || timeSeconds <= 0) return 0;

  // Sanity: reject times that are physically impossible
  // (e.g. under 10 min for a marathon, or > 10 hours for a 5K)
  const minPace = 1.5;  // m/s — ~11:07/km (very slow walk-jog)
  const maxPace = 7.0;  // m/s — ~2:23/km (world-record sprint)
  const pace = distanceMeters / timeSeconds;
  if (pace < minPace || pace > maxPace) return 0;

  const timeMinutes = timeSeconds / 60;
  const velocity = distanceMeters / timeMinutes; // meters per min

  const vo2 = oxygenCost(velocity);
  const fraction = vo2Fraction(timeMinutes);

  const vdot = vo2 / fraction;

  // Clamp to reasonable range
  if (vdot < VDOT_MIN || vdot > VDOT_MAX || !isFinite(vdot)) return 0;
  return vdot;
}

/**
 * Get the best (highest) VDOT from multiple race times.
 * Picks the race giving the highest VDOT.
 */
export function getBestVDOT(raceTimes) {
  const distances = {
    time_5k: 5000,
    time_10k: 10000,
    time_half_marathon: 21097.5,
    time_marathon: 42195,
  };

  let bestVdot = 0;

  for (const [key, distance] of Object.entries(distances)) {
    const time = raceTimes[key];
    if (time && time > 0) {
      const vdot = calculateVDOT(distance, time);
      if (vdot > bestVdot) bestVdot = vdot;
    }
  }

  return Math.round(bestVdot * 10) / 10; // 1 decimal place
}

/**
 * Velocity (m/min) for a given VDOT and % VO2max intensity.
 * Inverts the oxygenCost equation using the quadratic formula.
 */
function velocityAtIntensity(vdot, intensityPct) {
  const targetVO2 = vdot * intensityPct;
  // Solve: 0.000104*v^2 + 0.182258*v + (-4.60 - targetVO2) = 0
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.60 - targetVO2;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

/**
 * Convert velocity (m/min) to pace (seconds per km)
 */
function velocityToPaceSecPerKm(v) {
  if (v <= 0) return 0;
  return Math.round((1000 / v) * 60);
}

/**
 * Calculate all training paces from VDOT.
 * Returns paces in seconds per kilometer.
 *
 * Jack Daniels intensity zones (% of VO2max):
 *   Easy (E):        65–79%
 *   Marathon (M):    80–84%   → used as "Tempo" label
 *   Threshold (T):   86–88%   → lactate threshold
 *   Interval (I):    97–100%  → VO2max intervals
 *
 * Keys use pace_ prefix to match DB column names.
 */
export function getTrainingPaces(vdot) {
  if (!vdot || vdot <= 0) {
    return {
      pace_easy_min: 0, pace_easy_max: 0,
      pace_tempo: 0, pace_lt: 0,
      pace_race: 0, pace_vo2max: 0,
    };
  }

  // Easy range: 65–79% VO2max
  const easySlowV = velocityAtIntensity(vdot, 0.65);
  const easyFastV = velocityAtIntensity(vdot, 0.79);

  // Marathon / Tempo: ~84% VO2max
  const tempoV = velocityAtIntensity(vdot, 0.84);

  // Threshold (T pace): ~88% VO2max — lactate threshold
  const ltV = velocityAtIntensity(vdot, 0.88);

  // Race pace: ~93% VO2max (roughly 10K–HM effort)
  const raceV = velocityAtIntensity(vdot, 0.93);

  // VO2max intervals (I pace): ~98% VO2max
  const vo2maxV = velocityAtIntensity(vdot, 0.98);

  return {
    pace_easy_min: velocityToPaceSecPerKm(easyFastV),   // faster end of easy
    pace_easy_max: velocityToPaceSecPerKm(easySlowV),   // slower end of easy
    pace_tempo: velocityToPaceSecPerKm(tempoV),
    pace_lt: velocityToPaceSecPerKm(ltV),
    pace_race: velocityToPaceSecPerKm(raceV),
    pace_vo2max: velocityToPaceSecPerKm(vo2maxV),
  };
}

/**
 * Format seconds-per-km pace to mm:ss string
 */
export function formatPace(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return '--:--';
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/**
 * Replace hardcoded pace ranges in AI-generated description text
 * with the canonical pace values from the workout record.
 * Matches patterns like "(5:27 - 6:22 min/km)" or "(5:27-6:22/km)"
 */
export function normalizeDescriptionPace(description, workout) {
  if (!description || !workout?.pace_range_min || !workout?.pace_range_max) return description;
  const canonical = `${formatPace(workout.pace_range_min)} - ${formatPace(workout.pace_range_max)}`;
  return description.replace(
    /\(\d+:\d{2}\s*[-–]\s*\d+:\d{2}\s*(?:min\/km|\/km)\)/g,
    `(${canonical} min/km)`
  );
}

/**
 * Format total seconds to H:MM:SS or MM:SS string
 */
export function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '--:--';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Parse MM:SS or H:MM:SS string to total seconds
 */
export function parseTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}
