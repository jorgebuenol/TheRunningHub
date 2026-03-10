import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatPace, formatTime } from '../lib/vdot';
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
};

const PHASE_COLORS = {
  base: 'border-green-500 bg-green-500',
  build: 'border-yellow-500 bg-yellow-500',
  peak: 'border-red-500 bg-red-500',
  taper: 'border-blue-500 bg-blue-500',
  race: 'border-volt bg-volt',
};

const INTENSITY_STYLES = {
  easy: 'bg-green-500/20 text-green-400 border-green-500',
  moderate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
  hard: 'bg-red-500/20 text-red-400 border-red-500',
  recovery: 'bg-blue-500/20 text-blue-400 border-blue-500',
};

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const WORKOUT_TYPES = [
  'easy', 'tempo', 'long_run', 'intervals', 'race_pace',
  'recovery', 'rest', 'cross_training', 'race',
];

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

  // Edit workout
  function startEdit(workout) {
    setEditingWorkout(workout.id);
    setEditForm({
      title: workout.title || '',
      description: workout.description || '',
      workout_type: workout.workout_type || 'easy',
      distance_km: workout.distance_km || '',
      duration_minutes: workout.duration_minutes || '',
      pace_target_sec_km: workout.pace_target_sec_km || '',
      pace_range_min: workout.pace_range_min || '',
      pace_range_max: workout.pace_range_max || '',
      hr_zone: workout.hr_zone || '',
      coach_notes: workout.coach_notes || '',
    });
  }

  async function saveEdit(workoutId) {
    try {
      const updates = { ...editForm };
      // Convert number fields
      for (const k of ['distance_km', 'duration_minutes', 'pace_target_sec_km', 'pace_range_min', 'pace_range_max']) {
        if (updates[k] === '') updates[k] = null;
        else if (updates[k]) updates[k] = parseFloat(updates[k]);
      }
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

      setChatMessages(prev => [...prev, { role: 'assistant', content: reply.content }]);

      // If adjustments were returned, add them to pending
      if (reply.adjustments?.length > 0) {
        setPendingAdjustments(prev => [...prev, ...reply.adjustments]);
      }
    } catch (err) {
      setChatError(err.message);
    } finally {
      setChatSending(false);
    }
  }

  async function handleApplyAdjustments(adjustmentsToApply) {
    setApplyingAdj(true);
    try {
      const updated = await api.applyPlanAdjustments(planId, adjustmentsToApply);
      setPlan(updated);
      // Remove applied adjustments from pending
      const appliedIds = new Set(adjustmentsToApply.map(a => a.workout_id));
      setPendingAdjustments(prev => prev.filter(a => !appliedIds.has(a.workout_id)));
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

  function dismissAdjustment(workoutId) {
    setPendingAdjustments(prev => prev.filter(a => a.workout_id !== workoutId));
  }

  // Find workout info for an adjustment
  function findWorkoutInfo(workoutId) {
    if (!plan?.plan_weeks) return null;
    for (const week of plan.plan_weeks) {
      const w = week.workouts?.find(wo => wo.id === workoutId);
      if (w) return { week: week.week_number, day: DAY_NAMES[w.day_of_week], title: w.title, workout: w };
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
    <div className="flex gap-0">
      {/* Main plan area */}
      <div className={chatOpen ? 'flex-1 min-w-0 pr-4' : 'w-full'}>
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
                <div className="grid grid-cols-7 gap-2">
                  {DAY_NAMES.map((day, i) => {
                    const workout = week.workouts?.find(w => w.day_of_week === i);
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
                            {canEdit && !isEditing && (
                              <button onClick={() => startEdit(workout)} className="text-smoke hover:text-volt">
                                <Edit3 size={12} />
                              </button>
                            )}
                            {canEdit && isEditing && (
                              <button onClick={() => saveEdit(workout.id)} className="text-volt hover:text-white">
                                <Save size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        {isEditing ? (
                          <EditForm editForm={editForm} setEditForm={setEditForm} onCancel={() => setEditingWorkout(null)} />
                        ) : (
                          <div
                            className="cursor-pointer"
                            onClick={() => setExpandedWorkout(isExpanded ? null : workout.id)}
                          >
                            <p className="text-white text-xs font-bold uppercase leading-tight">{workout.title}</p>
                            {workout.distance_km && (
                              <p className="text-volt text-xs font-semibold mt-1">{workout.distance_km}km</p>
                            )}
                            {workout.pace_range_min && workout.pace_range_max && (
                              <p className="text-smoke text-xs mt-1">
                                {formatPace(workout.pace_range_min)}-{formatPace(workout.pace_range_max)}
                              </p>
                            )}
                            {workout.hr_zone && (
                              <p className="text-smoke text-xs">{workout.hr_zone}</p>
                            )}
                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-ash/50 space-y-1">
                                {workout.duration_minutes && <p className="text-smoke text-xs">{workout.duration_minutes} min</p>}
                                {workout.description && <p className="text-smoke text-xs">{workout.description}</p>}
                                {workout.coach_notes && <p className="text-volt/80 text-xs">Coach: {workout.coach_notes}</p>}
                                {workout.intervals_detail && (
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

      {/* AI Chat Sidebar */}
      {chatOpen && isCoach && isDraft && (
        <div className="w-[400px] flex-shrink-0 flex flex-col border-l border-ash h-[calc(100vh-4rem)] sticky top-0">
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
                {chatError}
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
                const info = findWorkoutInfo(adj.workout_id);
                return (
                  <div key={i} className="border border-ash bg-steel/50 px-3 py-2 mb-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-semibold">
                        {info ? `W${info.week} ${info.day} — ${info.title}` : adj.workout_id.slice(0, 8)}
                      </span>
                      <button onClick={() => dismissAdjustment(adj.workout_id)} className="text-smoke hover:text-red-400">
                        <X size={12} />
                      </button>
                    </div>
                    <div className="text-smoke space-y-0.5">
                      {Object.entries(adj.changes || {}).map(([key, val]) => {
                        const oldVal = info?.workout?.[key];
                        return (
                          <p key={key}>
                            <span className="text-smoke/70">{key}:</span>{' '}
                            {oldVal != null && <span className="text-red-400/70 line-through mr-1">{oldVal}</span>}
                            <span className="text-green-400">{val}</span>
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

function EditForm({ editForm, setEditForm, onCancel }) {
  return (
    <div className="space-y-1">
      <input
        value={editForm.title}
        onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
        className="w-full bg-carbon border border-ash px-2 py-1 text-xs"
        placeholder="Title"
      />
      <select
        value={editForm.workout_type}
        onChange={e => setEditForm(f => ({ ...f, workout_type: e.target.value }))}
        className="w-full bg-carbon border border-ash px-2 py-1 text-xs"
      >
        {WORKOUT_TYPES.map(t => (
          <option key={t} value={t}>{t.replace('_', ' ')}</option>
        ))}
      </select>
      <input
        type="number"
        value={editForm.distance_km}
        onChange={e => setEditForm(f => ({ ...f, distance_km: e.target.value }))}
        className="w-full bg-carbon border border-ash px-2 py-1 text-xs"
        placeholder="Distance (km)"
      />
      <input
        type="number"
        value={editForm.duration_minutes}
        onChange={e => setEditForm(f => ({ ...f, duration_minutes: e.target.value }))}
        className="w-full bg-carbon border border-ash px-2 py-1 text-xs"
        placeholder="Duration (min)"
      />
      <div className="grid grid-cols-2 gap-1">
        <input
          type="number"
          value={editForm.pace_range_min}
          onChange={e => setEditForm(f => ({ ...f, pace_range_min: e.target.value }))}
          className="w-full bg-carbon border border-ash px-2 py-1 text-xs"
          placeholder="Pace min (s/km)"
        />
        <input
          type="number"
          value={editForm.pace_range_max}
          onChange={e => setEditForm(f => ({ ...f, pace_range_max: e.target.value }))}
          className="w-full bg-carbon border border-ash px-2 py-1 text-xs"
          placeholder="Pace max (s/km)"
        />
      </div>
      <select
        value={editForm.hr_zone}
        onChange={e => setEditForm(f => ({ ...f, hr_zone: e.target.value }))}
        className="w-full bg-carbon border border-ash px-2 py-1 text-xs"
      >
        <option value="">HR Zone</option>
        {HR_ZONES.map(z => (
          <option key={z} value={z}>{z}</option>
        ))}
      </select>
      <textarea
        value={editForm.description}
        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
        className="w-full bg-carbon border border-ash px-2 py-1 text-xs h-12 resize-none"
        placeholder="Description"
      />
      <textarea
        value={editForm.coach_notes}
        onChange={e => setEditForm(f => ({ ...f, coach_notes: e.target.value }))}
        className="w-full bg-carbon border border-ash px-2 py-1 text-xs h-12 resize-none"
        placeholder="Coach notes"
      />
      <button onClick={onCancel} className="text-smoke text-xs hover:text-white">
        Cancel
      </button>
    </div>
  );
}
