import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { getBestVDOT, getTrainingPaces, formatPace, parseTime, formatTime } from '../lib/vdot';
import { ONBOARDING_SECTIONS, getSectionStatus, getOverallProgress } from '@shared/onboardingProgress';
import {
  ChevronDown, ChevronRight, Check, Circle, CircleDot, CheckCircle,
  User, Activity, Target, Calendar, Heart, Moon, Apple, Briefcase,
  RefreshCw, Dumbbell, Smartphone,
} from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const RACES = ['5K', '10K', 'Half Marathon', 'Marathon'];

const SECTION_ICONS = {
  personal_data: User,
  running_history: Activity,
  goal: Target,
  availability: Calendar,
  health: Heart,
  sleep: Moon,
  nutrition: Apple,
  work_life: Briefcase,
  recovery: RefreshCw,
  current_training: Dumbbell,
  technology: Smartphone,
};

const QUALITY_OPTIONS = [
  { value: 'poor', label: 'Poor' },
  { value: 'fair', label: 'Fair' },
  { value: 'good', label: 'Good' },
  { value: 'excellent', label: 'Excellent' },
];

const CONSISTENCY_OPTIONS = [
  { value: 'irregular', label: 'Irregular' },
  { value: 'somewhat_regular', label: 'Somewhat Regular' },
  { value: 'regular', label: 'Regular' },
  { value: 'very_regular', label: 'Very Regular' },
];

const DIET_OPTIONS = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'other', label: 'Other' },
];

const WORK_SCHEDULE_OPTIONS = [
  { value: 'regular_9_5', label: '9-to-5' },
  { value: 'shift_work', label: 'Shift Work' },
  { value: 'flexible', label: 'Flexible' },
  { value: 'remote', label: 'Remote' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'student', label: 'Student' },
];

const STRESS_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
  { value: 'very_high', label: 'Very High' },
];

const RECOVERY_METHODS = [
  'stretching', 'foam_rolling', 'massage', 'ice_bath',
  'compression', 'yoga', 'none',
];

const TRAINING_STRUCTURE_OPTIONS = [
  { value: 'none', label: 'None / Just Started' },
  { value: 'self_coached', label: 'Self-Coached' },
  { value: 'group_training', label: 'Group Training' },
  { value: 'previous_coach', label: 'Previous Coach' },
  { value: 'app_based', label: 'App-Based' },
];

