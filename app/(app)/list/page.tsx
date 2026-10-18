"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "./list.css";

// TODO: lists have no group yet. This mirrors the dashboard's sample group until groups come from Supabase.
const GROUP_NAME = "Apartment 4B";
const OTHER_GROUPS = ["Lisbon trip"];

type ApiItem = {
  id: string;
  name: string;
  quantity: number;
  priceCents: number;
  claimedBy: string | null;
};
type ListData = { list: { id: string; name: string }; items: ApiItem[]; totals: Record<string, number> };

type Item = { id: string; name: string; quantity: number; cents: number; who: string | null };
type SharedList = { name: string; paidBy: string; items: Item[] };

/* ---------------------------------------------------------------- helpers */

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const label = (name: string, me: string) => (name === me ? `${name.split(" ")[0]} (you)` : name);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "?").charAt(0);
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "").charAt(0) : "";
  return (first + last).toUpperCase();
}

function colorClass(name: string, me: string): string {
  if (name === me) return "p0";
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `p${1 + (h % 3)}`;
}

function Avatar({ name, me, large = false }: { name: string; me: string; large?: boolean }) {
  return (
    <span className={`av ${large ? "lgav " : ""}${colorClass(name, me)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** The payer is owed for every item assigned to someone else. */
function summarize(list: SharedList, me: string) {
  const subtotal = list.items.reduce((sum, i) => sum + i.cents, 0);
  const unassigned = list.items.filter((i) => !i.who).reduce((sum, i) => sum + i.cents, 0);
  const perPerson = new Map<string, Item[]>();
  for (const item of list.items) {
    if (!item.who) continue;
    perPerson.set(item.who, [...(perPerson.get(item.who) ?? []), item]);
  }
  const row = (name: string, items: Item[]) => ({
    name,
    what: items.map((i) => i.name).join(", "),
    cents: items.reduce((sum, i) => sum + i.cents, 0),
  });
  const owedToYou =
    list.paidBy === me ? [...perPerson].filter(([name]) => name !== me).map(([name, items]) => row(name, items)) : [];
  const mine = perPerson.get(me);
  const youOwe = list.paidBy !== me && mine ? [row(list.paidBy, mine)] : [];
  const owedCents = owedToYou.reduce((sum, r) => sum + r.cents, 0);
  const oweCents = youOwe.reduce((sum, r) => sum + r.cents, 0);
  return { subtotal, unassigned, owedToYou, youOwe, owedCents, oweCents };
}

/* ------------------------------------------------------------------ icons */

const Icon = ({ d }: { d: string }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />;
const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />;
const BackIcon = () => <Icon d="M15 6l-6 6 6 6" />;
const PersonIcon = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="9" r="3.5" />
    <path d="M5.5 19c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
  </svg>
);
const LogoMark = () => (
  <svg width="32" height="32" viewBox="3 3 60 60" aria-hidden="true">
    <g strokeWidth="6" strokeLinejoin="round">
      <polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" />
      <polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" />
    </g>
  </svg>
);

/* ---------------------------------------------------------------- sidebar */

// TODO: this page has no auth, groups or friends API. People are the names that have claimed items on this list.
// Create, Add, Remove, Add to group and Sign out have no action until the list page is wired to Supabase
// (see app/(site)/dashboard/actions.ts).
function Sidebar({ me, people }: { me: string; people: string[] }) {
  const [by, setBy] = useState<"phone" | "email">("phone");
  const groups = [
    { name: GROUP_NAME, count: people.length + (me ? 1 : 0), active: true },
    ...OTHER_GROUPS.map((name) => ({ name, count: null, active: false })),
  ];

  return (
    <aside className="side">
      <div className="brand">
        <LogoMark />
        <span>Splits</span>
      </div>

      <section aria-labelledby="g-h">
        <h2 className="sh" id="g-h">
          Your groups
        </h2>
        <ul className="groups">
          {groups.map((g) => (
            <li key={g.name}>
              <button className={`gbtn${g.active ? " on" : ""}`} type="button" aria-current={g.active ? "page" : undefined}>
                <span>{g.name}</span>
                <span className="cnt">{g.count ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
        <label className="lbl" htmlFor="ng">
          New group
        </label>
        <div className="inrow">
          <input id="ng" className="field" type="text" placeholder="Group name" />
          <button className="btn" type="button">
            Create
          </button>
        </div>
      </section>

      <section aria-labelledby="f-h">
        <h2 className="sh" id="f-h">
          People
        </h2>
        <ul className="friends">
          {people.map((name) => (
            <li key={name} className="fr">
              <Avatar name={name} me={me} />
              <div>
                <b>{name}</b>
                <small>In {GROUP_NAME}</small>
              </div>
              <button className="mini" type="button" disabled>
                Added
              </button>
              <button className="xb" type="button" aria-label={`Remove ${name}`}>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
        {people.length === 0 && <p className="sub note">People who claim items show up here.</p>}
        <p className="lbl">Add someone to {GROUP_NAME}</p>
        <div className="seg" role="group" aria-label="Add by">
          <button className={`sg${by === "phone" ? " on" : ""}`} type="button" aria-pressed={by === "phone"} onClick={() => setBy("phone")}>
            Phone
          </button>
          <button className={`sg${by === "email" ? " on" : ""}`} type="button" aria-pressed={by === "email"} onClick={() => setBy("email")}>
            Email
          </button>
        </div>
        <label className="lbl" htmlFor="ct">
          {by === "phone" ? "Phone number" : "Email address"}
        </label>
        <input
          id="ct"
          className="field"
          type={by === "phone" ? "tel" : "email"}
          placeholder={by === "phone" ? "(555) 123-4567" : "[friend's email address]"}
        />
        <button className="btn full" type="button">
          <PlusIcon />
          Add to group
        </button>
      </section>

      <div className="me">
        <span className="av lgav p0">{initials(me)}</span>
        <div>
          <b>{me || "Add your name"}</b>
        </div>
        <button className="btn txt" type="button">
          Sign out
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------- page */

type ReceiptRow = { description?: string; quantity?: string; amount?: string };

function receiptToItems(rows: ReceiptRow[]) {
  return rows.flatMap((row) => {
    const description = String(row.description ?? "").trim();
    const line = Math.round(Number(String(row.amount ?? "").replace(/[^0-9.]/g, "")) * 100);
    const parsedQty = Math.round(Number(row.quantity));
    const qty = Number.isInteger(parsedQty) && parsedQty >= 1 ? parsedQty : 1;
    if (!description || !Number.isInteger(line) || line < 0) return [];
    const exact = line % qty === 0;
    return [
      {
        name: exact || qty === 1 ? description : `${description} x${qty}`,
        quantity: exact ? qty : 1,
        priceCents: exact ? line / qty : line,
      },
    ];
  });
}

export default function ListPage() {
  const [listId, setListId] = useState<string | null>(null);
  const [data, setData] = useState<ListData | null>(null);
  const [me, setMe] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");
  const [scan, setScan] = useState(false);
  const [scanning, setScanning] = useState(false);

  // On load: use ?id= from the URL, or create a new list and put its id in the URL
  useEffect(() => {
    (async () => {
      await Promise.resolve(); // keeps state updates out of the synchronous effect body
      setMe(localStorage.getItem("splits-name") ?? "");
      const params = new URLSearchParams(window.location.search);
      const wantScan = params.get("scan") === "1";
      setScan(wantScan);
      const id = params.get("id");
      if (id) return setListId(id);
      const res = await fetch("/api/lists", { method: "POST", body: JSON.stringify({ name: "Shared list" }) });
      const list = await res.json();
      const next = wantScan ? `/list?id=${list.id}&scan=1` : `/list?id=${list.id}`;
      window.history.replaceState(null, "", next);
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

  async function scanReceipt(file: File) {
    if (!listId) return;
    setScanning(true);
    setMsg("");
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("That file could not be read."));
        reader.readAsDataURL(file);
      });
      const parsed = await fetch("/api/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const body = await parsed.json();
      if (!parsed.ok) {
        setMsg(typeof body.error === "string" ? body.error : "The receipt could not be read.");
        return;
      }
      const items = receiptToItems(Array.isArray(body.items) ? body.items : []);
      if (items.length === 0) {
        setMsg("The receipt has no items to add.");
        return;
      }
      const saved = await fetch(`/api/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (!saved.ok) {
        const failed = await saved.json().catch(() => null);
        setMsg(failed?.error ?? "Those items could not be added.");
        return;
      }
      setScan(false);
      window.history.replaceState(null, "", `/list?id=${listId}`);
      setMsg(`${items.length} ${items.length === 1 ? "item" : "items"} added from the receipt.`);
      refresh();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "The receipt could not be read.");
    } finally {
      setScanning(false);
    }
  }

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

  // The API only lets you claim an open item or unclaim your own; anyone else's item stays as it is.
  function toggleClaim(item: Item) {
    if (!item.who) return act(item.id, "claim");
    if (item.who === me) return act(item.id, "unclaim");
  }

  const list: SharedList = {
    name: data ? data.list.name : "Loading...",
    // TODO: lists have no payer field yet, so the person viewing the list is treated as the payer.
    paidBy: me,
    items: (data?.items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      cents: i.priceCents * i.quantity,
      who: i.claimedBy,
    })),
  };
  const people = [...new Set(list.items.map((i) => i.who).filter((who): who is string => !!who && who !== me))];

  const mine = list.paidBy === me;
  const s = summarize(list, me);
  const total = s.owedCents + s.oweCents;
  const headline = mine
    ? s.owedCents
      ? `You’re owed ${money(s.owedCents)} on this list`
      : "Nobody owes you on this list yet"
    : s.oweCents
      ? `You owe ${list.paidBy} ${money(s.oweCents)}`
      : "You owe nothing on this list";

  return (
    <div className="db">
      <Sidebar me={me} people={people} />

      <main className="main">
        <div className="wrap">
          <Link className="back" href="/dashboard">
            <BackIcon />
            {GROUP_NAME}
          </Link>

          <header className="top">
            <div>
              <h1>{list.name}</h1>
              <div className="meta">
                <span>
                  {mine ? "You paid." : `${list.paidBy} paid.`} {plural(list.items.length, "item")}.
                </span>
              </div>
              <label className="lbl" htmlFor="me">
                Your name
              </label>
              <input
                id="me"
                className="field"
                style={{ maxWidth: 280 }}
                placeholder="Your name"
                value={me}
                onChange={(e) => {
                  setMe(e.target.value);
                  localStorage.setItem("splits-name", e.target.value);
                }}
              />
            </div>
            <div className="acts">
              {/* TODO: there is no delete-list API route yet. */}
              <button className="btn txt" type="button">
                Delete list
              </button>
            </div>
          </header>

          <section className="sec" aria-labelledby="wo-h">
            <h2 id="wo-h" className="sh" style={{ fontSize: 14 }}>
              Who owes what
            </h2>
            <p className="bal">{headline}</p>
            <div role="img" aria-label={`Owed to you ${money(s.owedCents)}, you owe ${money(s.oweCents)}`}>
              <div className="bar">
                {s.owedCents > 0 && <i className="g" style={{ width: `${Math.round((s.owedCents / total) * 100)}%` }} />}
                {s.oweCents > 0 && <i className="v" style={{ width: `${Math.round((s.oweCents / total) * 100)}%` }} />}
              </div>
              <div className="legend">
                <span>
                  Owed to you<b>{money(s.owedCents)}</b>
                </span>
                <span>
                  You owe<b>{money(s.oweCents)}</b>
                </span>
              </div>
            </div>

            <div className="cols">
              <div>
                <div className="colh">
                  <span>Owed to you</span>
                  <span>{money(s.owedCents)}</span>
                </div>
                <ul className="plist">
                  {s.owedToYou.map((o) => (
                    <li key={o.name} className="pr">
                      <Avatar name={o.name} me={me} large />
                      <div>
                        <b>{o.name}</b>
                        <small>{o.what}</small>
                      </div>
                      <span className="pa">{money(o.cents)}</span>
                      {/* TODO: reminders (Photon + Grok copy) are not wired to this page yet. */}
                      <button className="btn line" type="button">
                        Remind
                      </button>
                    </li>
                  ))}
                </ul>
                {s.owedToYou.length === 0 && (
                  <p className="sub note">
                    {mine ? "Assign items to people and their totals show up here." : "Only the person who paid is owed on this list."}
                  </p>
                )}
              </div>

              <div>
                <div className="colh">
                  <span>You owe</span>
                  <span>{money(s.oweCents)}</span>
                </div>
                <ul className="plist">
                  {s.youOwe.map((o) => (
                    <li key={o.name} className="pr">
                      <Avatar name={o.name} me={me} large />
                      <div>
                        <b>{o.name}</b>
                        <small>{o.what}</small>
                      </div>
                      <span className="pa">{money(o.cents)}</span>
                      {/* TODO: no checkout route yet. Link to the hosted test checkout once it exists. */}
                      <button className="btn" type="button">
                        Pay
                      </button>
                    </li>
                  ))}
                </ul>
                {s.youOwe.length === 0 ? (
                  <p className="sub note">{mine ? "You paid for this list, so you owe nothing." : "Nothing is assigned to you yet."}</p>
                ) : (
                  <p className="sub note">Pay with Apple Pay or a card.</p>
                )}
              </div>
            </div>
          </section>

          <section className="sec" aria-labelledby="it-h">
            <div className="shead">
              <div>
                <h2 id="it-h">Items</h2>
                <p className="sub">
                  Assign each item to whoever has it. {mine ? "They owe you for their items." : `You owe ${list.paidBy} for yours.`}
                </p>
              </div>
            </div>

            {scan ? (
              <form className="scan">
                <label className="lbl" htmlFor="receipt">
                  Scan a receipt
                </label>
                <p className="sub">Upload a photo or PDF. The items are added to this list.</p>
                <input
                  id="receipt"
                  className="field"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={scanning || !listId}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void scanReceipt(file);
                  }}
                />
                {scanning ? <p className="sub">Reading the receipt…</p> : null}
              </form>
            ) : null}

            <div className="lt lh" aria-hidden="true">
              <span>Item</span>
              <span className="r">Price</span>
              <span>Assignee</span>
              <span />
            </div>
            <ul className="rows" style={{ borderTop: 0 }}>
              {list.items.map((item) => (
                <li key={item.id} className="lt li">
                  <span className="iname">
                    {item.name}
                    {item.quantity > 1 && <span className="qty"> x{item.quantity}</span>}
                    {!item.who && <small>Unassigned</small>}
                  </span>
                  <span className="r">{money(item.cents)}</span>
                  <div className="asg">
                    <button
                      className="asg-btn"
                      type="button"
                      aria-label={item.who ? `${item.name}, assigned to ${item.who}. Change` : `Assign ${item.name}`}
                      onClick={() => toggleClaim(item)}
                    >
                      {item.who ? (
                        <>
                          <Avatar name={item.who} me={me} />
                          <span className="asg-name">{label(item.who, me)}</span>
                        </>
                      ) : (
                        <>
                          <span className="ph-ic">
                            <PersonIcon />
                          </span>
                          <span className="asg-name muted">Assign</span>
                        </>
                      )}
                    </button>
                  </div>
                  <button className="xb" type="button" aria-label={`Delete ${item.name}`} onClick={() => remove(item.id)}>
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
            {data && list.items.length === 0 && <p className="empty">No items yet. Add one below.</p>}

            <div className="lfoot">
              <span>
                Subtotal <b>{money(s.subtotal)}</b>
              </span>
              <span>
                Not assigned yet <b>{money(s.unassigned)}</b>
              </span>
            </div>

            <form className="addrow" onSubmit={addItem}>
              <div>
                <label className="lbl" htmlFor="ni">
                  Add item
                </label>
                <input id="ni" className="field" type="text" placeholder="Dish soap" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="lbl" htmlFor="npr">
                  Price
                </label>
                <input
                  id="npr"
                  className="field"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <button className="btn" type="submit">
                <PlusIcon />
                Add
              </button>
            </form>
            {msg && (
              <p className="msg" role="status">
                {msg}
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
