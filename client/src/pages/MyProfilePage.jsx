import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { getBestVDOT, getTrainingPaces, formatPace, parseTime, formatTime } from '../lib/vdot';
import { ONBOARDING_SECTIONS, getSectionStatus, getOverallProgress } from '@shared/onboardingProgress';
import {
  ChevronDown, ChevronRight, Check, Circle, CircleDot, CheckCircle,
  User, Activity, Target, Calendar, Heart, Moon, Apple, Briefcase,
  RefreshCw, Dumbbell, Smartphone, Link2, Unlink, Loader,
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
    setAthlete(prev => {
      // Build the complete updated JSONB column from latest state
      const updatedColumn = { ...(prev[column] || {}), [key]: value };
      // Always send the complete JSONB object to the server
      pendingUpdatesRef.current[column] = updatedColumn;
      return { ...prev, [column]: updatedColumn };
    });
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
      // Merge server response with any new pending changes that arrived during the save
      // so we never overwrite what the user is currently typing
      setAthlete(() => {
        const merged = { ...updated };
        for (const [key, val] of Object.entries(pendingUpdatesRef.current)) {
          merged[key] = val;
        }
        return merged;
      });
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

  // HR zone auto-calculation helpers
  function calcDefaultZones(hrMax) {
    if (!hrMax) return {};
    return {
      hr_z1_max: Math.round(hrMax * 0.50),
      hr_z2_max: Math.round(hrMax * 0.75),
      hr_z3_max: Math.round(hrMax * 0.85),
      hr_z4_max: Math.round(hrMax * 0.92),
    };
  }

  function handleHrMaxChange(val) {
    if (val !== undefined) {
      const hrMax = val !== null ? Math.round(val) : null;
      updateField('hr_max', hrMax);
      // Auto-calculate zone defaults only if zones haven't been manually overridden
      if (hrMax) {
        const defaults = calcDefaultZones(hrMax);
        if (!athlete.hr_z1_max) updateField('hr_z1_max', defaults.hr_z1_max);
        if (!athlete.hr_z2_max) updateField('hr_z2_max', defaults.hr_z2_max);
        if (!athlete.hr_z3_max) updateField('hr_z3_max', defaults.hr_z3_max);
        if (!athlete.hr_z4_max) updateField('hr_z4_max', defaults.hr_z4_max);
      }
    }
  }

  // Auto-calculate hr_max from age on first load if not set
  useEffect(() => {
    if (athlete && athlete.age && !athlete.hr_max) {
      const estimated = 220 - athlete.age;
      handleHrMaxChange(estimated);
    }
  }, [athlete?.age, athlete?.hr_max]);

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

        {/* HR Zones Section (separate from onboarding) */}
        <HrZonesSection
          athlete={athlete}
          updateField={updateField}
          expanded={expandedSection === 'hr_zones'}
          onToggle={() => setExpandedSection(expandedSection === 'hr_zones' ? null : 'hr_zones')}
          onHrMaxChange={handleHrMaxChange}
          calcDefaultZones={calcDefaultZones}
        />
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

function StableTextInput({ value, onChange, ...props }) {
  const [display, setDisplay] = useState(value || '');
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDisplay(value || '');
    }
  }, [value]);

  return (
    <input
      type="text"
      {...props}
      value={display}
      onFocus={() => { focused.current = true; }}
      onChange={e => {
        setDisplay(e.target.value);
        onChange(e.target.value || null);
      }}
      onBlur={() => { focused.current = false; }}
    />
  );
}

