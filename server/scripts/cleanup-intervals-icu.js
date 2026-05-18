/**
 * One-time cleanup for pre-fix Intervals.icu duplicates.
 *
 * Before the bulk-upsert fix, every sync POSTed new events without an
 * external_id, so calendars accumulated 2-N copies of each workout. Those
 * legacy events are not addressable by external_id (they don't have one),
 * so the only way to clean them is by name+date match against RunHub's
 * own workouts. This script does that, then re-pushes via the new path.
 *
 * ⚠️  Garmin propagation: deleting ICU events propagates to Garmin Connect
 * (and to the athlete's watch via sync). During the run the athlete may
 * see workouts disappear, then reappear seconds later as the re-push
 * lands. Run off-hours. Give athletes a heads-up. Don't run while an
 * athlete is mid-workout.
 *
 * Usage:
 *   node scripts/cleanup-intervals-icu.js                       # dry-run, all athletes with creds
 *   node scripts/cleanup-intervals-icu.js --execute             # apply, interactive confirm per athlete
 *   node scripts/cleanup-intervals-icu.js --execute --yes       # apply, no prompts (unattended)
 *   node scripts/cleanup-intervals-icu.js --athlete <uuid>      # scope to one athlete
 *   node scripts/cleanup-intervals-icu.js --window 2026-01-01..2026-12-31
 */

import { createClient } from '@supabase/supabase-js';
import { pushPlanWorkouts } from '../src/services/intervalsPush.js';
import dotenv from 'dotenv';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, 'cleanup-intervals-icu.log');
const ICU_BASE = process.env.INTERVALS_ICU_BASE_URL || 'https://intervals.icu/api/v1';
const BULK_CHUNK_SIZE = 50;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { execute: false, yes: false, athlete: null, window: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') out.execute = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--athlete') out.athlete = argv[++i];
    else if (a === '--window') out.window = argv[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`Unknown arg: ${a}`); process.exit(1); }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/cleanup-intervals-icu.js [--execute] [--yes] [--athlete <uuid>] [--window <start>..<end>]
  --execute      apply changes (default is dry-run)
  --yes          skip per-athlete confirmation prompts
  --athlete <id> scope to one athlete uuid
  --window a..b  scope to date range (ISO YYYY-MM-DD on both ends)`);
}

function parseWindow(s) {
  if (!s) return null;
  const [start, end] = s.split('..');
  if (!start || !end) throw new Error(`--window expects "YYYY-MM-DD..YYYY-MM-DD", got: ${s}`);
  return { start, end };
}

// ─── logging ─────────────────────────────────────────────────────────────────

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_PATH, stamped + '\n');
}

// ─── ICU helpers (inlined; this is a one-off, don't bloat the service) ──────

function authHeader(apiKey) {
  return 'Basic ' + Buffer.from(`API_KEY:${apiKey}`).toString('base64');
}

async function listEvents(athlete, windowStart, windowEnd) {
  const url = `${ICU_BASE}/athlete/${athlete.intervals_icu_athlete_id}/events?oldest=${windowStart}&newest=${windowEnd}`;
  const res = await fetch(url, { headers: { Authorization: authHeader(athlete.intervals_icu_api_key) } });
  if (!res.ok) throw new Error(`ICU list events ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

