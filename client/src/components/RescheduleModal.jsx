import { useState } from 'react';
import { api } from '../lib/api';
import { CalendarClock, X, Loader } from 'lucide-react';

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Format a Date as 'YYYY-MM-DD' in LOCAL timezone */
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function RescheduleModal({ workout, weekWorkouts, onClose, onSaved }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Build week days (Mon-Sun) based on the workout's date
  const workoutDate = new Date(workout.workout_date + 'T00:00:00');
  const monday = getMonday(workoutDate);

  const weekDays = DAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const dateStr = toLocalDateStr(d);
    const isCurrentDay = dateStr === workout.workout_date;
    const dayWorkouts = (weekWorkouts || []).filter(w => w.workout_date === dateStr && w.id !== workout.id);
    const hasOtherWorkout = dayWorkouts.some(w => w.workout_type !== 'rest');
    return { label, dateStr, isCurrentDay, hasOtherWorkout, date: d };
  });

  async function handleConfirm() {
    if (!selectedDate) return;
    setSaving(true);
    setError('');
    try {
      await api.rescheduleWorkout(workout.id, selectedDate);
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to reschedule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="card max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg flex items-center gap-2">
            <CalendarClock size={18} className="text-volt" /> RESCHEDULE
          </h3>
          <button onClick={onClose} className="text-smoke hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <p className="text-smoke text-sm mb-4">
          Move <span className="text-white font-bold">{workout.title}</span> to another day this week.
        </p>

        <div className="grid grid-cols-7 gap-1 mb-4">
          {weekDays.map(({ label, dateStr, isCurrentDay, hasOtherWorkout, date }) => {
            const isSelected = selectedDate === dateStr;
            const dayNum = date.getDate();

            return (
              <button
                key={dateStr}
                onClick={() => !isCurrentDay && setSelectedDate(dateStr)}
                disabled={isCurrentDay}
                className={`py-3 text-center transition-colors ${
                  isCurrentDay
                    ? 'bg-smoke/20 text-smoke/50 cursor-not-allowed'
                    : isSelected
                      ? 'bg-volt text-carbon'
                      : 'bg-steel/50 text-white hover:bg-volt/20'
                }`}
              >
                <span className="text-[10px] font-bold block">{label}</span>
                <span className={`text-sm font-display block mt-0.5 ${isSelected ? 'text-carbon' : ''}`}>{dayNum}</span>
                {hasOtherWorkout && !isCurrentDay && (
                  <span className="block w-1.5 h-1.5 bg-yellow-500 mx-auto mt-1" title="Has a workout" />
                )}
              </button>
            );
          })}
        </div>

        {selectedDate && weekDays.find(d => d.dateStr === selectedDate)?.hasOtherWorkout && (
          <p className="text-yellow-400 text-xs mb-3">
            This day already has a workout. Both will coexist on the same day.
          </p>
        )}

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={!selectedDate || saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            {saving ? 'MOVING...' : 'CONFIRM'}
          </button>
          <button onClick={onClose} className="btn-ghost">CANCEL</button>
        </div>
      </div>
    </div>
  );
}