function StableTextarea({ value, onChange, ...props }) {
  const [display, setDisplay] = useState(value || '');
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDisplay(value || '');
    }
  }, [value]);

  return (
    <textarea
      {...props}
      value={display}
      onFocus={() => { focused.current = true; }}
      onChange={e => {
        setDisplay(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={() => { focused.current = false; }}
    />
  );
}

function PersonalDataFields({ athlete, updateField }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <FieldLabel required>Age</FieldLabel>
        <NumericInput
          type="number"
          className="input-field"
          placeholder="e.g. 28"
          value={athlete.age}
          onChange={val => { if (val !== undefined) updateField('age', val !== null ? Math.round(val) : null); }}
        />
      </div>
      <div>
        <FieldLabel required>Weight (kg)</FieldLabel>
        <NumericInput
          type="number"
          step="0.1"
          className="input-field"
          placeholder="e.g. 65"
          value={athlete.weight_kg}
          onChange={val => { if (val !== undefined) updateField('weight_kg', val); }}
        />
      </div>
      <div>
        <FieldLabel required>Height (cm)</FieldLabel>
        <NumericInput
          type="number"
          className="input-field"
          placeholder="e.g. 170"
          value={athlete.height_cm}
          onChange={val => { if (val !== undefined) updateField('height_cm', val !== null ? Math.round(val) : null); }}
        />
      </div>
      <div>
        <FieldLabel>Body Fat %</FieldLabel>
        <NumericInput
          type="number"
          step="0.1"
          className="input-field"
          placeholder="e.g. 18"
          value={athlete.body_fat_pct}
          onChange={val => { if (val !== undefined) updateField('body_fat_pct', val); }}
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
          { field: 'time_5k', label: '5K', ph: 'MM:SS' },
          { field: 'time_10k', label: '10K', ph: 'MM:SS' },
          { field: 'time_half_marathon', label: 'Half Marathon', ph: 'H:MM:SS' },
          { field: 'time_marathon', label: 'Marathon', ph: 'H:MM:SS' },
        ].map(({ field, label, ph }) => (
          <div key={field}>
            <FieldLabel>{label}</FieldLabel>
            <TimeInput
              value={athlete[field]}
              onChange={seconds => updateField(field, seconds)}
              placeholder={ph}
            />
          </div>
        ))}
      </div>
      {vdot > 0 && (
        <div className="mt-4 p-4 border border-volt bg-volt/5">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-volt font-display text-lg">VDOT: {vdot}</p>
            <span className="text-smoke text-xs" title="VDOT is a performance index based on Jack Daniels' Running Formula. It is not a true VO2max measurement but correlates with running fitness.">(performance index)</span>
          </div>
          {paces && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-smoke">Easy:</span> <span className="text-green-400">{formatPace(paces.pace_easy_min)}-{formatPace(paces.pace_easy_max)}/km</span></div>
              <div><span className="text-smoke">Tempo:</span> <span className="text-yellow-400">{formatPace(paces.pace_tempo)}/km</span></div>
              <div><span className="text-smoke">Threshold:</span> <span className="text-orange-400">{formatPace(paces.pace_lt)}/km</span></div>
              <div><span className="text-smoke">Race:</span> <span className="text-red-400">{formatPace(paces.pace_race)}/km</span></div>
              <div><span className="text-smoke">Interval:</span> <span className="text-red-500">{formatPace(paces.pace_vo2max)}/km</span></div>
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
          <TimeInput
            value={athlete.goal_time_seconds}
            onChange={seconds => updateField('goal_time_seconds', seconds)}
            placeholder="H:MM:SS"
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
      <StableTextarea
        className="input-field h-28"
        placeholder="Describe any current or past injuries, limitations, or health conditions..."
        value={athlete.injuries}
        onChange={val => updateField('injuries', val || null)}
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
        <NumericInput
          type="number"
          step="0.5"
          min="0"
          max="24"
          className="input-field"
          placeholder="e.g. 7.5"
          value={data.avg_hours}
          onChange={val => { if (val !== undefined) updateJsonbField('sleep_data', 'avg_hours', val); }}
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
          <NumericInput
            type="number"
            step="0.1"
            min="0"
            className="input-field"
            placeholder="e.g. 2.5"
            value={data.hydration_liters}
            onChange={val => { if (val !== undefined) updateJsonbField('nutrition_data', 'hydration_liters', val); }}
          />
        </div>
      </div>
      <div>
        <FieldLabel>Pre-Run Nutrition</FieldLabel>
        <StableTextarea
          className="input-field h-20"
          placeholder="What do you eat before running?"
          value={data.pre_run_nutrition}
          onChange={val => updateJsonbField('nutrition_data', 'pre_run_nutrition', val)}
        />
      </div>
      <div>
        <FieldLabel>Post-Run Nutrition</FieldLabel>
        <StableTextarea
          className="input-field h-20"
          placeholder="What do you eat/drink after running?"
          value={data.post_run_nutrition}
          onChange={val => updateJsonbField('nutrition_data', 'post_run_nutrition', val)}
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
        <NumericInput
          type="number"
          min="0"
          className="input-field"
          placeholder="e.g. 30"
          value={data.commute_minutes}
          onChange={val => { if (val !== undefined) updateJsonbField('work_life_data', 'commute_minutes', val !== null ? Math.round(val) : null); }}
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
        <StableTextarea
          className="input-field h-20"
          placeholder="What do you do on rest days? Walking, swimming, etc."
          value={data.rest_day_activities}
          onChange={val => updateJsonbField('recovery_data', 'rest_day_activities', val)}
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
          <NumericInput
            type="number"
            min="0"
            className="input-field"
            placeholder="e.g. 3"
            value={data.experience_years}
            onChange={val => { if (val !== undefined) updateJsonbField('current_training_data', 'experience_years', val !== null ? Math.round(val) : null); }}
          />
        </div>
        <div>
          <FieldLabel required>Longest Run (km)</FieldLabel>
          <NumericInput
            type="number"
            step="0.1"
            min="0"
            className="input-field"
            placeholder="e.g. 21"
            value={data.longest_run_km}
            onChange={val => { if (val !== undefined) updateJsonbField('current_training_data', 'longest_run_km', val); }}
          />
        </div>
        <div>
          <FieldLabel>Runs / Week</FieldLabel>
          <NumericInput
            type="number"
            min="0"
            max="14"
            className="input-field"
            placeholder="e.g. 4"
            value={data.runs_per_week}
            onChange={val => { if (val !== undefined) updateJsonbField('current_training_data', 'runs_per_week', val !== null ? Math.round(val) : null); }}
          />
        </div>
      </div>
    </div>
  );
}

function HrZonesSection({ athlete, updateField, expanded, onToggle, onHrMaxChange, calcDefaultZones }) {
  const hrMax = athlete.hr_max;
  const defaults = calcDefaultZones(hrMax);
  const estimatedMax = athlete.age ? 220 - athlete.age : null;

  function zoneRange(zoneMin, zoneMax) {
    if (!zoneMin && !zoneMax) return '--';
    return `${zoneMin || '?'}-${zoneMax || '?'} bpm`;
  }

  return (
    <div className={`border ${expanded ? 'border-volt' : 'border-ash'} transition-colors`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-steel transition-colors"
      >
        <div className="flex items-center gap-3">
          {hrMax ? (
            <CheckCircle size={16} className="text-volt" />
          ) : (
            <Circle size={16} className="text-smoke" />
          )}
          <Heart size={16} className="text-red-400" />
          <div className="text-left">
            <p className="font-display text-base">HEART RATE ZONES</p>
            <p className="text-smoke text-xs uppercase tracking-wider">HR-based training</p>
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-smoke transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="p-6 border-t border-ash bg-steel">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FieldLabel>Max HR (bpm)</FieldLabel>
              <NumericInput
                type="number"
                className="input-field"
                placeholder={estimatedMax ? `Auto: ${estimatedMax}` : 'e.g. 190'}
                value={athlete.hr_max}
                onChange={onHrMaxChange}
              />
              {estimatedMax && !athlete.hr_max && (
                <p className="text-smoke text-xs mt-1">Estimated from age: {estimatedMax} bpm (220 - {athlete.age})</p>
              )}
            </div>
            <div>
              <FieldLabel>Resting HR (bpm)</FieldLabel>
              <NumericInput
                type="number"
                className="input-field"
                placeholder="e.g. 55"
                value={athlete.hr_resting}
                onChange={val => { if (val !== undefined) updateField('hr_resting', val !== null ? Math.round(val) : null); }}
              />
            </div>
          </div>

          {hrMax && (
            <>
              <p className="text-smoke text-xs uppercase tracking-wider mb-3">Zone Thresholds (upper limit bpm — editable)</p>
              <div className="space-y-3">
                <ZoneRow
                  zone="Z1" label="Recovery" color="text-blue-400" percent="<50%"
                  range={`<${athlete.hr_z1_max || defaults.hr_z1_max} bpm`}
                  value={athlete.hr_z1_max || defaults.hr_z1_max}
                  onChange={val => { if (val !== undefined) updateField('hr_z1_max', val !== null ? Math.round(val) : null); }}
                />
                <ZoneRow
                  zone="Z2" label="Easy" color="text-green-400" percent="50-75%"
                  range={zoneRange(athlete.hr_z1_max || defaults.hr_z1_max, athlete.hr_z2_max || defaults.hr_z2_max)}
                  value={athlete.hr_z2_max || defaults.hr_z2_max}
                  onChange={val => { if (val !== undefined) updateField('hr_z2_max', val !== null ? Math.round(val) : null); }}
                />
                <ZoneRow
                  zone="Z3" label="Tempo" color="text-yellow-400" percent="75-85%"
                  range={zoneRange(athlete.hr_z2_max || defaults.hr_z2_max, athlete.hr_z3_max || defaults.hr_z3_max)}
                  value={athlete.hr_z3_max || defaults.hr_z3_max}
                  onChange={val => { if (val !== undefined) updateField('hr_z3_max', val !== null ? Math.round(val) : null); }}
                />
                <ZoneRow
                  zone="Z4" label="Threshold" color="text-orange-400" percent="85-92%"
                  range={zoneRange(athlete.hr_z3_max || defaults.hr_z3_max, athlete.hr_z4_max || defaults.hr_z4_max)}
                  value={athlete.hr_z4_max || defaults.hr_z4_max}
                  onChange={val => { if (val !== undefined) updateField('hr_z4_max', val !== null ? Math.round(val) : null); }}
                />
                <div className="flex items-center gap-3 px-3 py-2 border border-ash bg-carbon">
                  <span className="text-red-400 font-bold text-xs w-8">Z5</span>
                  <span className="text-xs text-smoke w-20">VO2max</span>
                  <span className="text-xs text-smoke w-16">&gt;92%</span>
                  <span className="text-xs text-white flex-1">&gt;{athlete.hr_z4_max || defaults.hr_z4_max} bpm</span>
                </div>
              </div>

              <button
                onClick={() => {
                  const d = calcDefaultZones(hrMax);
                  updateField('hr_z1_max', d.hr_z1_max);
                  updateField('hr_z2_max', d.hr_z2_max);
                  updateField('hr_z3_max', d.hr_z3_max);
                  updateField('hr_z4_max', d.hr_z4_max);
                }}
                className="btn-ghost text-xs mt-4 flex items-center gap-2"
              >
                <RefreshCw size={12} />
                RESET TO DEFAULTS
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ZoneRow({ zone, label, color, percent, range, value, onChange }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border border-ash bg-carbon">
      <span className={`${color} font-bold text-xs w-8`}>{zone}</span>
      <span className="text-xs text-smoke w-20">{label}</span>
      <span className="text-xs text-smoke w-16">{percent}</span>
      <span className="text-xs text-white flex-1">{range}</span>
      <NumericInput
        type="number"
        className="input-field w-20 text-center text-xs"
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function TechnologyFields({ athlete, updateField }) {
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaMsg, setStravaMsg] = useState('');
  const isStravaConnected = !!athlete.strava_athlete_id;

  // Check URL for strava=connected on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
      setStravaMsg('Strava connected successfully!');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function handleStravaConnect() {
    setStravaLoading(true);
    setStravaMsg('');
    try {
      const { url } = await api.stravaConnect(athlete.id);
      window.location.href = url;
    } catch (err) {
      setStravaMsg(err.message || 'Failed to connect Strava');
      setStravaLoading(false);
    }
  }

  async function handleStravaDisconnect() {
    setStravaLoading(true);
    setStravaMsg('');
    try {
      await api.stravaDisconnect(athlete.id);
      setStravaMsg('Strava disconnected');
      // Force re-fetch athlete to clear strava_athlete_id
      window.location.reload();
    } catch (err) {
      setStravaMsg(err.message || 'Failed to disconnect');
      setStravaLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Strava Integration */}
      <div>
        <FieldLabel>Strava</FieldLabel>
        <div className="flex items-center gap-3 mt-1">
          {isStravaConnected ? (
            <>
              <span className="flex items-center gap-2 text-sm text-green-400 font-semibold">
                <Check size={16} /> Strava Connected
              </span>
              <button
                onClick={handleStravaDisconnect}
                disabled={stravaLoading}
                className="px-3 py-1.5 border border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs uppercase font-bold tracking-wider flex items-center gap-1 transition-colors"
              >
                {stravaLoading ? <Loader size={12} className="animate-spin" /> : <Unlink size={12} />}
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleStravaConnect}
              disabled={stravaLoading}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm uppercase tracking-wider flex items-center gap-2 transition-colors"
            >
              {stravaLoading ? <Loader size={14} className="animate-spin" /> : <Link2 size={14} />}
              Connect Strava
            </button>
          )}
        </div>
        {stravaMsg && (
          <p className={`text-xs mt-2 ${stravaMsg.includes('success') || stravaMsg.includes('connected') ? 'text-green-400' : 'text-red-400'}`}>
            {stravaMsg}
          </p>
        )}
      </div>

      <div>
        <FieldLabel>GPS Watch Model</FieldLabel>
        <StableTextInput
          className="input-field"
          placeholder="e.g. Garmin Forerunner 255"
          value={athlete.gps_watch_model}
          onChange={val => updateField('gps_watch_model', val)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Intervals.icu API Key</FieldLabel>
          <StableTextInput
            className="input-field"
            placeholder="Optional"
            value={athlete.intervals_icu_api_key}
            onChange={val => updateField('intervals_icu_api_key', val)}
          />
        </div>
        <div>
          <FieldLabel>Intervals.icu Athlete ID</FieldLabel>
          <StableTextInput
            className="input-field"
            placeholder="Optional"
            value={athlete.intervals_icu_athlete_id}
            onChange={val => updateField('intervals_icu_athlete_id', val)}
          />
        </div>
      </div>
      <p className="text-smoke text-xs">All fields in this section are optional.</p>
    </div>
  );
}
