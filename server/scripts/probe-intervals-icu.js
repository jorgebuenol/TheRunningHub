/**
 * Standalone probe script for Intervals.icu sync behavior.
 *
 * NOT wired into the app. Tests whether the `external_id` upsert approach
 * (Option C from the bug investigation) actually works against the live API.
 *
 * Requires env vars:
 *   ICU_API_KEY     — Intervals.icu API key (used as Basic API_KEY:<key>)
 *   ICU_ATHLETE_ID  — Intervals.icu athlete id, e.g. "i566088"
 *
 * Run:
 *   ICU_API_KEY=... ICU_ATHLETE_ID=... node server/scripts/probe-intervals-icu.js
 *
 * All events created use the name prefix "RH_PROBE_" and live in 2026-06-01 .. 2026-06-15.
 * The script attempts to delete every event it created at the end, and also sweeps the
 * window for any leftover RH_PROBE_-named events from prior runs.
 */

import crypto from 'node:crypto';

const BASE = process.env.INTERVALS_ICU_BASE_URL || 'https://intervals.icu/api/v1';
const API_KEY = process.env.ICU_API_KEY;
const ATHLETE_ID = process.env.ICU_ATHLETE_ID;

if (!API_KEY || !ATHLETE_ID) {
  console.error('Missing ICU_API_KEY or ICU_ATHLETE_ID env vars.');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`API_KEY:${API_KEY}`).toString('base64');
const WINDOW_START = '2026-06-01';
const WINDOW_END = '2026-06-15';
const NAME_PREFIX = 'RH_PROBE_';

const created = []; // { id, external_id, source: 'single'|'bulk' }
const results = []; // { probe, status: 'pass'|'fail'|'inconclusive', detail }

function record(probe, status, detail) {
  results.push({ probe, status, detail });
  const tag = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'INCONCL';
  console.log(`[${tag}] ${probe} — ${detail}`);
}

async function icu(method, path, { body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: {
      Authorization: AUTH,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, json, text };
}

function event(extId, { date = '2026-06-01', name = 'A', desc = '- 5km Easy' } = {}) {
  const payload = {
    category: 'WORKOUT',
    start_date_local: `${date}T00:00:00`,
    type: 'Run',
    name: `${NAME_PREFIX}${name}`,
    description: desc,
    moving_time: 1800,
    workout_doc: {},
  };
  if (extId !== null) payload.external_id = extId;
  return payload;
}

async function listEventsInWindow() {
  const r = await icu('GET', `/athlete/${ATHLETE_ID}/events`, {
    query: { oldest: WINDOW_START, newest: WINDOW_END },
  });
  if (!r.ok) {
    console.error('listEventsInWindow failed:', r.status, r.text.slice(0, 200));
    return [];
  }
  return Array.isArray(r.json) ? r.json : [];
}

async function findByExternalId(extId) {
  const all = await listEventsInWindow();
  return all.filter(e => e.external_id === extId);
}

function track(json, source) {
  if (!json) return;
  const list = Array.isArray(json) ? json : [json];
  for (const e of list) {
    if (e && e.id != null) created.push({ id: e.id, external_id: e.external_id ?? null, source });
  }
}

// ─── Probes ──────────────────────────────────────────────────────────────────

async function probe1_singlePostHonorsExternalId() {
  const extId = `${NAME_PREFIX}1_${Date.now()}`;
  const a = await icu('POST', `/athlete/${ATHLETE_ID}/events`, { body: event(extId, { name: '1a' }) });
  if (!a.ok) return record('#1 single POST honors external_id', 'inconclusive', `first POST failed: ${a.status} ${a.text.slice(0, 120)}`);
  track(a.json, 'single');

  const b = await icu('POST', `/athlete/${ATHLETE_ID}/events`, { body: event(extId, { name: '1b' }) });
  if (!b.ok) {
    record('#1 single POST honors external_id', 'pass', `second POST rejected (${b.status}) — single POST refuses duplicate external_id (treat as upsert-equivalent only if dedupe error)`);
    return;
  }
  track(b.json, 'single');

  const matches = await findByExternalId(extId);
  if (matches.length === 1) {
    record('#1 single POST honors external_id', 'pass', `1 event after 2 POSTs with same external_id → single POST upserts`);
  } else {
    record('#1 single POST honors external_id', 'fail', `${matches.length} events after 2 POSTs with same external_id → single POST duplicates (expected)`);
  }
}

async function probe2_bulkUpsertsWithFlag() {
  const extId = `${NAME_PREFIX}2_${Date.now()}`;
  const a = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { name: '2a' })],
  });
  if (!a.ok) return record('#2 bulk upsert=true', 'inconclusive', `first bulk POST failed: ${a.status} ${a.text.slice(0, 160)}`);
  track(a.json, 'bulk');

  const b = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { name: '2b' })],
  });
  if (!b.ok) return record('#2 bulk upsert=true', 'fail', `second bulk POST failed: ${b.status} ${b.text.slice(0, 160)}`);
  track(b.json, 'bulk');

  const matches = await findByExternalId(extId);
  const updated = matches.length === 1 && matches[0].name === `${NAME_PREFIX}2b`;
  if (updated) record('#2 bulk upsert=true', 'pass', `1 event, name="${matches[0].name}" → bulk upserts cleanly`);
  else if (matches.length === 1) record('#2 bulk upsert=true', 'inconclusive', `1 event but name="${matches[0].name}" — write may have been ignored`);
  else record('#2 bulk upsert=true', 'fail', `${matches.length} events after 2 bulk POSTs with same external_id`);
}

