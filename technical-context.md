# RunHub — Technical Context

> Generated 2026-05-09. For Claude.ai conversations needing full-stack context without filesystem access.
> Stack: React+Vite client (port 5173) · Node/Express server (port 3001) · Supabase (Postgres + Auth + RLS).
> Project ID: `pqbhzxrxsdchxerkltab`.

---

## 1. Database Schema

All tables in schema `public`. RLS enabled on every table. Row counts as of generation.

### `profiles` (8 rows)
1:1 with `auth.users` (PK = auth user id).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | FK → `auth.users.id` |
| role | text | `'coach' \| 'athlete'`, default `'athlete'` |
| full_name | text | |
| email | text | |
| avatar_url | text | nullable |
| created_at, updated_at | timestamptz | default now() |

### `athletes` (7 rows)
The athlete-record. **`workouts.athlete_id`, `workout_feedback.athlete_id`, `daily_readiness.athlete_id`, `training_plans.athlete_id`, `strength_sessions.athlete_id` all FK to `athletes.id`, NOT `profiles.id`.** `athletes.profile_id` is the link to the auth user.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default uuid_generate_v4 |
| profile_id | uuid UNIQUE | FK → `profiles.id` |
| age, weight_kg, height_cm, body_fat_pct | numeric/int | |
| weekly_km | numeric | self-reported baseline |
| time_5k, time_10k, time_half_marathon, time_marathon | int (seconds) | PR seconds |
| vdot | numeric | computed from best PR |
| goal_race | text | `'5K' \| '10K' \| 'Half Marathon' \| 'Marathon'` |
| goal_time_seconds | int | |
| goal_race_date | date | |
| available_days | text[] | default `'{}'` |
| available_time_start, available_time_end | time | |
| injuries | text | |
| gps_watch_model | text | |
| pace_easy_min, pace_easy_max, pace_tempo, pace_lt, pace_race, pace_vo2max | int (sec/km) | derived from VDOT |
| hr_max, hr_resting, hr_z1_max, hr_z2_max, hr_z3_max, hr_z4_max | int | |
| intervals_icu_api_key | text | |
| intervals_icu_athlete_id | text | |
| sleep_data, nutrition_data, work_life_data, recovery_data, current_training_data | jsonb | onboarding answers, default `'{}'` |
| onboarding_completed_at | timestamptz | |
| created_at, updated_at | timestamptz | |

### `training_plans` (28 rows)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| athlete_id | uuid | FK → `athletes.id` |
| name | text | |
| goal_race | text | |
| goal_time_seconds | int | |
| race_date | date | |
| total_weeks | int | |
| status | text | `'draft' \| 'approved' \| 'completed' \| 'archived'`, default `'draft'` |
| ai_prompt, ai_model | text | snapshot of generation prompt + model name |
| parent_plan_id | uuid | FK self — links a versioned successor to its predecessor |
| version | int | default 1 |
| created_at, updated_at | timestamptz | |

### `plan_weeks` (652 rows)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| plan_id | uuid | FK → `training_plans.id` |
| week_number | int | |
| phase | text | `'base' \| 'build' \| 'peak' \| 'taper' \| 'race' \| 'base_recovery' \| 'build_recovery' \| 'peak_recovery'` |
| total_km, km_target | numeric | total_km is computed actual; km_target is planned |
| intensity | text | `'easy' \| 'moderate' \| 'hard' \| 'recovery'` |
| is_generated | bool | true once detail (workouts) generated, default false |
| is_recovery | bool | default false |
| start_date | date | Monday of the week |
| notes | text | |
| created_at | timestamptz | |

