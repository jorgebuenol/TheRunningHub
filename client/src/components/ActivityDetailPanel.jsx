import { X, Edit3, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const ACTIVITY_COLORS = {
  easy_run:  { bg: 'bg-green-500/20',   border: 'border-green-500',   text: 'text-green-400',   label: 'Easy Run' },
  long_run:  { bg: 'bg-blue-500/20',    border: 'border-blue-500',    text: 'text-blue-400',    label: 'Long Run' },
  race:      { bg: 'bg-volt/20',        border: 'border-volt',        text: 'text-volt',        label: 'Race' },
  strength:  { bg: 'bg-purple-500/20',  border: 'border-purple-500',  text: 'text-purple-400',  label: 'Strength' },
  pilates:   { bg: 'bg-pink-500/20',    border: 'border-pink-500',    text: 'text-pink-400',    label: 'Pilates' },
  cycling:   { bg: 'bg-cyan-500/20',    border: 'border-cyan-500',    text: 'text-cyan-400',    label: 'Cycling' },
  swimming:  { bg: 'bg-sky-500/20',     border: 'border-sky-500',     text: 'text-sky-400',     label: 'Swimming' },
  walking:   { bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-400', label: 'Walking' },
  other:     { bg: 'bg-gray-500/20',    border: 'border-gray-500',    text: 'text-gray-400',    label: 'Other' },
};

const INTENSITY_COLORS = {
  light:    'text-green-400',
  moderate: 'text-yellow-400',
  heavy:    'text-red-400',
};

function getColors(type) {
  return ACTIVITY_COLORS[type] || ACTIVITY_COLORS.other;
}

function formatPaceFromSec(totalSec) {
  if (!totalSec) return null;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export default function ActivityDetailPanel({ activity, onClose, onEdit, onDelete }) {
  const colors = getColors(activity.activity_type);
  const isRunType = ['easy_run', 'long_run', 'race'].includes(activity.activity_type);

  return (
    <div className="fixed inset-0 z-50 bg-carbon overflow-y-auto lg:relative lg:inset-auto lg:z-auto lg:bg-transparent">
      <div className="min-h-screen lg:min-h-0 bg-steel border border-ash p-4 sm:p-6 lg:mb-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-bold uppercase px-2 py-1 ${colors.bg} ${colors.text} border ${colors.border}`}>
                {colors.label}
              </span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl mb-1">{colors.label}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-smoke text-xs uppercase tracking-wider">
              {activity.session_date && (
                <span>{format(parseISO(activity.session_date), 'EEEE, MMM d')}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-smoke hover:text-white flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={22} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-smoke text-xs uppercase mb-1">Duration</p>
            <p className="font-display text-2xl text-volt">{activity.duration_minutes}<span className="text-sm text-smoke ml-1">min</span></p>
          </div>

          <div>
            <p className="text-smoke text-xs uppercase mb-1">Intensity</p>
            <p className={`font-semibold text-sm uppercase ${INTENSITY_COLORS[activity.intensity] || 'text-white'}`}>
              {activity.intensity || '—'}
            </p>
          </div>

          {(isRunType || activity.activity_type === 'cycling') && activity.distance_km && (
            <div>
              <p className="text-smoke text-xs uppercase mb-1">Distance</p>
              <p className="font-display text-2xl text-volt">{activity.distance_km}<span className="text-sm text-smoke ml-1">km</span></p>
            </div>
          )}

          {isRunType && activity.avg_pace_sec && (
            <div>
              <p className="text-smoke text-xs uppercase mb-1">Avg Pace</p>
              <p className="font-semibold text-sm">{formatPaceFromSec(activity.avg_pace_sec)}<span className="text-smoke ml-1">/km</span></p>
            </div>
          )}

          {activity.avg_hr && (
            <div>
              <p className="text-smoke text-xs uppercase mb-1">Avg HR</p>
              <p className="font-semibold text-sm">{activity.avg_hr}<span className="text-smoke ml-1">bpm</span></p>
            </div>
          )}

          {activity.max_hr && (
            <div>
              <p className="text-smoke text-xs uppercase mb-1">Max HR</p>
              <p className="font-semibold text-sm">{activity.max_hr}<span className="text-smoke ml-1">bpm</span></p>
            </div>
          )}

          {activity.elevation_m && (
            <div>
              <p className="text-smoke text-xs uppercase mb-1">Elevation</p>
              <p className="font-semibold text-sm">{activity.elevation_m}<span className="text-smoke ml-1">m</span></p>
            </div>
          )}
        </div>

        {/* Notes */}
        {activity.notes && (
          <div className="border-t border-ash pt-4 mt-4">
            <p className="text-smoke text-xs uppercase mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{activity.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-ash">
          {onEdit && (
            <button onClick={onEdit} className="btn-primary flex items-center gap-2 text-sm">
              <Edit3 size={14} /> EDIT
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="px-4 py-2 border border-red-500 text-red-400 hover:bg-red-500/20 text-sm uppercase font-bold tracking-wider transition-colors flex items-center gap-2">
              <Trash2 size={14} /> DELETE
            </button>
          )}
          <button onClick={onClose} className="btn-ghost text-sm lg:hidden">
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
