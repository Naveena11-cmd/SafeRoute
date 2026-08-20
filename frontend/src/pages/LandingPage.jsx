import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const FEATURES = [
  {
    icon: "⇄",
    title: "3 smart routes",
    desc: "Compare distance, time, and safety score side by side.",
  },
  {
    icon: "📍",
    title: "Live hotspot map",
    desc: "Theft, harassment, lighting, road-block and construction — visualised.",
  },
  {
    icon: "📈",
    title: "Yearly analysis",
    desc: "See how incidents trend across areas and categories, from real reported data.",
  },
  {
    icon: "🔔",
    title: "Community alerts",
    desc: "Recent reports from citizens and city advisories in one feed.",
  },
];

const STEPS = [
  {
    title: "Sign up in seconds",
    desc: "Just a name, email, and password — no lengthy onboarding before you can plan your first walk.",
  },
  {
    title: "Search a route",
    desc: "Enter where you're starting and where you're headed. We'll pull real road geometry, not a straight line.",
  },
  {
    title: "Pick with confidence",
    desc: "See up to three route options, each labelled Safest, Fastest, or Balanced by a trained model.",
  },
];

const STATS = [
  { num: "600+", label: "Incidents tracked" },
  { num: "17", label: "Ahmedabad areas covered" },
  { num: "3", label: "Route options per search" },
  { num: "Live", label: "Hotspot map updates" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }

    window.addEventListener("scroll", onScroll);

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing-page">

      {/* ================= NAVBAR ================= */}
      <nav className={"landing-nav" + (scrolled ? " scrolled" : "")}>

        <div className="landing-brand-area">
          <div className="brandmark">
            <span className="shield">🛡</span>
            <span>SafeRoute</span>
          </div>

          <span className="city-badge">
            Ahmedabad
          </span>
        </div>

        <div className="nav-actions">
          <button
            className="nav-login"
            onClick={() => navigate("/login")}
          >
            Log in
          </button>

          <button
            className="btn btn-primary nav-signup"
            onClick={() => navigate("/signup")}
          >
            Sign up
          </button>
        </div>

      </nav>


      {/* ================= HERO ================= */}
      <section className="hero-new">

        <div className="hero-content">

          <div className="hero-eyebrow">
            <span className="hero-dot" />
            PEDESTRIAN SAFETY, REIMAGINED
          </div>

          <h1>
            Walk Ahmedabad with a{" "}
            <span className="accent-word">
              route that watches your back.
            </span>
          </h1>

          <p>
            SafeRoute picks three real walking paths between any two points
            in the city, scores each one for safety using incident hotspots,
            lighting reports, and construction blocks — so you always know
            which way home is calmer.
          </p>

          <div className="hero-actions">

            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate("/signup")}
            >
              Get Started →
            </button>

            <button
              className="btn btn-ghost btn-lg"
              onClick={() => navigate("/login")}
            >
              I already have an account
            </button>

          </div>

        </div>


        {/* HERO IMAGE */}
        <div className="hero-visual">

          <div className="hero-image-wrapper">

            <img
              src="/images/safe-walking.jpg"
              alt="Pedestrian walking safely at night"
              className="hero-image"
            />

            <div className="route-preview-card">

              <div className="route-label">
                ROUTE A · SAFEST
              </div>

              <div className="route-score">
                92<span>/100</span>
              </div>

              <div className="route-meta">
                2.4 km · 28 min walk
              </div>

              <div className="route-recommended">
                Recommended
              </div>

            </div>

          </div>

        </div>

      </section>


      {/* ================= STATS ================= */}
      <section className="stats-bar">

        {STATS.map((s) => (
          <div
            className="stat-block"
            key={s.label}
          >
            <div className="num">
              {s.num}
            </div>

            <div className="lbl">
              {s.label}
            </div>
          </div>
        ))}

      </section>


      {/* ================= FEATURES ================= */}
      <section className="features-section">

        <div className="section-head">
          <div className="eyebrow">
            Why SafeRoute
          </div>

          <h2>
            Every step. Weighed against the city's real risks.
          </h2>
        </div>


        <div className="feature-grid">

          {FEATURES.map((f) => (
            <div
              className="feature-card"
              key={f.title}
            >

              <div className="icon">
                {f.icon}
              </div>

              <h3>
                {f.title}
              </h3>

              <p>
                {f.desc}
              </p>

            </div>
          ))}

        </div>

      </section>


      {/* ================= HOW IT WORKS ================= */}
      <section className="how-section">

        <div className="section-head">

          <div className="eyebrow">
            How it works
          </div>

          <h2>
            Three steps to a safer walk
          </h2>

        </div>


        <div className="steps-row">

          {STEPS.map((s, i) => (

            <div
              className="step-card"
              key={s.title}
            >

              <div className="step-num">
                {i + 1}
              </div>

              <h3>
                {s.title}
              </h3>

              <p>
                {s.desc}
              </p>

              {i < STEPS.length - 1 && (
                <div className="step-connector" />
              )}

            </div>

          ))}

        </div>

      </section>


      {/* ================= QUOTE ================= */}
      <section className="quote-section">

        <blockquote>
          "The route with the fewest incident reports isn't always
          the shortest — and that's the point."
        </blockquote>

        <div className="quote-attribution">

          <div className="quote-avatar">
            SR
          </div>

          Why we built SafeRoute this way

        </div>

      </section>


      {/* ================= CTA ================= */}
      <section className="cta-banner">

        <div>

          <div className="eyebrow">
            Free to start
          </div>

          <h2>
            Plan your first safe walk in under a minute.
          </h2>

          <p>
            Sign up, pick a source and destination anywhere in Ahmedabad,
            and we'll do the risk math for you.
          </p>

        </div>

        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate("/signup")}
        >
          Get Started →
        </button>

      </section>


      {/* ================= FOOTER ================= */}
      <footer className="landing-footer">

        <div className="brandmark">

          <span
            className="shield"
            style={{
              width: 24,
              height: 24,
              fontSize: 12,
            }}
          >
            🛡
          </span>

          SafeRoute

        </div>

        <div className="foot-note">
          Built for pedestrian safety in Ahmedabad.
          Route and incident data shown is for demonstration purposes.
        </div>

      </footer>

    </div>
  );
}