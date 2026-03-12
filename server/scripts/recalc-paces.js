/**
 * One-time script to recalculate VDOT and training paces
 * for ALL existing athletes after fixing the intensity percentages
 * and adding Bogotá altitude adjustment.
 *
 * Run: node scripts/recalc-paces.js
 */
import { createClient } from '@supabase/supabase-js';
import { getBestVDOT, getTrainingPaces, formatPace } from '../src/utils/vdot.js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function recalcAllAthletes() {
  const { data: athletes, error } = await supabase
    .from('athletes')
    .select('id, time_5k, time_10k, time_half_marathon, time_marathon, vdot, pace_easy_min, pace_easy_max, pace_tempo, pace_lt, pace_race, pace_vo2max, profiles(full_name)');

  if (error) {
    console.error('Fetch error:', error);
    return;
  }

  console.log(`Found ${athletes.length} athletes to recalculate\n`);

  let updated = 0;
  let skipped = 0;

  for (const a of athletes) {
    const raceTimes = {
      time_5k: a.time_5k,
      time_10k: a.time_10k,
      time_half_marathon: a.time_half_marathon,
      time_marathon: a.time_marathon,
    };

    const newVdot = getBestVDOT(raceTimes);
    const newPaces = getTrainingPaces(newVdot); // default +15s altitude for Bogotá

    if (!newPaces) {
      console.log(`${a.profiles?.full_name || a.id} — no valid race times, skipping`);
      skipped++;
      continue;
    }

    const name = a.profiles?.full_name || a.id;
    console.log(name);
    console.log(`  VDOT: ${a.vdot} → ${newVdot}`);
    console.log(`  Easy: ${formatPace(a.pace_easy_min)}-${formatPace(a.pace_easy_max)} → ${formatPace(newPaces.pace_easy_min)}-${formatPace(newPaces.pace_easy_max)}`);
    console.log(`  Tempo: ${formatPace(a.pace_tempo)} → ${formatPace(newPaces.pace_tempo)}`);
    console.log(`  LT: ${formatPace(a.pace_lt)} → ${formatPace(newPaces.pace_lt)}`);
    console.log(`  Race: ${formatPace(a.pace_race)} → ${formatPace(newPaces.pace_race)}`);
    console.log(`  Int: ${formatPace(a.pace_vo2max)} → ${formatPace(newPaces.pace_vo2max)}`);

    const { error: updateErr } = await supabase
      .from('athletes')
      .update({ vdot: newVdot, ...newPaces })
      .eq('id', a.id);

    if (updateErr) {
      console.log(`  ❌ ERROR: ${updateErr.message}`);
    } else {
      console.log(`  ✅ Updated`);
      updated++;
    }
    console.log('');
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
}

recalcAllAthletes();
