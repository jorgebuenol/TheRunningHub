import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPace } from '../lib/vdot';
import { X, Check, Edit3, MessageSquare } from 'lucide-react';
import { format, parseISO } from 'date-fns';

/* ─── Color scheme ─── */
const WORKOUT_COLORS = {
  easy:           { bg: 'bg-green-500/20',    border: 'border-green-500',    text: 'text-green-400',    label: 'Easy Run' },
  tempo:          { bg: 'bg-orange-500/20',   border: 'border-orange-500',   text: 'text-orange-400',   label: 'Tempo' },
  long_run:       { bg: 'bg-blue-500/20',     border: 'border-blue-500',     text: 'text-blue-400',     label: 'Long Run' },
  intervals:      { bg: 'bg-red-500/20',      border: 'border-red-500',      text: 'text-red-400',      label: 'Intervals' },
  race_pace:      { bg: 'bg-volt/20',         border: 'border-volt',         text: 'text-volt',         label: 'Race Pace' },
  recovery:       { bg: 'bg-green-500/10',    border: 'border-green-500/50', text: 'text-green-300',    label: 'Recovery' },
  rest:           { bg: 'bg-smoke/10',        border: 'border-smoke/50',     text: 'text-smoke',        label: 'Rest' },
  cross_training: { bg: 'bg-purple-500/20',   border: 'border-purple-500',   text: 'text-purple-400',   label: 'Strength' },
  race:           { bg: 'bg-volt/30',         border: 'border-volt',         text: 'text-volt',         label: 'Race Day' },
};

function getColors(type) {
  return WORKOUT_COLORS[type] || WORKOUT_COLORS.rest;
}

