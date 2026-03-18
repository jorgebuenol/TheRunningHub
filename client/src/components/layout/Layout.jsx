import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { LayoutDashboard, Users, Calendar, CalendarDays, LogOut, Zap, User, MessageSquare, ClipboardCheck, UserCircle, Menu, X, TrendingUp } from 'lucide-react';

export default function Layout() {
  const { profile, isCoach, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newAthleteCount, setNewAthleteCount] = useState(0);

  useEffect(() => {
    if (isCoach) {
      api.getNewAthleteCount().then(d => setNewAthleteCount(d.count)).catch(() => {});
    }
  }, [isCoach]);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 text-sm font-semibold uppercase tracking-wider transition-colors min-h-[44px] ${
      isActive ? 'text-volt bg-steel border-l-2 border-volt' : 'text-smoke hover:text-white'
    }`;

  function handleNavClick() {
    setSidebarOpen(false);
  }

  return (
    <div className="min-h-screen bg-carbon flex">
      {/* Mobile header bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-carbon border-b border-ash flex items-center justify-between px-4 z-30 md:hidden">
        <button onClick={() => setSidebarOpen(true)} className="text-smoke hover:text-volt p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <Menu size={24} />
        </button>
        <h1 className="font-display text-lg text-volt tracking-wider">THE RUN HUB</h1>
        <div className="w-[44px]" /> {/* spacer for centering */}
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        w-64 bg-carbon border-r border-ash flex flex-col fixed h-full z-50
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        {/* Logo + close button */}
        <div className="p-6 border-b border-ash flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-volt tracking-wider">THE RUN HUB</h1>
            <p className="text-smoke text-xs uppercase tracking-widest mt-1">
              {isCoach ? 'Coach Platform' : 'Training'}
            </p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-smoke hover:text-volt min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {isCoach ? (
            <>
              <NavLink to="/dashboard" className={navLinkClass} onClick={handleNavClick}>
                <LayoutDashboard size={18} />
                Dashboard
              </NavLink>
              <NavLink to="/athletes" className={navLinkClass} onClick={handleNavClick}>
                <Users size={18} />
                Athletes
                {newAthleteCount > 0 && (
                  <span className="ml-auto bg-volt text-carbon text-xs font-bold px-1.5 py-0.5 min-w-[20px] text-center">
                    {newAthleteCount}
                  </span>
                )}
              </NavLink>
              <NavLink to="/progress" className={navLinkClass} onClick={handleNavClick}>
                <TrendingUp size={18} />
                Progress
              </NavLink>
              <NavLink to="/chat" className={navLinkClass} onClick={handleNavClick}>
                <MessageSquare size={18} />
                AI Chat
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/my-plan" className={navLinkClass} onClick={handleNavClick}>
                <Calendar size={18} />
                My Plan
              </NavLink>
              <NavLink to="/my-calendar" className={navLinkClass} onClick={handleNavClick}>
                <CalendarDays size={18} />
                Calendar
              </NavLink>
              <NavLink to="/my-profile" className={navLinkClass} onClick={handleNavClick}>
                <UserCircle size={18} />
                My Profile
              </NavLink>
              <NavLink to="/my-progress" className={navLinkClass} onClick={handleNavClick}>
                <TrendingUp size={18} />
                Progress
              </NavLink>
              <NavLink to="/readiness" className={navLinkClass} onClick={handleNavClick}>
                <ClipboardCheck size={18} />
                Check-in
              </NavLink>
            </>
          )}
        </nav>

        {/* User */}
        <div className="border-t border-ash p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-volt flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-carbon" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.full_name}</p>
              <p className="text-xs text-smoke uppercase">{profile?.role}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-2 text-smoke hover:text-white text-xs uppercase tracking-wider min-h-[44px]">
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-64 min-w-0 overflow-x-hidden">
        <div className="p-4 md:p-8 pt-[72px] md:pt-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
