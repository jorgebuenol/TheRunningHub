import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Zap } from 'lucide-react';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, { full_name: fullName, role: 'athlete' });
        setError('Check your email to confirm your account.');
      } else {
        const result = await signIn(email, password);
        const dest = result.profile?.role === 'coach' ? '/dashboard' : '/my-plan';
        navigate(dest);
      }
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

          <h2 className="font-display text-2xl sm:text-3xl mb-6 sm:mb-8">
            {isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
          </h2>

          {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-300 px-4 py-3 mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
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
            )}

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="coach@therunhub.co"
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'LOADING...' : isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-smoke hover:text-volt text-sm uppercase tracking-wider transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
