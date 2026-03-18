import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Zap, CheckCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password, { full_name: fullName, role: 'athlete' });

      // Send welcome email (non-blocking)
      try {
        await fetch(`${API_URL}/api/email/welcome`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, full_name: fullName }),
        });
      } catch {
        // Email failure doesn't block registration
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-carbon flex">
      {/* Left: Brand */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-steel" />
        <div className="relative z-10 p-16">
          <div className="flex items-center gap-3 mb-8">
            <Zap size={40} className="text-volt" strokeWidth={3} />
            <h1 className="font-display text-6xl text-volt tracking-wider">THE RUN HUB</h1>
          </div>
          <p className="text-2xl font-body font-bold uppercase tracking-widest text-white mb-4">
            Getting Ready for the Colombia Splits
          </p>
          <p className="text-smoke text-lg font-body tracking-wide max-w-md">
            PERSONALIZED TRAINING PLANS. REAL-TIME TRACKING. POWERED BY AI.
          </p>
          <div className="mt-12 flex gap-6">
            <div>
              <p className="stat-value">2,640M</p>
              <p className="text-smoke text-xs uppercase tracking-wider mt-1">Altitude</p>
            </div>
            <div className="border-l border-ash pl-6">
              <p className="stat-value">BOGOTA</p>
              <p className="text-smoke text-xs uppercase tracking-wider mt-1">Colombia</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 sm:mb-12">
            <h1 className="font-display text-3xl sm:text-4xl text-volt tracking-wider">THE RUN HUB</h1>
            <p className="text-smoke uppercase tracking-widest text-xs sm:text-sm mt-1">Getting Ready for the Colombia Splits</p>
          </div>

          {success ? (
            <div className="text-center">
              <CheckCircle size={48} className="text-volt mx-auto mb-4" />
              <h2 className="font-display text-2xl sm:text-3xl mb-4">ACCOUNT CREATED</h2>
              <p className="text-smoke mb-6">
                Check your email for a welcome message, then sign in to complete your profile.
              </p>
              <Link to="/login" className="btn-primary inline-block px-8 py-3">
                SIGN IN
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-display text-2xl sm:text-3xl mb-2">CREATE ACCOUNT</h2>
              <p className="text-smoke text-sm uppercase tracking-wider mb-6">Athlete Registration</p>

              {error && (
                <div className="bg-red-900/30 border border-red-500 text-red-300 px-4 py-3 mb-6 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="label">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input-field"
                    placeholder="Your full name"
                    required
                  />
                </div>

                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field"
                    placeholder="athlete@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
                </button>
              </form>

              <div className="mt-8 text-center">
                <Link
                  to="/login"
                  className="text-smoke hover:text-volt text-sm uppercase tracking-wider transition-colors"
                >
                  Already have an account? Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
