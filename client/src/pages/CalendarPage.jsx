import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatPace, formatTime } from '../lib/vdot';
import { useAuth } from '../context/AuthContext';
import WorkoutFeedbackModal from '../components/athletes/WorkoutFeedbackModal';
import WorkoutDetailPanel from '../components/WorkoutDetailPanel';
import ActivityDetailPanel from '../components/ActivityDetailPanel';
import StrengthSessionModal from '../components/StrengthSessionModal';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Check, X, Edit3, Save,
  Calendar as CalendarIcon, LayoutGrid, Flag, MessageSquare, Plus, RefreshCw, Loader,
} from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addWeeks, subWeeks, format, isSameMonth,
  isToday, isSameDay, parseISO,
} from 'date-fns';

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

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function getColors(type) {
  return WORKOUT_COLORS[type] || WORKOUT_COLORS.rest;
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

export default function CalendarPage() {
  const { athleteId: paramAthleteId } = useParams();
  const { isCoach } = useAuth();

  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [athlete, setAthlete] = useState(null);
  const [plan, setPlan] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [feedbackWorkout, setFeedbackWorkout] = useState(null);
  const [saving, setSaving] = useState(false);
  const [strengthSessions, setStrengthSessions] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showStrengthModal, setShowStrengthModal] = useState(false);
  const [strengthModalDate, setStrengthModalDate] = useState(null);
  const [editingStrength, setEditingStrength] = useState(null);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaMsg, setStravaMsg] = useState('');

  /* ─── Data loading ─── */
  useEffect(() => { loadData(); }, [paramAthleteId]);

  async function loadData() {
    try {
      const athleteData = paramAthleteId
        ? await api.getAthlete(paramAthleteId)
        : await api.getMyProfile();
      setAthlete(athleteData);

      const activePlan = athleteData.training_plans?.find(p => p.status === 'approved')
        || athleteData.training_plans?.[0];
      if (activePlan) {
        const planData = await api.getPlan(activePlan.id);
        setPlan(planData);
      }

      const monData = await api.getMonitoring(athleteData.id).catch(() => null);
      setMonitoring(monData);

      // Load strength sessions
      const sessions = await api.getStrengthSessions(athleteData.id).catch(() => []);
      setStrengthSessions(sessions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  /* ─── Build workout lookup by date ─── */
  const workoutsByDate = useMemo(() => {
    const map = {};
    if (!plan?.plan_weeks) return map;
    for (const week of plan.plan_weeks) {
      for (const w of week.workouts || []) {
        if (w.workout_date) {
          map[w.workout_date] = { ...w, phase: week.phase, week_number: week.week_number };
        }
      }
    }
    return map;
  }, [plan]);

  /* ─── Build activities lookup by date (array per date) ─── */
  const activitiesByDate = useMemo(() => {
    const map = {};
    for (const s of strengthSessions) {
      if (!map[s.session_date]) map[s.session_date] = [];
      map[s.session_date].push(s);
    }
    return map;
  }, [strengthSessions]);

  /* ─── Week helpers ─── */
  const getWeekStart = useCallback((date) => {
    return startOfWeek(date, { weekStartsOn: 1 });
  }, []);

  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate, getWeekStart]);

  // Compute 7 days of current week
  const weekDates = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(weekStart.valueOf() + i * 86400000));
    }
    return days;
  }, [weekStart]);

  /* ─── Current week plan data ─── */
  const currentWeekData = useMemo(() => {
    if (!plan?.plan_weeks?.length || !weekDates.length) return null;
    const firstDay = format(weekDates[0], 'yyyy-MM-dd');
    // Find the plan week that contains the first day of the displayed week
    for (const w of plan.plan_weeks) {
      // Match by workout dates (generated weeks) or start_date (skeleton weeks)
      if (w.start_date === firstDay) return w;
      for (const wo of w.workouts || []) {
        if (wo.workout_date === firstDay) return w;
      }
    }
    return null;
  }, [plan, weekDates]);

  /* ─── Month helpers ─── */
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  /* ─── Week summary stats ─── */
  const weekSummary = useMemo(() => {
    let plannedKm = 0, completedKm = 0, plannedMin = 0, completedMin = 0;
    const dates = view === 'week' ? weekDates : [];

    // For week view, sum from the 7 visible days
    if (view === 'week') {
      for (const d of dates) {
        const key = format(d, 'yyyy-MM-dd');
        const w = workoutsByDate[key];
        if (!w || w.workout_type === 'rest') continue;
        plannedKm += w.distance_km || 0;
        plannedMin += w.duration_minutes || 0;
        if (w.status === 'completed') {
          completedKm += w.actual_distance_km || w.distance_km || 0;
          completedMin += w.actual_duration_minutes || w.duration_minutes || 0;
        }
      }
    }

    const acwrObj = monitoring?.acwr;
    const acwrRatio = typeof acwrObj === 'number' ? acwrObj : acwrObj?.ratio ?? null;
    const acwrZone = acwrObj?.zone || (acwrRatio == null ? null : acwrRatio < 0.8 ? 'low' : acwrRatio > 1.3 ? 'red' : acwrRatio > 1.1 ? 'amber' : 'green');

    return { plannedKm, completedKm, plannedMin, completedMin, acwr: acwrRatio, acwrZone };
  }, [view, weekDates, workoutsByDate, monitoring]);

  /* ─── Race date ─── */
  const raceDate = plan?.race_date ? parseISO(plan.race_date) : null;

  /* ─── Navigation ─── */
  function goToday() { setCurrentDate(new Date()); }
  function goRaceDay() { if (raceDate) setCurrentDate(raceDate); }
  function goPrev() { setCurrentDate(d => view === 'week' ? subWeeks(d, 1) : subMonths(d, 1)); }
  function goNext() { setCurrentDate(d => view === 'week' ? addWeeks(d, 1) : addMonths(d, 1)); }

  /* ─── Pace format helpers ─── */
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

  /* ─── Coach edit ─── */
  function startEdit(workout) {
    setEditingWorkout(workout);
    setEditForm({
      title: safeStr(workout.title),
      workout_type: workout.workout_type || 'easy',
      distance_km: workout.distance_km || '',
      duration_minutes: workout.duration_minutes || '',
      pace_from: secToMmss(workout.pace_range_min),
      pace_to: secToMmss(workout.pace_range_max),
      hr_zone: safeStr(workout.hr_zone),
      description: safeStr(workout.description),
      coach_notes: safeStr(workout.coach_notes),
    });
  }

  async function saveEdit() {
    if (!editingWorkout) return;
    setSaving(true);
    try {
      const data = {
        title: editForm.title,
        workout_type: editForm.workout_type,
        distance_km: editForm.distance_km ? parseFloat(editForm.distance_km) : null,
        duration_minutes: editForm.duration_minutes ? parseInt(editForm.duration_minutes) : null,
        pace_range_min: mmssToSec(editForm.pace_from),
        pace_range_max: mmssToSec(editForm.pace_to),
        hr_zone: editForm.hr_zone || null,
        description: editForm.description,
        coach_notes: editForm.coach_notes,
      };
      await api.updateWorkout(editingWorkout.id, data);
      setEditingWorkout(null);
      setSelectedWorkout(null);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() { setEditingWorkout(null); }

  /* ─── Render ─── */
  if (loading) return <div className="text-volt font-display text-xl animate-pulse">LOADING CALENDAR...</div>;

  const backUrl = paramAthleteId ? `/athletes/${paramAthleteId}` : '/my-plan';
  const backLabel = paramAthleteId ? athlete?.profiles?.full_name || 'Back' : 'My Plan';

  if (!plan) {
    return (
      <div>
        <Link to={backUrl} className="flex items-center gap-2 text-smoke hover:text-volt text-sm uppercase tracking-wider mb-6">
          <ArrowLeft size={16} /> {backLabel}
        </Link>
        <div className="card text-center py-12">
          <p className="text-smoke text-lg uppercase">No training plan found</p>
          {paramAthleteId && (
            <Link to={`/athletes/${paramAthleteId}`} className="btn-primary mt-4 inline-block">GENERATE A PLAN</Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link to={backUrl} className="flex items-center gap-2 text-smoke hover:text-volt text-sm uppercase tracking-wider mb-6 transition-colors">
        <ArrowLeft size={16} /> {backLabel}
      </Link>

      {/* ─── Navigation bar ─── */}
      <div className="flex flex-col gap-3 sm:gap-4 mb-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl sm:text-3xl text-volt">TRAINING CALENDAR</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex border border-ash">
            <button
              onClick={() => setView('week')}
              className={`px-3 py-2 text-xs uppercase font-bold tracking-wider transition-colors min-h-[44px] ${view === 'week' ? 'bg-volt text-carbon' : 'text-smoke hover:text-white'}`}
            >
              <span className="flex items-center gap-1"><CalendarIcon size={14} /> Week</span>
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-3 py-2 text-xs uppercase font-bold tracking-wider transition-colors min-h-[44px] ${view === 'month' ? 'bg-volt text-carbon' : 'text-smoke hover:text-white'}`}
            >
              <span className="flex items-center gap-1"><LayoutGrid size={14} /> Month</span>
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="p-2 border border-ash hover:border-volt text-smoke hover:text-volt transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
              <ChevronLeft size={18} />
            </button>
            <button onClick={goToday} className="px-3 py-2 border border-ash hover:border-volt text-smoke hover:text-volt text-xs uppercase font-bold tracking-wider transition-colors min-h-[44px]">
              Today
            </button>
            <button onClick={goNext} className="p-2 border border-ash hover:border-volt text-smoke hover:text-volt transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
              <ChevronRight size={18} />
            </button>
          </div>

          {raceDate && (
            <button onClick={goRaceDay} className="px-3 py-2 border border-volt text-volt hover:bg-volt hover:text-carbon text-xs uppercase font-bold tracking-wider transition-colors flex items-center gap-1 min-h-[44px]">
              <Flag size={14} /> Race Day
            </button>
          )}
          {!isCoach && (
            <button
              onClick={() => { setStrengthModalDate(null); setEditingStrength(null); setShowStrengthModal(true); }}
              className="px-3 py-2 border border-volt text-volt hover:bg-volt/20 text-xs uppercase font-bold tracking-wider transition-colors flex items-center gap-1 min-h-[44px]"
            >
              <Plus size={14} /> Log Activity
            </button>
          )}
          {athlete?.strava_athlete_id && (
            <button
              onClick={async () => {
                setStravaSyncing(true);
                setStravaMsg('');
                try {
                  const result = await api.stravaSync(athlete.id);
                  setStravaMsg(`Synced ${result.synced} activities`);
                  loadData(); // refresh calendar
                  setTimeout(() => setStravaMsg(''), 4000);
                } catch (err) {
                  setStravaMsg(err.message || 'Sync failed');
                  setTimeout(() => setStravaMsg(''), 4000);
                } finally {
                  setStravaSyncing(false);
                }
              }}
              disabled={stravaSyncing}
              className="px-3 py-2 border border-orange-500 text-orange-400 hover:bg-orange-500/20 text-xs uppercase font-bold tracking-wider transition-colors flex items-center gap-1 min-h-[44px]"
            >
              {stravaSyncing ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync Strava
            </button>
          )}
        </div>
        {stravaMsg && (
          <div className={`text-xs px-3 py-1 mt-1 ${stravaMsg.includes('Synced') ? 'text-green-400' : 'text-red-400'}`}>
            {stravaMsg}
          </div>
        )}
      </div>

      {/* Period label + phase */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 px-1">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="font-display text-base sm:text-lg">
            {view === 'week'
              ? `${format(weekDates[0], 'MMM d')} — ${format(weekDates[6], 'MMM d, yyyy')}`
              : format(currentDate, 'MMMM yyyy').toUpperCase()
            }
          </span>
          {view === 'week' && currentWeekData?.phase && (
            <span className="badge">{currentWeekData.phase.toUpperCase()}</span>
          )}
          {view === 'week' && currentWeekData && (
            <span className="text-smoke text-xs sm:text-sm">Wk {currentWeekData.week_number}</span>
          )}
        </div>
        {view === 'week' && currentWeekData?.total_km && (
          <span className="text-volt font-display text-sm sm:text-base">{currentWeekData.total_km}KM</span>
        )}
      </div>

      {/* ─── Skeleton Week Banner ─── */}
      {view === 'week' && currentWeekData && !currentWeekData.is_generated && (
        <div className="border-2 border-dashed border-ash/50 p-6 mb-6 text-center">
          <h3 className="font-display text-lg text-volt mb-1">
            WEEK {currentWeekData.week_number} — {(currentWeekData.phase || '').toUpperCase()} PHASE
          </h3>
          <p className="text-volt font-display text-2xl mb-2">{currentWeekData.km_target || '—'}KM TARGET</p>
          <p className="text-smoke text-sm">Workouts have not been generated for this week yet.</p>
        </div>
      )}

      {/* ─── Week Summary Bar ─── */}
      {view === 'week' && (!currentWeekData || currentWeekData.is_generated) && (
        <div className="border border-ash bg-steel/30 p-3 sm:p-4 mb-6">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-3 sm:gap-6 text-sm">
            <div>
              <span className="text-smoke uppercase text-[10px] sm:text-xs tracking-wider block sm:inline">Planned</span>
              <span className="sm:ml-2 font-semibold block sm:inline">{weekSummary.plannedKm.toFixed(1)} km</span>
            </div>
            <div>
              <span className="text-smoke uppercase text-[10px] sm:text-xs tracking-wider block sm:inline">Completed</span>
              <span className="sm:ml-2 text-green-400 font-semibold block sm:inline">{weekSummary.completedKm.toFixed(1)} km</span>
            </div>
            {weekSummary.acwr != null && (
              <div>
                <span className="text-smoke uppercase text-[10px] sm:text-xs tracking-wider block sm:inline">ACWR</span>
                <span className={`sm:ml-2 font-bold block sm:inline ${
                  weekSummary.acwrZone === 'green' ? 'text-green-400' :
                  weekSummary.acwrZone === 'amber' ? 'text-yellow-400' :
                  weekSummary.acwrZone === 'red' ? 'text-red-400' : 'text-blue-400'
                }`}>
                  {typeof weekSummary.acwr === 'number' ? weekSummary.acwr.toFixed(2) : weekSummary.acwr}
                </span>
              </div>
            )}
            {weekSummary.plannedKm > 0 && (
              <div className="col-span-2 sm:flex-1 sm:min-w-[120px]">
                <div className="w-full bg-ash h-2">
                  <div
                    className="bg-green-500 h-2 transition-all"
                    style={{ width: `${Math.min(100, (weekSummary.completedKm / weekSummary.plannedKm) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Week View ─── */}
      {view === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-3 mb-6">
          {weekDates.map((date, i) => {
            const key = format(date, 'yyyy-MM-dd');
            const workout = workoutsByDate[key];
            const colors = workout ? getColors(workout.workout_type) : getColors('rest');
            const today = isToday(date);
            const isRace = raceDate && isSameDay(date, raceDate);

            return (
              <div
                key={key}
                onClick={() => workout && setSelectedWorkout(workout)}
                className={`border-l-4 ${colors.border} ${colors.bg} p-3 sm:p-4 min-h-[80px] sm:min-h-[180px] cursor-pointer hover:bg-white/5 transition-colors
                  ${today ? 'ring-2 ring-volt ring-inset' : ''}
                  ${isRace ? 'ring-2 ring-volt' : ''}
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-smoke text-xs font-bold">{DAY_NAMES[i]}</span>
                  <span className={`text-xs ${today ? 'text-volt font-bold' : 'text-smoke'}`}>
                    {format(date, 'MMM d')}
                  </span>
                </div>

                {workout ? (
                  <>
                    <p className={`text-xs font-bold uppercase ${colors.text}`}>
                      {getColors(workout.workout_type).label}
                    </p>
                    <p className="text-white text-sm font-semibold mt-1 line-clamp-2">{safeStr(workout.title)}</p>

                    {workout.distance_km > 0 && (
                      <p className="text-volt text-lg font-display mt-2">{workout.distance_km}KM</p>
                    )}
                    {workout.pace_range_min && workout.pace_range_max && (
                      <p className="text-smoke text-xs mt-1">
                        {formatPace(workout.pace_range_min)}-{formatPace(workout.pace_range_max)}/km
                      </p>
                    )}
                    {workout.duration_minutes > 0 && (
                      <p className="text-smoke text-xs mt-1">{formatTime(Math.round(workout.duration_minutes * 60))}</p>
                    )}
                    {workout.status === 'completed' && (
                      <div className="flex items-center gap-1 mt-2">
                        <Check size={12} className="text-green-400" />
                        <span className="text-green-400 text-xs font-semibold">DONE</span>
                      </div>
                    )}
                    {workout.status === 'skipped' && (
                      <div className="flex items-center gap-1 mt-2">
                        <X size={12} className="text-red-400" />
                        <span className="text-red-400 text-xs font-semibold">SKIPPED</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-smoke/50 text-xs uppercase mt-4">Rest</p>
                )}

                {/* Logged activity blocks */}
                {activitiesByDate[key]?.map((act) => {
                  const ac = getActivityColors(act.activity_type);
                  const isRunType = ['easy_run', 'long_run', 'race'].includes(act.activity_type);
                  return (
                    <div
                      key={act.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedActivity(act);
                      }}
                      className={`mt-2 ${ac.bg} border-l-2 ${ac.border} px-2 py-1.5 cursor-pointer hover:brightness-125 transition-all`}
                    >
                      <span className={`${ac.text} text-[10px] font-bold uppercase`}>{ac.label}</span>
                      <p className="text-white text-xs mt-0.5">
                        {isRunType && act.distance_km ? (
                          <>
                            {act.distance_km}km
                            {act.avg_pace_sec ? <span className="text-smoke ml-1">{formatPaceFromSec(act.avg_pace_sec)}/km</span> : null}
                          </>
                        ) : (
                          <>
                            {act.duration_minutes}min
                            <span className={`${ac.text} ml-1 capitalize`}>{act.intensity}</span>
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Month View ─── */}
      {view === 'month' && (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px sm:gap-1 mb-px sm:mb-1 min-w-[320px]">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-smoke text-[10px] sm:text-xs font-bold py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px sm:gap-1 mb-6 min-w-[320px]">
            {monthDays.map((date) => {
              const key = format(date, 'yyyy-MM-dd');
              const workout = workoutsByDate[key];
              const inMonth = isSameMonth(date, currentDate);
              const today = isToday(date);
              const colors = workout ? getColors(workout.workout_type) : null;
              const isRace = raceDate && isSameDay(date, raceDate);

              return (
                <div
                  key={key}
                  onClick={() => workout && setSelectedWorkout(workout)}
                  className={`p-1 sm:p-2 min-h-[52px] sm:min-h-[90px] border border-ash/30 transition-colors
                    ${inMonth ? 'bg-steel/20' : 'bg-carbon/50 opacity-40'}
                    ${today ? 'ring-1 ring-volt ring-inset' : ''}
                    ${workout ? 'cursor-pointer hover:bg-white/5' : ''}
                  `}
                >
                  <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                    <span className={`text-[10px] sm:text-xs ${today ? 'text-volt font-bold' : 'text-smoke'}`}>
                      {format(date, 'd')}
                    </span>
                    {isRace && <Flag size={8} className="text-volt sm:w-[10px] sm:h-[10px]" />}
                  </div>

                  {workout && workout.workout_type !== 'rest' && (
                    <div className={`${colors.bg} border-l-2 ${colors.border} px-0.5 sm:px-1.5 py-0.5 sm:py-1`}>
                      <p className={`text-[8px] sm:text-[10px] font-bold uppercase ${colors.text} truncate`}>
                        {colors.label}
                      </p>
                      {workout.distance_km > 0 && (
                        <p className="text-white text-[8px] sm:text-[10px] font-semibold hidden sm:block">{workout.distance_km}km</p>
                      )}
                      {workout.status === 'completed' && (
                        <Check size={8} className="text-green-400 mt-0.5 hidden sm:block" />
                      )}
                    </div>
                  )}

                  {activitiesByDate[key]?.map((act) => {
                    const ac = getActivityColors(act.activity_type);
                    const isRunType = ['easy_run', 'long_run', 'race'].includes(act.activity_type);
                    return (
                      <div
                        key={act.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedActivity(act);
                        }}
                        className={`${ac.bg} border-l-2 ${ac.border} px-0.5 sm:px-1.5 py-0.5 sm:py-1 mt-0.5 cursor-pointer`}
                      >
                        <span className={`text-[8px] sm:text-[10px] font-bold uppercase ${ac.text}`}>{ac.abbrev}</span>
                        <p className="text-white text-[8px] sm:text-[10px] hidden sm:block">
                          {isRunType && act.distance_km ? `${act.distance_km}km` : `${act.duration_minutes}m`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Workout Detail Panel ─── */}
      {selectedWorkout && !editingWorkout && (
        <WorkoutDetailPanel
          workout={selectedWorkout}
          athlete={athlete}
          isCoach={isCoach}
          planStatus={plan?.status}
          onClose={() => setSelectedWorkout(null)}
          onEdit={() => startEdit(selectedWorkout)}
          onFeedback={() => setFeedbackWorkout(selectedWorkout)}
        />
      )}

      {/* ─── Activity Detail Panel ─── */}
      {selectedActivity && (
        <ActivityDetailPanel
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
          onEdit={() => {
            setEditingStrength(selectedActivity);
            setStrengthModalDate(selectedActivity.session_date);
            setShowStrengthModal(true);
            setSelectedActivity(null);
          }}
          onDelete={async () => {
            try {
              await api.deleteStrengthSession(selectedActivity.id);
              setSelectedActivity(null);
              loadData();
            } catch (err) { console.error(err); }
          }}
        />
      )}

      {/* ─── Coach Edit Modal ─── */}
      {editingWorkout && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl flex items-center gap-2">
                <Edit3 size={18} className="text-volt" /> EDIT WORKOUT
              </h2>
              <button onClick={cancelEdit} className="text-smoke hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Workout Name */}
              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Workout Name</label>
                <input
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. Easy Base Run"
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Type</label>
                <select
                  value={editForm.workout_type}
                  onChange={e => setEditForm(f => ({ ...f, workout_type: e.target.value }))}
                  className="input-field"
                >
                  <optgroup label="Running">
                    <option value="easy">Easy Run</option>
                    <option value="long_run">Long Run</option>
                    <option value="tempo">Tempo</option>
                    <option value="intervals">Intervals</option>
                    <option value="race_pace">Race Pace</option>
                    <option value="recovery">Recovery</option>
                    <option value="race">Race Day</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="rest">Rest</option>
                    <option value="cross_training">Cross Training</option>
                    <option value="strength">Strength</option>
                    <option value="pilates">Pilates</option>
                    <option value="cycling">Cycling</option>
                    <option value="swimming">Swimming</option>
                    <option value="walking">Walking</option>
                    <option value="other">Other</option>
                  </optgroup>
                </select>
              </div>

              {/* Distance + Duration side by side */}
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

              {/* Pace Range */}
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

              {/* HR Zone */}
              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">HR Zone</label>
                <select
                  value={editForm.hr_zone}
                  onChange={e => setEditForm(f => ({ ...f, hr_zone: e.target.value }))}
                  className="input-field"
                >
                  <option value="">—</option>
                  {['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>

              {/* Description */}
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

              {/* Coach Notes */}
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

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={saveEdit} disabled={saving}
                  className="px-4 py-2 bg-volt hover:bg-volt/80 text-carbon font-semibold text-sm transition-colors disabled:opacity-50 flex-1 uppercase tracking-wider flex items-center justify-center gap-2">
                  <Save size={14} /> {saving ? 'SAVING...' : 'SAVE CHANGES'}
                </button>
                <button onClick={cancelEdit} className="btn-ghost">
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Feedback Modal ─── */}
      {feedbackWorkout && (
        <WorkoutFeedbackModal
          workout={feedbackWorkout}
          onClose={() => setFeedbackWorkout(null)}
          onSaved={() => {
            setFeedbackWorkout(null);
            loadData();
          }}
        />
      )}

      {/* ─── Strength Session Modal ─── */}
      {showStrengthModal && (
        <StrengthSessionModal
          initialDate={strengthModalDate}
          existingSession={editingStrength}
          onClose={() => { setShowStrengthModal(false); setEditingStrength(null); }}
          onSaved={() => {
            setShowStrengthModal(false);
            setEditingStrength(null);
            loadData();
          }}
        />
      )}

      {/* ─── Week Overview Bar ─── */}
      {plan?.plan_weeks?.length > 1 && (
        <div className="flex gap-px sm:gap-0.5 mt-4 overflow-x-auto">
          {plan.plan_weeks.map((w, i) => {
            // Check if this plan week matches the currently displayed week
            const isActive = currentWeekData?.week_number === w.week_number;
            const isSkeleton = !w.is_generated;
            return (
              <button
                key={i}
                onClick={() => {
                  // Use start_date for skeleton weeks, workout date for generated
                  if (w.start_date) {
                    setCurrentDate(parseISO(w.start_date));
                    setView('week');
                  } else {
                    const firstWorkout = w.workouts?.[0];
                    if (firstWorkout?.workout_date) {
                      setCurrentDate(parseISO(firstWorkout.workout_date));
                      setView('week');
                    }
                  }
                }}
                className={`flex-1 h-2 transition-colors ${
                  isActive ? 'bg-volt' : isSkeleton ? 'bg-ash/30 hover:bg-ash/60' : 'bg-ash hover:bg-smoke'
                }`}
                title={`Week ${w.week_number} — ${w.phase}${isSkeleton ? ' (not generated)' : ''}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Sub-components (WorkoutDetailPanel) extracted to ../components/WorkoutDetailPanel.jsx */
