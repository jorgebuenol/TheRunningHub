import { useState } from 'react';
import { api } from '../lib/api';
import { X, Dumbbell } from 'lucide-react';

const INTENSITY_OPTIONS = [
  { value: 'light', label: 'Light', color: 'bg-green-500/20 border-green-500 text-green-400' },
  { value: 'moderate', label: 'Moderate', color: 'bg-yellow-500/20 border-yellow-500 text-yellow-400' },
  { value: 'heavy', label: 'Heavy', color: 'bg-red-500/20 border-red-500 text-red-400' },
];

export default function StrengthSessionModal({ initialDate, existingSession, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    session_date: existingSession?.session_date || initialDate || new Date().toISOString().split('T')[0],
    duration_minutes: existingSession?.duration_minutes || '',
    intensity: existingSession?.intensity || 'moderate',
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.duration_minutes) return;
    setSaving(true);
    try {
      await api.createStrengthSession({
        session_date: form.session_date,
        duration_minutes: parseInt(form.duration_minutes),
        intensity: form.intensity,
      });
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
      <div className="card max-w-md w-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-2">
            <Dumbbell size={20} className="text-purple-400" />
            <h3 className="font-display text-xl text-purple-400">
              {existingSession ? 'EDIT STRENGTH SESSION' : 'LOG STRENGTH SESSION'}
            </h3>
          </div>
          <button onClick={onClose} className="text-smoke hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
              max="300"
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

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving || !form.duration_minutes}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex-1 uppercase tracking-wider">
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
