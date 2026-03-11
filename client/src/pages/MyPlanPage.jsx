import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { formatPace, formatTime, normalizeDescriptionPace } from '../lib/vdot';
import WorkoutFeedbackModal from '../components/athletes/WorkoutFeedbackModal';
import WorkoutDetailPanel from '../components/WorkoutDetailPanel';
import { Calendar, Check, Zap, MessageSquare, ClipboardCheck, BarChart3, User } from 'lucide-react';
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
          <h2 className="font-display text-xl sm:text-2xl text-volt">{todayWorkout.title}</h2>
          <div className="flex flex-wrap gap-3 sm:gap-6 mt-3">
            {todayWorkout.distance_km && <span className="text-lg font-bold">{todayWorkout.distance_km}km</span>}
            {todayWorkout.duration_minutes && <span className="text-smoke">{formatTime(Math.round(todayWorkout.duration_minutes * 60))}</span>}
            {todayWorkout.pace_range_min && todayWorkout.pace_range_max && (
              <span className="text-smoke">{formatPace(todayWorkout.pace_range_min)}-{formatPace(todayWorkout.pace_range_max)} /km</span>
            )}
          </div>
          {todayWorkout.description && <p className="text-sm mt-3">{normalizeDescriptionPace(todayWorkout.description, todayWorkout)}</p>}
          {todayWorkout.coach_notes && <p className="text-volt text-sm mt-2">Coach: {todayWorkout.coach_notes}</p>}

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

      {/* This week */}
      <h2 className="font-display text-xl mb-4">THIS WEEK</h2>

      {/* Mobile: stacked list */}
      <div className="sm:hidden space-y-2 mb-8">
        {DAY_NAMES.map((day, i) => {
          const workout = thisWeekWorkouts.find(w => {
            const d = new Date(w.workout_date + 'T00:00:00');
            return d.getDay() === (i === 6 ? 0 : i + 1);
          });

          const isToday = workout?.workout_date === today;
          const colors = workout ? (WORKOUT_COLORS[workout.workout_type] || 'border-ash bg-ash/20') : 'border-ash/50';
          const hasFeedback = workout && workoutFeedbacks[workout.id];

          return (
            <div
              key={i}
              className={`border-l-4 p-3 ${colors} ${isToday ? 'ring-1 ring-volt' : ''} flex items-center justify-between gap-3 ${workout ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}
              onClick={() => workout && setSelectedWorkout(workout)}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <p className={`text-xs font-bold w-8 flex-shrink-0 ${isToday ? 'text-volt' : 'text-smoke'}`}>{day}</p>
                {workout ? (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold uppercase truncate">{workout.title}</p>
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
          );
        })}
      </div>

      {/* Desktop: 7 column grid */}
      <div className="hidden sm:grid grid-cols-7 gap-2 mb-8">
        {DAY_NAMES.map((day, i) => {
          const workout = thisWeekWorkouts.find(w => {
            const d = new Date(w.workout_date + 'T00:00:00');
            return d.getDay() === (i === 6 ? 0 : i + 1);
          });

          const isToday = workout?.workout_date === today;
          const colors = workout ? (WORKOUT_COLORS[workout.workout_type] || 'border-ash bg-ash/20') : 'border-ash/50';
          const hasFeedback = workout && workoutFeedbacks[workout.id];

          return (
            <div
              key={i}
              className={`border-l-4 p-3 min-h-[140px] ${colors} ${isToday ? 'ring-1 ring-volt' : ''} ${workout ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}
              onClick={() => workout && setSelectedWorkout(workout)}
            >
              <p className={`text-xs font-bold mb-2 ${isToday ? 'text-volt' : 'text-smoke'}`}>{day}</p>
              {workout ? (
                <>
                  <p className="text-xs font-bold uppercase">{workout.title}</p>
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

      {/* Note modal */}
      {noteWorkout && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <h3 className="font-display text-lg mb-4">ADD NOTE — {noteWorkout.title}</h3>
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