async function probe3_paramShape() {
  // Try: no flag, ?upsert=true (already done in #2 — re-test fresh), ?upsertOnUid=true.
  async function trial(label, query) {
    const extId = `${NAME_PREFIX}3_${label}_${Date.now()}`;
    const a = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, { query, body: [event(extId, { name: `3${label}a` })] });
    if (!a.ok) return { label, outcome: `first POST failed (${a.status})` };
    track(a.json, 'bulk');
    const b = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, { query, body: [event(extId, { name: `3${label}b` })] });
    if (!b.ok) return { label, outcome: `second POST rejected (${b.status})` };
    track(b.json, 'bulk');
    const matches = await findByExternalId(extId);
    return { label, outcome: `count=${matches.length}, name=${matches[0]?.name ?? 'n/a'}` };
  }

  const noFlag = await trial('noFlag', {});
  const upsert = await trial('upsert', { upsert: 'true' });
  const upsertOnUid = await trial('upsertOnUid', { upsertOnUid: 'true' });

  record('#3 param shape', 'pass',
    `noFlag → ${noFlag.outcome}; upsert=true → ${upsert.outcome}; upsertOnUid=true → ${upsertOnUid.outcome}`);
}

async function probe4_crossDateCollision() {
  const extId = `${NAME_PREFIX}4_${Date.now()}`;
  const a = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { date: '2026-06-02', name: '4a' })],
  });
  if (!a.ok) return record('#4 cross-date collision', 'inconclusive', `first POST failed: ${a.status}`);
  track(a.json, 'bulk');

  const b = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { date: '2026-06-09', name: '4b' })],
  });
  if (!b.ok) return record('#4 cross-date collision', 'fail', `second POST failed: ${b.status} ${b.text.slice(0, 120)}`);
  track(b.json, 'bulk');

  const matches = await findByExternalId(extId);
  if (matches.length === 1 && matches[0].start_date_local?.startsWith('2026-06-09')) {
    record('#4 cross-date collision', 'pass', `1 event moved to 2026-06-09 → upsert moves on date change`);
  } else if (matches.length === 1) {
    record('#4 cross-date collision', 'inconclusive', `1 event but on date=${matches[0].start_date_local}`);
  } else {
    record('#4 cross-date collision', 'fail', `${matches.length} events — date change duplicated instead of moving (will need delete-before-write)`);
  }
}

async function probe5_externalIdScoping() {
  const date = '2026-06-03';
  // Simulated "manual" = API-created event WITHOUT external_id (closest we can get without UI access).
  const manual = await icu('POST', `/athlete/${ATHLETE_ID}/events`, { body: event(null, { date, name: '5_manual' }) });
  if (!manual.ok) return record('#5 external_id scoping', 'inconclusive', `manual create failed: ${manual.status}`);
  track(manual.json, 'single');
  const manualId = manual.json?.id;

  const extId = `${NAME_PREFIX}5_${Date.now()}`;
  const app = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { date, name: '5_app' })],
  });
  if (!app.ok) return record('#5 external_id scoping', 'inconclusive', `app create failed: ${app.status}`);
  track(app.json, 'bulk');

  const inWindow = await listEventsInWindow();
  const manualStillThere = inWindow.find(e => e.id === manualId);
  const appEvent = inWindow.find(e => e.external_id === extId);

  if (manualStillThere && appEvent) {
    record('#5 external_id scoping', 'pass', `manual + app event coexist on same date → external_id does not clobber non-app events`);
  } else if (!manualStillThere) {
    record('#5 external_id scoping', 'fail', `manual event missing → upsert clobbered an event without external_id`);
  } else {
    record('#5 external_id scoping', 'fail', `app event missing → bulk upsert silently dropped`);
  }
}