### `workouts` (756 rows)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| plan_week_id | uuid | FK → `plan_weeks.id` |
| athlete_id | uuid | FK → `athletes.id` |
| day_of_week | text | `'monday'..'sunday'` |
| workout_date | date | |
| workout_type | text | `'easy' \| 'tempo' \| 'long_run' \| 'intervals' \| 'race_pace' \| 'recovery' \| 'rest' \| 'cross_training' \| 'race' \| 'strength' \| 'pilates' \| 'cycling' \| 'swimming' \| 'walking' \| 'other'` |
| title, description | text | |
| distance_km | numeric | **planned** distance |
| duration_minutes | int | **planned** duration |
| pace_target_sec_km, pace_range_min, pace_range_max | int | planned pace targets |
| hr_zone | text | |
| hr_target_min, hr_target_max | int | |
| target_type | text | `'pace' \| 'hr' \| 'rpe'`, default `'pace'` |
| rpe_target | int 1-10 | |
| intervals_detail | jsonb | structured interval prescription |
| session_structure | jsonb | |
| coach_notes, athlete_notes | text | |
| status | text | `'planned' \| 'completed' \| 'skipped' \| 'modified'`, default `'planned'` |
| **actual_distance_km** | numeric | populated from feedback / Intervals.icu sync |
| **actual_duration_minutes** | numeric | |
| **actual_avg_pace** | int (sec/km) | |
| **actual_avg_hr** | int (bpm) | |
| intervals_icu_activity_id | text | set when Intervals.icu sync matched |
| intervals_icu_event_id | text | set when pushed to Intervals.icu calendar |
| synced_to_intervals_at | timestamptz | |
| rescheduled_from_date | date | original date when an athlete moved a workout |
| created_at, updated_at | timestamptz | |

### `daily_readiness` (10 rows)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| athlete_id | uuid | FK → `athletes.id` |
| check_in_date | date | default CURRENT_DATE |
| energy, sleep_quality, soreness, stress, motivation | int 1-5 | required |
| sleep_hours | numeric | |
| pain_flag | bool | default false |
| pain_location | text | |
| pain_severity | int 1-10 | |
| resting_hr, hrv | int | |
| weight_kg | numeric | |
| notes | text | |
| composite_score | numeric | server-computed wellness score |
| created_at | timestamptz | |

### `workout_feedback` (102 rows)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| workout_id | uuid UNIQUE | FK → `workouts.id` (one feedback per workout) |
| athlete_id | uuid | FK → `athletes.id` |
| rpe | int 1-10 | required |
| completed | bool | default true |
| actual_distance_km | numeric | |
| actual_duration_minutes | numeric | |
| actual_pace_sec_km | int | |
| avg_hr, max_hr | int | |
| feeling | text | `'great' \| 'good' \| 'ok' \| 'bad' \| 'terrible'` |
| notes | text | |
| created_at | timestamptz | |

> **Important duality:** when an athlete submits feedback, the server upserts the feedback row AND also updates the corresponding `workouts` row's `actual_*` columns + `status='completed'` (server/src/routes/feedback.js). The Intervals.icu sync path bypasses `workout_feedback` and writes directly to `workouts.actual_*`.

### `strength_sessions` (17 rows)
Logs non-plan activities. Some historical rows may have `notes` like "Synced from Strava: …" — those are kept as historical record from the previous Strava integration.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| athlete_id | uuid | FK → `athletes.id` |
| session_date | date | |
| activity_type | text | `'easy_run' \| 'long_run' \| 'race' \| 'strength' \| 'pilates' \| 'cycling' \| 'swimming' \| 'walking' \| 'other'`, default `'strength'` |
| duration_minutes | int | required |
| intensity | text | `'light' \| 'moderate' \| 'heavy'` |
| distance_km, avg_pace_sec, avg_hr, max_hr, elevation_m | numeric/int | optional |
| notes | text | |
| created_at, updated_at | timestamptz | |

---

## 2. Backend Endpoints

All routes mounted under `/api/*` with `authMiddleware` (Supabase JWT). Some require `coachOnly`. The `/api/email` mount is unauthenticated.

Server entry: `server/src/index.js`. Per-router files in `server/src/routes/`.

