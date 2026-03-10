import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { ClipboardCheck, AlertTriangle, Check } from 'lucide-react';

const SCORE_LABELS = {
  1: 'Very Low',
  2: 'Low',
  3: 'Moderate',
  4: 'Good',
  5: 'Excellent',
};

const PAIN_LOCATIONS = [
  'Left Knee', 'Right Knee', 'Left Ankle', 'Right Ankle',
  'Left Shin', 'Right Shin', 'Left Hip', 'Right Hip',
  'Lower Back', 'Upper Back', 'Left Calf', 'Right Calf',
  'Left Foot', 'Right Foot', 'Left Hamstring', 'Right Hamstring',
  'Left Quad', 'Right Quad', 'Other',
];

export default function ReadinessCheckInPage() {
  const { user } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingCheckin, setExistingCheckin] = useState(null);

  const [form, setForm] = useState({
    energy: 3,
    sleep_hours: 7,
    sleep_quality: 3,
    soreness: 3,
    stress: 3,
    motivation: 3,
    pain_flag: false,
    pain_location: '',
    pain_severity: 5,
    resting_hr: '',
    hrv: '',
    weight_kg: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [user]);

  async function loadData() {
    if (!user) return;
    try {
      const { data: athleteData } = await supabase
        .from('athletes')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (athleteData) {
        setAthlete(athleteData);
        // Check if already checked in today
        const today = await api.getTodayReadiness(athleteData.id);
        if (today) {
          setExistingCheckin(today);
          setForm({
            energy: today.energy,
            sleep_hours: today.sleep_hours || 7,
            sleep_quality: today.sleep_quality,
            soreness: today.soreness,
            stress: today.stress,
            motivation: today.motivation,
            pain_flag: today.pain_flag || false,
            pain_location: today.pain_location || '',
            pain_severity: today.pain_severity || 5,
            resting_hr: today.resting_hr || '',
            hrv: today.hrv || '',
            weight_kg: today.weight_kg || '',
            notes: today.notes || '',
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!athlete) return;

    setSaving(true);
    try {
      const data = {
        athlete_id: athlete.id,
        energy: form.energy,
        sleep_hours: parseFloat(form.sleep_hours) || null,
        sleep_quality: form.sleep_quality,
        soreness: form.soreness,
        stress: form.stress,
        motivation: form.motivation,
        pain_flag: form.pain_flag,
        pain_location: form.pain_flag ? form.pain_location : null,
        pain_severity: form.pain_flag ? form.pain_severity : null,
        resting_hr: form.resting_hr ? parseInt(form.resting_hr) : null,
        hrv: form.hrv ? parseInt(form.hrv) : null,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        notes: form.notes || null,
      };

      const result = await api.submitReadiness(data);
      setExistingCheckin(result);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Calculate preview composite score
  const compositeScore = (
    (form.energy * 0.25) +
    (form.sleep_quality * 0.25) +
    ((6 - form.soreness) * 0.20) +
    ((6 - form.stress) * 0.15) +
    (form.motivation * 0.15)
  ).toFixed(2);

  const scoreColor = compositeScore >= 3.5 ? 'text-green-400' : compositeScore >= 2.5 ? 'text-yellow-400' : 'text-red-400';

  if (loading) return <div className="text-volt font-display text-xl animate-pulse">LOADING...</div>;

  if (!athlete) {
    return (
      <div className="text-center py-20">
        <ClipboardCheck size={48} className="text-volt mx-auto mb-4" />
        <h2 className="font-display text-2xl mb-2">NO ATHLETE PROFILE</h2>
        <p className="text-smoke">Your coach hasn't set up your profile yet.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center py-20">
        <Check size={64} className="text-green-400 mx-auto mb-4" />
        <h2 className="font-display text-3xl text-volt mb-2">CHECK-IN SAVED</h2>
        <p className="text-smoke text-lg mb-2">Your readiness score today:</p>
        <p className={`font-display text-6xl ${scoreColor}`}>{compositeScore}</p>
        <p className="text-smoke text-sm mt-4">
          {compositeScore >= 3.5 ? 'Looking strong! Ready to train.' :
           compositeScore >= 2.5 ? 'Moderate readiness. Consider adjusting intensity.' :
           'Low readiness. Take it easy today.'}
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="btn-ghost mt-6"
        >
          EDIT CHECK-IN
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-4xl text-volt">DAILY CHECK-IN</h1>
        <p className="text-smoke uppercase tracking-wider text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {existingCheckin && ' — Updating existing check-in'}
        </p>
      </div>

      {/* Live Composite Score */}
      <div className="card mb-6 text-center">
        <p className="text-smoke text-xs uppercase tracking-wider mb-1">Readiness Score</p>
        <p className={`font-display text-5xl ${scoreColor}`}>{compositeScore}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Energy */}
        <SliderField
          label="Energy Level"
          value={form.energy}
          onChange={v => updateForm('energy', v)}
          emoji={['😴', '😪', '😐', '😊', '⚡']}
        />

        {/* Sleep */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-bold uppercase tracking-wider">Sleep</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-smoke text-xs uppercase">Hours</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="14"
                value={form.sleep_hours}
                onChange={e => updateForm('sleep_hours', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase">Quality</label>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateForm('sleep_quality', v)}
                    className={`flex-1 py-2 text-sm font-bold border transition-colors ${
                      form.sleep_quality === v
                        ? 'bg-volt text-carbon border-volt'
                        : 'border-ash text-smoke hover:border-smoke'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Soreness */}
        <SliderField
          label="Muscle Soreness"
          value={form.soreness}
          onChange={v => updateForm('soreness', v)}
          emoji={['🟢', '🟡', '🟠', '🔴', '💀']}
          invert
        />

        {/* Stress */}
        <SliderField
          label="Life Stress"
          value={form.stress}
          onChange={v => updateForm('stress', v)}
          emoji={['😌', '🙂', '😐', '😰', '🤯']}
          invert
        />

        {/* Motivation */}
        <SliderField
          label="Training Motivation"
          value={form.motivation}
          onChange={v => updateForm('motivation', v)}
          emoji={['😒', '😕', '😐', '💪', '🔥']}
        />

        {/* Pain Flag */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={16} className={form.pain_flag ? 'text-red-400' : 'text-smoke'} />
              Pain / Injury
            </label>
            <button
              type="button"
              onClick={() => updateForm('pain_flag', !form.pain_flag)}
              className={`px-4 py-1 text-xs font-bold uppercase border transition-colors ${
                form.pain_flag
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'border-ash text-smoke hover:border-smoke'
              }`}
            >
              {form.pain_flag ? 'YES' : 'NO'}
            </button>
          </div>

          {form.pain_flag && (
            <div className="space-y-3 mt-4 pt-4 border-t border-ash">
              <div>
                <label className="text-smoke text-xs uppercase">Location</label>
                <select
                  value={form.pain_location}
                  onChange={e => updateForm('pain_location', e.target.value)}
                  className="input-field"
                >
                  <option value="">Select location...</option>
                  {PAIN_LOCATIONS.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-smoke text-xs uppercase">Severity (1-10)</label>
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => updateForm('pain_severity', v)}
                      className={`flex-1 py-2 text-xs font-bold border transition-colors ${
                        form.pain_severity === v
                          ? v <= 3 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                          : v <= 6 ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                          : 'bg-red-500/20 border-red-500 text-red-400'
                          : 'border-ash text-smoke hover:border-smoke'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Biometrics (optional) */}
        <div className="card">
          <label className="text-sm font-bold uppercase tracking-wider mb-3 block">Biometrics (Optional)</label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-smoke text-xs uppercase">Resting HR</label>
              <input
                type="number"
                min="30"
                max="120"
                value={form.resting_hr}
                onChange={e => updateForm('resting_hr', e.target.value)}
                className="input-field"
                placeholder="bpm"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase">HRV</label>
              <input
                type="number"
                min="0"
                max="200"
                value={form.hrv}
                onChange={e => updateForm('hrv', e.target.value)}
                className="input-field"
                placeholder="ms"
              />
            </div>
            <div>
              <label className="text-smoke text-xs uppercase">Weight</label>
              <input
                type="number"
                step="0.1"
                min="30"
                max="200"
                value={form.weight_kg}
                onChange={e => updateForm('weight_kg', e.target.value)}
                className="input-field"
                placeholder="kg"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card">
          <label className="text-sm font-bold uppercase tracking-wider mb-3 block">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => updateForm('notes', e.target.value)}
            className="input-field h-24 resize-none"
            placeholder="How are you feeling overall? Anything the coach should know?"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full py-4 text-lg"
        >
          {saving ? 'SAVING...' : existingCheckin ? 'UPDATE CHECK-IN' : 'SUBMIT CHECK-IN'}
        </button>
      </form>
    </div>
  );
}

function SliderField({ label, value, onChange, emoji, invert }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-bold uppercase tracking-wider">{label}</label>
        <span className="text-smoke text-xs">{SCORE_LABELS[value]}</span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 py-3 text-center text-xl border transition-all ${
              value === v
                ? 'bg-volt/20 border-volt scale-105'
                : 'border-ash hover:border-smoke'
            }`}
          >
            {emoji[v - 1]}
          </button>
        ))}
      </div>
    </div>
  );
}
