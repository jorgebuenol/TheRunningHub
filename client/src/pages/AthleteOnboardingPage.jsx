import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getBestVDOT, getTrainingPaces, formatPace, parseTime } from '../lib/vdot';
import { ChevronRight, ChevronLeft, Zap, Check } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const RACES = ['5K', '10K', 'Half Marathon', 'Marathon'];

export default function AthleteOnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    age: '',
    weight_kg: '',
    height_cm: '',
    body_fat_pct: '',
    weekly_km: '',
    time_5k: '',
    time_10k: '',
    time_half_marathon: '',
    time_marathon: '',
    goal_race: '',
    goal_time: '',
    goal_race_date: '',
    available_days: [],
    available_time_start: '06:00',
    available_time_end: '08:00',
    injuries: '',
    gps_watch_model: '',
    intervals_icu_api_key: '',
    intervals_icu_athlete_id: '',
  });

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleDay(day) {
    setForm(prev => ({
      ...prev,
      available_days: prev.available_days.includes(day)
        ? prev.available_days.filter(d => d !== day)
        : [...prev.available_days, day],
    }));
  }

  // Calculate VDOT preview
  const raceTimes = {
    time_5k: parseTime(form.time_5k),
    time_10k: parseTime(form.time_10k),
    time_half_marathon: parseTime(form.time_half_marathon),
    time_marathon: parseTime(form.time_marathon),
  };
  const previewVdot = getBestVDOT(raceTimes);
  const previewPaces = getTrainingPaces(previewVdot);

  async function handleSubmit() {
    setSaving(true);
    setError('');

    try {
      // Send all data to the server — it handles auth user creation + athlete insert
      const athleteData = {
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        age: parseInt(form.age) || null,
        weight_kg: parseFloat(form.weight_kg) || null,
        height_cm: parseFloat(form.height_cm) || null,
        body_fat_pct: parseFloat(form.body_fat_pct) || null,
        weekly_km: parseFloat(form.weekly_km) || null,
        time_5k: parseTime(form.time_5k) || null,
        time_10k: parseTime(form.time_10k) || null,
        time_half_marathon: parseTime(form.time_half_marathon) || null,
        time_marathon: parseTime(form.time_marathon) || null,
        goal_race: form.goal_race || null,
        goal_time_seconds: parseTime(form.goal_time) || null,
        goal_race_date: form.goal_race_date || null,
        available_days: form.available_days,
        available_time_start: form.available_time_start,
        available_time_end: form.available_time_end,
        injuries: form.injuries || null,
        gps_watch_model: form.gps_watch_model || null,
        intervals_icu_api_key: form.intervals_icu_api_key || null,
        intervals_icu_athlete_id: form.intervals_icu_athlete_id || null,
      };

      await api.createAthlete(athleteData);
      navigate('/athletes');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    { title: 'ACCOUNT', subtitle: 'Login credentials' },
    { title: 'BODY', subtitle: 'Physical profile' },
    { title: 'TIMES', subtitle: 'Race times' },
    { title: 'GOAL', subtitle: 'Target race' },
    { title: 'SCHED', subtitle: 'Availability' },
    { title: 'EXTRAS', subtitle: 'Gear & integrations' },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-display text-3xl sm:text-4xl text-volt mb-2">NEW ATHLETE</h1>
      <p className="text-smoke uppercase tracking-wider text-sm mb-6 sm:mb-8">Onboarding</p>

      {/* Step indicator */}
      <div className="flex items-center gap-0.5 sm:gap-1 mb-6 sm:mb-8">
        {steps.map((s, i) => (
          <div key={i} className="flex-1 min-w-0">
            <div
              className={`h-1 ${i <= step ? 'bg-volt' : 'bg-ash'} transition-colors`}
            />
            <p className={`text-[10px] sm:text-xs mt-1 sm:mt-2 uppercase tracking-wider truncate ${
              i === step ? 'text-volt font-semibold' : 'text-smoke'
            }`}>
              {s.title}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500 text-red-300 px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="card mb-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl mb-4">ACCOUNT CREDENTIALS</h2>
            <Field label="Full Name" value={form.full_name} onChange={v => update('full_name', v)} placeholder="Maria Rodriguez" />
            <Field label="Email" type="email" value={form.email} onChange={v => update('email', v)} placeholder="maria@therunhub.co" />
            <Field label="Password" type="password" value={form.password} onChange={v => update('password', v)} placeholder="Min 6 characters" />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl mb-4">PHYSICAL PROFILE</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Age" type="number" value={form.age} onChange={v => update('age', v)} placeholder="28" />
              <Field label="Weight (kg)" type="number" value={form.weight_kg} onChange={v => update('weight_kg', v)} placeholder="65" />
              <Field label="Height (cm)" type="number" value={form.height_cm} onChange={v => update('height_cm', v)} placeholder="170" />
              <Field label="Body Fat %" type="number" value={form.body_fat_pct} onChange={v => update('body_fat_pct', v)} placeholder="15" />
              <Field label="Weekly KM" type="number" value={form.weekly_km} onChange={v => update('weekly_km', v)} placeholder="40" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl mb-4">RACE TIMES & VO2max</h2>
            <p className="text-smoke text-sm mb-4">Enter recent race times (MM:SS or H:MM:SS). At least one is required.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="5K Time" value={form.time_5k} onChange={v => update('time_5k', v)} placeholder="22:30" />
              <Field label="10K Time" value={form.time_10k} onChange={v => update('time_10k', v)} placeholder="47:00" />
              <Field label="Half Marathon" value={form.time_half_marathon} onChange={v => update('time_half_marathon', v)} placeholder="1:45:00" />
              <Field label="Marathon" value={form.time_marathon} onChange={v => update('time_marathon', v)} placeholder="3:45:00" />
            </div>

            {previewVdot > 0 && (
              <div className="mt-6 p-4 bg-carbon border border-volt">
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={20} className="text-volt" />
                  <h3 className="font-display text-xl text-volt">VO2max: {previewVdot}</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <PaceDisplay label="Easy" value={`${formatPace(previewPaces.easy_min)} - ${formatPace(previewPaces.easy_max)}`} />
                  <PaceDisplay label="Tempo" value={formatPace(previewPaces.tempo)} />
                  <PaceDisplay label="Threshold" value={formatPace(previewPaces.lt)} />
                  <PaceDisplay label="Race 10K" value={formatPace(previewPaces.race_10k)} />
                  <PaceDisplay label="VO2max" value={formatPace(previewPaces.vo2max)} />
                  <PaceDisplay label="Race 5K" value={formatPace(previewPaces.race_5k)} />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl mb-4">RACE GOAL</h2>
            <div>
              <label className="label">Goal Race</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RACES.map(race => (
                  <button
                    key={race}
                    onClick={() => update('goal_race', race)}
                    className={`py-3 text-sm font-bold uppercase tracking-wider border transition-colors min-h-[44px] ${
                      form.goal_race === race
                        ? 'bg-volt text-carbon border-volt'
                        : 'border-ash text-smoke hover:border-volt hover:text-white'
                    }`}
                  >
                    {race}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Target Time" value={form.goal_time} onChange={v => update('goal_time', v)} placeholder="1:40:00" />
            <Field label="Race Date" type="date" value={form.goal_race_date} onChange={v => update('goal_race_date', v)} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl mb-4">TRAINING SCHEDULE</h2>
            <div>
              <label className="label">Available Days</label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`py-3 text-xs font-bold uppercase tracking-wider border transition-colors min-h-[44px] ${
                      form.available_days.includes(day)
                        ? 'bg-volt text-carbon border-volt'
                        : 'border-ash text-smoke hover:border-volt'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Start Time" type="time" value={form.available_time_start} onChange={v => update('available_time_start', v)} />
              <Field label="End Time" type="time" value={form.available_time_end} onChange={v => update('available_time_end', v)} />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-display text-xl mb-4">GEAR & INTEGRATIONS</h2>
            <Field label="GPS Watch Model" value={form.gps_watch_model} onChange={v => update('gps_watch_model', v)} placeholder="Garmin Forerunner 265" />
            <div>
              <label className="label">Injuries / Limitations</label>
              <textarea
                value={form.injuries}
                onChange={e => update('injuries', e.target.value)}
                className="input-field h-24 resize-none"
                placeholder="Any current injuries or physical limitations..."
              />
            </div>
            <div className="border-t border-ash pt-4 mt-6">
              <h3 className="font-body font-bold uppercase tracking-wider text-sm mb-4">INTERVALS.ICU (OPTIONAL)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="API Key" value={form.intervals_icu_api_key} onChange={v => update('intervals_icu_api_key', v)} placeholder="Your API key" />
                <Field label="Athlete ID" value={form.intervals_icu_athlete_id} onChange={v => update('intervals_icu_athlete_id', v)} placeholder="i12345" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          className="btn-ghost flex items-center gap-2 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
          BACK
        </button>

        {step < steps.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)} className="btn-primary flex items-center gap-2">
            NEXT
            <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving} className="btn-primary flex items-center gap-2">
            <Check size={16} />
            {saving ? 'CREATING...' : 'CREATE ATHLETE'}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-field"
        placeholder={placeholder}
      />
    </div>
  );
}

function PaceDisplay({ label, value }) {
  return (
    <div>
      <p className="text-smoke text-xs uppercase">{label}</p>
      <p className="text-white font-semibold">{value} /km</p>
    </div>
  );
}