async function probe6_deleteAndRecreate() {
  const extId = `${NAME_PREFIX}6_${Date.now()}`;
  const a = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { name: '6a' })],
  });
  if (!a.ok) return record('#6 delete and recreate', 'inconclusive', `create failed: ${a.status}`);
  track(a.json, 'bulk');

  const del = await icu('PUT', `/athlete/${ATHLETE_ID}/events/bulk-delete`, {
    body: [{ external_id: extId }],
  });
  if (!del.ok) return record('#6 delete and recreate', 'fail', `bulk-delete by external_id failed: ${del.status} ${del.text.slice(0, 160)}`);

  const afterDel = await findByExternalId(extId);
  if (afterDel.length !== 0) return record('#6 delete and recreate', 'fail', `event still present after delete (count=${afterDel.length})`);

  const b = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { name: '6b' })],
  });
  if (!b.ok) return record('#6 delete and recreate', 'fail', `recreate failed: ${b.status} ${b.text.slice(0, 160)}`);
  track(b.json, 'bulk');

  const after = await findByExternalId(extId);
  if (after.length === 1 && after[0].name === `${NAME_PREFIX}6b`) {
    record('#6 delete and recreate', 'pass', `delete-by-external_id + re-POST works cleanly`);
  } else {
    record('#6 delete and recreate', 'fail', `unexpected state: count=${after.length}, name=${after[0]?.name}`);
  }
}

async function probe8_uuidAsExternalId() {
  const extId = crypto.randomUUID();
  const a = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { name: '8a' })],
  });
  if (!a.ok) return record('#8 UUID as external_id', 'fail', `POST failed with UUID extId: ${a.status} ${a.text.slice(0, 160)}`);
  track(a.json, 'bulk');

  const b = await icu('POST', `/athlete/${ATHLETE_ID}/events/bulk`, {
    query: { upsert: 'true' },
    body: [event(extId, { name: '8b' })],
  });
  if (!b.ok) return record('#8 UUID as external_id', 'fail', `re-POST failed: ${b.status}`);
  track(b.json, 'bulk');

  const after = await findByExternalId(extId);
  if (after.length === 1 && after[0].external_id === extId) {
    record('#8 UUID as external_id', 'pass', `UUID round-trips and upserts`);
  } else {
    record('#8 UUID as external_id', 'fail', `count=${after.length}, external_id stored=${after[0]?.external_id}`);
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n--- cleanup ---');

  const trackedIds = [...new Set(created.map(c => c.id).filter(Boolean))];
  if (trackedIds.length) {
    const r = await icu('PUT', `/athlete/${ATHLETE_ID}/events/bulk-delete`, {
      body: trackedIds.map(id => ({ id })),
    });
    console.log(`bulk-delete tracked ids (n=${trackedIds.length}): ${r.ok ? 'ok' : 'FAILED ' + r.status + ' ' + r.text.slice(0, 160)}`);
  }

  // Defensive sweep: any RH_PROBE_ event still in window.
  const remaining = (await listEventsInWindow()).filter(e => (e.name || '').startsWith(NAME_PREFIX));
  if (remaining.length) {
    const r = await icu('PUT', `/athlete/${ATHLETE_ID}/events/bulk-delete`, {
      body: remaining.map(e => ({ id: e.id })),
    });
    console.log(`sweep-delete leftover RH_PROBE_ events (n=${remaining.length}): ${r.ok ? 'ok' : 'FAILED ' + r.status}`);
  } else {
    console.log('sweep: no leftover RH_PROBE_ events in window.');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Probing Intervals.icu API as athlete ${ATHLETE_ID}`);
  console.log(`Window: ${WINDOW_START} .. ${WINDOW_END}\n`);

  try {
    await probe1_singlePostHonorsExternalId();
    await probe2_bulkUpsertsWithFlag();
    await probe3_paramShape();
    await probe4_crossDateCollision();
    await probe5_externalIdScoping();
    await probe6_deleteAndRecreate();
    await probe8_uuidAsExternalId();
  } catch (e) {
    console.error('Probe run aborted:', e);
  } finally {
    await cleanup();
  }

  console.log('\n--- summary ---');
  for (const r of results) console.log(`${r.status.toUpperCase()}\t${r.probe}\t${r.detail}`);
}

main();