export default function MyProfilePage() {
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);

  const saveTimerRef = useRef(null);
  const pendingUpdatesRef = useRef({});

  useEffect(() => {
    loadProfile();
  }, []);

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        flushSave();
      }
    };
  }, []);

  async function loadProfile() {
    try {
      const data = await api.getMyProfile();
      setAthlete(data);
      // Auto-expand first incomplete section
      const progress = getOverallProgress(data);
      const firstIncomplete = ONBOARDING_SECTIONS.find(
        s => progress.sections[s.id] !== 'complete'
      );
      if (firstIncomplete) setExpandedSection(firstIncomplete.id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setAthlete(prev => ({ ...prev, [field]: value }));
    pendingUpdatesRef.current[field] = value;
    scheduleSave();
  }

  function updateJsonbField(column, key, value) {
    setAthlete(prev => ({
      ...prev,
      [column]: { ...(prev[column] || {}), [key]: value },
    }));
    // Always send the complete JSONB object
    pendingUpdatesRef.current[column] = {
      ...(athlete?.[column] || {}),
      ...(pendingUpdatesRef.current[column] || {}),
      [key]: value,
    };
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushSave(), 1500);
  }

  async function flushSave() {
    const updates = { ...pendingUpdatesRef.current };
    pendingUpdatesRef.current = {};
    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    try {
      const updated = await api.updateAthlete(athlete.id, updates);
      setAthlete(updated);
      setLastSaved(new Date());
    } catch (err) {
      console.error('Auto-save failed:', err);
      // Merge failed updates back into pending
      pendingUpdatesRef.current = { ...updates, ...pendingUpdatesRef.current };
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day) {
    const current = athlete.available_days || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    updateField('available_days', updated);
  }

  function toggleRecoveryMethod(method) {
    const current = athlete.recovery_data?.methods || [];
    const updated = current.includes(method)
      ? current.filter(m => m !== method)
      : [...current, method];
    updateJsonbField('recovery_data', 'methods', updated);
  }

  function goToNextSection() {
    const currentIndex = ONBOARDING_SECTIONS.findIndex(s => s.id === expandedSection);
    const next = ONBOARDING_SECTIONS[currentIndex + 1];
    if (next) setExpandedSection(next.id);
    else setExpandedSection(null);
  }

  if (loading) {
    return <div className="text-volt font-display text-xl animate-pulse">LOADING PROFILE...</div>;
  }

  if (!athlete) {
    return <div className="text-red-400">Athlete profile not found. Please contact your coach.</div>;
  }

  const progress = getOverallProgress(athlete);

  // Compute VDOT preview
  const raceTimes = {
    time_5k: athlete.time_5k,
    time_10k: athlete.time_10k,
    time_half_marathon: athlete.time_half_marathon,
    time_marathon: athlete.time_marathon,
  };
  const previewVdot = getBestVDOT(raceTimes);
  const previewPaces = previewVdot ? getTrainingPaces(previewVdot) : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-display text-3xl sm:text-4xl text-volt">MY PROFILE</h1>
          <div className="text-right">
            {saving && <span className="text-volt text-xs uppercase animate-pulse">SAVING...</span>}
            {!saving && lastSaved && (
              <span className="text-smoke text-xs">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <p className="text-smoke uppercase tracking-wider text-sm mb-4">
          {progress.completed}/{progress.total} sections complete
        </p>
        {/* Progress bar */}
        <div className="w-full h-2 bg-ash">
          <div
            className="h-2 bg-volt transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        {progress.isComplete && (
          <p className="text-volt text-xs uppercase mt-2 flex items-center gap-1">
            <CheckCircle size={14} /> Profile complete — your coach can generate a plan
          </p>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {ONBOARDING_SECTIONS.map(section => {
          const isExpanded = expandedSection === section.id;
          return (
            <SectionPanel
              key={section.id}
              section={section}
              athlete={athlete}
              expanded={isExpanded}
              onToggle={() => setExpandedSection(isExpanded ? null : section.id)}
            >
              {section.id === 'personal_data' && (
                <PersonalDataFields athlete={athlete} updateField={updateField} />
              )}
              {section.id === 'running_history' && (
                <RunningHistoryFields
                  athlete={athlete}
                  updateField={updateField}
                  vdot={previewVdot}
                  paces={previewPaces}
                />
              )}
              {section.id === 'goal' && (
                <GoalFields athlete={athlete} updateField={updateField} />
              )}
              {section.id === 'availability' && (
                <AvailabilityFields athlete={athlete} updateField={updateField} toggleDay={toggleDay} />
              )}
              {section.id === 'health' && (
                <HealthFields athlete={athlete} updateField={updateField} />
              )}
              {section.id === 'sleep' && (
                <SleepFields athlete={athlete} updateJsonbField={updateJsonbField} />
              )}
              {section.id === 'nutrition' && (
                <NutritionFields athlete={athlete} updateJsonbField={updateJsonbField} />
              )}
              {section.id === 'work_life' && (
                <WorkLifeFields athlete={athlete} updateJsonbField={updateJsonbField} />
              )}
              {section.id === 'recovery' && (
                <RecoveryFields athlete={athlete} updateJsonbField={updateJsonbField} toggleRecoveryMethod={toggleRecoveryMethod} />
              )}
              {section.id === 'current_training' && (
                <CurrentTrainingFields athlete={athlete} updateJsonbField={updateJsonbField} />
              )}
              {section.id === 'technology' && (
                <TechnologyFields athlete={athlete} updateField={updateField} />
              )}

              {/* Section footer */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-ash">
                <button onClick={() => setExpandedSection(null)} className="btn-ghost text-xs">
                  CONTINUE LATER
                </button>
                {ONBOARDING_SECTIONS.findIndex(s => s.id === section.id) < ONBOARDING_SECTIONS.length - 1 && (
                  <button onClick={goToNextSection} className="btn-primary flex items-center gap-2 text-xs">
                    NEXT SECTION
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>
            </SectionPanel>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section Panel ──────────────────────────────────────────────────────────

function SectionPanel({ section, athlete, expanded, onToggle, children }) {
  const status = getSectionStatus(athlete, section.id);
  const Icon = SECTION_ICONS[section.id] || Circle;

  const statusIcon = {
    empty: <Circle size={16} className="text-smoke" />,
    partial: <CircleDot size={16} className="text-yellow-400" />,
    complete: <CheckCircle size={16} className="text-volt" />,
  };

  return (
    <div className={`border ${expanded ? 'border-volt' : 'border-ash'} transition-colors`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-steel transition-colors"
      >
        <div className="flex items-center gap-3">
          {statusIcon[status]}
          <Icon size={16} className="text-smoke" />
          <div className="text-left">
            <p className="font-display text-base">{section.title}</p>
            <p className="text-smoke text-xs uppercase tracking-wider">{section.subtitle}</p>
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-smoke transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="p-6 border-t border-ash bg-steel">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Field Group Components ─────────────────────────────────────────────────

function FieldLabel({ children, required }) {
  return (
    <label className="label mb-1">
      {children}
      {required && <span className="text-volt ml-1">*</span>}
    </label>
  );
}

// ─── Stable Input Components ────────────────────────────────────────────────
// Defined at module level so React never unmounts/remounts them on parent re-renders.
// Each manages its own display string; syncs from parent only when NOT focused,
// preventing the auto-save server response from clobbering mid-typing input.

function TimeInput({ value, onChange, placeholder }) {
  const [display, setDisplay] = useState(value ? formatTime(value) : '');
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDisplay(value ? formatTime(value) : '');
    }
  }, [value]);

  return (
    <input
      type="text"
      className="input-field"
      placeholder={placeholder || 'MM:SS'}
      value={display}
      onFocus={() => { focused.current = true; }}
      onChange={e => setDisplay(e.target.value)}
      onBlur={e => {
        focused.current = false;
        const seconds = parseTime(e.target.value);
        onChange(seconds || null);
        setDisplay(seconds ? formatTime(seconds) : e.target.value);
      }}
    />
  );
}

function NumericInput({ value, onChange, ...props }) {
  const [display, setDisplay] = useState(value ?? '');
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDisplay(value ?? '');
    }
  }, [value]);

  return (
    <input
      {...props}
      value={display}
      onFocus={() => { focused.current = true; }}
      onChange={e => {
        setDisplay(e.target.value);
        const num = parseFloat(e.target.value);
        onChange(e.target.value === '' ? null : isNaN(num) ? undefined : num);
      }}
      onBlur={() => {
        focused.current = false;
        const num = display !== '' ? parseFloat(display) : null;
        const cleaned = num !== null && !isNaN(num) ? num : null;
        onChange(cleaned);
        setDisplay(cleaned ?? '');
      }}
    />
  );
}

function PersonalDataFields({ athlete, updateField }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <FieldLabel required>Age</FieldLabel>
        <input
          type="number"
          className="input-field"
          placeholder="e.g. 28"
          value={athlete.age || ''}
          onChange={e => updateField('age', e.target.value ? parseInt(e.target.value) : null)}
        />
      </div>
      <div>
        <FieldLabel required>Weight (kg)</FieldLabel>
        <input
          type="number"
          step="0.1"
          className="input-field"
          placeholder="e.g. 65"
          value={athlete.weight_kg || ''}
          onChange={e => updateField('weight_kg', e.target.value ? parseFloat(e.target.value) : null)}
        />
      </div>
      <div>
        <FieldLabel required>Height (cm)</FieldLabel>
        <input
          type="number"
          className="input-field"
          placeholder="e.g. 170"
          value={athlete.height_cm || ''}
          onChange={e => updateField('height_cm', e.target.value ? parseFloat(e.target.value) : null)}
        />
      </div>
      <div>
        <FieldLabel>Body Fat %</FieldLabel>
        <input
          type="number"
          step="0.1"
          className="input-field"
          placeholder="e.g. 18"
          value={athlete.body_fat_pct || ''}
          onChange={e => updateField('body_fat_pct', e.target.value ? parseFloat(e.target.value) : null)}
        />
      </div>
    </div>
  );
}

function RunningHistoryFields({ athlete, updateField, vdot, paces }) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Weekly KM</FieldLabel>
        <NumericInput
          type="number"
          step="0.1"
          className="input-field"
          placeholder="e.g. 35"
          value={athlete.weekly_km}
          onChange={val => { if (val !== undefined) updateField('weekly_km', val); }}
        />
      </div>
      <p className="text-smoke text-xs uppercase tracking-wider">Race Times (enter at least one)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { field: 'time_5k', label: '5K' },
          { field: 'time_10k', label: '10K' },
          { field: 'time_half_marathon', label: 'Half Marathon' },
          { field: 'time_marathon', label: 'Marathon' },
        ].map(({ field, label }) => (
          <div key={field}>
            <FieldLabel>{label}</FieldLabel>
            <TimeInput
              value={athlete[field]}
              onChange={seconds => updateField(field, seconds)}
              placeholder="MM:SS"
            />
          </div>
        ))}
      </div>
      {vdot > 0 && (
        <div className="mt-4 p-4 border border-volt bg-volt/5">
          <p className="text-volt font-display text-lg mb-2">VO2max: {vdot}</p>
          {paces && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-smoke">Easy:</span> <span className="text-green-400">{formatPace(paces.pace_easy_min)}-{formatPace(paces.pace_easy_max)}</span></div>
              <div><span className="text-smoke">Tempo:</span> <span className="text-yellow-400">{formatPace(paces.pace_tempo)}</span></div>
              <div><span className="text-smoke">Threshold:</span> <span className="text-orange-400">{formatPace(paces.pace_lt)}</span></div>
              <div><span className="text-smoke">Race:</span> <span className="text-red-400">{formatPace(paces.pace_race)}</span></div>
              <div><span className="text-smoke">VO2max:</span> <span className="text-red-500">{formatPace(paces.pace_vo2max)}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalFields({ athlete, updateField }) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Goal Race</FieldLabel>
        <div className="flex gap-2 flex-wrap">
          {RACES.map(race => (
            <button
              key={race}
              onClick={() => updateField('goal_race', race)}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border transition-colors ${
                athlete.goal_race === race
                  ? 'bg-volt text-carbon border-volt'
                  : 'border-ash text-smoke hover:border-volt hover:text-volt'
              }`}
            >
              {race}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Target Time</FieldLabel>
          <input
            type="text"
            className="input-field"
            placeholder="H:MM:SS"
            defaultValue={athlete.goal_time_seconds ? formatTime(athlete.goal_time_seconds) : ''}
            onBlur={e => {
              const seconds = parseTime(e.target.value);
              if (seconds) updateField('goal_time_seconds', seconds);
            }}
          />
        </div>
        <div>
          <FieldLabel required>Race Date</FieldLabel>
          <input
            type="date"
            className="input-field"
            value={athlete.goal_race_date || ''}
            onChange={e => updateField('goal_race_date', e.target.value || null)}
          />
        </div>
      </div>
    </div>
  );
}

function AvailabilityFields({ athlete, updateField, toggleDay }) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Available Days (select at least 3)</FieldLabel>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border transition-colors ${
                (athlete.available_days || []).includes(day)
                  ? 'bg-volt text-carbon border-volt'
                  : 'border-ash text-smoke hover:border-volt hover:text-volt'
              }`}
            >
              {day.substring(0, 3)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Start Time</FieldLabel>
          <input
            type="time"
            className="input-field"
            value={athlete.available_time_start || '06:00'}
            onChange={e => updateField('available_time_start', e.target.value)}
          />
        </div>
        <div>
          <FieldLabel required>End Time</FieldLabel>
          <input
            type="time"
            className="input-field"
            value={athlete.available_time_end || '08:00'}
            onChange={e => updateField('available_time_end', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function HealthFields({ athlete, updateField }) {
  return (
    <div>
      <FieldLabel>Injuries or Limitations</FieldLabel>
      <textarea
        className="input-field h-28"
        placeholder="Describe any current or past injuries, limitations, or health conditions..."
        value={athlete.injuries || ''}
        onChange={e => updateField('injuries', e.target.value)}
      />
      <p className="text-smoke text-xs mt-1">Leave blank if none. This section is optional.</p>
    </div>
  );
}

function SleepFields({ athlete, updateJsonbField }) {
  const data = athlete.sleep_data || {};
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <FieldLabel required>Average Hours per Night</FieldLabel>
        <input
          type="number"
          step="0.5"
          min="0"
          max="24"
          className="input-field"
          placeholder="e.g. 7.5"
          value={data.avg_hours ?? ''}
          onChange={e => updateJsonbField('sleep_data', 'avg_hours', e.target.value ? parseFloat(e.target.value) : null)}
        />
      </div>
      <div>
        <FieldLabel required>Sleep Quality</FieldLabel>
        <select
          className="input-field"
          value={data.quality || ''}
          onChange={e => updateJsonbField('sleep_data', 'quality', e.target.value || null)}
        >
          <option value="">Select...</option>
          {QUALITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <FieldLabel>Sleep Consistency</FieldLabel>
        <select
          className="input-field"
          value={data.consistency || ''}
          onChange={e => updateJsonbField('sleep_data', 'consistency', e.target.value || null)}
        >
          <option value="">Select...</option>
          {CONSISTENCY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function NutritionFields({ athlete, updateJsonbField }) {
  const data = athlete.nutrition_data || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Diet Type</FieldLabel>
          <select
            className="input-field"
            value={data.diet_type || ''}
            onChange={e => updateJsonbField('nutrition_data', 'diet_type', e.target.value || null)}
          >
            <option value="">Select...</option>
            {DIET_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel required>Daily Hydration (liters)</FieldLabel>
          <input
            type="number"
            step="0.1"
            min="0"
            className="input-field"
            placeholder="e.g. 2.5"
            value={data.hydration_liters ?? ''}
            onChange={e => updateJsonbField('nutrition_data', 'hydration_liters', e.target.value ? parseFloat(e.target.value) : null)}
          />
        </div>
      </div>
      <div>
        <FieldLabel>Pre-Run Nutrition</FieldLabel>
        <textarea
          className="input-field h-20"
          placeholder="What do you eat before running?"
          value={data.pre_run_nutrition || ''}
          onChange={e => updateJsonbField('nutrition_data', 'pre_run_nutrition', e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>Post-Run Nutrition</FieldLabel>
        <textarea
          className="input-field h-20"
          placeholder="What do you eat/drink after running?"
          value={data.post_run_nutrition || ''}
          onChange={e => updateJsonbField('nutrition_data', 'post_run_nutrition', e.target.value)}
        />
      </div>
    </div>
  );
}

function WorkLifeFields({ athlete, updateJsonbField }) {
  const data = athlete.work_life_data || {};
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <FieldLabel required>Work Schedule</FieldLabel>
        <select
          className="input-field"
          value={data.work_schedule || ''}
          onChange={e => updateJsonbField('work_life_data', 'work_schedule', e.target.value || null)}
        >
          <option value="">Select...</option>
          {WORK_SCHEDULE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <FieldLabel required>Stress Level</FieldLabel>
        <select
          className="input-field"
          value={data.stress_level || ''}
          onChange={e => updateJsonbField('work_life_data', 'stress_level', e.target.value || null)}
        >
          <option value="">Select...</option>
          {STRESS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <FieldLabel>Daily Commute (minutes)</FieldLabel>
        <input
          type="number"
          min="0"
          className="input-field"
          placeholder="e.g. 30"
          value={data.commute_minutes ?? ''}
          onChange={e => updateJsonbField('work_life_data', 'commute_minutes', e.target.value ? parseInt(e.target.value) : null)}
        />
      </div>
    </div>
  );
}

function RecoveryFields({ athlete, updateJsonbField, toggleRecoveryMethod }) {
  const data = athlete.recovery_data || {};
  const selectedMethods = data.methods || [];

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Recovery Methods (select all that apply)</FieldLabel>
        <div className="flex gap-2 flex-wrap">
          {RECOVERY_METHODS.map(method => (
            <button
              key={method}
              onClick={() => toggleRecoveryMethod(method)}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border transition-colors ${
                selectedMethods.includes(method)
                  ? 'bg-volt text-carbon border-volt'
                  : 'border-ash text-smoke hover:border-volt hover:text-volt'
              }`}
            >
              {method.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Rest Day Activities</FieldLabel>
        <textarea
          className="input-field h-20"
          placeholder="What do you do on rest days? Walking, swimming, etc."
          value={data.rest_day_activities || ''}
          onChange={e => updateJsonbField('recovery_data', 'rest_day_activities', e.target.value)}
        />
      </div>
    </div>
  );
}

function CurrentTrainingFields({ athlete, updateJsonbField }) {
  const data = athlete.current_training_data || {};
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel required>Training Structure</FieldLabel>
        <select
          className="input-field"
          value={data.structure || ''}
          onChange={e => updateJsonbField('current_training_data', 'structure', e.target.value || null)}
        >
          <option value="">Select...</option>
          {TRAINING_STRUCTURE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <FieldLabel required>Experience (years)</FieldLabel>
          <input
            type="number"
            min="0"
            className="input-field"
            placeholder="e.g. 3"
            value={data.experience_years ?? ''}
            onChange={e => updateJsonbField('current_training_data', 'experience_years', e.target.value ? parseInt(e.target.value) : null)}
          />
        </div>
        <div>
          <FieldLabel required>Longest Run (km)</FieldLabel>
          <input
            type="number"
            step="0.1"
            min="0"
            className="input-field"
            placeholder="e.g. 21"
            value={data.longest_run_km ?? ''}
            onChange={e => updateJsonbField('current_training_data', 'longest_run_km', e.target.value ? parseFloat(e.target.value) : null)}
          />
        </div>
        <div>
          <FieldLabel>Runs / Week</FieldLabel>
          <input
            type="number"
            min="0"
            max="14"
            className="input-field"
            placeholder="e.g. 4"
            value={data.runs_per_week ?? ''}
            onChange={e => updateJsonbField('current_training_data', 'runs_per_week', e.target.value ? parseInt(e.target.value) : null)}
          />
        </div>
      </div>
    </div>
  );
}

function TechnologyFields({ athlete, updateField }) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>GPS Watch Model</FieldLabel>
        <input
          type="text"
          className="input-field"
          placeholder="e.g. Garmin Forerunner 255"
          value={athlete.gps_watch_model || ''}
          onChange={e => updateField('gps_watch_model', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Intervals.icu API Key</FieldLabel>
          <input
            type="text"
            className="input-field"
            placeholder="Optional"
            value={athlete.intervals_icu_api_key || ''}
            onChange={e => updateField('intervals_icu_api_key', e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>Intervals.icu Athlete ID</FieldLabel>
          <input
            type="text"
            className="input-field"
            placeholder="Optional"
            value={athlete.intervals_icu_athlete_id || ''}
            onChange={e => updateField('intervals_icu_athlete_id', e.target.value)}
          />
        </div>
      </div>
      <p className="text-smoke text-xs">All fields in this section are optional.</p>
    </div>
  );
}