### Athletes — `/api/athletes` (athletes.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| GET | `/me` | any | Fetch own athlete record by `profile_id = req.user.id`. Auto-creates if missing. Selects `*, training_plans(id, name, status, race_date, goal_race)` |
| GET | `/` | coach | List all athletes: `select *, profiles(full_name,email,avatar_url), training_plans(...)` |
| GET | `/:id` | any (own or coach) | Single athlete: same select + access check via `profile_id` |
| POST | `/` | coach | Create athlete record |
| PATCH | `/:id` | any (own or coach) | Update athlete fields (recomputes VDOT/paces) |
| POST | `/:id/sync-paces` | coach | Recompute pace zones from PRs |
| DELETE | `/:id` | coach | Delete athlete |

### Training Plans — `/api/plans` (plans.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| POST | `/generate/:athleteId` | coach | Generate full plan via AI from `plan_generation_prompt.md`. 120s timeout |
| POST | `/:planId/weeks/:weekId/generate` | coach | Generate detailed workouts for one week |
| GET | `/:planId` | any | Fetch plan with weeks + workouts |
| POST | `/:planId/approve` | coach | Status → `approved` |
| POST | `/:planId/unpublish` | coach | Status → `draft` |
| POST | `/:planId/apply-adjustments` | coach | Apply AI-suggested edits to plan_weeks/workouts |
| GET | `/:planId/versions` | coach | Versioned ancestors (via `parent_plan_id`) |
| DELETE | `/:planId` | coach | Delete plan + cascading rows |
| DELETE | `/:planId/weeks/:weekId` | coach | Delete one week |
| GET | `/athlete/:athleteId` | any | All plans for athlete |

### Workouts — `/api/workouts` (workouts.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| PATCH | `/:id` | any | Edit a workout (used by coach + athlete reschedule UI) |
| POST | `/:id/reschedule` | any | Move workout to new date, sets `rescheduled_from_date` |
| GET | `/range/:athleteId?start=&end=` | any | Workouts in date range (calendar view) |

### Workout Feedback — `/api/feedback` (feedback.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| POST | `/` | any | Upsert feedback by `workout_id`. Also updates `workouts` row: `status='completed'` + `actual_distance_km` + `actual_duration_minutes` + `actual_avg_pace = actual_pace_sec_km` + `actual_avg_hr = avg_hr` |
| GET | `/workout/:workoutId` | any | Single feedback row |
| GET | `/athlete/:athleteId?limit=20` | any | Recent feedback joined with `workouts(workout_date,title,workout_type,distance_km,duration_minutes)` |

### Readiness — `/api/readiness` (readiness.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| POST | `/` | any | Upsert today's check-in (computes composite_score) |
| GET | `/athlete/:athleteId?days=30` | any | Readiness history |
| GET | `/today/:athleteId` | any | Today's check-in or null |

### Strength Sessions — `/api/strength` (strength.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| POST | `/` | any | Create session |
| GET | `/athlete/:athleteId?start=&end=` | any | Sessions in range |
| PATCH | `/:id` | any | Update |
| DELETE | `/:id` | any | Delete |

### Monitoring — `/api/monitoring` (monitoring.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| GET | `/:athleteId` | any | Full summary: ACWR, weekly km history (6w), 7-day RPE trend, 7-day readiness trend, 30-day readiness sparkline, today's readiness, compliance%, flags. Source: `getAthleteMonitoringSummary` in services/monitoring.js |
| GET | `/:athleteId/progress` | any | Progress page data: 8-week buckets (planned/completed km, easy pace, RPE, ACWR per week), pace trend label, RPE overreaching flag, type breakdown for current phase, total cycle km, weeks-to-race. Source: `getAthleteProgress` in services/progress.js |

#### Progress query shape (services/progress.js)
1. `training_plans` where `athlete_id` + `status in (approved,draft)`, latest by `updated_at`
2. `plan_weeks` for that plan
3. `workouts` for athlete in last 60 days (`workout_date >= today-60`), all statuses
4. `workout_feedback` joined with `workouts(workout_date)`, filtered by `athlete_id`, limit 200, ordered by `created_at desc` — **filtered to weekly buckets in JS**, not in SQL
5. Per-week buckets (Mon-Sun, last 8): planned_km from `plan_weeks.km_target` else summed `distance_km`; completed_km from raw `workouts.actual_distance_km` (NEVER falls back to planned). Easy pace = avg of `actual_avg_pace` for completed easy workouts where `actual_avg_pace > 0`. ACWR via 7d acute / 28d chronic from deduped completed workouts
6. Pace trend: half-vs-half compare across weeks-with-data, ±5 sec/km threshold → `improving | stable | declining`
7. RPE overreaching: last 3 RPE weeks rising by >0.5 AND pace not improving

