import { connection } from "next/server";
import { signedInUser } from "@/app/(site)/stripe/organizer";
import { createLinkToken, plaidConfigured } from "@/app/(site)/plaid/plaid";

function plaidRedirectUri(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const origin = forwardedHost ? `${forwardedProto || "https"}://${forwardedHost}` : url.origin;
  // 127.0.0.1 is a different allowlist entry from localhost.
  return `${origin.replace("://127.0.0.1", "://localhost")}/api/plaid/oauth`;
}

// Starts Plaid Link for the organizer's own bank. The redirect URI must be one saved in the Plaid
// dashboard: https://splits.select/api/plaid/oauth or http://localhost:3000/api/plaid/oauth.
export async function POST(request: Request) {
  await connection();
  if (!plaidConfigured()) return Response.json({ error: "Plaid isn’t set up here yet." }, { status: 503 });
  const user = await signedInUser();
  if (!user) return Response.json({ error: "Sign in to link a bank." }, { status: 401 });
  const redirectUri = plaidRedirectUri(request);
  try {
    const { link_token } = await createLinkToken(user.id, redirectUri);
    return Response.json({ linkToken: link_token });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : "Could not start Plaid.";
    const hint = /redirect URI/i.test(detail)
      ? ` These keys are Sandbox, so add this exact address on the Sandbox tab: ${redirectUri}`
      : "";
    return Response.json({ error: `${detail}${hint}` }, { status: 502 });
  }
}
