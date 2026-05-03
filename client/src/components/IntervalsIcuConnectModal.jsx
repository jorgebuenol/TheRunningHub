import { useState } from 'react';
import { api } from '../lib/api';
import { X, ExternalLink, Loader, Check, AlertCircle, Code2 } from 'lucide-react';

const SETTINGS_URL = 'https://intervals.icu/settings';
const PACE_SETTINGS_URL = 'https://intervals.icu/settings/Run';

export default function IntervalsIcuConnectModal({ athleteId, onClose, onConnected }) {
  const [icuAthleteId, setIcuAthleteId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [thresholdConfirmed, setThresholdConfirmed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = icuAthleteId.trim() && apiKey.trim() && thresholdConfirmed && !verifying;

  async function handleConnect() {
    setError('');
    setVerifying(true);
    const trimmedId = icuAthleteId.trim();
    const trimmedKey = apiKey.trim();
    try {
      const result = await api.intervalsConnect(athleteId, {
        athlete_id: trimmedId,
        api_key: trimmedKey,
      });
      onConnected?.({
        athlete_name: result?.athlete_name,
        athlete_id: trimmedId,
        api_key: trimmedKey,
      });
    } catch (err) {
      setError(err.message || 'Could not connect — check your credentials');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg">CONNECT INTERVALS.ICU</h3>
          <button onClick={onClose} className="text-smoke hover:text-white p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <Step number={1} title="Go to Intervals.icu Settings">
          <p className="text-smoke text-sm mb-3">
            Create a free account if you don't have one, then open Settings.
          </p>
          <a
            href={SETTINGS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-2 no-underline"
          >
            <ExternalLink size={14} /> Open Intervals.icu Settings
          </a>
        </Step>

        <Step number={2} title="Find Developer Settings">
          <p className="text-smoke text-sm mb-2">
            Scroll to the bottom of the Settings page until you see the{' '}
            <span className="text-white font-semibold">Developer Settings</span> section
            (it has a code icon
            <Code2 size={14} className="inline-block mx-1 -mt-0.5 text-white" />
            ).
          </p>
          <p className="text-smoke text-sm mb-3">
            You'll see your Athlete ID there — it starts with the letter{' '}
            <span className="text-white font-mono">i</span> (example:{' '}
            <span className="text-white font-mono">i557125</span>).
          </p>
          <input
            type="text"
            className="input-field font-mono"
            placeholder="Paste your Athlete ID here"
            value={icuAthleteId}
            onChange={e => setIcuAthleteId(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </Step>

        <Step number={3} title="Generate your API Key">
          <p className="text-smoke text-sm mb-2">
            Next to the API Key, click{' '}
            <span className="text-white font-semibold">(view)</span> and then click{' '}
            <span className="text-white font-semibold">Generate API Key</span>.
          </p>
          <p className="text-smoke text-sm mb-3">Copy the key that appears.</p>
          <input
            type="text"
            className="input-field font-mono"
            placeholder="Paste your API Key here"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </Step>

        <Step number="3.5" title="Configure your Threshold Pace">
          <p className="text-smoke text-sm mb-3">
            In Intervals.icu Settings, click the{' '}
            <span className="text-white font-semibold">RUN</span> tab and set your{' '}
            <span className="text-white font-semibold">Threshold Pace</span>. This is required
            for workouts to sync to your Garmin with pace targets.
          </p>
          <a
            href={PACE_SETTINGS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-2 no-underline mb-3"
          >
            <ExternalLink size={14} /> Open Pace Settings
          </a>
          <label className="flex items-start gap-2 cursor-pointer text-sm text-white">
            <input
              type="checkbox"
              checked={thresholdConfirmed}
              onChange={e => setThresholdConfirmed(e.target.checked)}
              className="mt-1 accent-volt"
            />
            <span>I've configured my Threshold Pace</span>
          </label>
        </Step>

        <Step number={4} title="Connect" last>
          <p className="text-smoke text-sm mb-3">
            We'll make a test call to Intervals.icu to confirm your credentials before saving.
          </p>
          <button
            onClick={handleConnect}
            disabled={!canSubmit}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            {verifying ? 'Verifying…' : 'Verify & Connect'}
          </button>
          {error && (
            <div className="flex items-start gap-2 mt-3 text-red-400 text-sm">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </Step>
      </div>
    </div>
  );
}

function Step({ number, title, children, last }) {
  return (
    <div className={`flex gap-3 ${last ? '' : 'mb-5 pb-5 border-b border-ash/50'}`}>
      <div className="shrink-0 w-7 h-7 rounded-full bg-volt text-carbon font-display text-sm flex items-center justify-center">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-display text-sm tracking-wider mb-2">{title}</h4>
        {children}
      </div>
    </div>
  );
}
