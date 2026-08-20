import axios from "axios";

// Defaults to the Django backend (django-backend/), which now serves
// auth, incidents, route planning, analysis, and ML scoring all in one
// place. Override with VITE_API_URL if you're pointing this at the
// Node/Express backend instead.
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://saferoute-mbth.onrender.com/api",
});



const TOKEN_KEY = "saferoute_token";

export function setAuthToken(token) {
  if (token) {
    client.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    delete client.defaults.headers.common.Authorization;
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// BUG FIX: there was previously no reaction to a 401 anywhere in the app —
// an expired/invalid token (e.g. after the JWT lifetime bug, or simply
// logging out in another tab) meant every subsequent API call just failed
// silently or showed a raw error string, while the sidebar still showed
// the user as logged in. This clears the stale session and sends the
// person back to /login instead.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes("/auth/login")) {
      setAuthToken(null);
      if (window.location.pathname.startsWith("/app")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(err);
  }
);

export default client;
