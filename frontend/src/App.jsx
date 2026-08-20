import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import AppLayout from "./pages/AppLayout.jsx";
import RouteSafetyView from "./pages/views/RouteSafetyView.jsx";
import HistoryView from "./pages/views/HistoryView.jsx";
import AnalysisView from "./pages/views/AnalysisView.jsx";
import AlertsView from "./pages/views/AlertsView.jsx";
import ReportView from "./pages/views/ReportView.jsx";
import SettingsView from "./pages/views/SettingsView.jsx";
import "./styles/theme.css";

/**
 * Redirects to /login if there's no authenticated user.
 *
 * BUG FIX: previously checked `user` alone, which is null for a brief
 * instant on every page load/refresh while AuthContext is still verifying
 * a stored token — that instant was enough to bounce a genuinely logged-in
 * user straight to /login. Now waits for `authReady` before deciding.
 */
function RequireAuth({ children }) {
  const { user, authReady } = useAuth();
  if (!authReady) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/login" element={<AuthPage mode="login" />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<RouteSafetyView />} />
        <Route path="history" element={<HistoryView />} />
        <Route path="analysis" element={<AnalysisView />} />
        <Route path="alerts" element={<AlertsView />} />
        <Route path="report" element={<ReportView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