#### Monitoring query shape (services/monitoring.js)
1. `daily_readiness` last 30 days (composite score etc.)
2. `workouts` last 42 days (all statuses, full row)
3. `workout_feedback` last 50 with nested `workouts(workout_date,title,workout_type,distance_km,pace_range_min,pace_range_max)`
4. `strength_sessions` last 42 days
5. ACWR = strict actual_distance_km only; suppressed when chronic <5 km/wk or <3 weeks of history
6. RPE 7d trend = filter feedback by `f.workouts?.workout_date === dateStr` for each of last 7 days; ⚠️ this strict 7-day window is why empty states fire often
7. Flags: ACWR red/yellow, low readiness today, pain in last 7d, RPE>8 for 3+ days, compliance<60% (only after 1 full week of plan), HR>target+10bpm in 2+ recent workouts

### Dashboard — `/api/dashboard` (dashboard.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| GET | `/` | coach | All athletes + `getDashboardFlags` per athlete (lightweight ACWR, RPE avg, today's readiness, pain flag) |
| GET | `/new-count` | coach | New-athlete badge count |

### Weekly Summary — `/api/weekly-summary` (weeklySummary.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| GET | `/` | coach | All-athlete summary used by the Sunday email |
| POST | `/send-email` | coach | Manual trigger for the Sunday email |

> Cron: `0 21 * * 0 UTC` runs `getAllAthletesSummary` + `sendWeeklySummaryEmail` (server/src/index.js).

### AI Chat — `/api/chat` (chat.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| POST | `/` | coach | Coach assistant chat (120s timeout) |
| POST | `/plan-review` | coach | Plan-review chat: returns suggested adjustments for `apply-adjustments` |

### Intervals.icu — `/api/intervals` (intervals.js)
| Method | Path | Auth | Action |
|---|---|---|---|
| GET | `/sync/:athleteId` | any | Pull last 7 days of activities, write actuals onto matching workouts (services/intervalsSync.js) |
| POST | `/connect/:athleteId` | any | Verify candidate `(api_key, athlete_id)` against Intervals.icu, save credentials, return live athlete name |
| GET | `/status/:athleteId` | any | `{ connected, valid, athlete_id, athlete_name }` |
| POST | `/push-workout/:workoutId` | coach | Push single workout to Intervals.icu calendar (so it syncs to Garmin). 412 if threshold pace missing |
| POST | `/push-plan/:planId` | coach | Push every non-rest workout in plan |
| POST | `/push/:athleteId/:planId` | coach | Older bulk push endpoint |
| POST | `/pull/:athleteId` | coach | Older 30-day pull endpoint |

### Email — `/api/email` (email.js, unauthenticated)
| Method | Path | Action |
|---|---|---|
| POST | `/welcome` | Send welcome email (called from registration) |

---

## 3. Frontend — Pages and Components

Page list under `client/src/pages/`. API client in `client/src/lib/api.js` (full method list at end of doc).

### `/athletes` — `AthletesPage.jsx`
- `api.getAthletes()` — list view
- `api.deleteAthlete(id)` — delete action

### `/athletes/:id` — `AthleteDetailPage.jsx`
- `api.getAthlete(id)` and `api.getMonitoring(id)` (parallel) on load
- `api.updateAthlete(id, payload)` — edit profile
- `api.generatePlan(id, overrides)` — generate plan button
- `api.syncToIntervals(id, planId)` — push plan to Intervals.icu
- `api.pullFromIntervals(id)` — manual pull
- `api.deleteAthlete(id)` — delete

