import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const NAV_ITEMS = [
  { to: "/app", end: true, label: "Route & Safety", icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>
    ) },
  { to: "/app/history", label: "Past History", icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
    ) },
  { to: "/app/analysis", label: "Yearly Analysis", icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 15l4-6 3 3 5-8" /></svg>
    ) },
  { to: "/app/alerts", label: "Alerts", icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
    ) },
  { to: "/app/report", label: "Report Incident", icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
    ) },
  { to: "/app/settings", label: "Your Details", icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>
    ) },
];

// Small hamburger / close icon. `open` swaps it to an "X" so the same
// button visually communicates what tapping it will do next.
function HamburgerIcon({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

const MOBILE_BREAKPOINT = 900;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // Sidebar starts open on desktop-sized screens and closed on narrow
  // ones, but the hamburger button always lets the person flip it either
  // way regardless of screen size.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > MOBILE_BREAKPOINT
  );

  // If the sidebar is open as an overlay on a small screen, close it
  // automatically once the person navigates to a different section —
  // otherwise it would just sit there covering the page they tapped into.
  function handleNavClick() {
    if (window.innerWidth <= MOBILE_BREAKPOINT) setSidebarOpen(false);
  }

  // Pressing Escape closes the sidebar when it's open as a mobile overlay.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && sidebarOpen && window.innerWidth <= MOBILE_BREAKPOINT) {
        setSidebarOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  function confirmLogout() {
    setConfirmingLogout(false);
    logout();
    navigate("/");
  }

  const initial = (user?.full_name || user?.fullName || user?.username || "?").trim()[0]?.toUpperCase() || "?";
  const displayName = user?.full_name || user?.fullName || user?.username || "—";

  return (
    <div className={"app-shell" + (sidebarOpen ? "" : " sidebar-collapsed")}>
      {/* Floating hamburger: only rendered while the sidebar is closed, so
          there's always exactly one toggle button visible/reachable. */}
      {!sidebarOpen && (
        <button
          type="button"
          className="hamburger-btn hamburger-floating"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
          aria-expanded={sidebarOpen}
        >
          <HamburgerIcon open={false} />
        </button>
      )}

      {/* Backdrop for the mobile overlay drawer; invisible/inert on
          desktop where the sidebar is just a normal flex column. */}
      <div
        className={"sidebar-backdrop" + (sidebarOpen ? " visible" : "")}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={"sidebar" + (sidebarOpen ? " sidebar-open" : " sidebar-closed")}>
        <div className="sidebar-top">
          <div className="brandmark"><span className="shield" style={{ width: 26, height: 26, fontSize: 13 }}>🛡</span> SafeRoute</div>
          <button
            type="button"
            className="hamburger-btn hamburger-inline"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            aria-expanded={sidebarOpen}
          >
            <HamburgerIcon open={true} />
          </button>
        </div>
        <div className="brand-sub">AHMEDABAD</div>

        <div className="nav-label">Navigation</div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={handleNavClick}
            className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        <div className="sidebar-spacer" />

        <div className="user-card">
          <div className="user-row">
            <div className="avatar">{initial}</div>
            <div>
              <div className="user-name">{displayName}</div>
              <div className="user-email">{user?.email || "—"}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={() => setConfirmingLogout(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
            Log out
          </button>
        </div>
      </aside>

      <main className="main-pane">
        <Outlet />
      </main>

      <ConfirmDialog
        open={confirmingLogout}
        title="Log out of SafeRoute?"
        message="You'll need to sign in again to plan routes, view alerts, or report incidents."
        confirmLabel="Log out"
        danger
        onConfirm={confirmLogout}
        onCancel={() => setConfirmingLogout(false)}
      />
    </div>
  );
}
