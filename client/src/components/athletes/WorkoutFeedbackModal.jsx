import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { X, Check } from 'lucide-react';

const FEELING_OPTIONS = [
  { value: 'great', emoji: '😄', label: 'Great' },
  { value: 'good', emoji: '😊', label: 'Good' },
  { value: 'ok', emoji: '😐', label: 'OK' },
  { value: 'bad', emoji: '😟', label: 'Bad' },
  { value: 'terrible', emoji: '😫', label: 'Terrible' },
];

export default function WorkoutFeedbackModal({ workout, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [existingFeedback, setExistingFeedback] = useState(null);

  const [form, setForm] = useState({
    rpe: 5,
    completed: true,
    actual_distance_km: workout?.distance_km || '',
    actual_duration_minutes: workout?.duration_minutes || '',
    actual_pace_sec_km: '',
    avg_hr: '',
    max_hr: '',
    feeling: 'good',
    notes: '',
  });

  useEffect(() => {
    if (workout?.id) {
      loadExistingFeedback();
    }
  }, [workout]);

  async function loadExistingFeedback() {
    try {
      const fb = await api.getWorkoutFeedback(workout.id);
      if (fb) {
        setExistingFeedback(fb);
        setForm({
          rpe: fb.rpe,
          completed: fb.completed,
          actual_distance_km: fb.actual_distance_km || workout?.distance_km || '',
          actual_duration_minutes: fb.actual_duration_minutes || workout?.duration_minutes || '',
          actual_pace_sec_km: fb.actual_pace_sec_km || '',
          avg_hr: fb.avg_hr || '',
          max_hr: fb.max_hr || '',
          feeling: fb.feeling || 'good',
          notes: fb.notes || '',
        });
      }
    } catch (err) {
      // No existing feedback, that's fine
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        workout_id: workout.id,
        athlete_id: workout.athlete_id,
        rpe: form.rpe,
        completed: form.completed,
        actual_distance_km: form.actual_distance_km ? parseFloat(form.actual_distance_km) : null,
        actual_duration_minutes: form.actual_duration_minutes ? parseInt(form.actual_duration_minutes) : null,
        actual_pace_sec_km: form.actual_pace_sec_km ? parseInt(form.actual_pace_sec_km) : null,
        avg_hr: form.avg_hr ? parseInt(form.avg_hr) : null,
        max_hr: form.max_hr ? parseInt(form.max_hr) : null,
        feeling: form.feeling,
        notes: form.notes || null,
      };

      await api.submitFeedback(data);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Calculate deltas
  const distanceDelta = form.actual_distance_km && workout?.distance_km
    ? (parseFloat(form.actual_distance_km) - workout.distance_km).toFixed(1)
    : null;
  const durationDelta = form.actual_duration_minutes && workout?.duration_minutes
    ? parseInt(form.actual_duration_minutes) - workout.duration_minutes
    : null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="font-display text-xl text-volt">{workout.title}</h3>
            <p className="text-smoke text-xs uppercase mt-1">
              {workout.workout_type} — {workout.workout_date}
            </p>
            {workout.distance_km && (
              <p className="text-smoke text-xs mt-1">
                Planned: {workout.distance_km}km
                {workout.duration_minutes && ` | ${workout.duration_minutes}min`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-smoke hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Completed toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold uppercase tracking-wider">Completed?</label>
            <button
              type="button"
              onClick={() => updateForm('completed', !form.completed)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase border transition-colors ${
                form.completed
                  ? 'bg-green-500/20 border-green-500 text-green-400'
                  : 'bg-red-500/20 border-red-500 text-red-400'
              }`}
            >
              <Check size={14} />
              {form.completed ? 'YES' : 'NO'}
            </button>
          </div>

          {/* RPE */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold uppercase tracking-wider">RPE (Rate of Perceived Exertion)</label>
              <span className="text-volt font-display text-xl">{form.rpe}</span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => updateForm('rpe', v)}
                  className={`flex-1 py-2 text-xs font-bold border transition-colors ${
                    form.rpe === v
                      ? v <= 3 ? 'bg-green-500/20 border-green-500 text-green-400'
                      : v <= 6 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                      : v <= 8 ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                      : 'bg-red-500/20 border-red-500 text-red-400'
                      : 'border-ash text-smoke hover:border-smoke'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-smoke text-[10px] uppercase mt-1 px-1">
              <span>Easy</span>
              <span>Moderate</span>
              <span>Hard</span>
              <span>Max</span>
            </div>
          </div>

          {/* Feeling */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">How did it feel?</label>
            <div className="flex gap-2">
              {FEELING_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateForm('feeling', opt.value)}
                  className={`flex-1 py-3 text-center border transition-all ${
                    form.feeling === opt.value
                      ? 'bg-volt/20 border-volt scale-105'
                      : 'border-ash hover:border-smoke'
                  }`}
                >
                  <div className="text-xl mb-1">{opt.emoji}</div>
                  <div className="text-[10px] uppercase text-smoke">{opt.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Actual performance */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Actual Performance</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-smoke text-xs uppercase">Distance (km)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.actual_distance_km}
                  onChange={e => updateForm('actual_distance_km', e.target.value)}
                  className="input-field"
                />
                {distanceDelta !== null && (
                  <p className={`text-xs mt-1 ${parseFloat(distanceDelta) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {parseFloat(distanceDelta) >= 0 ? '+' : ''}{distanceDelta}km vs planned
                  </p>
                )}
              </div>
              <div>
                <label className="text-smoke text-xs uppercase">Duration (min)</label>
                <input
                  type="number"
                  value={form.actual_duration_minutes}
                  onChange={e => updateForm('actual_duration_minutes', e.target.value)}
                  className="input-field"
                />
                {durationDelta !== null && (
                  <p className={`text-xs mt-1 ${durationDelta <= 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {durationDelta >= 0 ? '+' : ''}{durationDelta}min vs planned
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Heart rate */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Heart Rate (Optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-smoke text-xs uppercase">Avg HR</label>
                <input
                  type="number"
                  value={form.avg_hr}
                  onChange={e => updateForm('avg_hr', e.target.value)}
                  className="input-field"
                  placeholder="bpm"
                />
              </div>
              <div>
                <label className="text-smoke text-xs uppercase">Max HR</label>
                <input
                  type="number"
                  value={form.max_hr}
                  onChange={e => updateForm('max_hr', e.target.value)}
                  className="input-field"
                  placeholder="bpm"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => updateForm('notes', e.target.value)}
              className="input-field h-20 resize-none"
              placeholder="Any observations about the workout?"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'SAVING...' : existingFeedback ? 'UPDATE FEEDBACK' : 'SAVE FEEDBACK'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
