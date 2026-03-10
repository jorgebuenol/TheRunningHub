import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Plus, Search, ChevronRight } from 'lucide-react';
import { formatPace } from '../lib/vdot';

export default function AthletesPage() {
  const [athletes, setAthletes] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAthletes()
      .then(setAthletes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = athletes.filter(a =>
    a.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.goal_race?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="text-volt font-display text-xl animate-pulse">LOADING ATHLETES...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-4xl text-volt">ATHLETES</h1>
        <Link to="/athletes/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          ADD ATHLETE
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-smoke" />
        <input
          type="text"
          placeholder="SEARCH ATHLETES..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-12"
        />
      </div>

      {/* Table */}
      <div className="border border-ash">
        <div className="grid grid-cols-7 gap-4 px-6 py-3 bg-steel text-smoke text-xs uppercase tracking-wider font-semibold">
          <div className="col-span-2">Athlete</div>
          <div>VO2max</div>
          <div>Goal Race</div>
          <div>Weekly KM</div>
          <div>Plan Status</div>
          <div></div>
        </div>

        {filtered.map(athlete => (
          <Link
            key={athlete.id}
            to={`/athletes/${athlete.id}`}
            className="grid grid-cols-7 gap-4 px-6 py-4 border-t border-ash hover:bg-ash/50 transition-colors items-center group"
          >
            <div className="col-span-2">
              <p className="font-semibold uppercase">{athlete.profiles?.full_name}</p>
              <p className="text-smoke text-xs">{athlete.profiles?.email}</p>
            </div>
            <div className="text-volt font-bold">{athlete.vdot || '--'}</div>
            <div className="text-sm">{athlete.goal_race || '--'}</div>
            <div className="text-sm">{athlete.weekly_km || '--'}</div>
            <div>
              {athlete.training_plans?.some(p => p.status === 'approved') ? (
                <span className="badge">ACTIVE</span>
              ) : (
                <span className="text-smoke text-xs uppercase">No Plan</span>
              )}
            </div>
            <div className="text-right">
              <ChevronRight size={18} className="text-smoke group-hover:text-volt transition-colors inline" />
            </div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <div className="px-6 py-8 text-center text-smoke">
            {search ? 'No athletes match your search' : 'No athletes registered yet'}
          </div>
        )}
      </div>
    </div>
  );
}