async function bulkDeleteByIcuIds(athlete, icuIds) {
  if (!icuIds.length) return;
  for (let i = 0; i < icuIds.length; i += BULK_CHUNK_SIZE) {
    const chunk = icuIds.slice(i, i + BULK_CHUNK_SIZE);
    const url = `${ICU_BASE}/athlete/${athlete.intervals_icu_athlete_id}/events/bulk-delete`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(athlete.intervals_icu_api_key) },
      body: JSON.stringify(chunk.map(id => ({ id }))),
    });
    if (!res.ok) throw new Error(`ICU bulk-delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// ─── matching ────────────────────────────────────────────────────────────────

function normalize(s) {
  return (s || '').trim().toLowerCase();
}

/**
 * An ICU event "matches a RunHub workout" iff its start_date_local (date part)
 * equals a workout.workout_date for this athlete AND its name (case-insensitive,
 * trimmed) equals that workout.title. Anything not matching that join is
 * preserved — manual events, races, non-running events, anything renamed in
 * the ICU UI.
 */
function classifyEvents(icuEvents, workouts) {
  const byDateName = new Map(); // 'YYYY-MM-DD|title' → workout
  for (const w of workouts) {
    if (!w.title || !w.workout_date) continue;
    byDateName.set(`${w.workout_date}|${normalize(w.title)}`, w);
  }

  const ours = [];
  const foreign = [];
  for (const e of icuEvents) {
    const date = (e.start_date_local || '').split('T')[0];
    const key = `${date}|${normalize(e.name)}`;
    if (byDateName.has(key)) ours.push({ event: e, workout: byDateName.get(key) });
    else foreign.push(e);
  }
  return { ours, foreign };
}

function summarizeDuplicates(ours) {
  // Group "ours" by (date, name) — anything with >1 is a duplicate group.
  const groups = new Map();
  for (const o of ours) {
    const date = (o.event.start_date_local || '').split('T')[0];
    const key = `${date}|${normalize(o.event.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o.event);
  }
  const duplicateGroups = [...groups.entries()].filter(([, evs]) => evs.length > 1);
  return { duplicateGroups, totalGroups: groups.size };
}

// ─── per-athlete pipeline ───────────────────────────────────────────────────

