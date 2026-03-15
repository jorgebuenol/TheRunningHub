import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatPace, formatTime, normalizeDescriptionPace } from '../lib/vdot';
import {
  ArrowLeft, Calendar, Edit3, Save, X, Check,
  Bot, Send, Loader, MessageSquare, ChevronDown, ChevronRight,
  Shield, History, Undo2, Zap, Trash2,
} from 'lucide-react';

const WORKOUT_COLORS = {
  easy: 'border-green-500 bg-green-500/10',
  tempo: 'border-yellow-500 bg-yellow-500/10',
  long_run: 'border-blue-500 bg-blue-500/10',
  intervals: 'border-red-500 bg-red-500/10',
  race_pace: 'border-orange-500 bg-orange-500/10',
  recovery: 'border-emerald-300 bg-emerald-300/10',
  rest: 'border-smoke bg-smoke/10',
  cross_training: 'border-purple-500 bg-purple-500/10',
  race: 'border-volt bg-volt/10',
};

const PHASE_LABELS = {
  base: 'BASE BUILDING',
  build: 'BUILD PHASE',
  peak: 'PEAK TRAINING',
  taper: 'TAPER',
  race: 'RACE WEEK',
  base_recovery: 'BASE RECOVERY',
  build_recovery: 'BUILD RECOVERY',
  peak_recovery: 'PEAK RECOVERY',
};

const PHASE_COLORS = {
  base: 'border-green-500 bg-green-500',
  build: 'border-yellow-500 bg-yellow-500',
  peak: 'border-red-500 bg-red-500',
  taper: 'border-blue-500 bg-blue-500',
  race: 'border-volt bg-volt',
  base_recovery: 'border-emerald-300 bg-emerald-300',
  build_recovery: 'border-amber-300 bg-amber-300',
  peak_recovery: 'border-rose-300 bg-rose-300',
};

