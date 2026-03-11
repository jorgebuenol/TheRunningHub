import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ArrowLeft, AlertTriangle, Shield, Activity, Heart, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

const ZONE = {
  green:  { text: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500', label: 'OPTIMAL', fill: '#4ADE80' },
  yellow: { text: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500', label: 'CAUTION', fill: '#FACC15' },
  red:    { text: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500', label: 'DANGER', fill: '#F87171' },
  insufficient: { text: 'text-smoke', bg: 'bg-smoke/10', border: 'border-ash', label: 'INSUFFICIENT DATA', fill: '#888' },
};

const chartTooltipStyle = {
  contentStyle: { background: '#111', border: '1px solid #333', fontSize: 12 },
  labelStyle: { color: '#888' },
};

export default function AthleteLoadPage() {
  const { id } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAthlete(id),
      api.getMonitoring(id),
    ]).then(([a, m]) => {
      setAthlete(a);
      setMonitoring(m);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-volt font-display text-xl animate-pulse">LOADING LOAD DATA...</div>;
  if (!monitoring) return <div className="text-smoke text-center py-12">No monitoring data available yet.</div>;

  const { acwr, weekly_km_history, rpe_7d_trend, readiness_7d_trend, flags } = monitoring;
  const zone = ZONE[acwr.zone] || ZONE.green;
  const hasData = !acwr.insufficient_data && (acwr.acute_km > 0 || acwr.chronic_km > 0);

  return (
    <div>
      {/* Header */}
      <Link to={`/athletes/${id}`} className="flex items-center gap-2 text-smoke hover:text-volt text-sm uppercase tracking-wider mb-6 transition-colors">
        <ArrowLeft size={16} />
        Back to {athlete?.profiles?.full_name}
      </Link>

      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl text-volt">TRAINING LOAD</h1>
        <p className="text-smoke uppercase tracking-wider text-sm mt-1">
          {athlete?.profiles?.full_name} — {athlete?.goal_race || 'No race set'}
        </p>
      </div>

      {/* ACWR Gauge — Hero Section */}
      <div className={`border-2 ${zone.border} ${zone.bg} p-4 sm:p-6 mb-8`}>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={20} className={zone.text} />
          <span className="text-smoke text-xs uppercase tracking-wider font-semibold">
            ACUTE : CHRONIC WORKLOAD RATIO
          </span>
        </div>

        {hasData ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
              <span className={`font-display text-6xl sm:text-7xl leading-none ${zone.text}`}>
                {acwr.ratio}
              </span>
              <div className="sm:mb-1">
                <span className={`text-xs font-bold uppercase px-2 py-1 border ${zone.border} ${zone.bg} ${zone.text}`}>
                  {zone.label}
                </span>
                <p className="text-smoke text-xs mt-2">
                  Acute: {acwr.acute_km} km | Chronic: {acwr.chronic_km} km/wk
                </p>
              </div>
            </div>
            {/* Zone guide */}
            <div className="flex flex-wrap gap-3 sm:gap-6 text-xs">
              <span className="text-red-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-red-400 inline-block" /> &lt;0.5 or &gt;1.5
              </span>
              <span className="text-yellow-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-yellow-400 inline-block" /> 0.5–0.8 or 1.3–1.5
              </span>
              <span className="text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 inline-block" /> 0.8–1.3
              </span>
            </div>
          </>
        ) : (
          <p className="text-smoke text-lg font-display">
            {acwr.insufficient_data
              ? 'ACWR unavailable — activates after 3 weeks of training'
              : 'NO DATA'}
          </p>
        )}
      </div>

      {/* Active Flags */}
      {flags.length > 0 && (
        <div className="mb-8 space-y-2">
          <h2 className="font-display text-lg mb-2 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            ACTIVE FLAGS
          </h2>
          {flags.map((f, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 border ${
              f.type === 'pain' || f.type === 'acwr' ? 'bg-red-900/20 border-red-500 text-red-300' :
              f.type === 'rpe' ? 'bg-orange-900/20 border-orange-500 text-orange-300' :
              'bg-yellow-900/20 border-yellow-500 text-yellow-300'
            }`}>
              <AlertTriangle size={14} />
              <span className="text-sm font-semibold uppercase">{f.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Weekly KM Bar Chart */}
      <div className="card mb-6">
        <h2 className="font-display text-xl mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-volt" />
          WEEKLY DISTANCE (KM) — LAST 6 WEEKS
        </h2>
        {weekly_km_history?.some(w => w.km > 0) ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weekly_km_history} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="week"
                tick={{ fill: '#888', fontSize: 11, fontFamily: 'Barlow Condensed' }}
                axisLine={{ stroke: '#333' }}
                tickLine={{ stroke: '#333' }}
              />
              <YAxis
                tick={{ fill: '#888', fontSize: 11, fontFamily: 'Barlow Condensed' }}
                axisLine={{ stroke: '#333' }}
                tickLine={{ stroke: '#333' }}
              />
              <Tooltip
                {...chartTooltipStyle}
                formatter={(value) => [`${value} km`, 'Distance']}
              />
              <Bar dataKey="km" fill="#CCFF00" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-smoke text-sm py-8 text-center">No workout data yet.</p>
        )}
      </div>

      {/* RPE Trend Line Chart */}
      <div className="card mb-6">
        <h2 className="font-display text-xl mb-4 flex items-center gap-2">
          <Heart size={18} className="text-volt" />
          7-DAY RPE TREND
        </h2>
        {rpe_7d_trend?.some(d => d.rpe !== null) ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rpe_7d_trend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="day"
                tick={{ fill: '#888', fontSize: 11, fontFamily: 'Barlow Condensed' }}
                axisLine={{ stroke: '#333' }}
                tickLine={{ stroke: '#333' }}
              />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tick={{ fill: '#888', fontSize: 11, fontFamily: 'Barlow Condensed' }}
                axisLine={{ stroke: '#333' }}
                tickLine={{ stroke: '#333' }}
              />
              <Tooltip
                {...chartTooltipStyle}
                formatter={(value) => [value, 'RPE']}
              />
              <ReferenceLine y={8} stroke="#F87171" strokeDasharray="3 3" strokeWidth={1} />
              <Line
                type="monotone"
                dataKey="rpe"
                stroke="#CCFF00"
                strokeWidth={2}
                dot={{ fill: '#CCFF00', r: 4, strokeWidth: 0 }}
                activeDot={{ fill: '#CCFF00', r: 6, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-smoke text-sm py-8 text-center">No RPE data yet.</p>
        )}
      </div>

      {/* Readiness Trend Line Chart */}
      <div className="card mb-6">
        <h2 className="font-display text-xl mb-4 flex items-center gap-2">
          <Activity size={18} className="text-volt" />
          7-DAY READINESS TREND
        </h2>
        {readiness_7d_trend?.some(d => d.energy !== null || d.sleep_quality !== null) ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={readiness_7d_trend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="day"
                tick={{ fill: '#888', fontSize: 11, fontFamily: 'Barlow Condensed' }}
                axisLine={{ stroke: '#333' }}
                tickLine={{ stroke: '#333' }}
              />
              <YAxis
                domain={[0, 5]}
                ticks={[0, 1, 2, 3, 4, 5]}
                tick={{ fill: '#888', fontSize: 11, fontFamily: 'Barlow Condensed' }}
                axisLine={{ stroke: '#333' }}
                tickLine={{ stroke: '#333' }}
              />
              <Tooltip
                {...chartTooltipStyle}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, fontFamily: 'Barlow Condensed' }}
                iconType="line"
              />
              <Line
                type="monotone"
                dataKey="energy"
                stroke="#CCFF00"
                strokeWidth={2}
                name="Energy"
                dot={{ fill: '#CCFF00', r: 3, strokeWidth: 0 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="sleep_quality"
                stroke="#60A5FA"
                strokeWidth={2}
                name="Sleep Quality"
                dot={{ fill: '#60A5FA', r: 3, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-smoke text-sm py-8 text-center">No readiness data yet.</p>
        )}
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3">
        <Link to={`/athletes/${id}/monitoring`} className="btn-secondary flex items-center gap-2 text-xs">
          <Activity size={14} />
          FULL MONITORING
        </Link>
        <Link to={`/athletes/${id}`} className="btn-ghost flex items-center gap-2 text-xs">
          <ArrowLeft size={14} />
          ATHLETE PROFILE
        </Link>
      </div>
    </div>
  );
}
