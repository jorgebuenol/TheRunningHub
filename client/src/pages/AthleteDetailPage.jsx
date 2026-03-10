import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatPace, formatTime } from '../lib/vdot';
import { getOverallProgress, getSectionStatus, ONBOARDING_SECTIONS } from '@shared/onboardingProgress';
import {
  Zap, Calendar, Target, TrendingUp, RefreshCw, Send, ArrowLeft,
  Activity, Shield, AlertTriangle, CheckCircle, Circle, CircleDot,
  User, Heart, Moon, Apple, Briefcase, Dumbbell, Smartphone, MessageSquare, BarChart3,
} from 'lucide-react';

// ─── Lookup constants (for human-readable labels) ───────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

const TRAINING_STRUCTURE_OPTIONS = [
  { value: 'none', label: 'None / Just Started' },
  { value: 'self_coached', label: 'Self-Coached' },
  { value: 'group_training', label: 'Group Training' },
  { value: 'previous_coach', label: 'Previous Coach' },
  { value: 'app_based', label: 'App-Based' },
];

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

function labelFor(options, value) {
  if (!value) return null;
  const opt = options.find(o => o.value === value);
  return opt ? opt.label : value;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AthleteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [monitoring, setMonitoring] = useState(null);

  useEffect(() => {
    loadAthlete();
  }, [id]);

  async function loadAthlete() {
    try {
      const [data, mon] = await Promise.all([
        api.getAthlete(id),
        api.getMonitoring(id).catch(() => null),
      ]);
      setAthlete(data);
      setMonitoring(mon);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePlan() {
    setGenerating(true);
    setMessage('');
    try {
      const plan = await api.generatePlan(id);
      navigate(`/plans/${plan.id}`);
    } catch (err) {
      if (err.missing_sections) {
        setMessage(`Error: ${err.message}. Missing: ${err.missing_sections.map(s => s.title).join(', ')}`);
      } else {
        setMessage(`Error: ${err.message}`);
      }
      setGenerating(false);
    }
  }

  async function handleSyncIntervals() {
    setSyncing(true);
    setMessage('');
    try {
      const activePlan = athlete.training_plans?.find(p => p.status === 'approved');
      if (!activePlan) {
        setMessage('No active plan to sync');
        return;
      }
      const result = await api.syncToIntervals(id, activePlan.id);
      setMessage(`Synced ${result.synced}/${result.total} workouts to Intervals.icu`);
    } catch (err) {
      setMessage(`Sync error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handlePullIntervals() {
    setSyncing(true);
    setMessage('');
    try {
      const result = await api.pullFromIntervals(id);
      setMessage(`Found ${result.activities_found} activities, matched ${result.workouts_matched} workouts`);
      loadAthlete();
    } catch (err) {
      setMessage(`Pull error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="text-volt font-display text-xl animate-pulse">LOADING ATHLETE...</div>;
  }

  if (!athlete) {
    return <div className="text-red-400">Athlete not found</div>;
  }

  const activePlan = athlete.training_plans?.find(p => p.status === 'approved');
  const weeksToRace = athlete.goal_race_date
    ? Math.ceil((new Date(athlete.goal_race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000))
    : null;
  const onboarding = getOverallProgress(athlete);
  const profileIncomplete = !onboarding.isComplete;

  return (
    <div>
      {/* Back link */}
      <Link to="/athletes" className="flex items-center gap-2 text-smoke hover:text-volt text-sm uppercase tracking-wider mb-6 transition-colors">
        <ArrowLeft size={16} />
        Back to Athletes
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-volt">{athlete.profiles?.full_name}</h1>
          <p className="text-smoke uppercase tracking-wider text-sm mt-1">{athlete.profiles?.email}</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={handleGeneratePlan}
          disabled={generating || profileIncomplete}
          className={`flex items-center gap-2 ${profileIncomplete ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
          title={profileIncomplete ? 'Athlete profile must be 100% complete' : ''}
        >
          <Zap size={16} />
          {generating ? 'GENERATING...' : 'GENERATE PLAN'}
        </button>
        {activePlan && (
          <Link to={`/calendar/${id}`} className="btn-secondary flex items-center gap-2">
            <Calendar size={16} />
            CALENDAR
          </Link>
        )}
        <Link to={`/athletes/${id}/load`} className="btn-secondary flex items-center gap-2">
          <BarChart3 size={16} />
          LOAD
        </Link>
        <Link to="/chat" className="btn-secondary flex items-center gap-2">
          <MessageSquare size={16} />
          AI CHAT
        </Link>
        <button disabled className="btn-ghost flex items-center gap-2 opacity-50 cursor-not-allowed" title="Coming soon">
          <Send size={16} />
          MESSAGE ATHLETE
        </button>
      </div>

      {/* Status message */}
      {message && (
        <div className={`px-4 py-3 mb-6 text-sm border ${
          message.startsWith('Error') ? 'bg-red-900/30 border-red-500 text-red-300' : 'bg-green-900/30 border-green-500 text-green-300'
        }`}>
          {message}
        </div>
      )}

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <StatBox label="VO2max" value={athlete.vdot || '--'} accent />
        <StatBox label="Weekly KM" value={athlete.weekly_km || '--'} />
        <StatBox label="Goal" value={athlete.goal_race || '--'} />
        <StatBox label="Target" value={athlete.goal_time_seconds ? formatTime(athlete.goal_time_seconds) : '--'} />
        <StatBox label="Weeks to Race" value={weeksToRace ?? '--'} accent />
        <StatBox
          label="ACWR"
          value={monitoring?.acwr?.ratio ?? '--'}
          color={
            monitoring?.acwr?.zone === 'green' ? 'text-green-400' :
            monitoring?.acwr?.zone === 'yellow' ? 'text-yellow-400' :
            monitoring?.acwr?.ratio ? 'text-red-400' : undefined
          }
        />
      </div>

      {/* Onboarding Progress */}
      <div className="card mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg flex items-center gap-2">
            {profileIncomplete ? (
              <AlertTriangle size={18} className="text-yellow-400" />
            ) : (
              <CheckCircle size={18} className="text-green-400" />
            )}
            PROFILE — {onboarding.percent}%
          </h2>
          <span className="text-smoke text-xs uppercase">
            {onboarding.completed}/{onboarding.total} sections
          </span>
        </div>
        <div className="w-full h-2 bg-ash mb-4">
          <div
            className={`h-full transition-all ${profileIncomplete ? 'bg-yellow-400' : 'bg-green-400'}`}
            style={{ width: `${onboarding.percent}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {ONBOARDING_SECTIONS.map(section => {
            const status = onboarding.sections[section.id];
            const Icon = status === 'complete' ? CheckCircle : status === 'partial' ? CircleDot : Circle;
            const color = status === 'complete' ? 'text-green-400' : status === 'partial' ? 'text-yellow-400' : 'text-smoke';
            return (
              <div key={section.id} className="flex items-center gap-1.5">
                <Icon size={14} className={color} />
                <span className={`text-xs uppercase ${color}`}>{section.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 11 Profile Sections ─────────────────────────────────────── */}
      <div className="space-y-4 mb-8">
        {/* 1. Personal Data */}
        <ProfileSection icon={User} title="PERSONAL DATA" status={onboarding.sections.personal_data}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <FieldValue label="Age" value={athlete.age} suffix=" years" />
            <FieldValue label="Weight" value={athlete.weight_kg} suffix=" kg" />
            <FieldValue label="Height" value={athlete.height_cm} suffix=" cm" />
            <FieldValue label="Body Fat" value={athlete.body_fat_pct} suffix="%" />
          </div>
        </ProfileSection>

        {/* 2. Running History */}
        <ProfileSection icon={Activity} title="RUNNING HISTORY" status={onboarding.sections.running_history}>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <FieldValue label="Weekly KM" value={athlete.weekly_km} />
            <FieldValue label="5K" value={athlete.time_5k ? formatTime(athlete.time_5k) : null} />
            <FieldValue label="10K" value={athlete.time_10k ? formatTime(athlete.time_10k) : null} />
            <FieldValue label="Half Marathon" value={athlete.time_half_marathon ? formatTime(athlete.time_half_marathon) : null} />
            <FieldValue label="Marathon" value={athlete.time_marathon ? formatTime(athlete.time_marathon) : null} />
          </div>
        </ProfileSection>

        {/* 3. Goal */}
        <ProfileSection icon={Target} title="GOAL" status={onboarding.sections.goal}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <FieldValue label="Goal Race" value={athlete.goal_race} />
            <FieldValue label="Target Time" value={athlete.goal_time_seconds ? formatTime(athlete.goal_time_seconds) : null} />
            <FieldValue label="Race Date" value={athlete.goal_race_date} />
          </div>
        </ProfileSection>

        {/* 4. Availability */}
        <ProfileSection icon={Calendar} title="AVAILABILITY" status={onboarding.sections.availability}>
          <div className="space-y-4">
            <div>
              <p className="text-smoke text-xs uppercase mb-2">Available Days</p>
              {athlete.available_days?.length > 0 ? (
                <PillList items={athlete.available_days.map(d => d.substring(0, 3))} />
              ) : (
                <span className="text-smoke italic text-sm">—</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FieldValue label="Start Time" value={athlete.available_time_start} />
              <FieldValue label="End Time" value={athlete.available_time_end} />
            </div>
          </div>
        </ProfileSection>

        {/* 5. Health */}
        <ProfileSection icon={Heart} title="HEALTH & INJURIES" status={onboarding.sections.health}>
          <TextBlock label="Injuries / Limitations" value={athlete.injuries} emptyText="No injuries reported" />
        </ProfileSection>

        {/* 6. Sleep */}
        <ProfileSection icon={Moon} title="SLEEP HABITS" status={onboarding.sections.sleep}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <FieldValue label="Avg Hours / Night" value={athlete.sleep_data?.avg_hours} suffix=" hrs" />
            <FieldValue label="Quality" value={labelFor(QUALITY_OPTIONS, athlete.sleep_data?.quality)} />
            <FieldValue label="Consistency" value={labelFor(CONSISTENCY_OPTIONS, athlete.sleep_data?.consistency)} />
          </div>
        </ProfileSection>

        {/* 7. Nutrition */}
        <ProfileSection icon={Apple} title="NUTRITION" status={onboarding.sections.nutrition}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <FieldValue label="Diet Type" value={labelFor(DIET_OPTIONS, athlete.nutrition_data?.diet_type)} />
            <FieldValue label="Hydration" value={athlete.nutrition_data?.hydration_liters} suffix=" L / day" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TextBlock label="Pre-Run Nutrition" value={athlete.nutrition_data?.pre_run_nutrition} />
            <TextBlock label="Post-Run Nutrition" value={athlete.nutrition_data?.post_run_nutrition} />
          </div>
        </ProfileSection>

        {/* 8. Work / Life */}
        <ProfileSection icon={Briefcase} title="WORK & LIFE" status={onboarding.sections.work_life}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <FieldValue label="Work Schedule" value={labelFor(WORK_SCHEDULE_OPTIONS, athlete.work_life_data?.work_schedule)} />
            <FieldValue label="Stress Level" value={labelFor(STRESS_OPTIONS, athlete.work_life_data?.stress_level)} />
            <FieldValue label="Commute" value={athlete.work_life_data?.commute_minutes} suffix=" min" />
          </div>
        </ProfileSection>

        {/* 9. Recovery */}
        <ProfileSection icon={RefreshCw} title="RECOVERY" status={onboarding.sections.recovery}>
          <div className="space-y-4">
            <div>
              <p className="text-smoke text-xs uppercase mb-2">Recovery Methods</p>
              {athlete.recovery_data?.methods?.length > 0 ? (
                <PillList items={athlete.recovery_data.methods.map(m => m.replace(/_/g, ' '))} />
              ) : (
                <span className="text-smoke italic text-sm">—</span>
              )}
            </div>
            <TextBlock label="Rest Day Activities" value={athlete.recovery_data?.rest_day_activities} />
          </div>
        </ProfileSection>

        {/* 10. Current Training */}
        <ProfileSection icon={Dumbbell} title="CURRENT TRAINING" status={onboarding.sections.current_training}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <FieldValue label="Structure" value={labelFor(TRAINING_STRUCTURE_OPTIONS, athlete.current_training_data?.structure)} />
            <FieldValue label="Experience" value={athlete.current_training_data?.experience_years} suffix=" years" />
            <FieldValue label="Longest Run" value={athlete.current_training_data?.longest_run_km} suffix=" km" />
            <FieldValue label="Runs / Week" value={athlete.current_training_data?.runs_per_week} />
          </div>
        </ProfileSection>

        {/* 11. Technology */}
        <ProfileSection icon={Smartphone} title="TECHNOLOGY & DEVICES" status={onboarding.sections.technology}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <FieldValue label="GPS Watch" value={athlete.gps_watch_model} />
            <FieldValue label="Intervals.icu ID" value={athlete.intervals_icu_athlete_id} />
            <FieldValue label="Intervals.icu API Key" value={athlete.intervals_icu_api_key ? '••••••••' : null} />
          </div>
        </ProfileSection>
      </div>

      {/* Training Paces */}
      <div className="card mb-8">
        <h2 className="font-display text-xl mb-4">TRAINING PACES</h2>
        <div className="space-y-3">
          <PaceRow label="Easy" value={`${formatPace(athlete.pace_easy_min)} - ${formatPace(athlete.pace_easy_max)}`} color="text-green-400" />
          <PaceRow label="Tempo" value={formatPace(athlete.pace_tempo)} color="text-yellow-400" />
          <PaceRow label="Threshold" value={formatPace(athlete.pace_lt)} color="text-orange-400" />
          <PaceRow label="Race Pace" value={formatPace(athlete.pace_race)} color="text-red-400" />
          <PaceRow label="VO2max" value={formatPace(athlete.pace_vo2max)} color="text-volt" />
        </div>
      </div>

      {/* Monitoring Quick View */}
      {monitoring && (
        <Link
          to={`/athletes/${id}/monitoring`}
          className="card mb-8 hover:border-volt transition-colors group block"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl flex items-center gap-2">
              <Activity size={18} className="text-volt" />
              MONITORING
            </h2>
            <span className="text-smoke text-xs uppercase group-hover:text-volt transition-colors">View Full →</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-smoke text-xs uppercase">Readiness (7d)</p>
              <p className={`font-display text-xl ${
                monitoring.readiness?.average_7d >= 3.5 ? 'text-green-400' :
                monitoring.readiness?.average_7d >= 2.5 ? 'text-yellow-400' :
                monitoring.readiness?.average_7d ? 'text-red-400' : 'text-smoke'
              }`}>
                {monitoring.readiness?.average_7d ?? '--'}
              </p>
            </div>
            <div>
              <p className="text-smoke text-xs uppercase flex items-center gap-1">
                <Shield size={12} />
                ACWR
              </p>
              <p className={`font-display text-xl ${
                monitoring.acwr?.zone === 'green' ? 'text-green-400' :
                monitoring.acwr?.zone === 'yellow' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {monitoring.acwr?.ratio ?? '--'}
              </p>
            </div>
            <div>
              <p className="text-smoke text-xs uppercase">Compliance</p>
              <p className="text-white font-display text-xl">{monitoring.compliance?.rate ?? '--'}%</p>
            </div>
            <div>
              <p className="text-smoke text-xs uppercase">Flags</p>
              <p className={`font-display text-xl ${monitoring.flags?.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {monitoring.flags?.length || 0}
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Training Plans */}
      <div className="card mb-8">
        <h2 className="font-display text-xl mb-4">TRAINING PLANS</h2>
        {athlete.training_plans?.length > 0 ? (
          <div className="space-y-2">
            {athlete.training_plans.map(plan => (
              <Link
                key={plan.id}
                to={`/plans/${plan.id}`}
                className="flex items-center justify-between p-4 border border-ash hover:border-volt transition-colors"
              >
                <div>
                  <p className="font-semibold">{plan.name}</p>
                  <p className="text-smoke text-xs">{plan.total_weeks} weeks | {plan.goal_race}</p>
                </div>
                <span className={`text-xs font-bold uppercase ${
                  plan.status === 'approved' ? 'text-green-400' :
                  plan.status === 'draft' ? 'text-volt' :
                  plan.status === 'archived' ? 'text-smoke/50' : 'text-smoke'
                }`}>
                  {plan.status === 'approved' ? 'PUBLISHED' : plan.status.toUpperCase()}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-smoke text-sm">No plans yet. Generate one above.</p>
        )}
      </div>

      {/* Intervals.icu */}
      {(athlete.intervals_icu_api_key || athlete.intervals_icu_athlete_id) && (
        <div className="card">
          <h2 className="font-display text-xl mb-4">INTERVALS.ICU</h2>
          <p className="text-smoke text-xs mb-4">Athlete ID: {athlete.intervals_icu_athlete_id || 'Not configured'}</p>
          <div className="flex gap-3">
            <button onClick={handleSyncIntervals} disabled={syncing} className="btn-secondary flex items-center gap-2">
              <Send size={14} />
              PUSH TO INTERVALS
            </button>
            <button onClick={handlePullIntervals} disabled={syncing} className="btn-ghost flex items-center gap-2">
              <RefreshCw size={14} />
              PULL ACTIVITIES
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────────────────────────

function StatBox({ label, value, accent, color }) {
  const textColor = color || (accent ? 'text-volt' : 'text-white');
  return (
    <div className="card text-center">
      <p className={`font-display text-2xl ${textColor}`}>{value}</p>
      <p className="text-smoke text-xs uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function ProfileSection({ icon: Icon, title, status, children }) {
  const statusBadge = {
    complete: { text: 'COMPLETE', color: 'text-green-400 border-green-400/30' },
    partial: { text: 'PARTIAL', color: 'text-yellow-400 border-yellow-400/30' },
    empty: { text: 'EMPTY', color: 'text-smoke border-ash' },
  };
  const badge = statusBadge[status] || statusBadge.empty;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg flex items-center gap-2">
          <Icon size={18} className="text-volt" />
          {title}
        </h2>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${badge.color}`}>
          {badge.text}
        </span>
      </div>
      {children}
    </div>
  );
}

function FieldValue({ label, value, suffix = '' }) {
  const display = value != null && value !== '' ? `${value}${suffix}` : null;
  return (
    <div>
      <p className="text-smoke text-xs uppercase">{label}</p>
      {display ? (
        <p className="font-semibold text-white">{display}</p>
      ) : (
        <p className="text-smoke italic text-sm">—</p>
      )}
    </div>
  );
}

function TextBlock({ label, value, emptyText }) {
  return (
    <div>
      <p className="text-smoke text-xs uppercase mb-1">{label}</p>
      {value && value.trim() ? (
        <p className="text-white text-sm whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-smoke italic text-sm">{emptyText || '—'}</p>
      )}
    </div>
  );
}

function PillList({ items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <span key={item} className="px-2 py-1 text-xs uppercase font-bold tracking-wider border border-ash text-smoke">
          {item}
        </span>
      ))}
    </div>
  );
}

function PaceRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-ash last:border-0">
      <span className="text-smoke text-sm uppercase">{label}</span>
      <span className={`font-semibold ${color}`}>{value} /km</span>
    </div>
  );
}
