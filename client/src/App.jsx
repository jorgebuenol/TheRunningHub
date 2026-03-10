import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AthletesPage from './pages/AthletesPage';
import AthleteDetailPage from './pages/AthleteDetailPage';
import AthleteOnboardingPage from './pages/AthleteOnboardingPage';
import PlanViewPage from './pages/PlanViewPage';
import CalendarPage from './pages/CalendarPage';
import MyPlanPage from './pages/MyPlanPage';
import ReadinessCheckInPage from './pages/ReadinessCheckInPage';
import AthleteMonitoringPage from './pages/AthleteMonitoringPage';
import AthleteLoadPage from './pages/AthleteLoadPage';
import AIChatPage from './pages/AIChatPage';
import MyProfilePage from './pages/MyProfilePage';

function ProtectedRoute({ children, coachOnly = false }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-carbon flex items-center justify-center">
        <div className="text-volt font-display text-2xl animate-pulse">LOADING...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (coachOnly && profile?.role !== 'coach') return <Navigate to="/my-plan" replace />;

  return children;
}

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-carbon flex items-center justify-center">
        <div className="text-volt font-display text-4xl animate-pulse tracking-wider">
          THE RUN HUB
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={profile?.role === 'coach' ? '/dashboard' : '/my-plan'} replace /> : <LoginPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Coach routes */}
        <Route path="/dashboard" element={<ProtectedRoute coachOnly><DashboardPage /></ProtectedRoute>} />
        <Route path="/athletes" element={<ProtectedRoute coachOnly><AthletesPage /></ProtectedRoute>} />
        <Route path="/athletes/new" element={<ProtectedRoute coachOnly><AthleteOnboardingPage /></ProtectedRoute>} />
        <Route path="/athletes/:id" element={<ProtectedRoute coachOnly><AthleteDetailPage /></ProtectedRoute>} />
        <Route path="/athletes/:id/monitoring" element={<ProtectedRoute coachOnly><AthleteMonitoringPage /></ProtectedRoute>} />
        <Route path="/athletes/:id/load" element={<ProtectedRoute coachOnly><AthleteLoadPage /></ProtectedRoute>} />
        <Route path="/plans/:planId" element={<ProtectedRoute><PlanViewPage /></ProtectedRoute>} />
        <Route path="/calendar/:athleteId" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute coachOnly><AIChatPage /></ProtectedRoute>} />

        {/* Athlete routes */}
        <Route path="/my-plan" element={<ProtectedRoute><MyPlanPage /></ProtectedRoute>} />
        <Route path="/my-calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="/my-profile" element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
        <Route path="/readiness" element={<ProtectedRoute><ReadinessCheckInPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