### `/athletes/:id/load` — `AthleteLoadPage.jsx`
- `api.getAthlete(id)` and `api.getMonitoring(id)` on load
- Renders: ACWR hero, weekly KM bar (last 6 weeks), 7-day RPE line chart, 7-day readiness line chart (energy + sleep_quality), flags
- Empty-state copy (current): "No RPE entries in the last 7 days." / "No readiness check-ins in the last 7 days."

### `/athletes/:id/monitoring` — `AthleteMonitoringPage.jsx`
- `api.getAthlete(id)` and `api.getMonitoring(id)` on load
- Full monitoring detail (older view, more verbose than Load)

### `/athletes/:id/progress` and `/progress` — `CoachProgressPage.jsx`
- Direct route (`paramId` set): `Promise.all([api.getAthlete(paramId), api.getProgress(paramId)])`
- Standalone (no paramId): `api.getAthletes()` to populate selector, then load progress for selected athlete
- Renders: weekly volume bar (planned vs completed), easy pace line + trend label, RPE line + overreaching flag, workout type breakdown donut, ACWR overlay

### `/my-progress` (athlete-self) — `AthleteProgressPage.jsx`
- `api.getMyProfile()` to resolve own athlete record
- `api.getProgress(athlete.id)` for the same payload as the coach view
- Same charts; empty-state copy was "No RPE data yet." (still on this page; the recent change applied only to AthleteLoadPage)

### `/my-plan` — `MyPlanPage.jsx`
- `api.getMyProfile()` (own athlete)
- `api.getWorkoutsInRange(athleteId, start, end)` for week view
- `api.getWorkoutFeedback(workoutId)` per workout for completed status badge
- `api.getStrengthSessions(athleteId, start, end)`
- Submits feedback via `WorkoutFeedbackModal` → `api.submitFeedback`

### Other pages
- `DashboardPage.jsx` (coach home) — `api.getDashboard()`, `api.getNewAthleteCount()`
- `CalendarPage.jsx` — `api.getWorkoutsInRange`, reschedule via `api.rescheduleWorkout`
- `PlanViewPage.jsx` — `api.getPlan(planId)` + plan-review chat via `api.sendPlanReviewMessage`
- `ReadinessCheckInPage.jsx` — `api.submitReadiness(data)`, `api.getTodayReadiness(athleteId)`
- `MyProfilePage.jsx` — `api.intervalsConnect`, `api.intervalsStatus`
- `AIChatPage.jsx` (coach) — `api.sendChatMessage`
- `AthleteOnboardingPage.jsx` — `api.updateAthlete`, `api.createStrengthSession`

### Shared components in `client/src/components/`
| Component | Notes |
|---|---|
| `WorkoutDetailPanel.jsx` | Read-only workout panel, displays planned + actual side-by-side. Falls back to `feedback.actual_*` if `workout.actual_*` missing |
| `ActivityDetailPanel.jsx` | Read-only strength/cross-training session panel |
| `WeeklySummaryModal.jsx` | Renders weekly summary text used by Sunday email preview |
| `RescheduleModal.jsx` | Used by MyPlanPage, calls `api.rescheduleWorkout` |
| `StrengthSessionModal.jsx` | Create/edit strength_session row |
| `IntervalsIcuConnectModal.jsx` | Guided modal for Intervals.icu connect, uses `api.intervalsConnect` |
| `athletes/WorkoutFeedbackModal.jsx` | Submits `workout_feedback`. **Distance/duration inputs no longer pre-fill with planned values; SAVE is disabled until both fields are filled when workout has planned distance and `completed=true`. Planned values shown as input placeholders only.** |
| `layout/*` | Layout chrome (sidebar, nav) |
| `ui/*` | Generic primitives |

---

## 4. Strava Sync — Removed

The Strava integration was removed. The OAuth never received Strava production approval and was creating user confusion alongside the working Intervals.icu sync.

