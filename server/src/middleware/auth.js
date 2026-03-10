import { createClient } from '@supabase/supabase-js';

let _supabase;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _supabase;
}

export async function authMiddleware(req, res, next) {
  const supabase = getSupabase();
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization token' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // Attach user and profile (auto-create if trigger didn't fire)
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    const meta = user.user_metadata || {};
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email || '',
        full_name: meta.full_name || 'New User',
        role: meta.role || 'athlete',
      })
      .select()
      .single();
    profile = newProfile;
  }

  req.user = user;
  req.profile = profile;
  req.supabase = supabase;
  next();
}

export function coachOnly(req, res, next) {
  if (req.profile?.role !== 'coach') {
    return res.status(403).json({ message: 'Coach access required' });
  }
  next();
}
