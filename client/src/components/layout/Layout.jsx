import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, Users, Calendar, CalendarDays, LogOut, Zap, User, MessageSquare, ClipboardCheck, UserCircle } from 'lucide-react';

export default function Layout() {
  const { profile, isCoach, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 text-sm font-semibold uppercase tracking-wider transition-colors ${
      isActive ? 'text-volt bg-steel border-l-2 border-volt' : 'text-smoke hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-carbon flex">
      {/* Sidebar */}
      <aside className="w-64 bg-carbon border-r border-ash flex flex-col fixed h-full z-10">
        {/* Logo */}
        <div className="p-6 border-b border-ash">
          <h1 className="font-display text-2xl text-volt tracking-wider">THE RUN HUB</h1>
          <p className="text-smoke text-xs uppercase tracking-widest mt-1">Coach Platform</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          {isCoach ? (
            <>
              <NavLink to="/dashboard" className={navLinkClass}>
                <LayoutDashboard size={18} />
                Dashboard
              </NavLink>
              <NavLink to="/athletes" className={navLinkClass}>
                <Users size={18} />
                Athletes
              </NavLink>
              <NavLink to="/chat" className={navLinkClass}>
                <MessageSquare size={18} />
                AI Chat
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/my-plan" className={navLinkClass}>
                <Calendar size={18} />
                My Plan
              </NavLink>
              <NavLink to="/my-calendar" className={navLinkClass}>
                <CalendarDays size={18} />
                Calendar
              </NavLink>
              <NavLink to="/my-profile" className={navLinkClass}>
                <UserCircle size={18} />
                My Profile
              </NavLink>
              <NavLink to="/readiness" className={navLinkClass}>
                <ClipboardCheck size={18} />
                Check-in
              </NavLink>
            </>
          )}
        </nav>

        {/* User */}
        <div className="border-t border-ash p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-volt flex items-center justify-center">
              <User size={16} className="text-carbon" />
            </div>
            <div>
              <p className="text-sm font-semibold">{profile?.full_name}</p>
              <p className="text-xs text-smoke uppercase">{profile?.role}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-2 text-smoke hover:text-white text-xs uppercase tracking-wider">
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