async function listAthletes(scope) {
  let q = supabase
    .from('athletes')
    .select('id, intervals_icu_api_key, intervals_icu_athlete_id, profiles(email, full_name)')
    .not('intervals_icu_api_key', 'is', null)
    .not('intervals_icu_athlete_id', 'is', null);
  if (scope) q = q.eq('id', scope);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchWorkouts(athleteId, windowStart, windowEnd) {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, title, workout_date, plan_week_id, plan_weeks!inner(plan_id)')
    .eq('athlete_id', athleteId)
    .gte('workout_date', windowStart)
    .lte('workout_date', windowEnd)
    .neq('workout_type', 'rest');
  if (error) throw error;
  return data || [];
}

async function resolveWindow(override, athleteId) {
  if (override) return override;
  const { data } = await supabase
    .from('workouts')
    .select('workout_date')
    .eq('athlete_id', athleteId)
    .order('workout_date', { ascending: true });
  if (data && data.length) {
    return { start: data[0].workout_date, end: data[data.length - 1].workout_date };
  }
  const end = new Date();
  const start = new Date(); start.setDate(start.getDate() - 365);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

async function confirm(prompt) {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`${prompt} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function processAthlete(athlete, args) {
  const email = athlete.profiles?.email || '(no email)';
  const label = `${email} (${athlete.id})`;
  log(`--- athlete: ${label} ---`);

  const windowOverride = parseWindow(args.window);
  const window = await resolveWindow(windowOverride, athlete.id);
  log(`window: ${window.start} .. ${window.end}`);

  let workouts;
  try {
    workouts = await fetchWorkouts(athlete.id, window.start, window.end);
  } catch (err) {
    log(`  ERROR fetching workouts: ${err.message}`);
    return { athlete: email, status: 'error', error: err.message, before: 0, deleted: 0, repushed: 0, after: 0 };
  }

  let events;
  try {
    events = await listEvents(athlete, window.start, window.end);
  } catch (err) {
    log(`  ERROR listing ICU events: ${err.message}`);
    return { athlete: email, status: 'error', error: err.message, before: 0, deleted: 0, repushed: 0, after: 0 };
  }

  const { ours, foreign } = classifyEvents(events, workouts);
  const { duplicateGroups } = summarizeDuplicates(ours);

  log(`  RunHub workouts in window: ${workouts.length}`);
  log(`  ICU events in window:      ${events.length} (ours: ${ours.length}, foreign/preserved: ${foreign.length})`);
  log(`  Duplicate groups (>1 copy of same workout): ${duplicateGroups.length}`);
  if (duplicateGroups.length) {
    const worst = duplicateGroups.sort((a, b) => b[1].length - a[1].length).slice(0, 3);
    for (const [key, evs] of worst) log(`    - ${key} → ${evs.length} copies`);
  }
  const unmatchedWorkouts = workouts.filter(w => {
    const k = `${w.workout_date}|${normalize(w.title)}`;
    return !ours.some(o => `${(o.event.start_date_local || '').split('T')[0]}|${normalize(o.event.name)}` === k);
  });
  log(`  RunHub workouts with NO matching ICU event: ${unmatchedWorkouts.length}`);

  if (!args.execute) {
    log(`  [dry-run] would delete ${ours.length} ICU event(s), then re-push ${workouts.length} workout(s).`);
    return { athlete: email, status: 'dry-run', before: events.length, deleted: 0, repushed: 0, after: events.length };
  }

  if (!args.yes) {
    const ok = await confirm(`Delete ${ours.length} ICU events and re-push ${workouts.length} workouts for ${email}?`);
    if (!ok) {
      log(`  skipped by user`);
      return { athlete: email, status: 'skipped', before: events.length, deleted: 0, repushed: 0, after: events.length };
    }
  }

  const icuIdsToDelete = ours.map(o => o.event.id);
  let deleted = 0;
  try {
    await bulkDeleteByIcuIds(athlete, icuIdsToDelete);
    deleted = icuIdsToDelete.length;
    log(`  deleted ${deleted} ICU event(s)`);
  } catch (err) {
    log(`  ERROR during bulk-delete: ${err.message}`);
    return { athlete: email, status: 'error', error: err.message, before: events.length, deleted: 0, repushed: 0, after: events.length };
  }

  // Re-push each distinct plan in the window via the new upsert path.
  const planIds = [...new Set(workouts.map(w => w.plan_weeks?.plan_id).filter(Boolean))];
  let repushed = 0;
  for (const planId of planIds) {
    try {
      const r = await pushPlanWorkouts(supabase, planId);
      repushed += r.synced;
      log(`  re-pushed plan ${planId}: ${r.synced}/${r.total}`);
    } catch (err) {
      log(`  ERROR re-pushing plan ${planId}: ${err.message}`);
    }
  }

  let afterCount = events.length;
  try {
    afterCount = (await listEvents(athlete, window.start, window.end)).length;
  } catch (err) {
    log(`  WARN could not fetch after-state: ${err.message}`);
  }

  log(`  done. before=${events.length} deleted=${deleted} repushed=${repushed} after=${afterCount}`);
  return { athlete: email, status: 'ok', before: events.length, deleted, repushed, after: afterCount };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  log(`=== run start mode=${args.execute ? 'EXECUTE' : 'dry-run'} yes=${args.yes} athlete=${args.athlete ?? 'all'} window=${args.window ?? 'auto'} ===`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env.');
    process.exit(1);
  }

  let athletes;
  try {
    athletes = await listAthletes(args.athlete);
  } catch (err) {
    console.error('Failed to list athletes:', err.message);
    process.exit(1);
  }

  if (!athletes.length) {
    log('No athletes with ICU credentials match the scope.');
    return;
  }

  log(`scope: ${athletes.length} athlete(s)`);
  if (args.execute && !args.yes) {
    const ok = await confirm(`About to mutate ${athletes.length} ICU calendars. Proceed?`);
    if (!ok) { log('aborted before any mutation'); return; }
  }

  const summary = [];
  for (const a of athletes) {
    try {
      const r = await processAthlete(a, args);
      summary.push(r);
    } catch (err) {
      log(`UNCAUGHT for athlete ${a.id}: ${err.message}`);
      summary.push({ athlete: a.profiles?.email ?? a.id, status: 'error', error: err.message, before: 0, deleted: 0, repushed: 0, after: 0 });
    }
  }

  log('=== summary ===');
  console.log('\nathlete                          | before | deleted | repushed | after | status');
  console.log('---------------------------------|--------|---------|----------|-------|--------');
  for (const r of summary) {
    const a = (r.athlete || '').padEnd(32).slice(0, 32);
    console.log(`${a} | ${String(r.before).padStart(6)} | ${String(r.deleted).padStart(7)} | ${String(r.repushed).padStart(8)} | ${String(r.after).padStart(5)} | ${r.status}`);
  }
  log(`=== run end ===`);
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