What was removed:
- `server/src/routes/strava.js` (deleted)
- `/api/strava/*` route mounts and the unauthenticated `/api/strava/callback` (removed from `server/src/index.js`)
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI` env vars
- All client-side Strava UI: connect/disconnect on `MyProfilePage`, sync buttons on `MyPlanPage`, `PlanViewPage`, `CalendarPage`
- API methods: `api.stravaConnect/Sync/Disconnect/Status`
- `athletes` columns dropped via migration `drop_strava_columns_from_athletes`: `strava_access_token`, `strava_refresh_token`, `strava_token_expires_at`, `strava_athlete_id`

What was kept:
- Historical `strength_sessions` rows that were originally created via Strava sync — they are valid logged activities now regardless of source. Some have `notes` like "Synced from Strava: …"

Going forward, actual workout data flows in via the Intervals.icu integration (§5).

---

## 5. Intervals.icu — Current State

**Connection**
- `POST /api/intervals/connect/:athleteId` with body `{ api_key, athlete_id }`. Server hits `GET https://intervals.icu/api/v1/athlete/<id>` with Basic auth `API_KEY:<key>` to verify. On success saves `intervals_icu_api_key` + `intervals_icu_athlete_id` on `athletes`. Returns live `athlete_name` for UI confirmation
- `GET /api/intervals/status/:athleteId` — re-verifies on each call, returns `{ connected, valid, athlete_id, athlete_name }`. `valid:false` means stored creds no longer authenticate (UI shows reconnect prompt)
- No OAuth — Intervals.icu uses an API-key-based flow

**Sync triggers**
1. **Manual**: `GET /api/intervals/sync/:athleteId` (athlete OR coach)
2. **Auto cron**: `0 13 * * * UTC` (= 8:00 AM Bogotá UTC-5) iterates over all athletes with `intervals_icu_api_key` set and runs `syncIntervalsIcuActivities(supabase, id, { daysBack: 7 })`. See server/src/index.js

**What sync does** (server/src/services/intervalsSync.js)
1. Reads `intervals_icu_api_key`, `intervals_icu_athlete_id` from athlete
2. Fetches `/athlete/<id>/activities?oldest=<7d>&newest=<today>` with Basic auth
3. Filters to runs only: `type ∈ {Run, TrailRun, VirtualRun}`
4. For each run on date `D`:
   - Query `workouts` where `athlete_id` + `workout_date=D` + `workout_type != 'rest'` + `status != 'completed'`
   - Prefer a candidate whose `workout_type` is in `{easy, tempo, long_run, intervals, race_pace, recovery, race}`, else pick the first
   - **If matched**: update workout row with:
     - `status = 'completed'`
     - `actual_distance_km` = `activity.distance / 1000` (2dp)
     - `actual_duration_minutes` = `activity.moving_time / 60` (1dp)
     - `actual_avg_pace` = `Math.round(moving_time / (distance/1000))` — robust against `average_speed` unit ambiguity
     - `actual_avg_hr` = `Math.round(activity.average_heartrate)` if present
     - `intervals_icu_activity_id` = `String(activity.id)`
   - **If unmatched**: skipped (no fallback into `strength_sessions`)
5. Returns `{ synced, matched, fetched, runs }`

