import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Flame, Award, Calendar, Target, PieChart as PieIcon } from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

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

const TYPE_LABELS_ES = {
  easy: 'Fácil',
  threshold: 'Umbral',
  intervals: 'Intervalos',
  long_run: 'Largo',
  rest: 'Descanso',
  cross_training: 'Cross Training',
  race: 'Carrera',
};

export default function AthleteProgressPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api.getMyProfile()
      .then(athlete => {
        if (!athlete?.id) return;
        return api.getProgress(athlete.id);
      })
      .then(d => { if (d) setData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="text-volt font-display text-xl animate-pulse">CARGANDO...</div>;
  if (!data?.plan) return <div className="text-smoke text-center py-12">No tienes un plan activo.</div>;

  const { plan, adherence, weekly_volume, type_breakdown, total_km_cycle, weeks_to_race } = data;

  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl text-volt mb-1">MI PROGRESO</h1>
      <p className="text-smoke uppercase tracking-wider text-sm mb-8">
        {plan.goal_race} — Semana {plan.current_week || '?'} de {plan.total_weeks}
      </p>

      {/* ─── Hero Number: Total KM ─── */}
      <div className="border-2 border-volt bg-volt/5 p-6 mb-6 text-center">
        <p className="text-smoke text-xs uppercase tracking-wider mb-2">Kilómetros en este ciclo</p>
        <p className="font-display text-6xl sm:text-7xl text-volt leading-none">{total_km_cycle}</p>
        <p className="text-smoke text-sm mt-2 uppercase tracking-wider">km recorridos</p>
      </div>

      {/* ─── Streak + Countdown Cards ─── */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {/* Streak Badge */}
        <div className={`border p-4 text-center ${adherence.streak >= 1 ? 'border-volt bg-volt/5' : 'border-ash bg-steel'}`}>
          <Award size={24} className={`mx-auto mb-2 ${adherence.streak >= 1 ? 'text-volt' : 'text-smoke'}`} />
          <p className={`font-display text-4xl ${adherence.streak >= 1 ? 'text-volt' : 'text-white'}`}>
            {adherence.streak}
          </p>
          <p className="text-smoke text-xs uppercase tracking-wider mt-1">
            semana{adherence.streak !== 1 ? 's' : ''} consecutiva{adherence.streak !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Countdown Card */}
        <div className="border border-ash bg-steel p-4 text-center">
          <Calendar size={24} className="mx-auto mb-2 text-volt" />
          {weeks_to_race != null ? (
            <>
              <p className="font-display text-4xl text-white">{weeks_to_race}</p>
              <p className="text-smoke text-xs uppercase tracking-wider mt-1">
                semana{weeks_to_race !== 1 ? 's' : ''} para tu carrera
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl text-smoke">—</p>
              <p className="text-smoke text-xs uppercase tracking-wider mt-1">sin fecha de carrera</p>
            </>
          )}
        </div>
      </div>

      {/* ─── Weekly KM Bar Chart (Simple) ─── */}
      <div className="card mb-6">
        <h2 className="font-display text-xl mb-1 flex items-center gap-2">
          <Flame size={18} className="text-volt" />
          KM POR SEMANA
        </h2>
        <p className="text-smoke text-xs mb-4">Últimas 8 semanas</p>
        {weekly_volume.some(w => w.completed_km > 0) ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weekly_volume} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 12, fontFamily: 'Barlow Condensed' }}
                formatter={(v) => [`${v} km`, 'Completado']}
                labelStyle={{ color: '#888' }}
              />
              <Bar dataKey="completed_km" fill="#CCFF00" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-smoke text-sm py-8 text-center">Aún no hay datos de volumen.</p>
        )}
      </div>

      {/* ─── Donut: Training Time Distribution ─── */}
      {type_breakdown && (
        <div className="card mb-6">
          <h2 className="font-display text-xl mb-1 flex items-center gap-2">
            <PieIcon size={18} className="text-volt" />
            TU ENTRENAMIENTO
          </h2>
          <p className="text-smoke text-xs mb-4">
            Distribución en fase {type_breakdown.phase?.replace('_', ' ')}
          </p>
          <div className="flex flex-col items-center gap-4">
            <AthleteDonut breakdown={type_breakdown} />
            <div className="flex flex-wrap justify-center gap-2">
              {Object.entries(type_breakdown)
                .filter(([k]) => k !== 'phase')
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const total = Object.entries(type_breakdown).filter(([k]) => k !== 'phase').reduce((s, [, v]) => s + v, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={type} className="flex items-center gap-2 px-3 py-1 border border-ash bg-steel/50">
                      <span className="w-3 h-3 flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[type] || '#666' }} />
                      <span className="text-xs text-white font-semibold">{TYPE_LABELS_ES[type] || type}</span>
                      <span className="text-xs text-smoke">{pct}%</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Adherence Summary ─── */}
      <div className="card mb-6">
        <h2 className="font-display text-xl mb-4 flex items-center gap-2">
          <Target size={18} className="text-volt" />
          ADHERENCIA
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="font-display text-3xl text-volt">
              {adherence.this_week.rate != null ? `${adherence.this_week.rate}%` : '—'}
            </p>
            <p className="text-smoke text-xs uppercase">esta semana</p>
          </div>
          <div className="text-center">
            <p className="font-display text-3xl text-white">
              {adherence.all_time.rate != null ? `${adherence.all_time.rate}%` : '—'}
            </p>
            <p className="text-smoke text-xs uppercase">total del plan</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AthleteDonut({ breakdown }) {
  const entries = Object.entries(breakdown).filter(([k]) => k !== 'phase');
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return <p className="text-smoke text-sm">Sin datos</p>;

  const chartData = entries.map(([type, count]) => ({
    name: TYPE_LABELS_ES[type] || type,
    value: count,
    color: TYPE_COLORS[type] || '#666',
  }));

  return (
    <div className="w-[200px] h-[200px]">
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
            formatter={(v, name) => [`${v} sesiones`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
