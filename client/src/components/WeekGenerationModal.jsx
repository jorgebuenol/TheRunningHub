import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatPace } from '../lib/vdot';
import { X, Zap, Loader, AlertTriangle, Activity, TrendingUp, Shield, Settings } from 'lucide-react';

const OBJECTIVE_OPTIONS = [
  'Build aerobic base',
  'Introduce tempo work',
  'Threshold development',
  'VO2max stimulus',
  'Race-specific prep',
  'Recovery week',
  'Taper',
  'Custom',
];

const STATE_OPTIONS = [
  { value: 'fresh',      label: 'Fresh' },
  { value: 'normal',     label: 'Normal' },
  { value: 'fatigued',   label: 'Fatigued' },
  { value: 'recovering', label: 'Recovering' },
  { value: 'traveling',  label: 'Traveling' },
  { value: 'post_race',  label: 'Post-race' },
];

/**
 * Smart Week Generation modal.
 * Loads auto-context, captures coach intent, sends both to the generation
 * endpoint. Falls back to bare-bones generate if the context fetch fails.
 */
export default function WeekGenerationModal({ planId, week, onClose, onGenerated }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Coach intent form
  const [weeklyObjective, setWeeklyObjective] = useState(OBJECTIVE_OPTIONS[0]);
  const [specificFocus, setSpecificFocus] = useState('');
  const [athleteState, setAthleteState] = useState('normal');
  const [adjustments, setAdjustments] = useState('');
  const [isRecoveryWeek, setIsRecoveryWeek] = useState(false);
  const [isTaperWeek, setIsTaperWeek] = useState(false);
  const [maxSessions, setMaxSessions] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    api.getWeekGenerationContext(planId, week.id)
      .then(c => { if (!cancelled) setContext(c); })
      .catch(err => { if (!cancelled) setLoadError(err.message || 'Failed to load context'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [planId, week.id]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError('');
    try {
      const coachIntent = {
        weekly_objective: weeklyObjective,
        specific_focus: specificFocus.trim() || null,
        athlete_state: athleteState,
        adjustments: adjustments.trim() || null,
        is_recovery_week: isRecoveryWeek,
        is_taper_week: isTaperWeek,
        max_sessions: maxSessions ? parseInt(maxSessions, 10) : null,
      };
      const updated = await api.generateWeekDetail(planId, week.id, {
        coach_intent: coachIntent,
        include_auto_context: true,
      });
      onGenerated?.(updated);
      onClose();
    } catch (err) {
      setGenerateError(err.message || 'Generation failed');
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto my-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="font-display text-xl text-volt">GENERATE WEEK {week.week_number}</h3>
            <p className="text-smoke text-xs uppercase mt-1">
              {week.phase || 'no phase'} · {week.start_date} · target {week.km_target || '?'}km
            </p>
          </div>
          <button onClick={onClose} className="text-smoke hover:text-white" disabled={generating}>
            <X size={20} />
          </button>
        </div>

        {/* Auto-context summary */}
        {loading && (
          <div className="flex items-center gap-2 text-smoke text-sm py-8 justify-center">
            <Loader size={16} className="animate-spin" />
            Loading athlete context...
          </div>
        )}
        {loadError && (
          <div className="border border-red-500/50 bg-red-500/10 text-red-400 text-sm px-3 py-2 mb-4">
            Could not load context: {loadError}. You can still generate without it.
          </div>
        )}
        {context && <ContextSummary context={context} />}

        {/* Coach intent form */}
        <div className="mt-6 pt-6 border-t border-ash space-y-4 text-sm">
          <h4 className="text-smoke text-xs uppercase tracking-wider font-bold flex items-center gap-2">
            <Settings size={14} className="text-volt" />
            Coach intent
          </h4>

          <div>
            <label className="text-smoke text-[10px] uppercase tracking-wider block mb-1">Weekly objective</label>
            <select
              value={weeklyObjective}
              onChange={e => setWeeklyObjective(e.target.value)}
              className="input-field w-full"
              disabled={generating}
            >
              {OBJECTIVE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div>
            <label className="text-smoke text-[10px] uppercase tracking-wider block mb-1">Specific focus</label>
            <textarea
              value={specificFocus}
              onChange={e => setSpecificFocus(e.target.value)}
              placeholder="What are we trying to improve this week? Any specific techniques or drills?"
              className="input-field w-full h-20 resize-none"
              disabled={generating}
            />
          </div>

          <div>
            <label className="text-smoke text-[10px] uppercase tracking-wider block mb-1">Athlete state</label>
            <div className="flex flex-wrap gap-2">
              {STATE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAthleteState(opt.value)}
                  disabled={generating}
                  className={`px-3 py-1.5 text-xs uppercase font-bold border transition-colors ${
                    athleteState === opt.value
                      ? 'bg-volt/20 border-volt text-volt'
                      : 'border-ash text-smoke hover:border-smoke'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-smoke text-[10px] uppercase tracking-wider block mb-1">Schedule adjustments</label>
            <textarea
              value={adjustments}
              onChange={e => setAdjustments(e.target.value)}
              placeholder="Any constraints? Travel days? Conflicts? Specific day requests?"
              className="input-field w-full h-20 resize-none"
              disabled={generating}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isRecoveryWeek}
                onChange={e => setIsRecoveryWeek(e.target.checked)}
                disabled={generating}
                className="accent-volt"
              />
              <span className="uppercase tracking-wider text-smoke">Recovery week</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isTaperWeek}
                onChange={e => setIsTaperWeek(e.target.checked)}
                disabled={generating}
                className="accent-volt"
              />
              <span className="uppercase tracking-wider text-smoke">Taper week</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="uppercase tracking-wider text-smoke">Max sessions</span>
              <input
                type="number"
                min="1"
                max="7"
                value={maxSessions}
                onChange={e => setMaxSessions(e.target.value)}
                placeholder="—"
                disabled={generating}
                className="input-field w-16 py-1 text-center"
              />
            </label>
          </div>
        </div>

        {/* Generate error (separate from load error) */}
        {generateError && (
          <div className="border border-red-500/50 bg-red-500/10 text-red-400 text-sm px-3 py-2 mt-4">
            {generateError}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader size={16} className="animate-spin" />
                GENERATING... (up to 2 min)
              </>
            ) : (
              <>
                <Zap size={16} />
                GENERATE WEEK
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="btn-ghost"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

function ContextSummary({ context }) {
  const { athlete, previous_week: prev, trend_last_4_weeks: trend, flags, next_milestone: race } = context;

  return (
    <div className="space-y-4 text-sm">
      {/* Athlete header */}
      <div className="border border-ash bg-volt/5 px-4 py-3">
        <p className="text-volt font-display text-base">
          {athlete.name || 'Athlete'} {athlete.vdot ? `· VDOT ${athlete.vdot}` : ''}
        </p>
        {race && (
          <p className="text-smoke text-xs mt-0.5">
            {race.name} on {race.date} — {race.weeks_away} weeks away
          </p>
        )}
        <p className="text-smoke text-xs mt-1">
          Easy zone {formatPace(athlete.pace_easy_min)}–{formatPace(athlete.pace_easy_max)} · Tempo {formatPace(athlete.pace_tempo)} · LT {formatPace(athlete.pace_lt)}
        </p>
      </div>

      {/* Previous week */}
      <div>
        <h4 className="text-smoke text-xs uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
          <Activity size={14} className="text-volt" />
          Previous week (W{prev.week_number ?? '?'} · {prev.phase || 'no phase'})
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Volume" value={`${prev.completed_km} / ${prev.planned_km} km`} sub={prev.completion_pct !== null ? `${prev.completion_pct}%` : null} />
          <Stat label="Sessions" value={`${prev.workouts_completed} / ${prev.workouts_planned}`} sub={prev.workouts_skipped > 0 ? `${prev.workouts_skipped} skipped` : null} />
          <Stat label="Quality" value={`${prev.quality_sessions_completed} / ${prev.quality_sessions_planned}`} />
          <Stat label="Avg RPE" value={prev.avg_rpe !== null ? `${prev.avg_rpe}/10` : '—'} sub={prev.avg_rpe === null ? 'no feedback' : null} />
          <Stat
            label="Avg easy pace"
            value={prev.avg_easy_pace ? formatPace(prev.avg_easy_pace) : '—'}
            sub={prev.avg_easy_pace ? (prev.easy_pace_in_target ? 'in zone' : 'outside zone') : null}
            subColor={prev.easy_pace_in_target ? 'text-green-400' : 'text-yellow-400'}
          />
          <Stat
            label="Long run"
            value={prev.long_run_completed ? formatPace(prev.long_run_pace || 0) : (prev.long_run_planned ? 'missed' : '—')}
            subColor={prev.long_run_completed ? 'text-green-400' : (prev.long_run_planned ? 'text-yellow-400' : 'text-smoke')}
          />
        </div>
      </div>

      {/* 4-week trend */}
      <div>
        <h4 className="text-smoke text-xs uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
          <TrendingUp size={14} className="text-volt" />
          4-week trend
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="ACWR"
            value={trend.acwr !== null ? trend.acwr : '—'}
            sub={trend.acwr_status}
            subColor={
              trend.acwr_status === 'green' ? 'text-green-400' :
              trend.acwr_status === 'yellow' ? 'text-yellow-400' :
              trend.acwr_status === 'red' ? 'text-red-400' : 'text-smoke'
            }
          />
          <Stat label="Total km" value={trend.total_km} />
          <Stat label="Avg completion" value={trend.avg_completion_pct !== null ? `${trend.avg_completion_pct}%` : '—'} />
          <Stat label="Avg RPE" value={trend.avg_rpe !== null ? `${trend.avg_rpe}/10` : '—'} sub={trend.rpe_trend} />
        </div>
        <p className="text-smoke text-xs mt-2">Easy pace trend: <span className="text-white">{trend.easy_pace_trend}</span></p>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div>
          <h4 className="text-smoke text-xs uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
            <Shield size={14} className="text-volt" />
            Flags ({flags.length})
          </h4>
          <ul className="space-y-1.5">
            {flags.map((f, i) => (
              <li key={i} className={`flex items-start gap-2 text-xs px-3 py-2 border ${severityClasses(f.severity)}`}>
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                  <span className="font-bold uppercase">{f.type}</span> — {f.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, subColor }) {
  return (
    <div>
      <p className="text-smoke text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white font-display text-lg leading-tight">{value}</p>
      {sub && <p className={`text-[10px] uppercase tracking-wider mt-0.5 ${subColor || 'text-smoke'}`}>{sub}</p>}
    </div>
  );
}

function severityClasses(severity) {
  switch (severity) {
    case 'danger': return 'border-red-500/50 bg-red-500/10 text-red-300';
    case 'warn':   return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300';
    case 'info':
    default:       return 'border-ash bg-smoke/10 text-smoke';
  }
}
