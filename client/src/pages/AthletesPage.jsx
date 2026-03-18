import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Plus, Search, ChevronRight, Trash2 } from 'lucide-react';
import { formatPace } from '../lib/vdot';

export default function AthletesPage() {
  const [athletes, setAthletes] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function loadAthletes() {
    api.getAthletes()
      .then(setAthletes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadAthletes(); }, []);

  const filtered = athletes.filter(a =>
    a.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.goal_race?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="text-volt font-display text-xl animate-pulse">LOADING ATHLETES...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3">
        <h1 className="font-display text-3xl sm:text-4xl text-volt">ATHLETES</h1>
        <Link to="/athletes/new" className="btn-primary flex items-center gap-2 flex-shrink-0 text-xs sm:text-sm">
          <Plus size={16} />
          <span className="hidden sm:inline">ADD ATHLETE</span>
          <span className="sm:hidden">ADD</span>
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

      {/* Desktop Table */}
      <div className="hidden md:block border border-ash">
        <div className="grid grid-cols-7 gap-4 px-6 py-3 bg-steel text-smoke text-xs uppercase tracking-wider font-semibold">
          <div className="col-span-2">Athlete</div>
          <div>VDOT</div>
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
              ) : athlete.training_plans?.length === 0 ? (
                <span className="text-volt text-xs font-bold uppercase border border-volt/30 bg-volt/10 px-2 py-0.5">NEW</span>
              ) : (
                <span className="text-smoke text-xs uppercase">No Plan</span>
              )}
            </div>
            <div className="text-right flex items-center justify-end gap-2">
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(athlete); }}
                className="text-smoke/30 hover:text-red-400 transition-colors p-1"
                title="Delete athlete"
              >
                <Trash2 size={14} />
              </button>
              <ChevronRight size={18} className="text-smoke group-hover:text-volt transition-colors" />
            </div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <div className="px-6 py-8 text-center text-smoke">
            {search ? 'No athletes match your search' : 'No athletes registered yet'}
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filtered.map(athlete => (
          <Link
            key={athlete.id}
            to={`/athletes/${athlete.id}`}
            className="card flex items-center justify-between gap-3 group hover:border-volt transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold uppercase text-sm truncate">{athlete.profiles?.full_name}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-smoke">
                {athlete.vdot && <span className="text-volt font-bold">V{athlete.vdot}</span>}
                {athlete.goal_race && <span>{athlete.goal_race}</span>}
                {athlete.weekly_km && <span>{athlete.weekly_km}km/w</span>}
              </div>
              <div className="mt-1">
                {athlete.training_plans?.some(p => p.status === 'approved') ? (
                  <span className="text-green-400 text-xs font-semibold uppercase">Plan Active</span>
                ) : athlete.training_plans?.length === 0 ? (
                  <span className="text-volt text-xs font-bold uppercase">New</span>
                ) : (
                  <span className="text-smoke text-xs uppercase">No Plan</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(athlete); }}
                className="text-smoke/30 hover:text-red-400 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Delete athlete"
              >
                <Trash2 size={16} />
              </button>
              <ChevronRight size={18} className="text-smoke group-hover:text-volt transition-colors" />
            </div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <div className="card text-center py-8 text-smoke">
            {search ? 'No athletes match your search' : 'No athletes registered yet'}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-carbon border border-red-500/50 border-l-4 border-l-red-500 p-6 max-w-md w-full">
            <h3 className="font-display text-xl text-red-400 mb-3">DELETE ATHLETE</h3>
            <p className="text-smoke text-sm leading-relaxed mb-6">
              Delete <span className="text-white font-semibold">{deleteTarget.profiles?.full_name}</span>?
              This permanently removes their profile, training plans, workouts, and all data.
              This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="btn-ghost"
                disabled={deleting}
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api.deleteAthlete(deleteTarget.id);
                    setDeleteTarget(null);
                    loadAthletes();
                  } catch (err) {
                    console.error('Delete failed:', err);
                    alert('Failed to delete athlete: ' + err.message);
                  } finally {
                    setDeleting(false);
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                disabled={deleting}
              >
                {deleting ? 'DELETING...' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
