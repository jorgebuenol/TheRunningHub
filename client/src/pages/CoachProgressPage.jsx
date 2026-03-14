import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatPace } from '../lib/vdot';
import {
  ArrowLeft, TrendingUp, Target, Award, AlertTriangle,
  BarChart3, Activity, Zap, PieChart as PieIcon, Users,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea, ComposedChart, Legend,
} from 'recharts';

const CHART_TOOLTIP = {
  contentStyle: { background: '#111', border: '1px solid #333', fontSize: 12, fontFamily: 'Barlow Condensed' },
  labelStyle: { color: '#888' },
};

const AXIS_TICK = { fill: '#888', fontSize: 11, fontFamily: 'Barlow Condensed' };
const AXIS_LINE = { stroke: '#333' };

const TYPE_COLORS = {
  easy: '#4ADE80',
  threshold: '#FACC15',
  intervals: '#F87171',
  long_run: '#60A5FA',
  rest: '#666',
  cross_training: '#A78BFA',
  race: '#CCFF00',
};

const TYPE_LABELS = {
  easy: 'Easy',
  threshold: 'Threshold',
  intervals: 'Intervals',
  long_run: 'Long Run',
  rest: 'Rest',
  cross_training: 'Cross Training',
  race: 'Race',
};

const TREND_STYLES = {
  improving: { text: 'text-green-400', label: 'IMPROVING', icon: TrendingUp },
  stable: { text: 'text-yellow-400', label: 'STABLE', icon: Activity },
  declining: { text: 'text-red-400', label: 'DECLINING', icon: AlertTriangle },
};