export default function WorkoutDetailPanel({ workout, athlete, isCoach, planStatus, onClose, onEdit, onFeedback }) {
  const colors = getColors(workout.workout_type);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (workout.id) {
      api.getWorkoutFeedback(workout.id).then(setFeedback).catch(() => {});
    }
  }, [workout]);

  const ss = workout.session_structure;
  const hasStructure = ss && ss.warm_up && ss.main_set && ss.cool_down;

  return (
    <div className="fixed inset-0 z-50 bg-carbon overflow-y-auto lg:relative lg:inset-auto lg:z-auto lg:bg-transparent">
      <div className="min-h-screen lg:min-h-0 bg-steel border border-ash p-4 sm:p-6 lg:mb-6">

        {/* ── A. HEADER ── */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-bold uppercase px-2 py-1 ${colors.bg} ${colors.text} border ${colors.border}`}>
                {colors.label}
              </span>
              {workout.status === 'completed' && (
                <span className="text-xs font-bold uppercase px-2 py-1 bg-green-500/20 text-green-400 border border-green-500">
                  <Check size={10} className="inline mr-1" />DONE
                </span>
              )}
              {workout.status === 'skipped' && (
                <span className="text-xs font-bold uppercase px-2 py-1 bg-red-500/20 text-red-400 border border-red-500">
                  SKIPPED
                </span>
              )}
            </div>
            <h2 className="font-display text-xl sm:text-2xl mb-1">{workout.title}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-smoke text-xs uppercase tracking-wider">
              {workout.workout_date && (
                <span>{format(parseISO(workout.workout_date), 'EEEE, MMM d')}</span>
              )}
              {workout.week_number && workout.phase && (
                <span className="text-volt">Week {workout.week_number} — {workout.phase}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-3">
              {workout.distance_km > 0 && (
                <span className="font-display text-2xl text-volt">{workout.distance_km}KM</span>
              )}
              {workout.duration_minutes > 0 && (
                <span className="text-smoke text-sm">~{workout.duration_minutes} min</span>
              )}
              {workout.pace_range_min && workout.pace_range_max && (
                <span className="text-smoke text-sm">
                  {formatPace(workout.pace_range_min)}-{formatPace(workout.pace_range_max)}/km
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-smoke hover:text-white flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={22} />
          </button>
        </div>

        {/* ── B. SESSION STRUCTURE ── */}
        {hasStructure ? (
          <SessionTimeline structure={ss} />
        ) : (
          <LegacyWorkoutDetail workout={workout} />
        )}

        {/* ── C. PACE & HR REFERENCE ── */}
        {athlete && athlete.vdot > 0 && (
          <PaceReferenceCard athlete={athlete} workout={workout} />
        )}

        {/* ── D. COACH NOTES ── */}
        {workout.coach_notes && (
          <div className="mt-4 bg-volt/5 border border-volt/30 p-3">
            <p className="text-smoke text-xs uppercase tracking-wider mb-1">Coach Notes</p>
            <p className="text-sm text-volt whitespace-pre-wrap">{workout.coach_notes}</p>
          </div>
        )}

        {/* ── E. COMPLETED / FEEDBACK ── */}
        {workout.status === 'completed' && (
          <div className="border-t border-ash pt-4 mt-4">
            <h3 className="font-display text-sm tracking-wider text-green-400 mb-3">COMPLETED</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <CompareItem
                label="Distance"
                planned={workout.distance_km ? `${workout.distance_km}km` : '--'}
                actual={workout.actual_distance_km ? `${workout.actual_distance_km}km` : '--'}
              />
              <CompareItem
                label="Duration"
                planned={workout.duration_minutes ? `${workout.duration_minutes}m` : '--'}
                actual={workout.actual_duration_minutes ? `${workout.actual_duration_minutes}m` : '--'}
              />
              <CompareItem
                label="Avg Pace"
                planned={formatPace(workout.pace_target_sec_km)}
                actual={formatPace(workout.actual_avg_pace)}
              />
              <CompareItem
                label="Avg HR"
                planned={workout.hr_zone || '--'}
                actual={workout.actual_avg_hr ? `${workout.actual_avg_hr}bpm` : '--'}
              />
            </div>

            {feedback && (
              <div className="mt-4 border-t border-ash pt-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {feedback.rpe && <DetailItem label="RPE" value={`${feedback.rpe}/10`} />}
                  {feedback.feeling && <DetailItem label="Feeling" value={feedback.feeling} />}
                </div>
                {feedback.notes && (
                  <div className="mt-2">
                    <p className="text-smoke text-xs uppercase mb-1">Athlete Notes</p>
                    <p className="text-sm">{feedback.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Athlete notes */}
        {workout.athlete_notes && (
          <div className="border-t border-ash pt-4 mt-4">
            <p className="text-smoke text-xs uppercase mb-1">Athlete Notes</p>
            <p className="text-sm">{workout.athlete_notes}</p>
          </div>
        )}

        {/* ── F. ACTIONS ── */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-ash">
          {isCoach && onEdit && (
            <button onClick={onEdit} className="btn-primary flex items-center gap-2 text-sm">
              <Edit3 size={14} /> EDIT
            </button>
          )}
          {!isCoach && workout.status === 'completed' && !feedback && onFeedback && (
            <button onClick={onFeedback} className="btn-primary flex items-center gap-2 text-sm">
              <MessageSquare size={14} /> LOG FEEDBACK
            </button>
          )}
          {!isCoach && workout.status === 'completed' && feedback && onFeedback && (
            <button onClick={onFeedback} className="btn-ghost flex items-center gap-2 text-sm">
              <MessageSquare size={14} /> UPDATE FEEDBACK
            </button>
          )}
          {!isCoach && workout.status === 'planned' && onFeedback && (
            <button onClick={onFeedback} className="btn-primary flex items-center gap-2 text-sm">
              <Check size={14} /> LOG WORKOUT
            </button>
          )}
          <button onClick={onClose} className="btn-ghost text-sm lg:hidden">
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Session Timeline ─── */
function SessionTimeline({ structure }) {
  return (
    <div className="mt-5 mb-4">
      <h3 className="font-display text-sm tracking-wider text-smoke mb-4">SESSION STRUCTURE</h3>
      <div className="border-l-2 border-volt/30 ml-3 pl-5 space-y-5">
        <SessionStep label="WARM-UP" data={structure.warm_up} stepColor="text-green-400" />

        {structure.main_set.map((item, i) => (
          <SessionStep
            key={i}
            label={structure.main_set.length === 1 ? 'MAIN SET' : `SET ${i + 1}`}
            data={item}
            isInterval={item.type === 'intervals'}
            stepColor="text-volt"
          />
        ))}

        <SessionStep label="COOL-DOWN" data={structure.cool_down} stepColor="text-blue-400" />
      </div>
    </div>
  );
}

/* ─── Single Session Step ─── */
function SessionStep({ label, data, isInterval, stepColor = 'text-white' }) {
  if (!data) return null;

  return (
    <div className="relative">
      <div className="absolute -left-[25px] top-[5px] w-2.5 h-2.5 border-2 border-volt bg-carbon" />

      <p className={`text-xs font-bold uppercase tracking-wider ${stepColor}`}>{label}</p>

      {isInterval ? (
        <>
          <p className="text-white text-sm font-semibold mt-1">
            {data.reps} &times; {data.distance_m}m @ {formatPace(data.pace_sec_km)}/km
          </p>
          <p className="text-smoke text-xs mt-0.5">
            {data.rest_seconds}s {data.rest_type} recovery
            {data.hr_zone && <span className="ml-2">{data.hr_zone}</span>}
            {data.rpe && <span className="ml-2">RPE {data.rpe}</span>}
          </p>
        </>
      ) : (
        <>
          <p className="text-white text-sm font-semibold mt-1">
            {data.distance_km ? `${data.distance_km}km` : ''}
            {data.distance_km && data.duration_minutes ? ' · ' : ''}
            {data.duration_minutes ? `~${data.duration_minutes}min` : ''}
          </p>
          <p className="text-smoke text-xs mt-0.5">
            {data.pace_sec_km ? `${formatPace(data.pace_sec_km)}/km` : ''}
            {data.hr_zone && <span className="ml-2">{data.hr_zone}</span>}
            {data.rpe && <span className="ml-2">RPE {data.rpe}</span>}
          </p>
        </>
      )}

      {data.description && (
        <p className="text-smoke/70 text-xs mt-1 italic">{data.description}</p>
      )}
    </div>
  );
}

/* ─── Pace & HR Reference Card ─── */
function PaceReferenceCard({ athlete, workout }) {
  return (
    <div className="mt-4 bg-carbon border border-ash p-3">
      <p className="text-smoke text-xs uppercase tracking-wider mb-2">
        Your Pace Zones <span className="text-volt font-bold ml-1">VDOT {athlete.vdot}</span>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
        <PaceRow label="Easy" value={`${formatPace(athlete.pace_easy_min)}-${formatPace(athlete.pace_easy_max)}`} />
        <PaceRow label="Tempo" value={formatPace(athlete.pace_tempo)} />
        <PaceRow label="Threshold" value={formatPace(athlete.pace_lt)} />
        <PaceRow label="Race" value={formatPace(athlete.pace_race)} />
        <PaceRow label="Interval" value={formatPace(athlete.pace_vo2max)} />
      </div>

      {(workout.hr_zone || workout.rpe_target) && (
        <div className="flex gap-6 mt-3 pt-3 border-t border-ash">
          {workout.hr_zone && (
            <div>
              <span className="text-smoke text-[10px] uppercase tracking-wider">HR Zone</span>
              <span className="ml-2 text-volt font-bold text-sm">{workout.hr_zone}</span>
            </div>
          )}
          {workout.rpe_target && (
            <div>
              <span className="text-smoke text-[10px] uppercase tracking-wider">Target RPE</span>
              <span className="ml-2 text-volt font-bold text-sm">{workout.rpe_target}/10</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Pace Row ─── */
function PaceRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-smoke">{label}</span>
      <span className="text-white font-semibold">{value}/km</span>
    </div>
  );
}

/* ─── Legacy Workout Detail (backward compat for old workouts) ─── */
function LegacyWorkoutDetail({ workout }) {
  return (
    <div className="mt-4 mb-4">
      {workout.description && (
        <div className="mb-3">
          <p className="text-smoke text-xs uppercase mb-1">Description</p>
          <p className="text-sm whitespace-pre-wrap">{workout.description}</p>
        </div>
      )}
      {workout.intervals_detail && (
        <div className="mb-3">
          <p className="text-smoke text-xs uppercase mb-1">Intervals</p>
          <p className="text-sm font-semibold">
            {workout.intervals_detail.reps}&times;{workout.intervals_detail.distance_m}m
            @ {formatPace(workout.intervals_detail.pace_sec_km)}/km
            | {workout.intervals_detail.rest_seconds}s {workout.intervals_detail.rest_type}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Shared helpers ─── */
function DetailItem({ label, value }) {
  return (
    <div>
      <p className="text-smoke text-xs uppercase">{label}</p>
      <p className="font-semibold uppercase text-sm">{value}</p>
    </div>
  );
}

function CompareItem({ label, planned, actual }) {
  return (
    <div>
      <p className="text-smoke text-xs uppercase mb-1">{label}</p>
      <p className="text-sm"><span className="text-smoke">Plan:</span> {planned}</p>
      <p className="text-sm"><span className="text-green-400">Actual:</span> {actual}</p>
    </div>
  );
}