const INTENSITY_STYLES = {
  easy: 'bg-green-500/20 text-green-400 border-green-500',
  moderate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
  hard: 'bg-red-500/20 text-red-400 border-red-500',
  recovery: 'bg-blue-500/20 text-blue-400 border-blue-500',
};

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ABBREV = { monday: 'MON', tuesday: 'TUE', wednesday: 'WED', thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN' };

const WORKOUT_TYPES = [
  'easy', 'tempo', 'long_run', 'intervals', 'race_pace',
  'recovery', 'rest', 'cross_training', 'race',
];

/** Safely convert any value to a renderable string — prevents React error #31 from nested objects */
function safeStr(val) {
  if (val == null) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

const HR_ZONES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

export default function PlanViewPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [expandedWorkout, setExpandedWorkout] = useState(null);

  // Status actions
  const [approving, setApproving] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  // Week generation
  const [generatingWeek, setGeneratingWeek] = useState(null);
  const [generateError, setGenerateError] = useState('');

  // AI Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [pendingAdjustments, setPendingAdjustments] = useState([]);
  const [applyingAdj, setApplyingAdj] = useState(false);
  const messagesEndRef = useRef(null);

  // Version history
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'plan'|'week', id?, label }
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadPlan();
  }, [planId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatSending]);

  async function loadPlan() {
    try {
      const data = await api.getPlan(planId);
      setPlan(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadVersions() {
    try {
      const data = await api.getPlanVersions(planId);
      setVersions(data);
      setShowVersions(true);
    } catch (err) {
      console.error(err);
    }
  }

  // Generate weekly detail
  async function handleGenerateWeek(weekId) {
    setGeneratingWeek(weekId);
    setGenerateError('');
    try {
      const updated = await api.generateWeekDetail(planId, weekId);
      setPlan(updated);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGeneratingWeek(null);
    }
  }

  // Pace format helpers
  function secToMmss(sec) {
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function mmssToSec(str) {
    if (!str) return null;
    const parts = str.split(':');
    if (parts.length !== 2) return null;
    const m = parseInt(parts[0]);
    const s = parseInt(parts[1]);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }

  // Edit workout
  function startEdit(workout) {
    setEditingWorkout(workout.id);
    setEditForm({
      title: workout.title || '',
      description: workout.description || '',
      workout_type: workout.workout_type || 'easy',
      distance_km: workout.distance_km || '',
      duration_minutes: workout.duration_minutes || '',
      pace_from: secToMmss(workout.pace_range_min),
      pace_to: secToMmss(workout.pace_range_max),
      hr_zone: workout.hr_zone || '',
      coach_notes: workout.coach_notes || '',
    });
  }

  async function saveEdit(workoutId) {
    try {
      const updates = {
        title: editForm.title,
        description: editForm.description,
        workout_type: editForm.workout_type,
        distance_km: editForm.distance_km ? parseFloat(editForm.distance_km) : null,
        duration_minutes: editForm.duration_minutes ? parseInt(editForm.duration_minutes) : null,
        pace_range_min: mmssToSec(editForm.pace_from),
        pace_range_max: mmssToSec(editForm.pace_to),
        hr_zone: editForm.hr_zone || null,
        coach_notes: editForm.coach_notes,
      };
      await api.updateWorkout(workoutId, updates);
      setEditingWorkout(null);
      loadPlan();
    } catch (err) {
      console.error(err);
    }
  }

  // Approve / Unpublish
  async function handleApprove() {
    setApproving(true);
    setActionMessage('');
    try {
      const updated = await api.approvePlan(planId);
      setPlan(updated);
      setActionMessage('Plan approved and published!');
    } catch (err) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setApproving(false);
    }
  }

  async function handleUnpublish() {
    setUnpublishing(true);
    setActionMessage('');
    try {
      const updated = await api.unpublishPlan(planId);
      setPlan(updated);
      setActionMessage('Plan unpublished. You can now edit it.');
    } catch (err) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setUnpublishing(false);
    }
  }

  // Delete plan
  async function handleDeletePlan() {
    setDeleting(true);
    try {
      await api.deletePlan(planId);
      navigate(`/athletes/${plan.athlete_id}`);
    } catch (err) {
      setActionMessage(`Error: ${err.message}`);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  // Delete week
  async function handleDeleteWeek(weekId) {
    setDeleting(true);
    try {
      const updated = await api.deleteWeek(planId, weekId);
      setPlan(updated);
      setConfirmDelete(null);
    } catch (err) {
      setActionMessage(`Error: ${err.message}`);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  // AI Chat
  async function handleChatSend(e) {
    e.preventDefault();
    if (!chatInput.trim() || chatSending) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatError('');

    const newMessages = [...chatMessages, { role: 'user', content: userMessage }];
    setChatMessages(newMessages);
    setChatSending(true);

    try {
      const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
      const reply = await api.sendPlanReviewMessage(planId, plan.athlete_id, userMessage, history);

      if (!reply?.content) {
        throw new Error('Empty response from AI. Try a more specific request.');
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: reply.content }]);

      // If adjustments were returned, add them to pending
      if (reply.adjustments?.length > 0) {
        setPendingAdjustments(prev => [...prev, ...reply.adjustments]);
      }
    } catch (err) {
      setChatError(err.message || 'Something went wrong. Try again with a simpler request.');
      // Remove the user message if it failed completely (no AI response)
      setChatMessages(prev => prev.length > 0 && prev[prev.length - 1].role === 'user'
        ? prev.slice(0, -1)
        : prev
      );
    } finally {
      setChatSending(false);
    }
  }

  async function handleApplyAdjustments(adjustmentsToApply) {
    setApplyingAdj(true);
    try {
      const updated = await api.applyPlanAdjustments(planId, adjustmentsToApply);
      setPlan(updated);
      // Remove applied adjustments from pending (handle both week_id and workout_id)
      const appliedWorkoutIds = new Set(adjustmentsToApply.filter(a => a.workout_id).map(a => a.workout_id));
      const appliedWeekIds = new Set(adjustmentsToApply.filter(a => a.week_id).map(a => a.week_id));
      setPendingAdjustments(prev => prev.filter(a =>
        !(a.workout_id && appliedWorkoutIds.has(a.workout_id)) &&
        !(a.week_id && appliedWeekIds.has(a.week_id))
      ));
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Applied ${adjustmentsToApply.length} adjustment(s) to the plan.`,
      }]);
    } catch (err) {
      setChatError(`Failed to apply: ${err.message}`);
    } finally {
      setApplyingAdj(false);
    }
  }

  function dismissAdjustment(adj) {
    setPendingAdjustments(prev => prev.filter(a =>
      a.workout_id !== adj.workout_id || a.week_id !== adj.week_id
    ));
  }

  // Find info for an adjustment — supports both workout_id and week_id
  function findAdjustmentInfo(adj) {
    if (!plan?.plan_weeks) return null;

    // Week-level adjustment (skeleton)
    if (adj.week_id) {
      const week = plan.plan_weeks.find(w => w.id === adj.week_id);
      if (week) return { type: 'week', week: week.week_number, phase: week.phase, title: `Week ${week.week_number}`, source: week };
      return null;
    }

    // Workout-level adjustment (generated)
    if (adj.workout_id) {
      for (const week of plan.plan_weeks) {
        const w = week.workouts?.find(wo => wo.id === adj.workout_id);
        if (w) return { type: 'workout', week: week.week_number, day: DAY_ABBREV[w.day_of_week] || w.day_of_week, title: w.title, source: w };
      }
    }
    return null;
  }

  if (loading) return <div className="text-volt font-display text-xl animate-pulse">LOADING PLAN...</div>;
  if (!plan) return <div className="text-red-400">Plan not found</div>;

  const isDraft = plan.status === 'draft';
  const isApproved = plan.status === 'approved';
  const canEdit = isCoach && isDraft;

  const weeks = plan.plan_weeks || [];
  const generatedCount = weeks.filter(w => w.is_generated).length;
  const ungeneratedCount = weeks.filter(w => !w.is_generated).length;

  return (
    <div className="relative">
      {/* Main plan area */}
      <div className="w-full">
        {/* Back link */}
        {isCoach && (
          <Link to={`/athletes/${plan.athlete_id}`} className="flex items-center gap-2 text-smoke hover:text-volt text-sm uppercase tracking-wider mb-6 transition-colors">
            <ArrowLeft size={16} />
            Back to Athlete
          </Link>
        )}

        {/* Header with status */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl text-volt">{plan.name}</h1>
              <StatusBadge status={plan.status} />
            </div>
            <p className="text-smoke text-sm uppercase tracking-wider mt-1">
              {plan.total_weeks} weeks | {plan.goal_race} | Target: {formatTime(plan.goal_time_seconds)}
              {plan.version > 1 && ` | v${plan.version}`}
            </p>
          </div>
          <Link to={`/calendar/${plan.athlete_id}`} className="btn-secondary flex items-center gap-2">
            <Calendar size={16} />
            CALENDAR
          </Link>
        </div>

        {/* Coach action bar */}
        {isCoach && (
          <div className="flex items-center gap-3 mb-6">
            {isDraft && (
              <>
                <button
                  onClick={() => setChatOpen(prev => !prev)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <MessageSquare size={16} />
                  {chatOpen ? 'CLOSE CHAT' : 'AI ADJUSTMENT'}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="btn-primary flex items-center gap-2"
                >
                  <Check size={16} />
                  {approving ? 'APPROVING...' : 'APPROVE & PUBLISH'}
                </button>
                <button
                  onClick={() => setConfirmDelete({ type: 'plan', label: plan.name || 'this plan' })}
                  className="btn-ghost flex items-center gap-2 text-red-400 hover:text-red-300"
                >
                  <Trash2 size={16} />
                  DELETE PLAN
                </button>
              </>
            )}
            {isApproved && (
              <button
                onClick={handleUnpublish}
                disabled={unpublishing}
                className="btn-ghost flex items-center gap-2"
              >
                <Undo2 size={16} />
                {unpublishing ? 'UNPUBLISHING...' : 'UNPUBLISH & EDIT'}
              </button>
            )}
            <button
              onClick={loadVersions}
              className="btn-ghost flex items-center gap-2"
            >
              <History size={16} />
              VERSIONS
            </button>
          </div>
        )}

        {/* Action message */}
        {actionMessage && (
          <div className={`px-4 py-3 mb-4 text-sm border ${
            actionMessage.startsWith('Error') ? 'border-red-500 text-red-300 bg-red-900/20' : 'border-green-500 text-green-300 bg-green-900/20'
          }`}>
            {actionMessage}
          </div>
        )}

        {/* Version history */}
        {showVersions && (
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg">VERSION HISTORY</h3>
              <button onClick={() => setShowVersions(false)} className="text-smoke hover:text-white">
                <X size={16} />
              </button>
            </div>
            {versions.length === 0 ? (
              <p className="text-smoke text-sm">No version history</p>
            ) : (
              <div className="space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="flex items-center justify-between text-sm py-2 border-b border-ash last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-volt font-bold">v{v.version}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    <span className="text-smoke text-xs">{new Date(v.updated_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Plan Timeline Bar ─── */}
        {weeks.length > 1 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-sm tracking-wider text-smoke">PLAN TIMELINE</h3>
              <span className="text-smoke text-xs">
                {generatedCount}/{weeks.length} weeks generated
              </span>
            </div>
            <div className="flex gap-0.5 overflow-x-auto pb-2">
              {weeks.map((week) => {
                const phaseColor = PHASE_COLORS[week.phase] || PHASE_COLORS.base;
                return (
                  <a
                    key={week.id}
                    href={`#week-${week.week_number}`}
                    className={`flex-shrink-0 w-14 border-t-4 ${phaseColor.split(' ')[0]} bg-steel/40 p-1.5 hover:bg-steel/80 transition-colors ${
                      !week.is_generated ? 'opacity-50' : ''
                    }`}
                    title={`Week ${week.week_number} — ${week.phase} — ${week.km_target || 0}km`}
                  >
                    <p className="text-[10px] text-smoke font-bold">W{week.week_number}</p>
                    <p className="text-[10px] text-white font-semibold">{week.km_target || '—'}km</p>
                    <p className="text-[8px] text-smoke uppercase truncate">{week.phase}</p>
                    {week.is_generated && (
                      <Check size={8} className="text-green-400 mt-0.5" />
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Warning banner for un-generated weeks */}
        {isDraft && ungeneratedCount > 0 && generatedCount > 0 && (
          <div className="border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 mb-6 text-sm text-yellow-300">
            {ungeneratedCount} of {weeks.length} weeks have not been generated yet. Generate each week when ready, or approve the plan as-is.
          </div>
        )}

        {/* Generate error */}
        {generateError && (
          <div className="border border-red-500 bg-red-900/20 px-4 py-3 mb-4 text-sm text-red-300">
            {generateError}
            <button onClick={() => setGenerateError('')} className="ml-3 text-red-400 hover:text-white">
              <X size={14} className="inline" />
            </button>
          </div>
        )}

        {/* Phase legend */}
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(WORKOUT_COLORS).map(([type, cls]) => (
            <div key={type} className={`flex items-center gap-2 border-l-4 px-3 py-1 ${cls}`}>
              <span className="text-xs uppercase tracking-wider">{type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="space-y-6">
          {weeks.map(week => (
            <div key={week.id} id={`week-${week.week_number}`} className="card">
              {/* Week header — shared between generated and skeleton */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="font-display text-xl">
                      WEEK {week.week_number}
                      {week.phase && (
                        <span className="text-volt ml-3 text-sm">{PHASE_LABELS[week.phase] || week.phase}</span>
                      )}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {week.start_date && (
                        <span className="text-smoke text-xs">
                          {formatWeekRange(week.start_date)}
                        </span>
                      )}
                      {week.notes && <span className="text-smoke text-xs">— {week.notes}</span>}
                    </div>
                  </div>
                  {canEdit && weeks.length > 1 && (
                    <button
                      onClick={() => setConfirmDelete({ type: 'week', id: week.id, label: `Week ${week.week_number}` })}
                      className="text-smoke/50 hover:text-red-400 transition-colors p-1"
                      title="Delete this week"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="text-right">
                  {week.is_generated ? (
                    <>
                      <p className="text-volt font-display text-lg">{week.total_km || 0}KM</p>
                      {week.km_target && week.km_target !== week.total_km && (
                        <p className="text-smoke text-xs">Target: {week.km_target}km</p>
                      )}
                      <p className="text-smoke text-xs uppercase">Total Volume</p>
                    </>
                  ) : (
                    <>
                      <p className="text-volt font-display text-lg">{week.km_target || '—'}KM</p>
                      <p className="text-smoke text-xs uppercase">Target Volume</p>
                    </>
                  )}
                </div>
              </div>

              {/* Generated week → full workout grid */}
              {week.is_generated ? (
                <div className="overflow-x-auto -mx-1 px-1 pb-1">
                <div className="grid grid-cols-7 gap-2 min-w-[700px]">
                  {DAY_NAMES.map((day, i) => {
                    const workout = week.workouts?.find(w => w.day_of_week === DAY_KEYS[i]);
                    if (!workout) {
                      return (
                        <div key={i} className="border border-ash/50 p-3 min-h-[120px]">
                          <p className="text-smoke text-xs font-semibold mb-1">{day}</p>
                        </div>
                      );
                    }

                    const colorClass = WORKOUT_COLORS[workout.workout_type] || 'border-ash';
                    const isEditing = editingWorkout === workout.id;
                    const isExpanded = expandedWorkout === workout.id;

                    return (
                      <div key={i} className={`border-l-4 border-t border-r border-b border-ash p-3 min-h-[120px] ${colorClass}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-smoke text-xs font-semibold">{day}</p>
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <button onClick={() => startEdit(workout)} className="text-smoke hover:text-volt">
                                <Edit3 size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        {(
                          <div
                            className="cursor-pointer"
                            onClick={() => setExpandedWorkout(isExpanded ? null : workout.id)}
                          >
                            <p className="text-white text-xs font-bold uppercase leading-tight">{safeStr(workout.title)}</p>
                            {workout.distance_km && (
                              <p className="text-volt text-xs font-semibold mt-1">{workout.distance_km}km</p>
                            )}
                            {workout.pace_range_min && workout.pace_range_max && (
                              <p className="text-smoke text-xs mt-1">
                                {formatPace(workout.pace_range_min)}-{formatPace(workout.pace_range_max)}
                              </p>
                            )}
                            {workout.hr_zone && (
                              <p className="text-smoke text-xs">{safeStr(workout.hr_zone)}</p>
                            )}
                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-ash/50 space-y-1">
                                {workout.duration_minutes && <p className="text-smoke text-xs">{formatTime(Math.round(workout.duration_minutes * 60))}</p>}
                                {workout.description && <p className="text-smoke text-xs">{normalizeDescriptionPace(safeStr(workout.description), workout)}</p>}
                                {workout.coach_notes && <p className="text-volt/80 text-xs">Coach: {safeStr(workout.coach_notes)}</p>}
                                {workout.intervals_detail && typeof workout.intervals_detail === 'object' && (
                                  <p className="text-smoke text-xs">
                                    {workout.intervals_detail.reps}x{workout.intervals_detail.distance_m}m @ {formatPace(workout.intervals_detail.pace_sec_km)}/km, {workout.intervals_detail.rest_seconds}s rest
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
              ) : (
                /* Skeleton week → generate prompt */
                <div className="border-2 border-dashed border-ash/50 p-6 text-center">
                  <div className="flex items-center justify-center gap-3 mb-3">
                    {week.intensity && <IntensityBadge intensity={week.intensity} />}
                    <span className="text-smoke text-sm">
                      {week.km_target}km planned
                      {week.intensity && ` · ${week.intensity} intensity`}
                    </span>
                  </div>

                  {isCoach && isDraft && (
                    <button
                      onClick={() => handleGenerateWeek(week.id)}
                      disabled={generatingWeek !== null}
                      className="btn-primary inline-flex items-center gap-2 mt-2"
                    >
                      {generatingWeek === week.id ? (
                        <>
                          <Loader size={16} className="animate-spin" />
                          GENERATING...
                        </>
                      ) : (
                        <>
                          <Zap size={16} />
                          GENERATE THIS WEEK
                        </>
                      )}
                    </button>
                  )}

                  {!isCoach && (
                    <p className="text-smoke text-xs mt-2">Workouts have not been generated for this week yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Coach Edit Modal ─── */}
      {editingWorkout && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl flex items-center gap-2">
                <Edit3 size={18} className="text-volt" /> EDIT WORKOUT
              </h2>
              <button onClick={() => setEditingWorkout(null)} className="text-smoke hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Workout Name</label>
                <input
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. Easy Base Run"
                />
              </div>

              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Type</label>
                <select
                  value={editForm.workout_type}
                  onChange={e => setEditForm(f => ({ ...f, workout_type: e.target.value }))}
                  className="input-field"
                >
                  <option value="easy">Easy Run</option>
                  <option value="long_run">Long Run</option>
                  <option value="tempo">Tempo</option>
                  <option value="intervals">Intervals</option>
                  <option value="race_pace">Race Pace</option>
                  <option value="recovery">Recovery</option>
                  <option value="rest">Rest</option>
                  <option value="cross_training">Cross Training</option>
                  <option value="race">Race Day</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Distance (km)</label>
                  <input
                    type="number" step="0.1" min="0"
                    value={editForm.distance_km}
                    onChange={e => setEditForm(f => ({ ...f, distance_km: e.target.value }))}
                    className="input-field"
                    placeholder="10.0"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Duration (min)</label>
                  <input
                    type="number" min="0"
                    value={editForm.duration_minutes}
                    onChange={e => setEditForm(f => ({ ...f, duration_minutes: e.target.value }))}
                    className="input-field"
                    placeholder="60"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Pace Range (min/km)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-smoke text-xs block mb-1">From (faster)</span>
                    <input
                      type="text"
                      value={editForm.pace_from}
                      onChange={e => setEditForm(f => ({ ...f, pace_from: e.target.value }))}
                      className="input-field"
                      placeholder="5:30"
                    />
                  </div>
                  <div>
                    <span className="text-smoke text-xs block mb-1">To (slower)</span>
                    <input
                      type="text"
                      value={editForm.pace_to}
                      onChange={e => setEditForm(f => ({ ...f, pace_to: e.target.value }))}
                      className="input-field"
                      placeholder="6:00"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">HR Zone</label>
                <select
                  value={editForm.hr_zone}
                  onChange={e => setEditForm(f => ({ ...f, hr_zone: e.target.value }))}
                  className="input-field"
                >
                  <option value="">—</option>
                  {HR_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Description</label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="input-field resize-none"
                  placeholder="Workout details..."
                />
              </div>

              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Coach Notes</label>
                <textarea
                  rows={3}
                  value={editForm.coach_notes}
                  onChange={e => setEditForm(f => ({ ...f, coach_notes: e.target.value }))}
                  className="input-field resize-none"
                  placeholder="Notes for athlete..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => saveEdit(editingWorkout)} disabled={false}
                  className="px-4 py-2 bg-volt hover:bg-volt/80 text-carbon font-semibold text-sm transition-colors disabled:opacity-50 flex-1 uppercase tracking-wider flex items-center justify-center gap-2">
                  <Save size={14} /> SAVE CHANGES
                </button>
                <button onClick={() => setEditingWorkout(null)} className="btn-ghost">
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-carbon border border-red-500/50 border-l-4 border-l-red-500 p-6 max-w-md w-full mx-4">
            <h3 className="font-display text-lg text-white mb-2">
              DELETE {confirmDelete.type === 'plan' ? 'PLAN' : 'WEEK'}
            </h3>
            <p className="text-smoke text-sm mb-1">
              Delete <span className="text-white font-semibold">{confirmDelete.label}</span>? This cannot be undone.
            </p>
            <p className="text-red-400/70 text-xs mb-6">
              {confirmDelete.type === 'plan'
                ? 'All weeks and workouts will be permanently deleted.'
                : 'All workouts in this week will be deleted and remaining weeks will be renumbered.'}
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="btn-ghost px-4 py-2 text-sm"
              >
                CANCEL
              </button>
              <button
                onClick={() => confirmDelete.type === 'plan' ? handleDeletePlan() : handleDeleteWeek(confirmDelete.id)}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
              >
                <Trash2 size={14} />
                {deleting ? 'DELETING...' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Chat Sidebar — fixed overlay */}
      {chatOpen && isCoach && isDraft && (
        <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setChatOpen(false)} />
        <div className="fixed right-0 top-0 w-[400px] max-w-[90vw] flex flex-col border-l border-ash h-screen bg-carbon z-50 shadow-2xl shadow-black/50">
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-ash flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-volt" />
              <h3 className="font-display text-sm">PLAN REVIEW CHAT</h3>
            </div>
            <button onClick={() => setChatOpen(false)} className="text-smoke hover:text-white">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <Bot size={32} className="text-volt/50 mx-auto mb-3" />
                <p className="text-smoke text-sm mb-4">Ask me to adjust the plan</p>
                <div className="space-y-2">
                  {[
                    'Make week 3 easier',
                    'Add more tempo in build phase',
                    'Reduce long run distances',
                    'Is the taper long enough?',
                  ].map(s => (
                    <button
                      key={s}
                      onClick={() => setChatInput(s)}
                      className="block w-full text-left px-3 py-2 text-xs text-smoke border border-ash hover:border-volt hover:text-volt transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 bg-volt flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot size={12} className="text-carbon" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3 py-2 text-xs whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-volt/20 border border-volt text-white'
                    : 'bg-steel border border-ash text-white'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {chatSending && (
              <div className="flex gap-2">
                <div className="w-6 h-6 bg-volt flex items-center justify-center flex-shrink-0">
                  <Bot size={12} className="text-carbon" />
                </div>
                <div className="bg-steel border border-ash px-3 py-2 flex items-center gap-2">
                  <Loader size={12} className="animate-spin text-volt" />
                  <span className="text-smoke text-xs">Analyzing plan...</span>
                </div>
              </div>
            )}

            {chatError && (
              <div className="bg-red-900/20 border border-red-500 px-3 py-2 text-red-300 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span>{chatError}</span>
                  <button onClick={() => setChatError('')} className="text-red-400 hover:text-white flex-shrink-0">
                    <X size={12} />
                  </button>
                </div>
                <p className="text-red-400/60 text-[10px] mt-1">Tip: Try targeting specific weeks (e.g. "make week 3 easier") instead of entire phases.</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Pending adjustments */}
          {pendingAdjustments.length > 0 && (
            <div className="border-t border-ash px-4 py-3 max-h-[200px] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-volt text-xs font-bold uppercase">
                  {pendingAdjustments.length} Suggested Change{pendingAdjustments.length > 1 ? 's' : ''}
                </p>
                <button
                  onClick={() => handleApplyAdjustments(pendingAdjustments)}
                  disabled={applyingAdj}
                  className="text-xs text-volt hover:text-white font-bold uppercase"
                >
                  {applyingAdj ? 'APPLYING...' : 'APPLY ALL'}
                </button>
              </div>
              {pendingAdjustments.map((adj, i) => {
                const info = findAdjustmentInfo(adj);
                const label = info
                  ? info.type === 'week'
                    ? `W${info.week} — ${(info.phase || '').toUpperCase()}`
                    : `W${info.week} ${info.day} — ${safeStr(info.title)}`
                  : (adj.week_id || adj.workout_id || '').slice(0, 8);
                return (
                  <div key={i} className={`border bg-steel/50 px-3 py-2 mb-2 text-xs ${
                    info?.type === 'week' ? 'border-yellow-500/50' : 'border-ash'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-semibold">
                        {info?.type === 'week' && <span className="text-yellow-400 mr-1">WEEK</span>}
                        {label}
                      </span>
                      <button onClick={() => dismissAdjustment(adj)} className="text-smoke hover:text-red-400">
                        <X size={12} />
                      </button>
                    </div>
                    <div className="text-smoke space-y-0.5">
                      {Object.entries(adj.changes || {}).map(([key, val]) => {
                        const oldVal = info?.source?.[key];
                        return (
                          <p key={key}>
                            <span className="text-smoke/70">{key}:</span>{' '}
                            {oldVal != null && <span className="text-red-400/70 line-through mr-1">{safeStr(oldVal)}</span>}
                            <span className="text-green-400">{safeStr(val)}</span>
                          </p>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => handleApplyAdjustments([adj])}
                      disabled={applyingAdj}
                      className="mt-1 text-volt hover:text-white text-xs font-bold uppercase"
                    >
                      APPLY
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Chat input */}
          <form onSubmit={handleChatSend} className="border-t border-ash p-3 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask for adjustments..."
              className="input-field flex-1 py-2 text-xs"
              disabled={chatSending}
            />
            <button
              type="submit"
              disabled={chatSending || !chatInput.trim()}
              className="btn-primary px-3 py-2"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
        </>
      )}
    </div>
  );
}

/* ─── Helper: format week date range from start_date ─── */
function formatWeekRange(startDateStr) {
  if (!startDateStr) return '';
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} — ${end.toLocaleDateString('en-US', opts)}`;
}

/* ─── Intensity Badge ─── */
function IntensityBadge({ intensity }) {
  const style = INTENSITY_STYLES[intensity] || INTENSITY_STYLES.moderate;
  return (
    <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider border ${style}`}>
      {intensity}
    </span>
  );
}

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-volt/20 text-volt border-volt',
    approved: 'bg-green-500/20 text-green-400 border-green-500',
    archived: 'bg-smoke/20 text-smoke border-smoke',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider border ${styles[status] || styles.draft}`}>
      {status === 'approved' ? 'PUBLISHED' : status}
    </span>
  );
}

