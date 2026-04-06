import { useState } from 'react';
import { api } from '../lib/api';
import { X, Activity } from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'easy_run',  label: 'Easy Run' },
  { value: 'long_run',  label: 'Long Run' },
  { value: 'race',      label: 'Race' },
  { value: 'strength',  label: 'Strength' },
  { value: 'pilates',   label: 'Pilates' },
  { value: 'cycling',   label: 'Cycling' },
  { value: 'swimming',  label: 'Swimming' },
  { value: 'walking',   label: 'Walking' },
  { value: 'other',     label: 'Other' },
];

const INTENSITY_OPTIONS = [
  { value: 'light', label: 'Light', color: 'bg-green-500/20 border-green-500 text-green-400' },
  { value: 'moderate', label: 'Moderate', color: 'bg-yellow-500/20 border-yellow-500 text-yellow-400' },
  { value: 'heavy', label: 'Hard', color: 'bg-red-500/20 border-red-500 text-red-400' },
];

const RUN_TYPES = new Set(['easy_run', 'long_run', 'race']);

function parsePaceInput(str) {
  if (!str) return null;
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const min = parseInt(parts[0]);
  const sec = parseInt(parts[1]);
  if (isNaN(min) || isNaN(sec)) return null;
  return min * 60 + sec;
}

function formatPaceFromSec(totalSec) {
  if (!totalSec) return '';
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export default function StrengthSessionModal({ initialDate, existingSession, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    activity_type: existingSession?.activity_type || 'strength',
    session_date: existingSession?.session_date || initialDate || new Date().toISOString().split('T')[0],
    duration_minutes: existingSession?.duration_minutes || '',
    intensity: existingSession?.intensity || 'moderate',
    distance_km: existingSession?.distance_km || '',
    pace_display: formatPaceFromSec(existingSession?.avg_pace_sec),
    avg_hr: existingSession?.avg_hr || '',
    max_hr: existingSession?.max_hr || '',
    elevation_m: existingSession?.elevation_m || '',
    notes: existingSession?.notes || '',
  });

  const isRun = RUN_TYPES.has(form.activity_type);
  const showDistance = isRun || form.activity_type === 'cycling';
  const showPace = isRun;
  const showHR = isRun || form.activity_type === 'cycling';
  const showElevation = isRun;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.duration_minutes) return;
    setSaving(true);
    try {
      const payload = {
        activity_type: form.activity_type,
        session_date: form.session_date,
        duration_minutes: parseInt(form.duration_minutes),
        intensity: form.intensity,
        distance_km: showDistance && form.distance_km ? parseFloat(form.distance_km) : null,
        avg_pace_sec: showPace ? parsePaceInput(form.pace_display) : null,
        avg_hr: showHR && form.avg_hr ? parseInt(form.avg_hr) : null,
        max_hr: showHR && form.max_hr ? parseInt(form.max_hr) : null,
        elevation_m: showElevation && form.elevation_m ? parseInt(form.elevation_m) : null,
        notes: form.notes || null,
      };
      if (existingSession?.id) {
        await api.updateStrengthSession(existingSession.id, payload);
      } else {
        await api.createStrengthSession(payload);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingSession?.id) return;
    setSaving(true);
    try {
      await api.deleteStrengthSession(existingSession.id);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-volt" />
            <h3 className="font-display text-xl text-volt">
              {existingSession ? 'EDIT ACTIVITY' : 'LOG ACTIVITY'}
            </h3>
          </div>
          <button onClick={onClose} className="text-smoke hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Activity Type */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Activity Type</label>
            <select
              value={form.activity_type}
              onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))}
              className="input-field"
            >
              {ACTIVITY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Date</label>
            <input
              type="date"
              value={form.session_date}
              onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))}
              className="input-field"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Duration (minutes)</label>
            <input
              type="number"
              min="1"
              max="600"
              value={form.duration_minutes}
              onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
              className="input-field"
              placeholder="e.g. 45"
            />
          </div>

          {/* Intensity */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Intensity</label>
            <div className="flex gap-2">
              {INTENSITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, intensity: opt.value }))}
                  className={`flex-1 py-3 text-center border text-sm font-bold uppercase transition-all ${
                    form.intensity === opt.value ? opt.color : 'border-ash text-smoke hover:border-smoke'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Distance — runs + cycling */}
          {showDistance && (
            <div>
              <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Distance (km)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.distance_km}
                onChange={e => setForm(f => ({ ...f, distance_km: e.target.value }))}
                className="input-field"
                placeholder="e.g. 10.5"
              />
            </div>
          )}

          {/* Avg Pace — runs only */}
          {showPace && (
            <div>
              <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Avg Pace (min:sec /km)</label>
              <input
                type="text"
                value={form.pace_display}
                onChange={e => setForm(f => ({ ...f, pace_display: e.target.value }))}
                className="input-field"
                placeholder="5:30"
              />
            </div>
          )}

          {/* Heart Rate — runs + cycling */}
          {showHR && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Avg HR (bpm)</label>
                <input
                  type="number"
                  min="30"
                  max="220"
                  value={form.avg_hr}
                  onChange={e => setForm(f => ({ ...f, avg_hr: e.target.value }))}
                  className="input-field"
                  placeholder="145"
                />
              </div>
              <div>
                <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Max HR (bpm)</label>
                <input
                  type="number"
                  min="30"
                  max="220"
                  value={form.max_hr}
                  onChange={e => setForm(f => ({ ...f, max_hr: e.target.value }))}
                  className="input-field"
                  placeholder="172"
                />
              </div>
            </div>
          )}

          {/* Elevation — runs only */}
          {showElevation && (
            <div>
              <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Elevation Gain (m)</label>
              <input
                type="number"
                min="0"
                value={form.elevation_m}
                onChange={e => setForm(f => ({ ...f, elevation_m: e.target.value }))}
                className="input-field"
                placeholder="e.g. 120"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="input-field h-20 resize-none"
              placeholder="How did it feel?"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving || !form.duration_minutes}
              className="px-4 py-2 bg-volt hover:bg-volt/80 text-carbon font-semibold text-sm transition-colors disabled:opacity-50 flex-1 uppercase tracking-wider">
              {saving ? 'SAVING...' : existingSession ? 'UPDATE' : 'SAVE'}
            </button>
            {existingSession && (
              <button type="button" onClick={handleDelete} disabled={saving}
                className="px-4 py-2 border border-red-500 text-red-400 hover:bg-red-500/20 text-sm uppercase font-bold tracking-wider transition-colors">
                DELETE
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-ghost">
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
