import { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";

export default function SettingsView() {
  const { user, updateUsername } = useAuth();

  // --------------------------------------------------
  // Profile state
  // --------------------------------------------------

  const [username, setUsername] = useState(
    user?.username || ""
  );

  const [usernameStatus, setUsernameStatus] =
    useState(null);

  const [savingUsername, setSavingUsername] =
    useState(false);

  // --------------------------------------------------
  // Username validation
  // --------------------------------------------------

  function validateUsername(value) {
    const trimmed = value.trim();

    if (!trimmed) {
      return "Username is required.";
    }

    if (trimmed.length < 3) {
      return "Username must be at least 3 characters.";
    }

    if (trimmed.length > 30) {
      return "Username must not exceed 30 characters.";
    }

    // Allows letters, numbers, underscore and dot
    if (!/^[a-zA-Z0-9_.]+$/.test(trimmed)) {
      return "Username can only contain letters, numbers, underscores, and dots.";
    }

    return null;
  }

  // --------------------------------------------------
  // Username submit
  // --------------------------------------------------

  async function handleUsernameSubmit(e) {
    e.preventDefault();

    setUsernameStatus(null);

    const validationError =
      validateUsername(username);

    if (validationError) {
      setUsernameStatus({
        ok: false,
        text: validationError,
      });
      return;
    }

    setSavingUsername(true);

    try {
      await updateUsername(username.trim());

      setUsernameStatus({
        ok: true,
        text: "Username updated successfully.",
      });
    } catch (err) {
      setUsernameStatus({
        ok: false,
        text:
          err.response?.data?.username?.[0] ||
          err.response?.data?.error ||
          "Could not update username.",
      });
    } finally {
      setSavingUsername(false);
    }
  }

  return (
    <div className="content-view settings-view">

      {/* ---------------------------------------- */}
      {/* Page Header */}
      {/* ---------------------------------------- */}

      <div className="content-header settings-header">
        <div className="eyebrow">
          Account
        </div>

        <h2>Your details</h2>

        <p>
          Manage your profile information.
        </p>
      </div>


      {/* ---------------------------------------- */}
      {/* Profile Card */}
      {/* ---------------------------------------- */}

      <form
        className="panel-card settings-card"
        onSubmit={handleUsernameSubmit}
      >
        <div className="settings-card-header">
          <div className="settings-icon">
            👤
          </div>

          <div>
            <h4>Profile</h4>

            <p>
              Update your SafeRoute username.
            </p>
          </div>
        </div>


        {/* Email */}

        <div className="field-block">
          <label>
            Email
          </label>

          <input
            type="email"
            readOnly
            value={user?.email || ""}
            aria-label="Email address"
          />

          <small className="field-help">
            Your registered email cannot be
            changed here.
          </small>
        </div>


        {/* Username */}

        <div className="field-block">
          <label>
            Username
            <span className="required">*</span>
          </label>

          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameStatus(null);
            }}
            placeholder="Enter your username"
            minLength={3}
            maxLength={30}
            required
          />

          <small className="field-help">
            3–30 characters. Letters, numbers,
            underscores and dots only.
          </small>
        </div>


        <button
          className="btn btn-primary"
          type="submit"
          disabled={savingUsername}
        >
          {savingUsername
            ? "Saving…"
            : "Save username"}
        </button>


        {usernameStatus && (
          <div
            className={
              `form-toast ${
                usernameStatus.ok
                  ? "success-message"
                  : "error-message"
              }`
            }
          >
            {usernameStatus.text}
          </div>
        )}
      </form>
    </div>
  );
}
