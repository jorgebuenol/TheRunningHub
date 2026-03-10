/**
 * Server-side VDOT calculator (mirrors client logic)
 */

function oxygenCost(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

function vo2Fraction(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

export function calculateVDOT(distanceMeters, timeSeconds) {
  const timeMinutes = timeSeconds / 60;
  const velocity = distanceMeters / timeMinutes;
  const vo2 = oxygenCost(velocity);
  const fraction = vo2Fraction(timeMinutes);
  return vo2 / fraction;
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
  return Math.round(bestVdot * 100) / 100;
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

export function getTrainingPaces(vdot) {
  if (!vdot || vdot <= 0) return null;
  const easyMinV = velocityAtIntensity(vdot, 0.59);
  const easyMaxV = velocityAtIntensity(vdot, 0.74);
  return {
    pace_easy_min: velocityToPaceSecPerKm(easyMaxV),
    pace_easy_max: velocityToPaceSecPerKm(easyMinV),
    pace_tempo: velocityToPaceSecPerKm(velocityAtIntensity(vdot, 0.83)),
    pace_lt: velocityToPaceSecPerKm(velocityAtIntensity(vdot, 0.88)),
    pace_race: velocityToPaceSecPerKm(velocityAtIntensity(vdot, 0.93)),
    pace_vo2max: velocityToPaceSecPerKm(velocityAtIntensity(vdot, 0.98)),
  };
}

export function formatPace(secPerKm) {
  if (!secPerKm) return '--:--';
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
