import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Sparkline from '../components/ui/Sparkline';
import { Users, Target, Calendar, TrendingUp, ChevronRight, Plus, Zap, AlertTriangle, Shield, Activity, UserX, Heart } from 'lucide-react';

const ACWR_ZONE = {
  green:  { bg: 'bg-green-500/20',  border: 'border-green-500',  text: 'text-green-400',  label: 'OPTIMAL' },
  yellow: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', label: 'CAUTION' },
  red:    { bg: 'bg-red-500/20',    border: 'border-red-500',    text: 'text-red-400',    label: 'DANGER' },
};

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const data = await api.getDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-volt font-display text-xl animate-pulse">LOADING DASHBOARD...</div>;
  }

  if (error) {
    return <div className="text-red-400">{error}</div>;
  }

  const athletes = dashboard?.athletes || [];
  const withPlans = athletes.filter(a => a.active_plan);
  const upcoming = athletes.filter(a => a.weeks_to_race && a.weeks_to_race <= 4);
  const incompleteProfiles = athletes.filter(a => a.onboarding && !a.onboarding.isComplete);

  // Flagged athletes: ACWR >1.3, avg RPE >8 for 3+ days, pain in 7 days, low readiness
  const flagged = athletes.filter(a => {
    const m = a.monitoring;
    if (!m) return false;
    return (m.readiness_score !== null && m.readiness_score < 2.5) ||
           m.acwr_zone === 'red' || m.acwr_zone === 'yellow' ||
           m.pain_flag_7d ||
           m.rpe_high_days >= 3;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl sm:text-4xl text-volt">DASHBOARD</h1>
          <p className="text-smoke uppercase tracking-wider text-xs sm:text-sm mt-1">Coach Overview</p>
        </div>
        <Link to="/athletes/new" className="btn-primary flex items-center gap-2 flex-shrink-0 text-xs sm:text-sm">
          <Plus size={16} />
          <span className="hidden sm:inline">ADD ATHLETE</span>
          <span className="sm:hidden">ADD</span>
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users size={20} />} value={athletes.length} label="Total Athletes" />
        <StatCard icon={<Target size={20} />} value={withPlans.length} label="Active Plans" />
        <StatCard icon={<Calendar size={20} />} value={upcoming.length} label="Race in 4 Weeks" />
        {incompleteProfiles.length > 0 ? (
          <StatCard icon={<UserX size={20} />} value={incompleteProfiles.length} label="Incomplete Profiles" warning />
        ) : (
          <StatCard
            icon={<TrendingUp size={20} />}
            value={athletes.reduce((sum, a) => sum + (a.workouts_this_week || 0), 0)}
            label="Workouts This Week"
          />
        )}
      </div>

      {/* Flagged Athletes */}
      {flagged.length > 0 && (
        <div className="mb-8">
          <h2 className="font-display text-xl mb-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-400" />
            FLAGGED ATHLETES
          </h2>
          <div className="space-y-2">
            {flagged.map(a => {
              const m = a.monitoring;
              return (
                <Link
                  key={a.id}
                  to={`/athletes/${a.id}/load`}
                  className="flex items-center justify-between px-4 py-3 border border-red-500/30 bg-red-900/10 hover:border-red-500 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={16} className="text-red-400" />
                    <span className="font-semibold uppercase text-sm">{a.name}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 text-xs flex-shrink-0">
                    {(m?.acwr_zone === 'red' || m?.acwr_zone === 'yellow') && (
                      <span className={`hidden sm:inline ${m.acwr_zone === 'red' ? 'text-red-400' : 'text-yellow-400'}`}>
                        ACWR: {m.acwr_ratio}
                      </span>
                    )}
                    {m?.rpe_high_days >= 3 && (
                      <span className="text-orange-400 hidden sm:inline">RPE High {m.rpe_high_days}d</span>
                    )}
                    {m?.pain_flag_7d && (
                      <span className="text-red-400 hidden sm:inline">Pain</span>
                    )}
                    {m?.readiness_score !== null && m.readiness_score < 2.5 && (
                      <span className="text-red-400 hidden sm:inline">Readiness: {m.readiness_score}</span>
                    )}
                    <ChevronRight size={14} className="text-smoke" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Athletes Grid */}
      <div className="mb-4">
        <h2 className="font-display text-xl sm:text-2xl mb-4">ATHLETES</h2>
      </div>

      {athletes.length === 0 ? (
        <div className="card text-center py-12">
          <Zap size={40} className="text-volt mx-auto mb-4" />
          <p className="text-smoke text-lg uppercase tracking-wider">No athletes yet</p>
          <Link to="/athletes/new" className="btn-primary mt-4 inline-block">
            ADD FIRST ATHLETE
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {athletes.map(athlete => (
            <AthleteCard key={athlete.id} athlete={athlete} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, value, label, warning }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-2">
        <div className={warning ? 'text-yellow-400' : 'text-volt'}>{icon}</div>
      </div>
      <p className={warning ? 'text-yellow-400 font-display text-3xl' : 'stat-value'}>{value}</p>
      <p className="text-smoke text-xs uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function AthleteCard({ athlete }) {
  const weeksLabel = athlete.weeks_to_race != null
    ? `${athlete.weeks_to_race}W`
    : '--';

  const statusColor = athlete.active_plan
    ? 'text-green-400'
    : 'text-yellow-400';

  const m = athlete.monitoring;
  const zone = m?.acwr_zone ? (ACWR_ZONE[m.acwr_zone] || ACWR_ZONE.green) : null;

  // Readiness color
  const readinessColor = m?.readiness_score >= 3.5 ? 'text-green-400' :
                          m?.readiness_score >= 2.5 ? 'text-yellow-400' :
                          m?.readiness_score ? 'text-red-400' : null;

  // Auto-flag: ACWR >1.3, avg RPE >8 for 3+ days, pain in 7 days
  const hasFlag = m && (
    (m.acwr_ratio > 1.3) ||
    (m.rpe_high_days >= 3) ||
    m.pain_flag_7d
  );

  return (
    <Link to={`/athletes/${athlete.id}`} className="card hover:border-volt transition-colors group">
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <h3 className="font-body font-bold text-lg uppercase truncate">{athlete.name}</h3>
          <p className="text-smoke text-xs truncate">{athlete.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasFlag && (
            <span title="Athlete flagged — check Load page" className="text-red-400">
              <AlertTriangle size={16} />
            </span>
          )}
          <ChevronRight size={20} className="text-smoke group-hover:text-volt transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-smoke text-xs uppercase">Goal</p>
          <p className="text-white font-semibold text-sm">{athlete.goal_race || '--'}</p>
        </div>
        <div>
          <p className="text-smoke text-xs uppercase">Race In</p>
          <p className="text-volt font-bold text-sm">{weeksLabel}</p>
        </div>
        <div>
          <p className="text-smoke text-xs uppercase">VDOT</p>
          <p className="text-white font-semibold text-sm">{athlete.vdot || '--'}</p>
        </div>
      </div>

      {/* Monitoring badges row */}
      {m && (
        <div className="flex flex-wrap items-center gap-2 mb-3 py-2 border-t border-b border-ash">
          {/* ACWR Badge */}
          {zone && m.acwr_ratio > 0 && (
            <div className={`flex items-center gap-1.5 px-2 py-1 border ${zone.border} ${zone.bg}`}>
              <Shield size={12} className={zone.text} />
              <span className={`text-xs font-bold ${zone.text}`}>{m.acwr_ratio}</span>
            </div>
          )}

          {/* Readiness */}
          {readinessColor && (
            <div className="flex items-center gap-1.5">
              <Activity size={12} className="text-smoke" />
              <span className={`text-xs font-bold ${readinessColor}`}>
                {m.readiness_score}
              </span>
            </div>
          )}

          {/* RPE */}
          {m.avg_rpe && (
            <div className="flex items-center gap-1.5">
              <Heart size={12} className="text-smoke" />
              <span className="text-smoke text-[10px] uppercase">RPE</span>
              <span className={`text-xs font-bold ${m.avg_rpe <= 6 ? 'text-green-400' : m.avg_rpe <= 8 ? 'text-yellow-400' : 'text-red-400'}`}>
                {m.avg_rpe}
              </span>
            </div>
          )}

          {/* Pain indicator */}
          {m.pain_flag_7d && (
            <span className="text-red-400 text-xs font-bold uppercase px-2 py-1 border border-red-500/30 bg-red-500/10">
              PAIN
            </span>
          )}

          {/* RPE sparkline */}
          {m.rpe_sparkline?.length > 1 && (
            <Sparkline data={m.rpe_sparkline} width={50} height={16} color="#FF6B6B" />
          )}
        </div>
      )}

      {/* Onboarding progress */}
      {athlete.onboarding && !athlete.onboarding.isComplete && (
        <div className="mb-3 py-2 border-t border-ash">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-yellow-400 font-semibold uppercase">Profile {athlete.onboarding.percent}%</span>
            <span className="text-smoke">{athlete.onboarding.completed}/{athlete.onboarding.total}</span>
          </div>
          <div className="w-full h-1.5 bg-ash">
            <div className="h-full bg-yellow-400 transition-all" style={{ width: `${athlete.onboarding.percent}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-ash">
        <span className={`text-xs font-semibold uppercase ${statusColor}`}>
          {athlete.active_plan ? 'PLAN ACTIVE' : 'NO PLAN'}
        </span>
        {athlete.last_activity && (
          <span className="text-smoke text-xs">
            Last: {athlete.last_activity.workout_date}
          </span>
        )}
      </div>
    </Link>
  );
}
