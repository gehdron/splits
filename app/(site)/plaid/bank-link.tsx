"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PlaidHandler = { open: () => void };
type PlaidLink = {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string, metadata: { accounts?: { id: string }[] }) => void;
    onExit: () => void;
  }) => PlaidHandler;
};

declare global {
  interface Window {
    Plaid?: PlaidLink;
  }
}

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function loadPlaid(): Promise<PlaidLink> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLAID_SCRIPT;
    script.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("Plaid didn’t load.")));
    script.onerror = () => reject(new Error("Plaid didn’t load. Check your connection."));
    document.head.appendChild(script);
  });
}

// The "Link your bank with Plaid" button on /account. It asks the server for a link token, opens Plaid's popup,
// and sends the result to /api/plaid/exchange. The server code is in link-token.ts and exchange.ts next to this file.
export function BankLink({ bank }: { bank: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function linkBank() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const data = (await res.json()) as { linkToken?: string; error?: string };
      if (!data.linkToken) throw new Error(data.error ?? "Couldn’t start Plaid.");
      // The OAuth return page (/api/plaid/oauth) resumes Link with this same token.
      try {
        localStorage.setItem("splits-plaid-link-token", data.linkToken);
      } catch {
        // Without storage, banks that use OAuth can't resume; the others still work.
      }
      const Plaid = await loadPlaid();
      Plaid.create({
        token: data.linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const accountId = metadata.accounts?.[0]?.id ?? "";
            const saved = await fetch("/api/plaid/exchange", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicToken, accountId }),
            });
            const result = (await saved.json()) as { ok?: boolean; attached?: boolean; note?: string | null; error?: string };
            setMessage(
              result.ok
                ? { ok: Boolean(result.attached), text: result.attached ? "Bank linked. Payouts go there." : (result.note ?? "Bank linked.") }
                : { ok: false, text: result.error ?? "Couldn’t link that bank." },
            );
            router.refresh();
          } catch {
            setMessage({ ok: false, text: "Couldn’t save that bank. Check your connection and try again." });
          } finally {
            setBusy(false);
          }
        },
        onExit: () => setBusy(false),
      }).open();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Couldn’t start Plaid." });
      setBusy(false);
    }
  }

  return (
    <div className="payouts-bank">
      <p className="note">Link your bank with Plaid. Recent charges come from that account, and Stripe can use it for payouts.</p>
      <button className="btn btn-b" type="button" onClick={() => void linkBank()} disabled={busy}>
        {busy ? "Opening Plaid…" : bank ? "Use a different bank" : "Link your bank with Plaid"}
      </button>
      {message ? <p className={message.ok ? "ok" : "err"}>{message.text}</p> : null}
    </div>
  );
}
