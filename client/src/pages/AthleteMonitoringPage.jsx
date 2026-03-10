import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import Sparkline from '../components/ui/Sparkline';
import { ArrowLeft, AlertTriangle, TrendingUp, Activity, Heart, Shield } from 'lucide-react';

const ACWR_COLORS = { green: 'text-green-400', amber: 'text-yellow-400', red: 'text-red-400' };
const ACWR_BG = { green: 'bg-green-500/10 border-green-500', amber: 'bg-yellow-500/10 border-yellow-500', red: 'bg-red-500/10 border-red-500' };
const FEELING_EMOJI = { great: '😄', good: '😊', ok: '😐', bad: '😟', terrible: '😫' };

export default function AthleteMonitoringPage() {
  const { id } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [athleteData, monitoringData] = await Promise.all([
        api.getAthlete(id),
        api.getMonitoring(id),
      ]);
      setAthlete(athleteData);
      setMonitoring(monitoringData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-volt font-display text-xl animate-pulse">LOADING MONITORING...</div>;
  if (!athlete || !monitoring) return <div className="text-red-400">Data not found</div>;

  const { acwr, readiness, feedback, compliance, pain_flags, flags } = monitoring;

  return (
    <div>
      {/* Header */}
      <Link to={`/athletes/${id}`} className="flex items-center gap-2 text-smoke hover:text-volt text-sm uppercase tracking-wider mb-6 transition-colors">
        <ArrowLeft size={16} />
        Back to {athlete.profiles?.full_name}
      </Link>

      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl text-volt">MONITORING</h1>
        <p className="text-smoke uppercase tracking-wider text-sm mt-1">
          {athlete.profiles?.full_name} — {athlete.goal_race || 'No race set'}
        </p>
      </div>

      {/* Flags Banner */}
      {flags.length > 0 && (
        <div className="mb-6 space-y-2">
          {flags.map((flag, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 border ${
              flag.type === 'pain' || flag.type === 'acwr' ? 'bg-red-900/20 border-red-500 text-red-300' :
              flag.type === 'readiness' ? 'bg-orange-900/20 border-orange-500 text-orange-300' :
              'bg-yellow-900/20 border-yellow-500 text-yellow-300'
            }`}>
              <AlertTriangle size={16} />
              <span className="text-sm font-semibold uppercase">{flag.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* ACWR */}
        <div className={`card border-l-4 ${ACWR_BG[acwr.zone]}`}>
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className={ACWR_COLORS[acwr.zone]} />
            <p className="text-smoke text-xs uppercase">ACWR</p>
          </div>
          <p className={`font-display text-3xl ${ACWR_COLORS[acwr.zone]}`}>{acwr.ratio}</p>
          <p className="text-smoke text-xs mt-1">
            Acute: {acwr.acute_km}km | Chronic: {acwr.chronic_km}km/wk
          </p>
        </div>

        {/* Readiness */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} className="text-volt" />
            <p className="text-smoke text-xs uppercase">Readiness (7d avg)</p>
          </div>
          <p className={`font-display text-3xl ${
            readiness.average_7d >= 3.5 ? 'text-green-400' :
            readiness.average_7d >= 2.5 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {readiness.average_7d ?? '--'}
          </p>
          <Sparkline data={readiness.sparkline} width={120} height={24} color="#ADFF2F" className="mt-2" />
        </div>

        {/* Compliance */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-volt" />
            <p className="text-smoke text-xs uppercase">Compliance (7d)</p>
          </div>
          <p className={`font-display text-3xl ${
            compliance.rate >= 80 ? 'text-green-400' :
            compliance.rate >= 60 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {compliance.rate ?? '--'}%
          </p>
          <p className="text-smoke text-xs mt-1">{compliance.completed}/{compliance.planned} workouts</p>
        </div>

        {/* Avg RPE */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <Heart size={16} className="text-volt" />
            <p className="text-smoke text-xs uppercase">Avg RPE (recent)</p>
          </div>
          <p className={`font-display text-3xl ${
            (feedback.rpe_sparkline.length > 0 ? feedback.rpe_sparkline.reduce((a, b) => a + b, 0) / feedback.rpe_sparkline.length : 0) <= 6
              ? 'text-green-400' : 'text-orange-400'
          }`}>
            {feedback.rpe_sparkline.length > 0
              ? (feedback.rpe_sparkline.reduce((a, b) => a + b, 0) / feedback.rpe_sparkline.length).toFixed(1)
              : '--'}
          </p>
          <Sparkline data={feedback.rpe_sparkline} width={120} height={24} color="#FF6B6B" className="mt-2" />
        </div>
      </div>

      {/* Readiness History */}
      <div className="card mb-6">
        <h2 className="font-display text-xl mb-4">READINESS HISTORY (30 DAYS)</h2>
        {readiness.history.length === 0 ? (
          <p className="text-smoke text-sm">No check-ins yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-smoke text-xs uppercase border-b border-ash">
                  <th className="py-2 text-left">Date</th>
                  <th className="py-2 text-center">Score</th>
                  <th className="py-2 text-center">Energy</th>
                  <th className="py-2 text-center">Sleep</th>
                  <th className="py-2 text-center">Soreness</th>
                  <th className="py-2 text-center">Stress</th>
                  <th className="py-2 text-center">Motivation</th>
                  <th className="py-2 text-center">Pain</th>
                </tr>
              </thead>
              <tbody>
                {[...readiness.history].reverse().map(r => (
                  <tr key={r.id} className="border-b border-ash/50">
                    <td className="py-2 text-left">{r.check_in_date}</td>
                    <td className={`py-2 text-center font-bold ${
                      r.composite_score >= 3.5 ? 'text-green-400' :
                      r.composite_score >= 2.5 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {parseFloat(r.composite_score).toFixed(2)}
                    </td>
                    <td className="py-2 text-center">{r.energy}/5</td>
                    <td className="py-2 text-center">{r.sleep_hours}h (Q:{r.sleep_quality})</td>
                    <td className="py-2 text-center">{r.soreness}/5</td>
                    <td className="py-2 text-center">{r.stress}/5</td>
                    <td className="py-2 text-center">{r.motivation}/5</td>
                    <td className="py-2 text-center">
                      {r.pain_flag ? (
                        <span className="text-red-400 text-xs">{r.pain_location} ({r.pain_severity})</span>
                      ) : (
                        <span className="text-smoke">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Feedback */}
      <div className="card mb-6">
        <h2 className="font-display text-xl mb-4">RECENT WORKOUT FEEDBACK</h2>
        {feedback.recent.length === 0 ? (
          <p className="text-smoke text-sm">No feedback yet.</p>
        ) : (
          <div className="space-y-3">
            {feedback.recent.slice(0, 10).map(fb => (
              <div key={fb.id} className="flex items-center justify-between py-3 border-b border-ash last:border-0">
                <div>
                  <p className="font-semibold text-sm">{fb.workouts?.title || 'Workout'}</p>
                  <p className="text-smoke text-xs">{fb.workouts?.workout_date} — {fb.workouts?.workout_type}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-smoke text-[10px] uppercase">RPE</p>
                    <p className={`font-bold ${fb.rpe <= 6 ? 'text-green-400' : fb.rpe <= 8 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {fb.rpe}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-smoke text-[10px] uppercase">Feel</p>
                    <p className="text-lg">{FEELING_EMOJI[fb.feeling] || '—'}</p>
                  </div>
                  {fb.actual_distance_km && (
                    <div className="text-center">
                      <p className="text-smoke text-[10px] uppercase">Dist</p>
                      <p className="text-sm font-bold">{fb.actual_distance_km}km</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pain History */}
      {pain_flags.length > 0 && (
        <div className="card">
          <h2 className="font-display text-xl mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-400" />
            PAIN FLAGS (LAST 7 DAYS)
          </h2>
          <div className="space-y-2">
            {pain_flags.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-ash last:border-0">
                <span className="text-sm">{p.check_in_date}</span>
                <span className="text-red-400 text-sm font-semibold">
                  {p.pain_location} — Severity {p.pain_severity}/10
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
