import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { formatPace, formatTime, normalizeDescriptionPace } from '../lib/vdot';
import WorkoutFeedbackModal from '../components/athletes/WorkoutFeedbackModal';
import WorkoutDetailPanel from '../components/WorkoutDetailPanel';
import ActivityDetailPanel from '../components/ActivityDetailPanel';
import StrengthSessionModal from '../components/StrengthSessionModal';
import { Calendar, Check, Zap, MessageSquare, ClipboardCheck, BarChart3, User, Plus } from 'lucide-react';
import { getOverallProgress } from '@shared/onboardingProgress';

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

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Format a Date as 'YYYY-MM-DD' in LOCAL timezone (not UTC) */
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Safely convert any value to a renderable string — prevents React error #31 from nested objects */
function safeStr(val) {
  if (val == null) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/* ─── Activity type colors (logged activities) ─── */
const ACTIVITY_COLORS = {
  easy_run:  { bg: 'bg-green-500/20',   border: 'border-green-500',   text: 'text-green-400',   label: 'Easy Run',  abbrev: 'EASY' },
  long_run:  { bg: 'bg-blue-500/20',    border: 'border-blue-500',    text: 'text-blue-400',    label: 'Long Run',  abbrev: 'LONG' },
  race:      { bg: 'bg-volt/20',        border: 'border-volt',        text: 'text-volt',        label: 'Race',      abbrev: 'RACE' },
  strength:  { bg: 'bg-purple-500/20',  border: 'border-purple-500',  text: 'text-purple-400',  label: 'Strength',  abbrev: 'STR' },
  pilates:   { bg: 'bg-pink-500/20',    border: 'border-pink-500',    text: 'text-pink-400',    label: 'Pilates',   abbrev: 'PIL' },
  cycling:   { bg: 'bg-cyan-500/20',    border: 'border-cyan-500',    text: 'text-cyan-400',    label: 'Cycling',   abbrev: 'CYC' },
  swimming:  { bg: 'bg-sky-500/20',     border: 'border-sky-500',     text: 'text-sky-400',     label: 'Swimming',  abbrev: 'SWIM' },
  walking:   { bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-400', label: 'Walking',   abbrev: 'WALK' },
  other:     { bg: 'bg-gray-500/20',    border: 'border-gray-500',    text: 'text-gray-400',    label: 'Other',     abbrev: 'OTH' },
};

function getActivityColors(type) {
  return ACTIVITY_COLORS[type] || ACTIVITY_COLORS.other;
}

function formatPaceFromSec(totalSec) {
  if (!totalSec) return '';
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export default function MyPlanPage() {
  const { user } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [plan, setPlan] = useState(null);
  const [thisWeekWorkouts, setThisWeekWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteWorkout, setNoteWorkout] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [feedbackWorkout, setFeedbackWorkout] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [todayCheckedIn, setTodayCheckedIn] = useState(null);
  const [workoutFeedbacks, setWorkoutFeedbacks] = useState({});
  const [strengthSessions, setStrengthSessions] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showStrengthModal, setShowStrengthModal] = useState(false);
  const [editingStrength, setEditingStrength] = useState(null);

  useEffect(() => {
    loadMyData();
  }, [user]);

  async function loadMyData() {
    if (!user) return;

    try {
      // Get my athlete profile
      const { data: athleteData } = await supabase
        .from('athletes')
        .select('*, profiles(full_name, email)')
        .eq('profile_id', user.id)
        .single();

      if (!athleteData) {
        setLoading(false);
        return;
      }

      setAthlete(athleteData);

      // Check today's readiness
      try {
        const readiness = await api.getTodayReadiness(athleteData.id);
        setTodayCheckedIn(readiness);
      } catch {
        setTodayCheckedIn(null);
      }

      // Get active plan
      const { data: plans } = await supabase
        .from('training_plans')
        .select('*')
        .eq('athlete_id', athleteData.id)
        .eq('status', 'approved')
        .limit(1);

      if (plans?.[0]) {
        const fullPlan = await api.getPlan(plans[0].id);
        setPlan(fullPlan);

        // Find this week's workouts
        const today = new Date();
        const monday = getMonday(today);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);

        const mondayStr = toLocalDateStr(monday);
        const sundayStr = toLocalDateStr(sunday);

        const { data: weekWorkouts } = await supabase
          .from('workouts')
          .select('*')
          .eq('athlete_id', athleteData.id)
          .gte('workout_date', mondayStr)
          .lte('workout_date', sundayStr)
          .order('workout_date');

        setThisWeekWorkouts(weekWorkouts || []);

        // Load feedback for this week's workouts
        const fbMap = {};
        for (const w of (weekWorkouts || [])) {
          try {
            const fb = await api.getWorkoutFeedback(w.id);
            if (fb) fbMap[w.id] = fb;
          } catch { /* no feedback */ }
        }
        setWorkoutFeedbacks(fbMap);
      }

      // Load strength sessions for the week (always, even without a plan)
      const now = new Date();
      const mon = getMonday(now);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      const sessions = await api.getStrengthSessions(athleteData.id, toLocalDateStr(mon), toLocalDateStr(sun)).catch(() => []);
      setStrengthSessions(sessions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveNote() {
    if (!noteWorkout) return;
    try {
      await api.updateWorkout(noteWorkout.id, { athlete_notes: noteText });
      setNoteWorkout(null);
      setNoteText('');
      loadMyData();
    } catch (err) {
      console.error(err);
    }
  }

  async function markCompleted(workoutId) {
    try {
      await api.updateWorkout(workoutId, { status: 'completed' });
      loadMyData();
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div className="text-volt font-display text-xl animate-pulse">LOADING YOUR PLAN...</div>;

  if (!athlete) {
    return (
      <div className="text-center py-20">
        <Zap size={48} className="text-volt mx-auto mb-4" />
        <h2 className="font-display text-2xl mb-2">WELCOME TO THE RUN HUB</h2>
        <p className="text-smoke">Your coach hasn't set up your profile yet. Check back soon!</p>
      </div>
    );
  }

  const weeksToRace = athlete.goal_race_date
    ? Math.ceil((new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000))
    : null;

  const today = toLocalDateStr(new Date());
  const todayWorkout = thisWeekWorkouts.find(w => w.workout_date === today);

  // Build activities lookup by date (array per date)
  const activitiesByDate = {};
  for (const s of strengthSessions) {
    if (!activitiesByDate[s.session_date]) activitiesByDate[s.session_date] = [];
    activitiesByDate[s.session_date].push(s);
  }
  const todayActivities = activitiesByDate[today] || [];

  // Compute date string for each day slot (Mon=0 .. Sun=6)
  const monday = getMonday(new Date());
  const weekDateStrs = DAY_NAMES.map((_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return toLocalDateStr(d);
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="font-display text-3xl sm:text-4xl text-volt">MY TRAINING</h1>
        <p className="text-smoke uppercase tracking-wider text-xs sm:text-sm mt-1">
          {athlete.goal_race} | {weeksToRace != null ? `${weeksToRace} weeks to race` : 'No race set'}
        </p>
      </div>

      {/* Profile Completion Banner */}
      {(() => {
        const onboarding = getOverallProgress(athlete);
        if (onboarding.isComplete) return null;
        return (
          <Link
            to="/my-profile"
            className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-5 py-3 sm:py-4 mb-6 border border-volt bg-volt/5 hover:bg-volt/10 transition-colors gap-2 sm:gap-3"
          >
            <div className="flex items-center gap-3">
              <User size={20} className="text-volt flex-shrink-0" />
              <div>
                <p className="font-bold uppercase text-sm">Complete Your Profile</p>
                <p className="text-smoke text-xs">{onboarding.completed}/{onboarding.total} sections done</p>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-8 sm:ml-0">
              <div className="w-24 h-2 bg-ash">
                <div className="h-2 bg-volt" style={{ width: `${onboarding.percent}%` }} />
              </div>
              <span className="text-volt text-xs font-bold uppercase">{onboarding.percent}%</span>
            </div>
          </Link>
        );
      })()}

      {/* Daily Check-in Banner */}
      {!todayCheckedIn && (
        <Link
          to="/readiness"
          className="flex items-center justify-between px-5 py-4 mb-6 border border-volt/50 bg-volt/5 hover:bg-volt/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck size={20} className="text-volt" />
            <div>
              <p className="font-bold uppercase text-sm">Daily Check-in</p>
              <p className="text-smoke text-xs">How are you feeling today? Log your readiness.</p>
            </div>
          </div>
          <span className="text-volt text-xs font-bold uppercase">CHECK IN →</span>
        </Link>
      )}

      {todayCheckedIn && (
        <div className="flex items-center gap-3 px-5 py-3 mb-6 border border-ash bg-steel/30">
          <Check size={16} className="text-green-400" />
          <span className="text-sm text-smoke">
            Today's readiness: <span className={`font-bold ${
              todayCheckedIn.composite_score >= 3.5 ? 'text-green-400' :
              todayCheckedIn.composite_score >= 2.5 ? 'text-yellow-400' : 'text-red-400'
            }`}>{parseFloat(todayCheckedIn.composite_score).toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* Today's workout highlight */}
      {todayWorkout && todayWorkout.workout_type !== 'rest' && (
        <div className={`border-l-4 ${WORKOUT_COLORS[todayWorkout.workout_type] || ''} p-4 sm:p-6 mb-6 sm:mb-8`}>
          <p className="text-smoke text-xs uppercase tracking-wider mb-1">TODAY</p>
          <h2 className="font-display text-xl sm:text-2xl text-volt">{safeStr(todayWorkout.title)}</h2>
          <div className="flex flex-wrap gap-3 sm:gap-6 mt-3">
            {todayWorkout.distance_km && <span className="text-lg font-bold">{todayWorkout.distance_km}km</span>}
            {todayWorkout.duration_minutes && <span className="text-smoke">{formatTime(Math.round(todayWorkout.duration_minutes * 60))}</span>}
            {todayWorkout.pace_range_min && todayWorkout.pace_range_max && (
              <span className="text-smoke">{formatPace(todayWorkout.pace_range_min)}-{formatPace(todayWorkout.pace_range_max)} /km</span>
            )}
          </div>
          {todayWorkout.description && <p className="text-sm mt-3">{normalizeDescriptionPace(safeStr(todayWorkout.description), todayWorkout)}</p>}
          {todayWorkout.coach_notes && <p className="text-volt text-sm mt-2">Coach: {safeStr(todayWorkout.coach_notes)}</p>}

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            {todayWorkout.status !== 'completed' && (
              <button onClick={() => markCompleted(todayWorkout.id)} className="btn-primary flex items-center justify-center gap-2">
                <Check size={16} />
                MARK COMPLETED
              </button>
            )}
            <button
              onClick={() => setFeedbackWorkout(todayWorkout)}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <BarChart3 size={16} />
              {workoutFeedbacks[todayWorkout.id] ? 'EDIT FEEDBACK' : 'LOG FEEDBACK'}
            </button>
          </div>
        </div>
      )}

      {/* Today's logged activities */}
      {todayActivities.map((act) => {
        const ac = getActivityColors(act.activity_type);
        const isRunType = ['easy_run', 'long_run', 'race'].includes(act.activity_type);
        return (
          <div
            key={act.id}
            className={`border-l-4 ${ac.border} ${ac.bg} p-4 sm:p-6 mb-4 cursor-pointer hover:brightness-125 transition-all`}
            onClick={() => setSelectedActivity(act)}
          >
            <p className="text-smoke text-xs uppercase tracking-wider mb-1">TODAY — {ac.label.toUpperCase()}</p>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold ${ac.text}`}>
                {isRunType && act.distance_km ? `${act.distance_km}km` : `${act.duration_minutes}min`}
              </span>
              {isRunType && act.avg_pace_sec && (
                <span className="text-smoke">{formatPaceFromSec(act.avg_pace_sec)}/km</span>
              )}
              {!isRunType && <span className={`${ac.text} capitalize`}>{act.intensity}</span>}
            </div>
          </div>
        );
      })}

      {/* This week */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl">THIS WEEK</h2>
        <button
          onClick={() => { setEditingStrength(null); setShowStrengthModal(true); }}
          className="px-3 py-2 border border-volt text-volt hover:bg-volt/20 text-xs uppercase font-bold tracking-wider transition-colors flex items-center gap-1"
        >
          <Plus size={14} /> Log Activity
        </button>
      </div>

      {/* Mobile: stacked list */}
      <div className="sm:hidden space-y-2 mb-8">
        {DAY_NAMES.map((day, i) => {
          const dateStr = weekDateStrs[i];
          const workout = thisWeekWorkouts.find(w => w.workout_date === dateStr);
          const dayActivities = activitiesByDate[dateStr] || [];

          const isTodayRow = dateStr === today;
          const colors = workout ? (WORKOUT_COLORS[workout.workout_type] || 'border-ash bg-ash/20') : 'border-ash/50';
          const hasFeedback = workout && workoutFeedbacks[workout.id];

          return (
            <div key={i} className="space-y-0.5">
              <div
                className={`border-l-4 p-3 ${colors} ${isTodayRow ? 'ring-1 ring-volt' : ''} flex items-center justify-between gap-3 ${workout ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}
                onClick={() => workout && setSelectedWorkout(workout)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <p className={`text-xs font-bold w-8 flex-shrink-0 ${isTodayRow ? 'text-volt' : 'text-smoke'}`}>{day}</p>
                  {workout ? (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold uppercase truncate">{safeStr(workout.title)}</p>
                        {workout.distance_km && <span className="text-volt text-xs font-display flex-shrink-0">{workout.distance_km}KM</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {workout.status === 'completed' && (
                          <span className="text-green-400 text-[10px] font-semibold">DONE</span>
                        )}
                        {hasFeedback && (
                          <span className="text-volt text-[10px]">RPE {hasFeedback.rpe}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-smoke/50 text-xs">Rest</p>
                  )}
                </div>
              {workout && (
                <div className="flex gap-2 flex-shrink-0">
                  {workout.status !== 'completed' && (
                    <button onClick={(e) => { e.stopPropagation(); markCompleted(workout.id); }} className="text-smoke hover:text-green-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
                      <Check size={16} />
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setFeedbackWorkout(workout); }} className="text-smoke hover:text-volt min-h-[44px] min-w-[44px] flex items-center justify-center" title="Log feedback">
                    <BarChart3 size={16} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setNoteWorkout(workout); setNoteText(workout.athlete_notes || ''); }} className="text-smoke hover:text-volt min-h-[44px] min-w-[44px] flex items-center justify-center">
                    <MessageSquare size={16} />
                  </button>
                </div>
              )}
            </div>
              {dayActivities.map((act) => {
                const ac = getActivityColors(act.activity_type);
                const isRunType = ['easy_run', 'long_run', 'race'].includes(act.activity_type);
                return (
                  <div
                    key={act.id}
                    onClick={() => setSelectedActivity(act)}
                    className={`border-l-4 ${ac.border} ${ac.bg} p-2 flex items-center gap-2 cursor-pointer hover:brightness-125 transition-all`}
                  >
                    <span className={`${ac.text} text-xs font-bold uppercase`}>{ac.label}</span>
                    <span className="text-white text-xs">
                      {isRunType && act.distance_km ? `${act.distance_km}km` : `${act.duration_minutes}min`}
                    </span>
                    {isRunType && act.avg_pace_sec && (
                      <span className="text-smoke text-xs">{formatPaceFromSec(act.avg_pace_sec)}/km</span>
                    )}
                    {!isRunType && <span className={`${ac.text} text-xs capitalize`}>{act.intensity}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Desktop: 7 column grid */}
      <div className="hidden sm:grid grid-cols-7 gap-2 mb-8">
        {DAY_NAMES.map((day, i) => {
          const dateStr = weekDateStrs[i];
          const workout = thisWeekWorkouts.find(w => w.workout_date === dateStr);
          const dayActivities = activitiesByDate[dateStr] || [];

          const isTodayCol = dateStr === today;
          const colors = workout ? (WORKOUT_COLORS[workout.workout_type] || 'border-ash bg-ash/20') : 'border-ash/50';
          const hasFeedback = workout && workoutFeedbacks[workout.id];

          return (
            <div
              key={i}
              className={`border-l-4 p-3 min-h-[140px] ${colors} ${isTodayCol ? 'ring-1 ring-volt' : ''} ${workout ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}
              onClick={() => workout && setSelectedWorkout(workout)}
            >
              <p className={`text-xs font-bold mb-2 ${isTodayCol ? 'text-volt' : 'text-smoke'}`}>{day}</p>
              {workout ? (
                <>
                  <p className="text-xs font-bold uppercase">{safeStr(workout.title)}</p>
                  {workout.distance_km && <p className="text-volt text-sm font-display mt-1">{workout.distance_km}KM</p>}
                  {workout.status === 'completed' && (
                    <div className="flex items-center gap-1 mt-2">
                      <Check size={10} className="text-green-400" />
                      <span className="text-green-400 text-xs">DONE</span>
                    </div>
                  )}
                  {hasFeedback && (
                    <div className="flex items-center gap-1 mt-1">
                      <BarChart3 size={10} className="text-volt" />
                      <span className="text-volt text-[10px]">RPE {hasFeedback.rpe}</span>
                    </div>
                  )}
                  <div className="flex gap-1 mt-2">
                    {workout.status !== 'completed' && (
                      <button onClick={(e) => { e.stopPropagation(); markCompleted(workout.id); }} className="text-smoke hover:text-green-400">
                        <Check size={12} />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setFeedbackWorkout(workout); }} className="text-smoke hover:text-volt" title="Log feedback">
                      <BarChart3 size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setNoteWorkout(workout); setNoteText(workout.athlete_notes || ''); }} className="text-smoke hover:text-volt">
                      <MessageSquare size={12} />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-smoke/50 text-xs">—</p>
              )}

              {/* Logged activity blocks */}
              {dayActivities.map((act) => {
                const ac = getActivityColors(act.activity_type);
                const isRunType = ['easy_run', 'long_run', 'race'].includes(act.activity_type);
                return (
                  <div
                    key={act.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedActivity(act); }}
                    className={`mt-2 ${ac.bg} border-l-2 ${ac.border} px-2 py-1 cursor-pointer hover:brightness-125 transition-all`}
                  >
                    <span className={`${ac.text} text-[10px] font-bold uppercase`}>{ac.abbrev}</span>
                    <p className="text-white text-[10px] mt-0.5">
                      {isRunType && act.distance_km ? `${act.distance_km}km` : `${act.duration_minutes}m`}
                      {!isRunType && <span className={`${ac.text} capitalize ml-1`}>{act.intensity}</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Workout detail panel */}
      {selectedWorkout && (
        <WorkoutDetailPanel
          workout={selectedWorkout}
          athlete={athlete}
          isCoach={false}
          planStatus={plan?.status}
          onClose={() => setSelectedWorkout(null)}
          onFeedback={() => { setFeedbackWorkout(selectedWorkout); setSelectedWorkout(null); }}
        />
      )}

      {/* Activity detail panel */}
      {selectedActivity && (
        <ActivityDetailPanel
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
          onEdit={() => {
            setEditingStrength(selectedActivity);
            setShowStrengthModal(true);
            setSelectedActivity(null);
          }}
          onDelete={async () => {
            try {
              await api.deleteStrengthSession(selectedActivity.id);
              setSelectedActivity(null);
              loadMyData();
            } catch (err) { console.error(err); }
          }}
        />
      )}

      {/* Note modal */}
      {noteWorkout && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <h3 className="font-display text-lg mb-4">ADD NOTE — {safeStr(noteWorkout.title)}</h3>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className="input-field h-32 resize-none mb-4"
              placeholder="How did the workout feel? Any issues?"
            />
            <div className="flex gap-3">
              <button onClick={saveNote} className="btn-primary flex-1">SAVE NOTE</button>
              <button onClick={() => setNoteWorkout(null)} className="btn-ghost">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback modal */}
      {feedbackWorkout && (
        <WorkoutFeedbackModal
          workout={feedbackWorkout}
          onClose={() => setFeedbackWorkout(null)}
          onSaved={loadMyData}
        />
      )}

      {/* Strength Session Modal */}
      {showStrengthModal && (
        <StrengthSessionModal
          initialDate={today}
          existingSession={editingStrength}
          onClose={() => { setShowStrengthModal(false); setEditingStrength(null); }}
          onSaved={() => {
            setShowStrengthModal(false);
            setEditingStrength(null);
            loadMyData();
          }}
        />
      )}

      {/* Paces reference */}
      <div className="card">
        <h2 className="font-display text-xl mb-4">MY TRAINING PACES</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4 text-center">
          <div>
            <p className="text-smoke text-xs uppercase">Easy</p>
            <p className="text-green-400 font-semibold">{formatPace(athlete.pace_easy_min)}-{formatPace(athlete.pace_easy_max)}</p>
          </div>
          <div>
            <p className="text-smoke text-xs uppercase">Tempo</p>
            <p className="text-yellow-400 font-semibold">{formatPace(athlete.pace_tempo)}</p>
          </div>
          <div>
            <p className="text-smoke text-xs uppercase">Threshold</p>
            <p className="text-orange-400 font-semibold">{formatPace(athlete.pace_lt)}</p>
          </div>
          <div>
            <p className="text-smoke text-xs uppercase">Race</p>
            <p className="text-red-400 font-semibold">{formatPace(athlete.pace_race)}</p>
          </div>
          <div>
            <p className="text-smoke text-xs uppercase">Interval</p>
            <p className="text-volt font-semibold">{formatPace(athlete.pace_vo2max)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
