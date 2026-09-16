import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { setAuthToken, getStoredToken } from "../api/client.js";
import { loginUser, registerUser, fetchMe, updateUsername as apiUpdateUsername } from "../api/auth.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const stored = getStoredToken();
    
    // FIX: Verify `stored` is a legitimate token string, not "null"/"undefined"/empty
    if (!stored || stored === "null" || stored === "undefined") {
      setAuthToken(null);
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
        // Clear invalid token state on failure
        setAuthToken(null);
        setToken(null);
        setUser(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  const signup = useCallback(async ({ fullName, email, password }) => {
    const username = email.split("@")[0] + "_" + Math.floor(Math.random() * 100000);
    const data = await registerUser({ username, email, fullName, password });
    
    setAuthToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const data = await loginUser({ email, password });
    
    // FIX: Ensure setAuthToken sets headers immediately on login
    setAuthToken(data.token);
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