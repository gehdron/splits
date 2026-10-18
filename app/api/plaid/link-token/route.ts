import { connection } from "next/server";
import { signedInUser } from "@/lib/organizer";
import { createLinkToken, plaidConfigured } from "@/lib/plaid";

// Starts Plaid Link for the organizer's own bank. The redirect URI must be one saved in the Plaid
// dashboard: https://splits.select/api/plaid/oauth or http://localhost:3000/api/plaid/oauth.
export async function POST(request: Request) {
  await connection();
  if (!plaidConfigured()) return Response.json({ error: "Plaid isn’t set up here yet." }, { status: 503 });
  const user = await signedInUser();
  if (!user) return Response.json({ error: "Sign in to link a bank." }, { status: 401 });
  try {
    const redirectUri = `${new URL(request.url).origin}/api/plaid/oauth`;
    const { link_token } = await createLinkToken(user.id, redirectUri);
    return Response.json({ linkToken: link_token });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not start Plaid." }, { status: 502 });
  }
}
