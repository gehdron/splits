"use client";

import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  quantity: number;
  priceCents: number;
  claimedBy: string | null;
};
type ListData = { list: { id: string; name: string }; items: Item[]; totals: Record<string, number> };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
      const existing = await fetch("/api/lists");
      const lists: { id: string }[] = await existing.json();
      if (lists[0]) {
        window.history.replaceState(null, "", `/list?id=${lists[0].id}`);
        return setListId(lists[0].id);
      }
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

  return (
    <main className="mx-auto max-w-xl p-6 font-sans">
      <h1 className="text-2xl font-semibold">{data?.list.name ?? "Loading..."}</h1>
      <p className="mt-1 text-sm text-zinc-500">Share this page&apos;s URL so others can join the same list.</p>

      <input
        className="mt-4 w-full rounded border p-2 dark:bg-zinc-900"
        placeholder="Your name"
        value={me}
        onChange={(e) => {
          setMe(e.target.value);
          localStorage.setItem("splits-name", e.target.value);
        }}
      />

      <form onSubmit={addItem} className="mt-4 flex gap-2">
        <input className="flex-1 rounded border p-2 dark:bg-zinc-900" placeholder="Item" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-24 rounded border p-2 dark:bg-zinc-900" placeholder="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="rounded bg-black px-4 text-white dark:bg-white dark:text-black">Add</button>
      </form>

      {msg && <p className="mt-3 rounded bg-amber-100 p-2 text-sm text-amber-900">{msg}</p>}

      <ul className="mt-4 divide-y">
        {data?.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-3">
            <div className="flex-1">
              <div className="font-medium">
                {i.name} {i.quantity > 1 && <span className="text-zinc-500">x{i.quantity}</span>}
              </div>
              <div className="text-sm text-zinc-500">
                {money(i.priceCents * i.quantity)}
                {i.claimedBy && <> · claimed by {i.claimedBy}</>}
              </div>
            </div>
            {!i.claimedBy && <button onClick={() => act(i.id, "claim")} className="rounded border px-3 py-1 text-sm">Claim</button>}
            {i.claimedBy && i.claimedBy === me && <button onClick={() => act(i.id, "unclaim")} className="rounded border px-3 py-1 text-sm">Unclaim</button>}
            <button onClick={() => remove(i.id)} className="text-sm text-zinc-400" aria-label="Delete">✕</button>
          </li>
        ))}
        {data && data.items.length === 0 && <li className="py-6 text-center text-zinc-500">No items yet. Add one above.</li>}
      </ul>

      {data && Object.keys(data.totals).length > 0 && (
        <section className="mt-6 rounded bg-zinc-100 p-4 dark:bg-zinc-900">
          <h2 className="font-semibold">Who owes what</h2>
          {Object.entries(data.totals).map(([who, cents]) => (
            <div key={who} className="flex justify-between text-sm">
              <span>{who}</span>
              <span>{money(cents)}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}