import "server-only";
import { randomUUID } from "node:crypto";
import { Photon } from "@photon-ai/api";
import { normalizePhone } from "./phone";

// Same environment as photon/agent.ts. The agent replies inside existing chats; this starts a new one
// with the friend (create-or-get the two users, then their space) and sends one text.
type PhotonConfig = { key: string; project: string; platform: "imessage" | "email"; agent: string };

export function photonConfigured() {
  return Boolean(
    process.env.PHOTON_API_KEY && process.env.PHOTON_PROJECT_ID && process.env.PHOTON_PLATFORM && process.env.PHOTON_AGENT_HANDLE,
  );
}

function photonConfig(): PhotonConfig {
  const key = process.env.PHOTON_API_KEY;
  const project = process.env.PHOTON_PROJECT_ID;
  const platform = process.env.PHOTON_PLATFORM;
  const agent = process.env.PHOTON_AGENT_HANDLE;
  if (!key || !project || !platform || !agent) {
    throw new Error("Set PHOTON_API_KEY, PHOTON_PROJECT_ID, PHOTON_PLATFORM and PHOTON_AGENT_HANDLE to send texts.");
  }
  if (platform !== "imessage" && platform !== "email") throw new Error("PHOTON_PLATFORM must be imessage or email.");
  if (!/^pho_prj_[0-7][0-9a-hjkmnp-tv-z]{25}$/.test(project)) {
    throw new Error("PHOTON_PROJECT_ID must be the Project ID from the Photon dashboard (pho_prj_...).");
  }
  return { key, project, platform, agent };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A phone number (any common format) becomes E.164; an email is lowercased. Anything else is null. */
export function normalizeHandle(raw: string): string | null {
  const value = raw.trim();
  if (emailPattern.test(value)) return value.toLowerCase();
  return normalizePhone(value);
}

function userId(user: unknown): string {
  if (user && typeof user === "object" && "id" in user && typeof user.id === "string") return user.id;
  throw new Error("Photon did not return a user for that phone number or email.");
}

function spaceId(space: unknown): string {
  if (space && typeof space === "object" && "id" in space && typeof space.id === "string") return space.id;
  throw new Error("Photon could not open a conversation with that phone number or email.");
}

export async function sendText(handle: string, text: string, subject?: string) {
  const c = photonConfig();
  // PHOTON_BASE_URL is only for pointing tests at a local fake; leave it unset in production.
  const photon = new Photon({
    headers: { Authorization: `Bearer ${c.key}` },
    ...(process.env.PHOTON_BASE_URL ? { baseUrl: process.env.PHOTON_BASE_URL } : {}),
  });
  const path = { id: c.project };

  const [friend, agent] = await Promise.all([
    photon.projects.createOrGetUser({ path, body: { handle, platform: c.platform } }),
    photon.projects.createOrGetUser({ path, body: { handle: c.agent, platform: c.platform } }),
  ]);
  const friendId = userId(friend);
  const agentId = userId(agent);

  // iMessage treats the first participant as the creator, so the agent goes first.
  const space = await photon.projects.createOrGetSpace({
    path,
    headers: { "idempotency-key": `splits-pay:${agentId}:${friendId}` },
    body: { participantIds: [agentId, friendId], platform: c.platform },
  });

  return photon.projects.sendMessage({
    path,
    headers: { "idempotency-key": `splits-pay-link:${randomUUID()}` },
    body: {
      spaceId: spaceId(space),
      senderId: agentId,
      content: { type: "text", format: "plain", text },
      ...(c.platform === "email" && subject ? { email: { subject } } : {}),
    },
  });
}