export default function CoachProgressPage() {
  const { id: paramId } = useParams();
  const [athletes, setAthletes] = useState([]);
  const [selectedId, setSelectedId] = useState(paramId || '');
  const [athlete, setAthlete] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(false);

  // Load athlete list when no paramId (standalone /progress page)
  useEffect(() => {
    if (paramId) {
      // Direct route: /athletes/:id/progress
      Promise.all([api.getAthlete(paramId), api.getProgress(paramId)])
        .then(([a, d]) => { setAthlete(a); setData(d); })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      // Standalone route: /progress — load athletes list
      api.getAthletes()
        .then(list => {
          setAthletes(list || []);
          if (list?.length > 0) setSelectedId(list[0].id);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [paramId]);

  // Load progress when selectedId changes (standalone mode)
  useEffect(() => {
    if (paramId || !selectedId) return;
    setProgressLoading(true);
    setData(null);
    Promise.all([api.getAthlete(selectedId), api.getProgress(selectedId)])
      .then(([a, d]) => { setAthlete(a); setData(d); })
      .catch(console.error)
      .finally(() => setProgressLoading(false));
  }, [selectedId, paramId]);

  if (loading) return <div className="text-volt font-display text-xl animate-pulse">LOADING PROGRESS...</div>;

  const activeId = paramId || selectedId;
  const showSelector = !paramId;
  const isLoadingProgress = progressLoading;

  const hasPlan = data?.plan;
  const { plan, adherence, weekly_volume, easy_pace_trend, pace_trend_label, weekly_rpe, rpe_overreaching, type_breakdown } = data || {};
  const trend = TREND_STYLES[pace_trend_label] || TREND_STYLES.stable;

  return (
    <div>
      {paramId && (
        <Link to={`/athletes/${paramId}`} className="flex items-center gap-2 text-smoke hover:text-volt text-sm uppercase tracking-wider mb-6 transition-colors">
          <ArrowLeft size={16} />
          Back to {athlete?.profiles?.full_name}
        </Link>
      )}

      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl text-volt">PROGRESS</h1>
        {hasPlan && (
          <p className="text-smoke uppercase tracking-wider text-sm mt-1">
            {athlete?.profiles?.full_name} — {plan.goal_race} — Week {plan.current_week || '?'} of {plan.total_weeks}
          </p>
        )}
      </div>

      {/* Athlete Selector (standalone mode) */}
      {showSelector && (
        <div className="card mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-smoke text-sm">
              <Users size={16} />
              <span className="uppercase tracking-wider font-bold text-xs">Athlete:</span>
            </div>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="input-field flex-1 py-2"
            >
              {athletes.map(a => (
                <option key={a.id} value={a.id}>
                  {a.profiles?.full_name} — {a.goal_race || 'No race'}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {isLoadingProgress && (
        <div className="text-volt font-display text-xl animate-pulse py-12 text-center">LOADING PROGRESS...</div>
      )}

      {!isLoadingProgress && !hasPlan && activeId && (
        <div className="text-smoke text-center py-12">No active plan found for this athlete.</div>
      )}

      {!isLoadingProgress && hasPlan && (
        <>

      {/* ─── Adherence Hero Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="THIS WEEK"
          value={adherence.this_week.rate != null ? `${adherence.this_week.rate}%` : '—'}
          sub={`${adherence.this_week.completed}/${adherence.this_week.planned} workouts`}
          accent={adherence.this_week.rate >= 80}
        />
        <StatCard
          label="ALL-TIME"
          value={adherence.all_time.rate != null ? `${adherence.all_time.rate}%` : '—'}
          sub={`${adherence.all_time.completed}/${adherence.all_time.planned} workouts`}
          accent={adherence.all_time.rate >= 80}
        />
        <StatCard
          label="STREAK"
          value={`${adherence.streak}`}
          sub={`week${adherence.streak !== 1 ? 's' : ''} >80%`}
          accent={adherence.streak >= 3}
        />
        <StatCard
          label="WEEKS LEFT"
          value={data.weeks_to_race != null ? `${data.weeks_to_race}` : '—'}
          sub="to race day"
        />
      </div>

      {/* ─── 1. Weekly KM: Completed vs Planned + ACWR overlay ─── */}
      <div className="card mb-6">
        <h2 className="font-display text-xl mb-1 flex items-center gap-2">
          <BarChart3 size={18} className="text-volt" />
          WEEKLY VOLUME — LAST 8 WEEKS
        </h2>
        <div className="flex items-center gap-4 text-xs text-smoke mb-4">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 inline-block bg-volt" />
            Completed
          </span>
          <span className="flex items-center gap-1">
            <svg width="12" height="12" className="inline-block"><rect width="12" height="12" fill="#1a1a1a" stroke="#555" strokeWidth="1" /><circle cx="3" cy="3" r="1" fill="#555" /><circle cx="9" cy="9" r="1" fill="#555" /><circle cx="3" cy="9" r="1" fill="#555" /><circle cx="9" cy="3" r="1" fill="#555" /></svg>
            Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-1 inline-block bg-blue-400" />
            ACWR
          </span>
        </div>
        {weekly_volume.some(w => w.planned_km > 0 || w.completed_km > 0) ? (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={weekly_volume} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <pattern id="dotPattern" patternUnits="userSpaceOnUse" width="6" height="6">
                  <rect width="6" height="6" fill="transparent" />
                  <circle cx="3" cy="3" r="1" fill="#555" />
                </pattern>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <YAxis yAxisId="km" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <YAxis yAxisId="acwr" orientation="right" domain={[0, 2]} ticks={[0.5, 0.8, 1.0, 1.3, 1.5, 2.0]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <Tooltip {...CHART_TOOLTIP} formatter={(v, name) => {
                if (name === 'acwr') return [v, 'ACWR'];
                return [`${v} km`, name === 'completed_km' ? 'Completed' : 'Planned'];
              }} />
              <ReferenceArea yAxisId="acwr" y1={0.8} y2={1.3} fill="#4ADE80" fillOpacity={0.08} />
              <ReferenceLine yAxisId="acwr" y={1.3} stroke="#FACC15" strokeDasharray="3 3" strokeWidth={1} />
              <ReferenceLine yAxisId="acwr" y={0.8} stroke="#FACC15" strokeDasharray="3 3" strokeWidth={1} />
              <Bar yAxisId="km" dataKey="planned_km" fill="url(#dotPattern)" stroke="#555" strokeWidth={1} radius={[0, 0, 0, 0]} />
              <Bar yAxisId="km" dataKey="completed_km" fill="#CCFF00" fillOpacity={0.8} radius={[0, 0, 0, 0]} />
              <Line yAxisId="acwr" type="monotone" dataKey="acwr" stroke="#60A5FA" strokeWidth={2} dot={{ fill: '#60A5FA', r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-smoke text-sm py-8 text-center">No volume data yet.</p>
        )}
      </div>

      {/* ─── 2. Easy Run Pace Trend ─── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-xl flex items-center gap-2">
            <Zap size={18} className="text-volt" />
            EASY PACE TREND — LAST 8 WEEKS
          </h2>
          <span className={`text-xs font-bold uppercase px-2 py-1 border ${trend.text} border-current`}>
            {trend.label}
          </span>
        </div>
        <p className="text-smoke text-xs mb-4">Average easy-run pace per week (lower = faster)</p>
        {easy_pace_trend.some(w => w.avg_pace_sec_km) ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={easy_pace_trend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <YAxis
                reversed
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={AXIS_LINE}
                tickFormatter={v => formatPace(v)}
              />
              <Tooltip
                {...CHART_TOOLTIP}
                formatter={(v) => [formatPace(v), 'Avg Easy Pace']}
              />
              <Line
                type="monotone"
                dataKey="avg_pace_sec_km"
                stroke="#CCFF00"
                strokeWidth={2}
                dot={{ fill: '#CCFF00', r: 4, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-smoke text-sm py-8 text-center">No easy pace data yet.</p>
        )}
      </div>

      {/* ─── 3. Weekly RPE Trend ─── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-xl flex items-center gap-2">
            <Activity size={18} className="text-volt" />
            SESSION RPE — LAST 8 WEEKS
          </h2>
          {rpe_overreaching && (
            <span className="text-xs font-bold uppercase px-2 py-1 border border-red-500 text-red-400 bg-red-500/10 flex items-center gap-1">
              <AlertTriangle size={12} />
              OVERREACHING SIGNAL
            </span>
          )}
        </div>
        <p className="text-smoke text-xs mb-4">
          Average RPE per week
          {rpe_overreaching && ' — RPE is rising while pace is not improving'}
        </p>
        {weekly_rpe.some(w => w.avg_rpe) ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={weekly_rpe} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <Tooltip {...CHART_TOOLTIP} formatter={(v) => [v, 'Avg RPE']} />
              <ReferenceLine y={8} stroke="#F87171" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'High', fill: '#F87171', fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="avg_rpe"
                stroke={rpe_overreaching ? '#F87171' : '#CCFF00'}
                strokeWidth={2}
                dot={{ fill: rpe_overreaching ? '#F87171' : '#CCFF00', r: 4, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-smoke text-sm py-8 text-center">No RPE data yet.</p>
        )}
      </div>

      {/* ─── 4. Workout Type Breakdown (Current Phase) ─── */}
      {type_breakdown && (
        <div className="card mb-6">
          <h2 className="font-display text-xl mb-1 flex items-center gap-2">
            <PieIcon size={18} className="text-volt" />
            TRAINING MIX — {type_breakdown.phase?.toUpperCase().replace('_', ' ')} PHASE
          </h2>
          <p className="text-smoke text-xs mb-4">Workout type distribution for current training phase</p>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <DonutChart breakdown={type_breakdown} />
            <div className="flex flex-wrap gap-2">
              {Object.entries(type_breakdown)
                .filter(([k]) => k !== 'phase')
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const total = Object.entries(type_breakdown).filter(([k]) => k !== 'phase').reduce((s, [, v]) => s + v, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={type} className="flex items-center gap-2 px-3 py-1 border border-ash bg-steel/50">
                      <span className="w-3 h-3 flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[type] || '#666' }} />
                      <span className="text-xs text-white font-semibold uppercase">{TYPE_LABELS[type] || type}</span>
                      <span className="text-xs text-smoke">{pct}%</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3">
        <Link to={`/athletes/${activeId}/load`} className="btn-secondary flex items-center gap-2 text-xs">
          <Activity size={14} />
          TRAINING LOAD
        </Link>
        <Link to={`/athletes/${activeId}/monitoring`} className="btn-secondary flex items-center gap-2 text-xs">
          <Target size={14} />
          MONITORING
        </Link>
      </div>
      </>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`border p-4 ${accent ? 'border-volt bg-volt/5' : 'border-ash bg-steel'}`}>
      <p className="text-smoke text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-display text-3xl ${accent ? 'text-volt' : 'text-white'}`}>{value}</p>
      <p className="text-smoke text-xs mt-1">{sub}</p>
    </div>
  );
}

function DonutChart({ breakdown }) {
  const entries = Object.entries(breakdown).filter(([k]) => k !== 'phase');
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return <p className="text-smoke text-sm">No data</p>;

  const chartData = entries.map(([type, count]) => ({
    name: TYPE_LABELS[type] || type,
    value: count,
    color: TYPE_COLORS[type] || '#666',
  }));

  return (
    <div className="w-[200px] h-[200px] flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 12 }}
            formatter={(v, name) => [`${v} workouts`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