**Push (plan → Intervals.icu calendar → Garmin)**
- `POST /api/intervals/push-workout/:workoutId` (coach) — pushes single workout via `pushWorkoutToIntervals` in services/intervalsPush.js. 412 returned if athlete is missing threshold pace (`pace_lt`)
- `POST /api/intervals/push-plan/:planId` (coach) — bulk variant for an entire plan (used by calendar's "Sync Plan to Garmin")
- Older endpoints `/push/:athleteId/:planId` and `/pull/:athleteId` still exist; `/push/...` builds events directly with `mapWorkoutType` (EASY/TEMPO/LONG/INTERVALS/RACE_PACE/RECOVERY/OTHER/RACE) and `buildDescription` (description, distance, pace range, HR zone, coach notes)
- On successful push, the workout's `intervals_icu_event_id` and `synced_to_intervals_at` are set (by `pushWorkoutToIntervals`)

**Known characteristics**
- Daily auto-sync covers a 7-day rolling window — older workouts are not retroactively backfilled unless manually triggered with a longer window (the older `/pull` endpoint covers 30 days)
- Sync writes directly to `workouts.actual_*`; does NOT create `workout_feedback` rows. RPE remains athlete-entered

---

## API Client Reference (`client/src/lib/api.js`)

```js
api.getAthletes()                      // GET    /api/athletes
api.getAthlete(id)                     // GET    /api/athletes/:id
api.getMyProfile()                     // GET    /api/athletes/me
api.createAthlete(data)                // POST   /api/athletes
api.updateAthlete(id, data)            // PATCH  /api/athletes/:id
api.deleteAthlete(id)                  // DELETE /api/athletes/:id

api.generatePlan(athleteId, overrides) // POST   /api/plans/generate/:athleteId  (120s)
api.getPlan(planId)                    // GET    /api/plans/:planId
api.generateWeekDetail(planId, weekId) // POST   /api/plans/:planId/weeks/:weekId/generate (120s)
api.deletePlan(planId)                 // DELETE /api/plans/:planId
api.deleteWeek(planId, weekId)         // DELETE /api/plans/:planId/weeks/:weekId
api.getAthletePlans(athleteId)         // GET    /api/plans/athlete/:athleteId
api.approvePlan(planId)                // POST   /api/plans/:planId/approve
api.unpublishPlan(planId)              // POST   /api/plans/:planId/unpublish
api.applyPlanAdjustments(planId, adj)  // POST   /api/plans/:planId/apply-adjustments
api.getPlanVersions(planId)            // GET    /api/plans/:planId/versions
api.sendPlanReviewMessage(...)         // POST   /api/chat/plan-review (120s)

api.updateWorkout(workoutId, data)     // PATCH  /api/workouts/:id
api.rescheduleWorkout(workoutId, date) // POST   /api/workouts/:id/reschedule
api.getWorkoutsInRange(athleteId,s,e)  // GET    /api/workouts/range/:athleteId

api.syncToIntervals(athleteId, planId) // POST   /api/intervals/push/:athleteId/:planId
api.pullFromIntervals(athleteId)       // POST   /api/intervals/pull/:athleteId
api.intervalsSync(athleteId)           // GET    /api/intervals/sync/:athleteId
api.intervalsConnect(athleteId, body)  // POST   /api/intervals/connect/:athleteId
api.intervalsStatus(athleteId)         // GET    /api/intervals/status/:athleteId
api.pushWorkoutToIntervals(workoutId)  // POST   /api/intervals/push-workout/:workoutId
api.pushPlanToIntervals(planId)        // POST   /api/intervals/push-plan/:planId (120s)

api.getDashboard()                     // GET    /api/dashboard
api.getNewAthleteCount()               // GET    /api/dashboard/new-count

api.submitReadiness(data)              // POST   /api/readiness
api.getReadiness(athleteId, days)      // GET    /api/readiness/athlete/:athleteId
api.getTodayReadiness(athleteId)       // GET    /api/readiness/today/:athleteId

api.submitFeedback(data)               // POST   /api/feedback
api.getWorkoutFeedback(workoutId)      // GET    /api/feedback/workout/:workoutId
api.getAthleteFeedback(athleteId, n)   // GET    /api/feedback/athlete/:athleteId

api.getMonitoring(athleteId)           // GET    /api/monitoring/:athleteId
api.getProgress(athleteId)             // GET    /api/monitoring/:athleteId/progress

api.createStrengthSession(data)        // POST   /api/strength
api.updateStrengthSession(id, data)    // PATCH  /api/strength/:id
api.getStrengthSessions(athleteId,s,e) // GET    /api/strength/athlete/:athleteId
api.deleteStrengthSession(id)          // DELETE /api/strength/:id

api.sendChatMessage(...)               // POST   /api/chat (120s)

api.getWeeklySummary()                 // GET    /api/weekly-summary
api.sendWeeklySummaryEmail()           // POST   /api/weekly-summary/send-email
```

Default fetch timeout is 30s; AI/plan endpoints set `timeout: 120000`.
