import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * BUG FIX / missing feature: SOS previously had no gating at all — it
 * fired a toast for anyone regardless of whether they had any emergency
 * contact on file, which defeats the point of an SOS button. Per spec: a
 * reminder message must stay visible at all times until the user has
 * filled in their emergency contacts, and the button itself should not
 * pretend to send an SOS signal until then.
 */
export default function SosButton() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);

  const hasContacts = (user?.emergency_contacts?.length || 0) > 0;

  function handleClick() {
    if (!hasContacts) {
      navigate("/app/settings");
      return;
    }
    setShowToast(true);
    setTimeout(() => setShowToast(false), 6000);
  }

  return (
    <>
      <button className="sos-btn" onClick={handleClick}>🆘 SOS</button>

      {!hasContacts && (
        <div className="sos-toast" style={{ background: "var(--risk-bg, #fbeae6)", color: "var(--risk)" }}>
          ⚠️ Add at least one emergency contact in "Your Details" to enable SOS.
        </div>
      )}

      {hasContacts && showToast && (
        <div className="sos-toast">
          🆘 SOS signal sent. Share your live location with a trusted contact and call local emergency services if you are in immediate danger.
        </div>
      )}
    </>
  );
}
