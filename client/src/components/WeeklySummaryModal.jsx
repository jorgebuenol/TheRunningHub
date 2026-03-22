import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { X, Mail, Copy, Check, ChevronLeft, ChevronRight, AlertTriangle, Zap } from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────

function formatPace(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return null;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

function acwrEmoji(zone) {
  if (zone === 'green') return '🟢';
  if (zone === 'yellow') return '🟡';
  if (zone === 'red') return '🔴';
  return null;
}

function celebLabel(c) {
  if (c.type === 'first_workout') return { emoji: '🎉', text: 'First workout ever!' };
  if (c.type === 'longest_run') return { emoji: '🏃', text: `Longest run ever: ${c.value_km} km` };
  if (c.type === 'best_pace') return { emoji: '⚡', text: `Best pace ever: ${formatPace(c.value_sec_km)} min/km` };
  if (c.type === 'perfect_week') return { emoji: '💯', text: '100% adherence week!' };
  return null;
}

// ── WhatsApp message generator ─────────────────────────────────────────────

function buildCoachingTip(s) {
  if (s.pain_flags.length > 0) {
    return 'Escucha tu cuerpo y no fuerces si hay molestia. La recuperación también es entrenamiento.';
  }
  if (s.acwr?.zone === 'red' && s.acwr.ratio > 1.5) {
    return 'Tu carga de trabajo está muy alta. Esta semana prioriza descanso y rodajes suaves.';
  }
  if (s.acwr?.zone === 'yellow') {
    return 'Carga elevada. Asegúrate de dormir bien y no te saltes los días de recuperación.';
  }
  if (s.avg_rpe && s.avg_rpe > 8) {
    return 'El esfuerzo percibido fue alto. Incluye más kilómetros suaves para equilibrar la intensidad.';
  }
  if (s.adherence.percent === 100) {
    return '¡La consistencia es la clave! Mantén esta disciplina y los resultados en carrera llegarán.';
  }
  if (s.adherence.percent !== null && s.adherence.percent < 70) {
    return 'Intenta completar al menos 3 de cada 4 sesiones planificadas. Cada entrenamiento suma.';
  }
  return 'Sigue ejecutando tu plan con inteligencia. La consistencia a largo plazo es lo que transforma corredores.';
}

function buildWhatsAppText(s) {
  const lines = [];
  const firstName = s.name?.split(' ')[0] || s.name || 'Atleta';

  lines.push(`Hola ${firstName} 👋`);
  lines.push('');
  lines.push(`📅 Semana del ${s.week_start}:`);
  lines.push(`📊 Entrenamientos: ${s.adherence.completed}/${s.adherence.planned} completados${s.adherence.percent !== null ? ` (${s.adherence.percent}%)` : ''}`);

  if (s.completed_runs.length > 0) {
    lines.push('');
    lines.push('🏃 Sesiones:');
    s.completed_runs.forEach(r => {
      const dist = r.actual_distance_km != null
        ? `${r.actual_distance_km} km${r.planned_distance_km ? ` (plan: ${r.planned_distance_km} km)` : ''}`
        : null;
      const pace = formatPace(r.actual_pace_sec_km)
        ? `ritmo ${formatPace(r.actual_pace_sec_km)} min/km${r.planned_pace_sec_km ? ` (plan: ${formatPace(r.planned_pace_sec_km)} min/km)` : ''}`
        : null;
      const rpe = r.rpe ? `RPE ${r.rpe}/10` : null;
      const parts = [dist, pace, rpe].filter(Boolean);
      lines.push(`• ${r.title || r.type}${parts.length ? ': ' + parts.join(', ') : ''}`);
    });
  }

  if (s.avg_rpe != null || s.acwr) {
    lines.push('');
    if (s.avg_rpe != null) lines.push(`💪 RPE promedio: ${s.avg_rpe}/10`);
    if (s.acwr && !s.acwr.insufficient_data) {
      const emoji = acwrEmoji(s.acwr.zone) || '';
      const label = s.acwr.zone === 'green' ? 'óptima' : s.acwr.zone === 'yellow' ? 'elevada' : 'alta';
      lines.push(`⚖️ Carga: ${emoji} ${s.acwr.ratio} (${label})`);
    }
  }

  if (s.pain_flags.length > 0) {
    const locations = [...new Set(s.pain_flags.map(p => p.pain_location).filter(Boolean))];
    lines.push('');
    lines.push(`⚠️ Reportaste molestia${locations.length ? ` en: ${locations.join(', ')}` : ''}. Cuéntame cómo estás.`);
  }

  if (s.celebrations.length > 0) {
    lines.push('');
    s.celebrations.forEach(c => {
      const lbl = celebLabel(c);
      if (lbl) lines.push(`${lbl.emoji} ${lbl.text}`);
    });
  }

  lines.push('');
  lines.push(`💡 ${buildCoachingTip(s)}`);
  lines.push('');
  lines.push('¡Sigue adelante! 💪');
  lines.push('— The Run Hub');

  return lines.join('\n');
}

// ── Sub-components ─────────────────────────────────────────────────────────

function AthleteSummary({ s }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(buildWhatsAppText(s));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const adherencePct = s.adherence.percent;
  const adherenceColor = adherencePct === 100 ? 'text-volt' :
    adherencePct >= 70 ? 'text-yellow-400' : 'text-red-400';

  const acwrColors = { green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400' };
  const acwrColor = s.acwr?.zone ? acwrColors[s.acwr.zone] : 'text-smoke';
  const acwrLabel = s.acwr?.zone === 'green' ? 'OPTIMAL' :
    s.acwr?.zone === 'yellow' ? 'CAUTION' :
    s.acwr?.zone === 'red' ? 'DANGER' : null;

  return (
    <div className="space-y-4">
      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-smoke text-xs uppercase tracking-wider mb-1">Adherence</p>
          <p className={`font-display text-2xl ${adherenceColor}`}>
            {s.adherence.completed}/{s.adherence.planned}
          </p>
          {adherencePct !== null && (
            <p className={`text-xs ${adherenceColor} mt-0.5`}>{adherencePct}%</p>
          )}
        </div>
        <div className="card py-3 text-center">
          <p className="text-smoke text-xs uppercase tracking-wider mb-1">RPE Avg</p>
          <p className="font-display text-2xl text-white">
            {s.avg_rpe != null ? s.avg_rpe : '—'}
            {s.avg_rpe != null && <span className="text-smoke text-sm">/10</span>}
          </p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-smoke text-xs uppercase tracking-wider mb-1">ACWR</p>
          {s.acwr?.insufficient_data ? (
            <p className="text-smoke text-sm mt-1">N/A</p>
          ) : (
            <>
              <p className={`font-display text-2xl ${acwrColor}`}>
                {acwrEmoji(s.acwr?.zone)} {s.acwr?.ratio ?? '—'}
              </p>
              {acwrLabel && <p className={`text-xs ${acwrColor} mt-0.5`}>{acwrLabel}</p>}
            </>
          )}
        </div>
      </div>

      {/* Completed runs */}
      {s.completed_runs.length === 0 ? (
        <div className="card py-6 text-center">
          <p className="text-smoke text-sm uppercase tracking-wider">No completed workouts this week</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-smoke text-xs uppercase tracking-wider font-semibold">Completed Workouts</h4>
          {s.completed_runs.map((r, i) => (
            <div key={i} className="card py-3 border-l-2 border-volt">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-white uppercase">{r.title || r.type}</span>
                <span className="text-smoke text-xs">{r.date}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-smoke">Distance: </span>
                  <span className="text-white font-semibold">{r.actual_distance_km ?? '—'} km</span>
                  {r.planned_distance_km && (
                    <span className="text-smoke ml-1">(plan {r.planned_distance_km} km)</span>
                  )}
                </div>
                <div>
                  <span className="text-smoke">Pace: </span>
                  <span className="text-white font-semibold">
                    {formatPace(r.actual_pace_sec_km) ? `${formatPace(r.actual_pace_sec_km)} /km` : '—'}
                  </span>
                  {r.planned_pace_sec_km && (
                    <span className="text-smoke ml-1">(plan {formatPace(r.planned_pace_sec_km)}/km)</span>
                  )}
                </div>
                <div>
                  <span className="text-smoke">HR: </span>
                  <span className="text-white font-semibold">{r.actual_avg_hr ? `${r.actual_avg_hr} bpm` : '—'}</span>
                  {r.planned_hr_zone && (
                    <span className="text-smoke ml-1">(Zone {r.planned_hr_zone})</span>
                  )}
                </div>
                <div>
                  <span className="text-smoke">RPE: </span>
                  <span className={`font-semibold ${r.rpe <= 6 ? 'text-green-400' : r.rpe <= 8 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {r.rpe ? `${r.rpe}/10` : '—'}
                  </span>
                  {r.feeling && (
                    <span className="text-smoke ml-1 capitalize">· {r.feeling}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pain flags */}
      {s.pain_flags.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-500/40">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-red-400 text-xs font-bold uppercase">Pain Reported This Week</span>
            {s.pain_flags.some(p => p.pain_location) && (
              <span className="text-red-300 text-xs ml-2">
                — {[...new Set(s.pain_flags.map(p => p.pain_location).filter(Boolean))].join(', ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Celebrations */}
      {s.celebrations.length > 0 && (
        <div className="px-3 py-2 bg-[#0d1a00] border border-volt">
          {s.celebrations.map((c, i) => {
            const lbl = celebLabel(c);
            return lbl ? (
              <div key={i} className="text-volt text-sm font-bold">
                {lbl.emoji} {lbl.text}
              </div>
            ) : null;
          })}
        </div>
      )}

      {/* Copy for WhatsApp */}
      <button
        onClick={handleCopy}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-volt/40 hover:border-volt text-volt hover:bg-volt hover:text-black transition-colors text-sm font-bold uppercase tracking-wider"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Copied!' : 'Copy for WhatsApp'}
      </button>
    </div>
  );
}

// ── Main Modal ──────────────────────────────────────────────────────────────

export default function WeeklySummaryModal({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');

  // Load on mount
  useEffect(() => {
    api.getWeeklySummary()
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  async function handleSendEmail() {
    setSendingEmail(true);
    try {
      await api.sendWeeklySummaryEmail();
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingEmail(false);
    }
  }

  const summaries = data?.summaries || [];
  const current = summaries[activeTab];

  return (
    <div className="fixed inset-0 bg-black/90 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-8 mb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl text-volt">WEEKLY SUMMARY</h2>
            {data?.generated_at && (
              <p className="text-smoke text-xs uppercase tracking-wider mt-0.5">
                {new Date(data.generated_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSendEmail}
              disabled={sendingEmail || loading}
              className="btn-secondary flex items-center gap-2 text-xs"
            >
              {emailSent ? <Check size={14} /> : <Mail size={14} />}
              {emailSent ? 'Sent!' : sendingEmail ? 'Sending...' : 'Email Coach'}
            </button>
            <button onClick={onClose} className="btn-ghost p-2">
              <X size={20} />
            </button>
          </div>
        </div>

        {loading && (
          <div className="card py-12 text-center">
            <p className="text-volt font-display animate-pulse">LOADING...</p>
          </div>
        )}

        {error && (
          <div className="card py-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && summaries.length === 0 && (
          <div className="card py-12 text-center">
            <Zap size={32} className="text-volt mx-auto mb-3" />
            <p className="text-smoke uppercase tracking-wider">No athletes found</p>
          </div>
        )}

        {!loading && summaries.length > 0 && (
          <>
            {/* Athlete tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
              {summaries.map((s, i) => (
                <button
                  key={s.athleteId}
                  onClick={() => setActiveTab(i)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap border transition-colors flex-shrink-0 ${
                    activeTab === i
                      ? 'border-volt bg-volt text-black'
                      : 'border-ash text-smoke hover:border-volt hover:text-volt'
                  }`}
                >
                  {s.name?.split(' ')[0] || `Athlete ${i + 1}`}
                  {s.adherence.percent === 100 && (
                    <span className="ml-1">💯</span>
                  )}
                  {s.pain_flags.length > 0 && (
                    <span className="ml-1 text-red-400">!</span>
                  )}
                </button>
              ))}
            </div>

            {/* Navigation (mobile) */}
            {summaries.length > 1 && (
              <div className="flex items-center justify-between mb-3 sm:hidden">
                <button
                  onClick={() => setActiveTab(t => Math.max(0, t - 1))}
                  disabled={activeTab === 0}
                  className="btn-ghost p-1 disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-smoke text-xs">{activeTab + 1} / {summaries.length}</span>
                <button
                  onClick={() => setActiveTab(t => Math.min(summaries.length - 1, t + 1))}
                  disabled={activeTab === summaries.length - 1}
                  className="btn-ghost p-1 disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

            {/* Athlete name heading */}
            <div className="card mb-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-body font-bold text-lg uppercase text-white">{current.name}</h3>
                  <p className="text-smoke text-xs">{current.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-smoke text-xs uppercase">Week</p>
                  <p className="text-white text-sm font-semibold">{current.week_start} → {current.week_end}</p>
                </div>
              </div>
            </div>

            <AthleteSummary s={current} />
          </>
        )}
      </div>
    </div>
  );
}
