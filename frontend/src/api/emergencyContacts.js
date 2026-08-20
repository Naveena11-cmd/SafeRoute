import client from "./client.js";

export async function fetchEmergencyContacts() {
  const { data } = await client.get("/auth/emergency-contacts/");
  return data.contacts || [];
}

export async function saveEmergencyContacts(contacts) {
  const { data } = await client.put("/auth/emergency-contacts/", { contacts });
  return data.contacts || [];
}
