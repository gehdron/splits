"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";
import type {
  SplitAssistantResult,
  SplitInstructionMessage,
} from "@/app/split-types";
import "./list.css";

// TODO: lists have no group yet. This mirrors the dashboard's sample group until groups come from Supabase.
const GROUP_NAME = "Apartment 4B";
const OTHER_GROUPS = ["Lisbon trip"];
const ME = "You";

type Person = { id: string; name: string; detail: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isSplitAssistantResult(value: unknown): value is SplitAssistantResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "reply" in value &&
    typeof value.reply === "string" &&
    "clarification" in value &&
    typeof value.clarification === "string" &&
    "assignments" in value &&
    Array.isArray(value.assignments) &&
    value.assignments.every((assignment: unknown) =>
        typeof assignment === "object" &&
        assignment !== null &&
        "itemIndex" in assignment &&
        typeof assignment.itemIndex === "number" &&
        Number.isInteger(assignment.itemIndex) &&
        assignment.itemIndex >= 0 &&
        "people" in assignment &&
        Array.isArray(assignment.people) &&
        assignment.people.length === 1 &&
        assignment.people.every(
          (person: unknown) => typeof person === "string" && person.trim().length > 0
        )
    )
  );
}

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
          <b>{me}</b>
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
  const me = ME;
  const [friends, setFriends] = useState<Person[]>([]);
  const [added, setAdded] = useState<Person[]>([]);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [contactBy, setContactBy] = useState<"phone" | "email">("phone");
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const savingTitle = useRef(false);
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");
  const [scan, setScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [splitChatOpen, setSplitChatOpen] = useState(false);
  const [splitMessages, setSplitMessages] = useState<SplitInstructionMessage[]>([]);
  const [splitMessage, setSplitMessage] = useState("");
  const [splitParsing, setSplitParsing] = useState(false);
  const [splitError, setSplitError] = useState("");

  // On load: use ?id= from the URL, or create a new list and put its id in the URL
  useEffect(() => {
    (async () => {
      await Promise.resolve(); // keeps state updates out of the synchronous effect body
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

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: rows, error } = await supabase.rpc("list_friends");
        if (cancel || error || !rows) return;
        setFriends(
          (rows as { friend_id: string; display_name: string; phone: string }[]).map((friend) => ({
            id: friend.friend_id,
            name: friend.display_name,
            detail: friend.phone,
          })),
        );
      } catch {
        // Friends stay empty when Supabase is not signed in.
      }
    })();
    return () => {
      cancel = true;
    };
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

  function startRename() {
    if (!data) return;
    setTitle(data.list.name);
    setEditingTitle(true);
  }

  async function saveTitle(event?: React.FormEvent) {
    event?.preventDefault();
    if (savingTitle.current) return;
    savingTitle.current = true;
    const next = title.trim();
    setEditingTitle(false);
    if (!listId || !data || !next || next === data.list.name) {
      setTitle(data?.list.name ?? "");
      savingTitle.current = false;
      return;
    }
    const res = await fetch(`/api/lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    savingTitle.current = false;
    if (!res.ok) {
      setTitle(data.list.name);
      setMsg((await res.json()).error ?? "The list name could not be saved.");
      return;
    }
    setData({ ...data, list: { ...data.list, name: next } });
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

  const roster = [...friends, ...added];

  useEffect(() => {
    if (!openItem) return;
    function close(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".asg")) setOpenItem(null);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openItem]);

  function remember(person: Person) {
    setAdded((current) => (current.some((entry) => entry.id === person.id) || friends.some((entry) => entry.id === person.id) ? current : [...current, person]));
    setContact("");
    setMsg("");
  }

  function addContact(event: React.FormEvent, item: Item) {
    event.preventDefault();
    if (contactBy === "phone") {
      const phone = normalizePhone(contact);
      if (!phone) return setMsg("Enter a phone number, including the area code.");
      const person = { id: `phone:${phone}`, name: phone, detail: "Phone" };
      remember(person);
      void assignPerson(item, person.name);
      return;
    }
    const email = contact.trim();
    if (!emailPattern.test(email)) return setMsg("Enter a valid email.");
    const person = { id: `email:${email.toLowerCase()}`, name: email, detail: "Email" };
    remember(person);
    void assignPerson(item, person.name);
  }

  async function act(
    id: string,
    action: "claim" | "unclaim",
    user: string
  ): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ action, user }) });
    const payload: unknown = await res.json();
    const error =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "That item could not be updated.";
    setMsg(res.ok ? "" : error);
    refresh();
    return res.ok ? { success: true } : { success: false, error };
  }

  async function remove(id: string) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    refresh();
  }

  async function assignPerson(
    item: Item,
    user: string
  ): Promise<{ success: boolean; error?: string }> {
    setOpenItem(null);
    if (item.who === user) return { success: true };
    if (item.who) {
      const cleared = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "unclaim", user: item.who }),
      });
      if (!cleared.ok) {
        const payload: unknown = await cleared.json();
        const error =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "That item could not be reassigned.";
        setMsg(error);
        refresh();
        return { success: false, error };
      }
    }
    return act(item.id, "claim", user);
  }

  function clearPerson(item: Item) {
    if (!item.who) return;
    setOpenItem(null);
    return act(item.id, "unclaim", item.who);
  }

  async function sendSplitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = splitMessage.trim();
    if (!content || splitParsing || !data || !listId) return;

    const messages: SplitInstructionMessage[] = [
      ...splitMessages.slice(-19),
      { role: "user", content },
    ];
    setSplitParsing(true);
    setSplitError("");

    try {
      const items = list.items.map((item) => ({
        description: item.name,
        quantity: String(item.quantity),
        amount: (item.cents / 100).toFixed(2),
      }));
      const response = await fetch("/api/split-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "list",
          items,
          totals: {
            subtotal: (s.subtotal / 100).toFixed(2),
            tax: "0",
            tip: "0",
            total: (s.subtotal / 100).toFixed(2),
          },
          assignments: list.items.flatMap((item, itemIndex) =>
            item.who ? [{ itemIndex, people: [item.who] }] : []
          ),
          messages,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "The list assistant could not process that message.";
        throw new Error(message);
      }
      if (
        !isSplitAssistantResult(result) ||
        result.assignments.some(
          (assignment) => assignment.itemIndex >= list.items.length
        )
      ) {
        throw new Error("The list assistant returned invalid assignments.");
      }

      let changedCount = 0;
      for (const assignment of result.assignments) {
        const item = list.items[assignment.itemIndex];
        const assignee = assignment.people[0];
        if (!item || item.who === assignee) continue;
        const assignmentResult = await assignPerson(item, assignee);
        if (!assignmentResult.success) {
          throw new Error(
            `The assistant planned ${result.assignments.length} assignment(s), but only ${changedCount} were saved. ${assignmentResult.error ?? "Refresh the list and try again."}`
          );
        }
        changedCount += 1;
      }

      const reply =
        result.clarification ||
        (changedCount > 0
          ? `${result.reply} ✓ ${changedCount} ${changedCount === 1 ? "item is" : "items are"} assigned.`
          : result.reply);
      setSplitMessages([...messages, { role: "assistant", content: reply }]);
      setSplitMessage("");
      setAdded((current) => {
        const next = [...current];
        for (const assignment of result.assignments) {
          const assignedName = assignment.people[0];
          if (
            !friends.some(
              (friend) => friend.name.toLocaleLowerCase() === assignedName.toLocaleLowerCase()
            ) &&
            !next.some(
              (person) => person.name.toLocaleLowerCase() === assignedName.toLocaleLowerCase()
            )
          ) {
            next.push({
              id: `assistant:${assignedName.toLocaleLowerCase()}`,
              name: assignedName,
              detail: "Assigned by list chat",
            });
          }
        }
        return next;
      });
      await refresh();
    } catch (error) {
      console.error(error);
      setSplitMessages(messages);
      setSplitError(
        error instanceof Error
          ? error.message
          : "The list assistant could not process that message."
      );
    } finally {
      setSplitParsing(false);
    }
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
              {editingTitle ? (
                <form className="rename-form" onSubmit={saveTitle}>
                  <label className="sr" htmlFor="list-name">
                    List name
                  </label>
                  <input
                    id="list-name"
                    className="field title"
                    value={title}
                    autoFocus
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={() => saveTitle()}
                  />
                  <button className="btn txt" type="submit">
                    Save
                  </button>
                </form>
              ) : (
                <h1>
                  {data ? (
                    <button className="rename" type="button" onClick={startRename}>
                      {list.name}
                    </button>
                  ) : (
                    list.name
                  )}
                </h1>
              )}
              <div className="meta">
                <span>
                  {mine ? "You paid." : `${list.paidBy} paid.`} {plural(list.items.length, "item")}.
                </span>
              </div>
            </div>
            <div className="acts">
              {/* TODO: there is no delete-list API route yet. */}
              <button className="btn txt" type="button" onClick={startRename} disabled={!data || editingTitle}>
                Rename
              </button>
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
                  Assign each item to a friend, or to a phone number or email. {mine ? "They owe you for their items." : `You owe ${list.paidBy} for yours.`}
                </p>
              </div>
              <button
                className="btn line"
                type="button"
                aria-expanded={splitChatOpen}
                aria-controls="list-split-chat"
                disabled={!data || list.items.length === 0}
                onClick={() => setSplitChatOpen((open) => !open)}
              >
                {splitChatOpen ? "Close chat" : "Split with chat"}
              </button>
            </div>

            <section
              className="list-chat"
              id="list-split-chat"
              aria-label="Split items with chat"
              hidden={!splitChatOpen}
            >
              <div className="list-chat-messages" aria-live="polite" aria-relevant="additions text">
                {splitMessages.length === 0 ? (
                  <p className="list-chat-welcome">
                    Tell me who should get each item, for example, “Alex is bringing the plates and I’ll take the drinks.”
                  </p>
                ) : (
                  splitMessages.map((message, index) => (
                    <p
                      className={`list-chat-message ${message.role}`}
                      key={`${index}-${message.role}`}
                    >
                      {message.content}
                    </p>
                  ))
                )}
                {splitParsing ? <p className="list-chat-pending">Working on the assignments…</p> : null}
              </div>
              {splitError ? <p className="list-chat-error" role="alert">{splitError}</p> : null}
              <form className="list-chat-form" onSubmit={sendSplitMessage}>
                <label className="sr" htmlFor="list-split-message">Tell the assistant how to assign items</label>
                <textarea
                  id="list-split-message"
                  value={splitMessage}
                  maxLength={1000}
                  rows={2}
                  placeholder="Who should get each item?"
                  disabled={splitParsing}
                  onChange={(event) => setSplitMessage(event.target.value)}
                />
                <button className="btn" type="submit" disabled={splitParsing || !splitMessage.trim()}>
                  {splitParsing ? "Assigning…" : "Send"}
                </button>
              </form>
            </section>

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
                      className={`asg-btn${openItem === item.id ? " is-open" : ""}`}
                      type="button"
                      aria-expanded={openItem === item.id}
                      aria-haspopup="menu"
                      aria-label={item.who ? `${item.name}, assigned to ${item.who}. Change` : `Assign ${item.name}`}
                      onClick={() => setOpenItem(openItem === item.id ? null : item.id)}
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
                    {openItem === item.id ? (
                      <div className="menu" role="menu" aria-label={`Assign ${item.name}`}>
                        {roster.length > 0 ? <p className="menu-h">Friends and contacts</p> : null}
                        {roster.map((person) => (
                          <button key={person.id} className="opt" type="button" role="menuitem" onClick={() => assignPerson(item, person.name)}>
                            <Avatar name={person.name} me={me} />
                            <span className="on">
                              {person.name}
                              {person.detail && person.detail !== person.name ? <small>{person.detail}</small> : null}
                            </span>
                          </button>
                        ))}
                        {item.who ? (
                          <button className="opt un" type="button" role="menuitem" onClick={() => clearPerson(item)}>
                            Unassign
                          </button>
                        ) : null}
                        <form onSubmit={(event) => addContact(event, item)}>
                          <div className="seg" role="group" aria-label="Add a contact by">
                            <button className={`sg${contactBy === "phone" ? " on" : ""}`} type="button" aria-pressed={contactBy === "phone"} onClick={() => setContactBy("phone")}>
                              Phone
                            </button>
                            <button className={`sg${contactBy === "email" ? " on" : ""}`} type="button" aria-pressed={contactBy === "email"} onClick={() => setContactBy("email")}>
                              Email
                            </button>
                          </div>
                          <div className="inrow">
                            <label className="sr" htmlFor={`contact-${item.id}`}>
                              {contactBy === "phone" ? "Phone number" : "Email"}
                            </label>
                            <input
                              id={`contact-${item.id}`}
                              className="field"
                              type={contactBy === "phone" ? "tel" : "email"}
                              autoComplete={contactBy === "phone" ? "tel" : "email"}
                              placeholder={contactBy === "phone" ? "(555) 123-4567" : "name@example.com"}
                              value={contact}
                              onChange={(event) => setContact(event.target.value)}
                            />
                            <button className="btn" type="submit">
                              Add
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : null}
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
