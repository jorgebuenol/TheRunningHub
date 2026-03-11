import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatPace } from '../lib/vdot';
import { useAuth } from '../context/AuthContext';
import WorkoutFeedbackModal from '../components/athletes/WorkoutFeedbackModal';
import WorkoutDetailPanel from '../components/WorkoutDetailPanel';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Check, X, Edit3, Save,
  Calendar as CalendarIcon, LayoutGrid, Flag, MessageSquare,
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

  /* ─── Coach edit ─── */
  function startEdit(workout) {
    setEditingWorkout(workout);
    setEditForm({
      title: workout.title || '',
      workout_type: workout.workout_type || 'easy',
      distance_km: workout.distance_km || '',
      duration_minutes: workout.duration_minutes || '',
      pace_range_min: workout.pace_range_min || '',
      pace_range_max: workout.pace_range_max || '',
      hr_zone: workout.hr_zone || '',
      description: workout.description || '',
      coach_notes: workout.coach_notes || '',
    });
  }

  async function saveEdit() {
    if (!editingWorkout) return;
    setSaving(true);
    try {
      const data = { ...editForm };
      if (data.distance_km) data.distance_km = parseFloat(data.distance_km);
      if (data.duration_minutes) data.duration_minutes = parseInt(data.duration_minutes);
      if (data.pace_range_min) data.pace_range_min = parseInt(data.pace_range_min);
      if (data.pace_range_max) data.pace_range_max = parseInt(data.pace_range_max);
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
        </div>
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
                    <p className="text-white text-sm font-semibold mt-1 line-clamp-2">{workout.title}</p>

                    {workout.distance_km > 0 && (
                      <p className="text-volt text-lg font-display mt-2">{workout.distance_km}KM</p>
                    )}
                    {workout.pace_range_min && workout.pace_range_max && (
                      <p className="text-smoke text-xs mt-1">
                        {formatPace(workout.pace_range_min)}-{formatPace(workout.pace_range_max)}/km
                      </p>
                    )}
                    {workout.duration_minutes > 0 && (
                      <p className="text-smoke text-xs mt-1">{workout.duration_minutes} min</p>
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

      {/* ─── Coach Inline Edit ─── */}
      {editingWorkout && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl flex items-center gap-2">
              <Edit3 size={18} className="text-volt" /> EDIT WORKOUT
            </h2>
            <button onClick={cancelEdit} className="text-smoke hover:text-white"><X size={20} /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">Title</label>
              <input
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">Type</label>
              <select
                value={editForm.workout_type}
                onChange={e => setEditForm(f => ({ ...f, workout_type: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none"
              >
                {Object.keys(WORKOUT_COLORS).map(t => (
                  <option key={t} value={t}>{WORKOUT_COLORS[t].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">Distance (km)</label>
              <input
                type="number" step="0.1"
                value={editForm.distance_km}
                onChange={e => setEditForm(f => ({ ...f, distance_km: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">Duration (min)</label>
              <input
                type="number"
                value={editForm.duration_minutes}
                onChange={e => setEditForm(f => ({ ...f, duration_minutes: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">Pace Min (sec/km)</label>
              <input
                type="number"
                value={editForm.pace_range_min}
                onChange={e => setEditForm(f => ({ ...f, pace_range_min: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">Pace Max (sec/km)</label>
              <input
                type="number"
                value={editForm.pace_range_max}
                onChange={e => setEditForm(f => ({ ...f, pace_range_max: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">HR Zone</label>
              <select
                value={editForm.hr_zone}
                onChange={e => setEditForm(f => ({ ...f, hr_zone: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none"
              >
                <option value="">--</option>
                {['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">Description</label>
              <textarea
                rows={3}
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase block mb-1">Coach Notes</label>
              <textarea
                rows={3}
                value={editForm.coach_notes}
                onChange={e => setEditForm(f => ({ ...f, coach_notes: e.target.value }))}
                className="w-full bg-carbon border border-ash px-3 py-2 text-sm focus:border-volt outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={saveEdit} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save size={14} /> {saving ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
            <button onClick={cancelEdit} className="px-4 py-2 border border-ash text-smoke hover:text-white text-sm uppercase font-bold tracking-wider transition-colors">
              Cancel
            </button>
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
