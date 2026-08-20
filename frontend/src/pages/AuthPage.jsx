import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthPage({ mode }) {
  const navigate = useNavigate();
  const { signup, login } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!fullName.trim() || !email.trim() || !password) {
          throw new Error("Please fill in all fields.");
        }

        if (password.length < 8) {
          throw new Error("Password should be at least 8 characters.");
        }

        await signup({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        });
      } else {
        if (!email.trim() || !password) {
          throw new Error("Please fill in all fields.");
        }

        await login({
          email: email.trim(),
          password,
        });
      }

      navigate("/app");

    } catch (err) {
      if (mode === "login") {
        const status = err.response?.status;
        const detail = err.response?.data?.detail || "";

        if (status === 400 || status === 401) {
          setError(
            "No account found or incorrect email/password. Please check your details or create an account."
          );
        } else {
          setError(detail || "Unable to sign in. Please try again.");
        }
      } else {
        const apiMsg =
          err.response?.data?.detail ||
          err.response?.data?.email?.[0] ||
          err.response?.data?.password?.[0] ||
          err.message;

        setError(apiMsg || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className={`auth-page ${isSignup ? "auth-signup" : "auth-login"}`}>

      {/* ================= IMAGE SIDE ================= */}
      <div className="auth-visual">

        <img
          src={
            isSignup
              ? "/images/ahmedabad-city.jpg"
              : "/images/safe-walking1.jpg"
          }
          alt="Ahmedabad"
          className="auth-visual-image"
        />

        <div className="auth-visual-overlay" />

        <div className="auth-visual-content">

          <div className="auth-visual-label">
            PEDESTRIAN SAFETY, LIVE
          </div>

          <h2>
            {isSignup
              ? "Walk Ahmedabad with confidence."
              : "The safest route isn't always the shortest."
            }
          </h2>

          <p>
            {isSignup
              ? "Plan safer walks using real incident data, route analysis, and community reports."
              : "SafeRoute weighs real incident reports and pedestrian risks before recommending your route."
            }
          </p>

        </div>

      </div>


      {/* ================= FORM SIDE ================= */}
      <div className="auth-form-side">

        <div className="auth-form-container">

          {/* BACK */}
          <button
            className="auth-back"
            onClick={() => navigate("/")}
            type="button"
          >
            ← Back to SafeRoute
          </button>


          {/* BRAND */}
          <div className="brandmark auth-brand">

            <span
              className="shield"
              style={{
                width: 30,
                height: 30,
                fontSize: 14,
              }}
            >
              🛡
            </span>

            SafeRoute

          </div>


          {/* HEADING */}
          {isSignup ? (
            <>
              <h1>Create your account</h1>

              <p className="auth-subtitle">
                Start planning safer walks in Ahmedabad today.
              </p>
            </>
          ) : (
            <>
              <h1>Welcome back</h1>

              <p className="auth-subtitle">
                Log in to plan safer walks across Ahmedabad.
              </p>
            </>
          )}


          {/* FORM */}
          <form
            className="auth-form"
            onSubmit={handleSubmit}
          >

            {isSignup && (
              <div className="field">

                <label htmlFor="fullName">
                  Full name
                </label>

                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) =>
                    setFullName(e.target.value)
                  }
                  placeholder="Your full name"
                  autoComplete="name"
                />

              </div>
            )}


            <div className="field">

              <label htmlFor="email">
                Email
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                placeholder="you@saferoute.app"
                autoComplete="email"
              />

            </div>


            <div className="field">

              <label htmlFor="password">
                Password
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder={
                  isSignup
                    ? "At least 8 characters"
                    : "Your password"
                }
                autoComplete={
                  isSignup
                    ? "new-password"
                    : "current-password"
                }
              />

            </div>


            {/* ERROR */}
            {error && (
              <div
                className="auth-error"
                style={{ display: "block" }}
              >
                {error}
              </div>
            )}


            {/* SUBMIT */}
            <button
              className="btn btn-primary auth-submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Please wait…"
                : isSignup
                  ? "Create account →"
                  : "Sign in →"
              }
            </button>

          </form>


          {/* SWITCH */}
          <div className="auth-switch">

            {isSignup ? (
              <>
                Already registered?{" "}
                <Link to="/login">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to SafeRoute?{" "}
                <Link to="/signup">
                  Create an account
                </Link>
              </>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}