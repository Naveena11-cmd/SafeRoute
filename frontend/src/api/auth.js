import client, { setAuthToken } from "./client.js";

export async function registerUser({ username, email, fullName, password }) {
  const { data } = await client.post("/auth/register/", {
    username, email, full_name: fullName, password,
  });
  return data; // { token, user }
}

export async function loginUser({ email, password }) {
  // Django SimpleJWT's token endpoint only returns { access, refresh } —
  // no user profile — so fetch /auth/me/ right after to get a consistent
  // { token, user } shape matching registerUser().
  const { data } = await client.post("/auth/login/", { email, password });
  setAuthToken(data.access);
  const user = await fetchMe();
  return { token: data.access, user };
}

export async function fetchMe() {
  const { data } = await client.get("/auth/me/");
  return data;
}

/** Your Details page — username is the only editable field. */
export async function updateUsername(username) {
  const { data } = await client.patch("/auth/me/", { username });
  return data;
}
