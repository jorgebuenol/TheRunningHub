/**
 * VDOT Calculator — Jack Daniels Running Formula
 *
 * Calculates VDOT from race performance and derives training paces.
 * All paces returned as seconds per kilometer.
 * Times input/output in total seconds.
 */

// Oxygen cost of running at velocity v (meters/min)
function oxygenCost(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

// Fraction of VO2max sustained over time t (minutes)
function vo2Fraction(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

/**
 * Calculate VDOT from a race result
 * @param {number} distanceMeters - Race distance in meters
 * @param {number} timeSeconds - Finishing time in seconds
 * @returns {number} VDOT value
 */
export function calculateVDOT(distanceMeters, timeSeconds) {
  const timeMinutes = timeSeconds / 60;
  const velocity = distanceMeters / timeMinutes; // meters per min

  const vo2 = oxygenCost(velocity);
  const fraction = vo2Fraction(timeMinutes);

  return vo2 / fraction;
}

/**
 * Get the best (highest) VDOT from multiple race times
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

  return Math.round(bestVdot * 100) / 100;
}

/**
 * Velocity (m/min) for a given VDOT and % VO2max intensity
 */
function velocityAtIntensity(vdot, intensityPct) {
  const targetVO2 = vdot * intensityPct;
  // Solve oxygen cost equation for velocity using quadratic formula
  // 0.000104*v^2 + 0.182258*v + (-4.60 - targetVO2) = 0
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
 * Calculate all training paces from VDOT
 * Returns paces in seconds per kilometer
 */
export function getTrainingPaces(vdot) {
  if (!vdot || vdot <= 0) {
    return {
      easy_min: 0, easy_max: 0,
      tempo: 0, lt: 0,
      race_5k: 0, race_10k: 0,
      race_hm: 0, race_marathon: 0,
      vo2max: 0,
    };
  }

  const easyMinV = velocityAtIntensity(vdot, 0.59);
  const easyMaxV = velocityAtIntensity(vdot, 0.74);
  const tempoV = velocityAtIntensity(vdot, 0.83);
  const ltV = velocityAtIntensity(vdot, 0.88);
  const vo2maxV = velocityAtIntensity(vdot, 0.98);

  // Race paces estimated from VDOT tables
  const race5kV = velocityAtIntensity(vdot, 0.97);
  const race10kV = velocityAtIntensity(vdot, 0.93);
  const raceHmV = velocityAtIntensity(vdot, 0.87);
  const raceMarathonV = velocityAtIntensity(vdot, 0.82);

  return {
    easy_min: velocityToPaceSecPerKm(easyMaxV),  // faster end of easy
    easy_max: velocityToPaceSecPerKm(easyMinV),   // slower end of easy
    tempo: velocityToPaceSecPerKm(tempoV),
    lt: velocityToPaceSecPerKm(ltV),
    race_5k: velocityToPaceSecPerKm(race5kV),
    race_10k: velocityToPaceSecPerKm(race10kV),
    race_hm: velocityToPaceSecPerKm(raceHmV),
    race_marathon: velocityToPaceSecPerKm(raceMarathonV),
    vo2max: velocityToPaceSecPerKm(vo2maxV),
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
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}
