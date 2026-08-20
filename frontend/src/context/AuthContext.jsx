import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { setAuthToken, getStoredToken } from "../api/client.js";
import { loginUser, registerUser, fetchMe, updateUsername as apiUpdateUsername } from "../api/auth.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  // BUG FIX: there was previously no persisted session at all — a page
  // refresh wiped `user`/`token` from memory and RequireAuth immediately
  // bounced to /login even though the JWT was still valid. `authReady`
  // gates routing until we've had a chance to restore + verify a stored
  // token, so a refresh doesn't flash-redirect a still-logged-in user.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const stored = getStoredToken();
    if (!stored) {
      setAuthReady(true);
      return;
    }
    setAuthToken(stored);
    fetchMe()
      .then((me) => {
        setToken(stored);
        setUser(me);
      })
      .catch(() => {
        // stored token expired/invalid — client.js's 401 interceptor
        // already clears it, but do it here too in case fetchMe fails
        // for another reason (e.g. server unreachable).
        setAuthToken(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  const signup = useCallback(async ({ fullName, email, password }) => {
    // Django's User model needs a unique username; derive one from the
    // email since the signup form only asks for name/email/password.
    // Login afterwards is still by email (see api/auth.js), so this
    // generated username is an implementation detail the user never sees
    // (they can still change it later from Your Details).
    const username = email.split("@")[0] + "_" + Math.floor(Math.random() * 100000);
    const data = await registerUser({ username, email, fullName, password });
    setAuthToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const data = await loginUser({ email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const updateUsername = useCallback(async (username) => {
    const updated = await apiUpdateUsername(username);
    setUser(updated);
    return updated;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user, token, authReady, signup, login, logout,
        updateUsername,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
