"use client";

import { useCallback, useEffect, useState } from "react";
import "./receipt.css";

type Item = {
  id: string;
  name: string;
  quantity: number;
  priceCents: number;
  claimedBy: string | null;
};
type ListData = { list: { id: string; name: string }; items: Item[]; totals: Record<string, number> };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Every person gets a consistent highlighter color based on their name
const TAG_COLORS = ["#ffd6a5", "#caffbf", "#a0c4ff", "#ffc6ff", "#fdffb6", "#9bf6ff", "#ffadad"];
const tagColor = (who: string) => {
  let h = 0;
  for (const c of who.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
};

function Tag({ who }: { who: string }) {
  return (
    <span className="rc-tag" style={{ background: tagColor(who) }}>
      {who}
    </span>
  );
}

export default function ListPage() {
  const [listId, setListId] = useState<string | null>(null);
  const [data, setData] = useState<ListData | null>(null);
  const [me, setMe] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");

  // On load: use ?id= from the URL, or create a new list and put its id in the URL
  useEffect(() => {
    (async () => {
      await Promise.resolve(); // keeps state updates out of the synchronous effect body
      setMe(localStorage.getItem("splits-name") ?? "");
      const id = new URLSearchParams(window.location.search).get("id");
      if (id) return setListId(id);
      const res = await fetch("/api/lists", { method: "POST", body: JSON.stringify({ name: "Shared list" }) });
      const list = await res.json();
      window.history.replaceState(null, "", `/list?id=${list.id}`);
      setListId(list.id);
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!listId) return;
    const res = await fetch(`/api/lists/${listId}`);
    if (res.status === 404) return setMsg("List not found (the server may have restarted). Open /list for a new one.");
    setData(await res.json());
  }, [listId]);

  // Poll every 3 seconds so everyone sees claims quickly
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch(`/api/lists/${listId}/items`, {
      method: "POST",
      body: JSON.stringify({ name, priceCents: Math.round(parseFloat(price || "0") * 100) }),
    });
    const { duplicates } = await res.json();
    setMsg(duplicates?.length ? `Heads up: "${duplicates[0]}" is already on the list.` : "");
    setName("");
    setPrice("");
    refresh();
  }

  async function act(id: string, action: "claim" | "unclaim") {
    if (!me.trim()) return setMsg("Enter your name first.");
    const res = await fetch(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ action, user: me }) });
    setMsg(res.ok ? "" : (await res.json()).error);
    refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    refresh();
  }

  // Receipt math (display only)
  const subtotal = data?.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0) ?? 0;
  const claimed = data ? Object.values(data.totals).reduce((a, b) => a + b, 0) : 0;
  const shortId = data ? data.list.id.slice(0, 4).toUpperCase() : "----";

  return (
    <div className="rc-page">
      <div className="rc-paper">
        {/* Header */}
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-[0.35em]">SPLITS</h1>
          <p className="mt-1 text-xs uppercase tracking-widest">Settle up without the stress</p>
          <p className="mt-3 text-xs opacity-60">
            {data ? data.list.name : "Opening a tab..."} · #{shortId}
          </p>
        </header>

        <hr className="rc-dash" />

        {/* Who are you */}
        <label className="block text-xs uppercase tracking-widest opacity-60" htmlFor="me">
          Name on this tab
        </label>
        <input
          id="me"
          className="rc-field"
          placeholder="your name"
          value={me}
          onChange={(e) => {
            setMe(e.target.value);
            localStorage.setItem("splits-name", e.target.value);
          }}
        />

        {msg && <p className="rc-note mt-4">{msg}</p>}

        <hr className="rc-dash" />

        {/* Items */}
        <div className="rc-row text-xs uppercase tracking-widest opacity-60">
          <span>Item</span>
          <span className="rc-leader" />
          <span>Price</span>
        </div>

        <ul className="mt-3 space-y-4">
          {data?.items.map((i) => (
            <li key={i.id}>
              <div className="rc-row">
                <span className="font-bold">
                  {i.name}
                  {i.quantity > 1 && <span className="font-normal opacity-60"> x{i.quantity}</span>}
                </span>
                <span className="rc-leader" />
                <span className="font-bold">{money(i.priceCents * i.quantity)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                {i.claimedBy ? <Tag who={i.claimedBy} /> : <span className="opacity-40">unclaimed</span>}
                <span className="flex-1" />
                {!i.claimedBy && (
                  <button className="rc-btn" onClick={() => act(i.id, "claim")}>
                    Claim
                  </button>
                )}
                {i.claimedBy && i.claimedBy === me && (
                  <button className="rc-btn" onClick={() => act(i.id, "unclaim")}>
                    Unclaim
                  </button>
                )}
                <button className="rc-x" onClick={() => remove(i.id)} aria-label={`Delete ${i.name}`}>
                  ✕
                </button>
              </div>
            </li>
          ))}
          {data && data.items.length === 0 && (
            <li className="py-4 text-center text-sm opacity-50">nothing ordered yet...</li>
          )}
        </ul>

        {/* Add an item */}
        <form onSubmit={addItem} className="mt-6 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs uppercase tracking-widest opacity-60" htmlFor="item">
              Add item
            </label>
            <input id="item" className="rc-field" placeholder="nachos" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="w-20">
            <label className="block text-xs uppercase tracking-widest opacity-60" htmlFor="price">
              Price
            </label>
            <input id="price" className="rc-field" placeholder="0.00" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <button className="rc-btn rc-btn-solid">Add</button>
        </form>

        <hr className="rc-dash" />

        {/* Totals */}
        <div className="rc-row">
          <span>Subtotal</span>
          <span className="rc-leader" />
          <span>{money(subtotal)}</span>
        </div>
        {data && subtotal - claimed > 0 && (
          <div className="rc-row mt-1 opacity-60">
            <span>Not claimed yet</span>
            <span className="rc-leader" />
            <span>{money(subtotal - claimed)}</span>
          </div>
        )}

        {data && Object.keys(data.totals).length > 0 && (
          <>
            <hr className="rc-dash" />
            <p className="text-xs uppercase tracking-widest opacity-60">Who owes what</p>
            <div className="mt-3 space-y-2">
              {Object.entries(data.totals).map(([who, cents]) => (
                <div key={who} className="rc-row">
                  <Tag who={who} />
                  <span className="rc-leader" />
                  <span className="text-lg font-bold">{money(cents)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <hr className="rc-dash" />

        {/* Footer */}
        <p className="text-center text-xs uppercase tracking-widest">Thank you! Come again</p>
        <div className="rc-barcode" aria-hidden="true" />
        <p className="text-center text-[10px] tracking-[0.3em] opacity-50">{shortId}-SPLITS-{shortId}</p>
        <p className="mt-4 text-center text-xs opacity-60">Share this page&apos;s URL so friends can join the same tab.</p>
      </div>
    </div>
  );
}