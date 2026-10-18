"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";
import { calculateListAmounts } from "@/lib/list-totals";
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
type PayLink = { id: string; personName: string; amountCents: number; status: "unpaid" | "sent" | "paid" | "void"; url: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function moneyToCents(value: string): number | undefined {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

type ApiItem = {
  id: string;
  name: string;
  quantity: number;
  priceCents: number;
  claimedBy: string | null;
};
type ListMember = { name: string; userId?: string };
type ListData = {
  list: {
    id: string;
    name: string;
    groupId?: string;
    merchant?: string;
    receiptSubtotalCents?: number;
    taxCents?: number;
    tipCents?: number;
    receiptTotalCents?: number;
    members?: ListMember[];
  };
  items: ApiItem[];
  totals: Record<string, number>;
};

type Item = { id: string; name: string; quantity: number; cents: number; who: string | null };
type SharedList = { name: string; paidBy: string; items: Item[] };

function getEditDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    for (let index = 0; index <= right.length; index += 1) {
      previous[index] = current[index];
    }
  }
  return previous[right.length];
}

function getAssignees(who: string | null | undefined): string[] {
  if (!who) return [];
  return who
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
        assignment.people.length >= 1 &&
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

/** The payer is owed for every item assigned to someone else. Shared items split evenly. */
function summarize(list: SharedList, me: string, taxCents = 0, tipCents = 0) {
  const totals = calculateListAmounts(
    list.items.map((item) => ({
      name: item.name,
      quantity: 1,
      priceCents: item.cents,
      claimedBy: item.who,
    })),
    taxCents,
    tipCents,
  );
  const perPersonTotal = new Map<string, { itemsDesc: string; totalCents: number }>();
  for (const entry of totals.people) {
    const extras: string[] = [];
    if (entry.taxCents > 0) extras.push(`tax ${money(entry.taxCents)}`);
    if (entry.tipCents > 0) extras.push(`tip ${money(entry.tipCents)}`);
    const itemsDesc =
      entry.items.map((i) => i.name).join(", ") +
      (extras.length ? ` (+${extras.join(", ")})` : "");
    perPersonTotal.set(entry.name, { itemsDesc, totalCents: entry.totalCents });
  }

  const row = (name: string, total: { itemsDesc: string; totalCents: number }) => ({
    name,
    what: total.itemsDesc,
    cents: total.totalCents,
  });

  const owedToYou =
    list.paidBy === me
      ? [...perPersonTotal.entries()]
          .filter(([name]) => name !== me)
          .map(([name, total]) => row(name, total))
      : [];
  const mine = perPersonTotal.get(me);
  const youOwe = list.paidBy !== me && mine ? [row(list.paidBy, mine)] : [];
  const owedCents = owedToYou.reduce((sum, r) => sum + r.cents, 0);
  const oweCents = youOwe.reduce((sum, r) => sum + r.cents, 0);
  return { subtotal: totals.subtotal, unassigned: totals.unassigned, owedToYou, youOwe, owedCents, oweCents };
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
function Sidebar({
  me,
  people,
  onAdd,
  allowContacts,
}: {
  me: string;
  people: string[];
  onAdd: (person: { name: string; phone?: string; email?: string }) => Promise<string>;
  allowContacts: boolean;
}) {
  const [by, setBy] = useState<"phone" | "email">("phone");
  const [contact, setContact] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  async function addPerson(event: React.FormEvent) {
    event.preventDefault();
    if (adding) return;
    if (by === "phone") {
      const phone = normalizePhone(contact);
      if (!phone) return setAddError("Enter a phone number, including the area code.");
      setAdding(true);
      const error = await onAdd({ name: phone, phone });
      setAdding(false);
      setAddError(error);
      if (!error) setContact("");
      return;
    }
    const email = contact.trim().toLowerCase();
    if (!emailPattern.test(email)) return setAddError("Enter a valid email.");
    setAdding(true);
    const error = await onAdd({ name: email, email });
    setAdding(false);
    setAddError(error);
    if (!error) setContact("");
  }
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
                <small>On this list</small>
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
        {people.length === 0 && (
          <p className="sub note">
            {allowContacts ? "People you add can see this list." : "Add group members from the dashboard before assigning items."}
          </p>
        )}
        {allowContacts ? <form onSubmit={addPerson}>
          <p className="lbl">Add someone to this list</p>
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
            value={contact}
            placeholder={by === "phone" ? "(555) 123-4567" : "[friend's email address]"}
            onChange={(event) => {
              setContact(event.target.value);
              setAddError("");
            }}
          />
          {addError ? <p className="sub note">{addError}</p> : null}
          <button className="btn full" type="submit" disabled={adding}>
            <PlusIcon />
            {adding ? "Adding…" : "Add to list"}
          </button>
        </form> : null}
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
  const router = useRouter();
  const [listId, setListId] = useState<string | null>(null);
  const [data, setData] = useState<ListData | null>(null);
  const [friends, setFriends] = useState<Person[]>([]);
  const [added, setAdded] = useState<Person[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const me =
    data?.list.members?.find((member) => member.userId === meId)?.name ?? ME;
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [contactBy, setContactBy] = useState<"phone" | "email">("phone");
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [suggestingNewTitle, setSuggestingNewTitle] = useState(false);
  const [startWithScan, setStartWithScan] = useState(false);
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
  const splitInputRef = useRef<HTMLTextAreaElement>(null);
  const [splitSuggestionsEnabled, setSplitSuggestionsEnabled] = useState(true);
  const [splitCursorPosition, setSplitCursorPosition] = useState(0);
  const [splitInputScrollTop, setSplitInputScrollTop] = useState(0);
  const [taxInput, setTaxInput] = useState("");
  const [tipInput, setTipInput] = useState("");
  const [savingTotals, setSavingTotals] = useState(false);
  const [suggestingName, setSuggestingName] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingList, setDeletingList] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // Pay links: one per person who owes. The amount is worked out on the server from this list.
  const [payLinks, setPayLinks] = useState<PayLink[]>([]);
  const [requestFor, setRequestFor] = useState<string | null>(null);
  const [requestHandle, setRequestHandle] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMsg, setRequestMsg] = useState("");

  // On load: use ?id= from the URL. New lists are only created after a name is supplied.
  useEffect(() => {
    (async () => {
      await Promise.resolve(); // keeps state updates out of the synchronous effect body
      const params = new URLSearchParams(window.location.search);
      const wantScan = params.get("scan") === "1";
      setStartWithScan(wantScan);
      setScan(wantScan);
      const id = params.get("id");
      if (id) setListId(id);
    })();
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!cancel) setMeId(userData.user?.id ?? null);
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
    const json: ListData = await res.json();
    setData(json);
    if (json.list.name === "Shared list") {
      setTitle((current) => current || json.list.name);
      setEditingTitle(true);
    }
    setTaxInput((prev) => (prev === "" && json.list?.taxCents !== undefined ? (json.list.taxCents / 100).toFixed(2) : prev));
    setTipInput((prev) => (prev === "" && json.list?.tipCents !== undefined ? (json.list.tipCents / 100).toFixed(2) : prev));
    const links = await fetch(`/api/shares?list=${listId}`).catch(() => null);
    if (links?.ok) setPayLinks(((await links.json()) as { shares: PayLink[] }).shares);
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
      const body: unknown = await parsed.json();
      if (!parsed.ok) {
        setMsg(
          typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
            ? body.error
            : "The receipt could not be read.",
        );
        return;
      }
      if (typeof body !== "object" || body === null || !("items" in body) || !Array.isArray(body.items)) {
        throw new Error("Gemini returned an invalid receipt.");
      }
      const receiptBody = body as {
        items: ReceiptRow[];
        merchant?: string;
        totals?: { subtotal?: string; tax?: string; tip?: string; total?: string };
      };
      const items = receiptToItems(receiptBody.items);
      if (items.length === 0) {
        setMsg("The receipt has no items to add.");
        return;
      }
      const parsedTotals: Record<string, number> = {};
      for (const field of ["subtotal", "tax", "tip", "total"] as const) {
        const value = receiptBody.totals?.[field]?.trim();
        if (!value) continue;
        const cents = moneyToCents(value);
        if (cents === undefined) {
          throw new Error(`Gemini returned an invalid ${field}. Check the receipt and try again.`);
        }
        parsedTotals[field] = cents;
      }
      const saved = await fetch(`/api/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (!saved.ok) {
        const failed: unknown = await saved.json().catch(() => null);
        setMsg(
          typeof failed === "object" && failed !== null && "error" in failed && typeof failed.error === "string"
            ? failed.error
            : "Those items could not be added.",
        );
        return;
      }

      if (parsedTotals.tax !== undefined) setTaxInput((parsedTotals.tax / 100).toFixed(2));
      if (parsedTotals.tip !== undefined) setTipInput((parsedTotals.tip / 100).toFixed(2));

      const merchant = receiptBody.merchant?.trim() ?? "";
      const needsName = !data?.list.name.trim() || data.list.name === "Shared list";
      let suggestedName = "";
      let suggestionWarning = "";
      if (needsName) {
        try {
          const nameResponse = await fetch("/api/suggest-list-name", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: items.map((i) => i.name),
              merchant: merchant || undefined,
            }),
          });
          const nameResult: unknown = await nameResponse.json().catch(() => null);
          if (
            !nameResponse.ok ||
            typeof nameResult !== "object" ||
            nameResult === null ||
            !("name" in nameResult) ||
            typeof nameResult.name !== "string" ||
            !nameResult.name.trim()
          ) {
            const reason =
              typeof nameResult === "object" && nameResult !== null && "error" in nameResult && typeof nameResult.error === "string"
                ? nameResult.error
                : "Gemini could not suggest a list name.";
            throw new Error(reason);
          }
          suggestedName = nameResult.name.trim();
        } catch (error) {
          suggestionWarning = error instanceof Error ? error.message : "Gemini could not suggest a list name.";
        }
      }

      const patchBody: Record<string, string | number> = {};
      if (suggestedName) patchBody.name = suggestedName;
      if (merchant) patchBody.merchant = merchant;
      if (parsedTotals.subtotal !== undefined) patchBody.receiptSubtotalCents = parsedTotals.subtotal;
      if (parsedTotals.tax !== undefined) patchBody.taxCents = parsedTotals.tax;
      if (parsedTotals.tip !== undefined) patchBody.tipCents = parsedTotals.tip;
      if (parsedTotals.total !== undefined) patchBody.receiptTotalCents = parsedTotals.total;
      if (Object.keys(patchBody).length > 0) {
        const patched = await fetch(`/api/lists/${listId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        if (!patched.ok) {
          const failed: unknown = await patched.json().catch(() => null);
          const reason =
            typeof failed === "object" && failed !== null && "error" in failed && typeof failed.error === "string"
              ? failed.error
              : "Receipt totals and name could not be saved.";
          setMsg(`Receipt items were added, but ${reason}`);
          refresh();
          return;
        }
        if (suggestedName) setTitle(suggestedName);
      }

      setScan(false);
      window.history.replaceState(null, "", `/list?id=${listId}`);
      setMsg(
        `${items.length} ${items.length === 1 ? "item" : "items"} added from receipt.${
          suggestedName ? ` Named "${suggestedName}".` : ""
        }${suggestionWarning ? ` ${suggestionWarning}` : ""}`,
      );
      refresh();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "The receipt could not be read.");
    } finally {
      setScanning(false);
    }
  }

  async function suggestListName() {
    if (!listId) return;
    setSuggestingName(true);
    setMsg("");
    try {
      const res = await fetch("/api/suggest-list-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: list.items.map((i) => i.name),
          currentName: list.name,
        }),
      });
      const result: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "Gemini could not suggest a list name.";
        throw new Error(message);
      }
      if (
        typeof result === "object" &&
        result !== null &&
        "name" in result &&
        typeof result.name === "string" &&
        result.name.trim()
      ) {
        const suggestedName = result.name.trim();
        setTitle(result.name);
        const saved = await fetch(`/api/lists/${listId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: suggestedName }),
        });
        if (!saved.ok) {
          const failed: unknown = await saved.json().catch(() => null);
          const message =
            typeof failed === "object" && failed !== null && "error" in failed && typeof failed.error === "string"
              ? failed.error
              : "The suggested list name could not be saved.";
          throw new Error(message);
        }
        if (data) {
          setData({ ...data, list: { ...data.list, name: suggestedName } });
        }
        setMsg(`List named "${suggestedName}".`);
      } else {
        throw new Error("Gemini returned an invalid list name.");
      }
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Could not suggest a list name.");
    } finally {
      setSuggestingName(false);
    }
  }

  async function saveTotals() {
    if (!listId || savingTotals) return;
    const taxCents = taxInput.trim() ? moneyToCents(taxInput) : 0;
    const tipCents = tipInput.trim() ? moneyToCents(tipInput) : 0;
    if (taxCents === undefined || tipCents === undefined) {
      setMsg("Enter tax and tip as non-negative amounts with up to two decimal places.");
      return;
    }
    setSavingTotals(true);
    try {
      const response = await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxCents, tipCents }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "Receipt totals could not be saved.";
        throw new Error(message);
      }
      setMsg("Tax and tip saved.");
      await refresh();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Receipt totals could not be saved.");
    } finally {
      setSavingTotals(false);
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
    if (!next) {
      setMsg("Every list needs a name.");
      setEditingTitle(true);
      savingTitle.current = false;
      return;
    }
    if (!listId || !data || next === data.list.name) {
      setTitle(data?.list.name ?? "");
      setEditingTitle(data?.list.name === "Shared list");
      savingTitle.current = false;
      return;
    }
    setEditingTitle(false);
    const res = await fetch(`/api/lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    savingTitle.current = false;
    if (!res.ok) {
      setTitle(data.list.name);
      setEditingTitle(data.list.name === "Shared list");
      const result: unknown = await res.json().catch(() => null);
      setMsg(
        typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "The list name could not be saved.",
      );
      return;
    }
    setData({ ...data, list: { ...data.list, name: next } });
  }

  async function removeList() {
    if (!listId || deletingList) return;
    setDeletingList(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/lists/${listId}`, { method: "DELETE" });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "The list could not be deleted. Please try again.";
        throw new Error(message);
      }
      router.push("/dashboard");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "The list could not be deleted.");
      setDeletingList(false);
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch(`/api/lists/${listId}/items`, {
      method: "POST",
      body: JSON.stringify({ name, priceCents: Math.round(parseFloat(price || "0") * 100) }),
    });
    const result: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const error =
        typeof result === "object" &&
        result !== null &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "That item could not be added.";
      setMsg(error);
      return;
    }
    const duplicates =
      typeof result === "object" &&
      result !== null &&
      "duplicates" in result &&
      Array.isArray(result.duplicates)
        ? result.duplicates.filter(
            (duplicate): duplicate is string => typeof duplicate === "string",
          )
        : [];
    setMsg(duplicates.length ? `Heads up: "${duplicates[0]}" is already on the list.` : "");
    setName("");
    setPrice("");
    refresh();
  }

  const roster = data?.list.groupId
    ? (data.list.members ?? []).map((member) => ({
        id: member.userId
          ? `group-member:${member.userId}`
          : `group-member:${member.name.toLocaleLowerCase()}`,
        name: member.name,
        detail: "",
      }))
    : [...friends, ...added];

  useEffect(() => {
    if (!openItem) return;
    function close(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".asg")) setOpenItem(null);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openItem]);

  function contactOf(person: Person): { name: string; phone?: string; email?: string } | null {
    if (person.id.startsWith("phone:")) return { name: person.name, phone: person.id.slice("phone:".length) };
    if (person.id.startsWith("email:")) return { name: person.name, email: person.id.slice("email:".length) };
    const phone = normalizePhone(person.detail);
    if (phone) return { name: person.name, phone };
    if (emailPattern.test(person.detail)) return { name: person.name, email: person.detail.trim().toLowerCase() };
    return null;
  }

  async function addPerson(person: { name: string; phone?: string; email?: string }) {
    if (!listId) return "Open a list first.";
    if (data?.list.groupId) return "Add group members from the dashboard before assigning them.";
    const res = await fetch(`/api/lists/${listId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(person),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return body?.error || "That person could not be added.";
    }
    refresh();
    return "";
  }

  function remember(person: Person) {
    setAdded((current) => (current.some((entry) => entry.id === person.id) || friends.some((entry) => entry.id === person.id) ? current : [...current, person]));
    setContact("");
    setMsg("");
  }

  async function addContact(event: React.FormEvent, item: Item) {
    event.preventDefault();
    if (contactBy === "phone") {
      const phone = normalizePhone(contact);
      if (!phone) return setMsg("Enter a phone number, including the area code.");
      const person = { id: `phone:${phone}`, name: phone, detail: "Phone" };
      const error = await addPerson({ name: phone, phone });
      if (error) return setMsg(error);
      remember(person);
      const result = await togglePerson(item, person.name);
      if (!result.success) setMsg(result.error ?? "That person could not be assigned.");
      return;
    }
    const email = contact.trim();
    if (!emailPattern.test(email)) return setMsg("Enter a valid email.");
    const person = { id: `email:${email.toLowerCase()}`, name: email, detail: "Email" };
    const error = await addPerson({ name: email, email });
    if (error) return setMsg(error);
    remember(person);
    const result = await togglePerson(item, person.name);
    if (!result.success) setMsg(result.error ?? "That person could not be assigned.");
  }

  // What this person has paid on the list, what's left, and their open link (if it's for what's left).
  function payStatus(person: string, cents: number) {
    const mine = payLinks.filter((link) => link.personName === person && link.status !== "void");
    const paid = mine.filter((link) => link.status === "paid").reduce((sum, link) => sum + link.amountCents, 0);
    const due = cents - paid;
    const open = mine.filter((link) => link.status !== "paid" && link.amountCents === due).at(-1) ?? null;
    return { paid, due, open };
  }

  function openRequest(person: string) {
    if (requestFor === person) return setRequestFor(null);
    // People added by phone or email are named by it; saved friends carry their phone.
    const known = [...friends, ...added].find((entry) => entry.name === person);
    const looksLikeHandle = emailPattern.test(person) || normalizePhone(person) !== null;
    setRequestHandle(looksLikeHandle ? person : known && normalizePhone(known.detail) ? known.detail : "");
    setRequestMsg("");
    setRequestFor(person);
  }

  async function requestPay(person: string, send: boolean) {
    if (!listId) return;
    setRequestBusy(true);
    setRequestMsg("");
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId, personName: person, handle: requestHandle, send }),
      });
      const result = (await res.json()) as { share?: PayLink; sent?: boolean; error?: string; note?: string };
      if (result.share) setPayLinks((links) => [...links.filter((link) => link.id !== result.share?.id), result.share as PayLink]);
      if (result.error) return setRequestMsg(result.error);
      if (result.note) return setRequestMsg(result.note);
      if (result.sent) {
        setRequestMsg(`Sent. ${person} got a link to pay ${money(result.share?.amountCents ?? 0)}.`);
      } else if (result.share) {
        // Phones often block the clipboard after a network wait, so only say "copied" when it worked.
        const copied = await navigator.clipboard
          .writeText(result.share.url)
          .then(() => true)
          .catch(() => false);
        setRequestMsg(copied ? `Link copied: ${result.share.url}` : `Here’s the link to send: ${result.share.url}`);
      }
    } catch {
      setRequestMsg("Couldn’t reach Splits. Check your connection and try again.");
    } finally {
      setRequestBusy(false);
    }
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

  async function togglePerson(
    item: Item,
    assignee: Person | string
  ): Promise<{ success: boolean; error?: string }> {
    if (typeof assignee !== "string") {
      const contact = contactOf(assignee);
      if (contact) {
        const error = await addPerson(contact);
        if (error) return { success: false, error };
      }
    }
    const user = typeof assignee === "string" ? assignee : assignee.name;
    const assignees = getAssignees(item.who);
    const isAssigned = assignees.some(
      (name) => name.toLowerCase() === user.toLowerCase()
    );
    return act(item.id, isAssigned ? "unclaim" : "claim", user);
  }

  async function clearAllPeople(item: Item) {
    setOpenItem(null);
    const assignees = getAssignees(item.who);
    for (const person of assignees) {
      const result = await act(item.id, "unclaim", person);
      if (!result.success) {
        setMsg(result.error ?? `Could not remove ${person} from ${item.name}.`);
        return;
      }
    }
  }

  async function sendSplitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = splitMessage.trim();
    if (!content || splitParsing || !data || !listId) return;
    if (
      (taxInput.trim() && moneyToCents(taxInput) === undefined) ||
      (tipInput.trim() && moneyToCents(tipInput) === undefined)
    ) {
      setSplitError("Enter valid tax and tip amounts before asking the assistant to split the list.");
      return;
    }

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
      const participants = data.list.groupId
        ? (data.list.members ?? []).map((member) => member.name)
        : [
            me,
            ...(data.list.members ?? []).map((member) => member.name),
            ...friends.map((friend) => friend.name),
            ...added.map((person) => person.name),
            ...list.items.flatMap((item) => getAssignees(item.who)),
          ];
      const allowedPeople = new Set(participants.map((person) => person.toLocaleLowerCase()));
      const response = await fetch("/api/split-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "list",
          currentUser: me,
          participants: [...new Set(participants)],
          items,
          totals: {
            subtotal: (s.subtotal / 100).toFixed(2),
            tax: (parsedTaxCents / 100).toFixed(2),
            tip: (parsedTipCents / 100).toFixed(2),
            total: (finalTotalCents / 100).toFixed(2),
          },
          assignments: list.items.flatMap((item, itemIndex) => {
            const assignees = getAssignees(item.who);
            return assignees.length > 0 ? [{ itemIndex, people: assignees }] : [];
          }),
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
        ) ||
        new Set(result.assignments.map((assignment) => assignment.itemIndex)).size !== result.assignments.length ||
        result.assignments.some((assignment) =>
          assignment.people.some((person) => !allowedPeople.has(person.trim().toLocaleLowerCase()))
        )
      ) {
        throw new Error("The list assistant returned invalid assignments.");
      }

      let changedCount = 0;
      for (const assignment of result.assignments) {
        const item = list.items[assignment.itemIndex];
        if (!item) continue;
        const targetPeople = assignment.people;
        const currentPeople = getAssignees(item.who);

        for (const p of currentPeople) {
          if (!targetPeople.some((t) => t.toLowerCase() === p.toLowerCase())) {
            const update = await act(item.id, "unclaim", p);
            if (!update.success) throw new Error(update.error ?? `Could not unassign ${p} from ${item.name}.`);
          }
        }
        for (const p of targetPeople) {
          if (!currentPeople.some((c) => c.toLowerCase() === p.toLowerCase())) {
            const update = await act(item.id, "claim", p);
            if (!update.success) throw new Error(update.error ?? `Could not assign ${item.name} to ${p}.`);
          }
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
          for (const assignedName of assignment.people) {
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
    paidBy: me,
    items: (data?.items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      cents: i.priceCents * i.quantity,
      who: i.claimedBy,
    })),
  };
  const people = [
    ...new Set([
      ...(data?.list.members ?? []).filter((member) => member.userId !== meId).map((member) => member.name),
      ...list.items.flatMap((i) => getAssignees(i.who)).filter((who): who is string => !!who && who !== me),
    ]),
  ];

  const parsedTaxCents = taxInput.trim() ? moneyToCents(taxInput) ?? 0 : 0;
  const parsedTipCents = tipInput.trim() ? moneyToCents(tipInput) ?? 0 : 0;
  const totalsInputInvalid =
    (taxInput.trim() && moneyToCents(taxInput) === undefined) ||
    (tipInput.trim() && moneyToCents(tipInput) === undefined);
  const mine = list.paidBy === me;
  const s = summarize(list, me, parsedTaxCents, parsedTipCents);
  const finalTotalCents = s.subtotal + parsedTaxCents + parsedTipCents;
  const receiptSubtotalMismatch =
    !totalsInputInvalid &&
    data?.list.receiptSubtotalCents !== undefined &&
    data.list.receiptSubtotalCents !== s.subtotal;
  const receiptTotalMismatch =
    !totalsInputInvalid &&
    data?.list.receiptTotalCents !== undefined &&
    data.list.receiptTotalCents !== finalTotalCents;
  const total = s.owedCents + s.oweCents;
  const headline = mine
    ? s.owedCents
      ? `You’re owed ${money(s.owedCents)} on this list`
      : "Nobody owes you on this list yet"
    : s.oweCents
      ? `You owe ${list.paidBy} ${money(s.oweCents)}`
      : "You owe nothing on this list";

  const splitSafeCursor = Math.min(splitCursorPosition, splitMessage.length);
  const splitTextBeforeCursor = splitMessage.slice(0, splitSafeCursor);
  const splitTextAfterCursor = splitMessage.slice(splitSafeCursor);
  const splitTokenBeforeCursor =
    splitTextBeforeCursor.match(/[^\s;,\n]+$/)?.[0] ?? "";
  const splitTokenAfterCursor =
    splitTextAfterCursor.match(/^[^\s;,\n]*/)?.[0] ?? "";
  const splitTokenStart = splitSafeCursor - splitTokenBeforeCursor.length;
  const splitTokenEnd = splitSafeCursor + splitTokenAfterCursor.length;
  const splitSuggestionQuery = (
    splitTokenBeforeCursor + splitTokenAfterCursor
  ).toLocaleLowerCase();

  const splitSuggestions =
    splitSuggestionsEnabled && splitSuggestionQuery.length >= 2
      ? list.items
          .map((item) => item.name.trim())
          .filter(Boolean)
          .map((description) => {
            const words = description
              .toLocaleLowerCase()
              .split(/[^\p{L}\p{N}]+/u)
              .filter(Boolean);
            const scores = words.flatMap((word) => {
              if (word === splitSuggestionQuery) return [];
              if (word.startsWith(splitSuggestionQuery)) {
                return [0.1 + (word.length - splitSuggestionQuery.length) / 100];
              }
              const distance = getEditDistance(splitSuggestionQuery, word);
              const maxDistance = splitSuggestionQuery.length <= 4 ? 1 : 2;
              return distance <= maxDistance
                ? [1 + distance + Math.abs(word.length - splitSuggestionQuery.length) / 100]
                : [];
            });
            const matchedWord = words
              .filter((word) => word !== splitSuggestionQuery)
              .find(
                (word) =>
                  word.startsWith(splitSuggestionQuery) ||
                  getEditDistance(splitSuggestionQuery, word) <=
                    (splitSuggestionQuery.length <= 4 ? 1 : 2),
              );
            return {
              description,
              score: Math.min(...scores),
              matchedWord,
              matchedWordStart: matchedWord
                ? description
                    .toLocaleLowerCase()
                    .indexOf(matchedWord.toLocaleLowerCase())
                : -1,
            };
          })
          .filter((suggestion) => Number.isFinite(suggestion.score))
          .sort((left, right) => left.score - right.score)
          .filter(
            (suggestion, index, all) =>
              all.findIndex(
                (candidate) =>
                  candidate.description.toLocaleLowerCase() ===
                  suggestion.description.toLocaleLowerCase(),
              ) === index,
          )
      : [];
  const splitItemSuggestions = splitSuggestions
    .slice(0, 5)
    .map((suggestion) => suggestion.description);
  const splitInlineSuggestion = splitSuggestions[0] ?? null;

  async function suggestNewListName() {
    setSuggestingNewTitle(true);
    setMsg("");
    try {
      const response = await fetch("/api/suggest-list-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentName: newListTitle.trim() || undefined }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "Gemini could not suggest a list name.";
        throw new Error(message);
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("name" in result) ||
        typeof result.name !== "string" ||
        !result.name.trim()
      ) {
        throw new Error("Gemini returned an invalid list name.");
      }
      setNewListTitle(result.name.trim());
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Gemini could not suggest a list name.");
    } finally {
      setSuggestingNewTitle(false);
    }
  }

  async function createNamedList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedName = newListTitle.trim();
    if (!requestedName || creatingList) {
      if (!requestedName) setMsg("Enter a name for this list.");
      return;
    }
    setCreatingList(true);
    setMsg("");
    try {
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: requestedName }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "The list could not be created.";
        throw new Error(message);
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("id" in result) ||
        typeof result.id !== "string" ||
        !result.id
      ) {
        throw new Error("The server did not return the new list.");
      }
      const nextUrl = startWithScan
        ? `/list?id=${encodeURIComponent(result.id)}&scan=1`
        : `/list?id=${encodeURIComponent(result.id)}`;
      window.history.replaceState(null, "", nextUrl);
      setScan(startWithScan);
      setListId(result.id);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "The list could not be created.");
    } finally {
      setCreatingList(false);
    }
  }

  function selectSplitItemSuggestion(description: string) {
    const suffix = splitMessage.slice(splitTokenEnd);
    const needsSpace = suffix.length === 0 && !/[;,\s]$/.test(description);
    const updatedMessage =
      splitMessage.slice(0, splitTokenStart) +
      description +
      (needsSpace ? " " : "") +
      suffix;
    const nextCursor =
      splitTokenStart + description.length + (needsSpace ? 1 : 0);

    setSplitMessage(updatedMessage);
    setSplitCursorPosition(nextCursor);
    requestAnimationFrame(() => {
      splitInputRef.current?.focus();
      splitInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleSplitInputKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key === "Tab" && splitInlineSuggestion) {
      event.preventDefault();
      selectSplitItemSuggestion(splitInlineSuggestion.description);
    }
  }

  if (!listId) {
    return (
      <div className="db">
        <main className="main">
          <div className="wrap">
            <section className="sec list-start" aria-labelledby="new-list-heading">
              <h1 id="new-list-heading">Name your list</h1>
              <p className="sub">
                Every shared list needs a name. You can change it at any time.
              </p>
              <form className="list-start-form" onSubmit={createNamedList}>
                <label className="lbl" htmlFor="new-list-title">List name</label>
                <div className="inrow">
                  <input
                    id="new-list-title"
                    className="field"
                    value={newListTitle}
                    maxLength={80}
                    placeholder="Friday night dinner"
                    required
                    onChange={(event) => setNewListTitle(event.target.value)}
                  />
                  <button
                    className="btn line"
                    type="button"
                    disabled={suggestingNewTitle || creatingList}
                    onClick={() => void suggestNewListName()}
                  >
                    {suggestingNewTitle ? "Suggesting…" : "AI suggest"}
                  </button>
                </div>
                {msg ? <p className="msg" role="alert">{msg}</p> : null}
                <button
                  className="btn lg"
                  type="submit"
                  disabled={creatingList || !newListTitle.trim()}
                >
                  {creatingList ? "Creating…" : startWithScan ? "Create list and scan receipt" : "Create list"}
                </button>
              </form>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="db">
      <Sidebar me={me} people={people} onAdd={addPerson} allowContacts={!data?.list.groupId} />

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
                    maxLength={80}
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
              <button
                className="btn txt"
                type="button"
                onClick={() => void suggestListName()}
                disabled={!data || suggestingName}
              >
                {suggestingName ? "Suggesting…" : "AI suggest name"}
              </button>
              <button className="btn txt" type="button" onClick={startRename} disabled={!data || editingTitle}>
                Rename
              </button>
              <button
                className="btn txt"
                type="button"
                onClick={() => {
                  setConfirmingDelete((value) => !value);
                  setDeleteError("");
                }}
                disabled={!data || deletingList}
              >
                Delete list
              </button>
            </div>
          </header>
          {confirmingDelete ? (
            <div className="delete-confirm" role="group" aria-label="Confirm list deletion">
              <p>This permanently deletes the list and expires its unpaid payment links.</p>
              <button className="btn txt" type="button" onClick={() => setConfirmingDelete(false)} disabled={deletingList}>
                Keep list
              </button>
              <button className="btn txt delete-action" type="button" onClick={() => void removeList()} disabled={deletingList}>
                {deletingList ? "Deleting…" : "Delete permanently"}
              </button>
              {deleteError ? <p className="msg" role="alert">{deleteError}</p> : null}
            </div>
          ) : null}

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
                  {s.owedToYou.map((o) => {
                    const pay = payStatus(o.name, o.cents);
                    const link = pay.open;
                    const settled = pay.due <= 0 && pay.paid > 0;
                    const open = requestFor === o.name;
                    return (
                      <li key={o.name} className="pr">
                        <Avatar name={o.name} me={me} large />
                        <div>
                          <b>{o.name}</b>
                          <small>{o.what}</small>
                          {settled ? (
                            <span className="pill pg">Paid</span>
                          ) : link ? (
                            <span className={`pill ${link.status === "sent" ? "pv" : "pn"}`}>{link.status === "sent" ? "Link sent" : "Link ready"}</span>
                          ) : null}
                          {pay.paid > 0 && !settled ? <span className="pill pg">Paid {money(pay.paid)} so far</span> : null}
                        </div>
                        <span className="pa">{money(o.cents)}</span>
                        {settled ? (
                          <span />
                        ) : (
                          <button className="btn line" type="button" aria-expanded={open} onClick={() => openRequest(o.name)}>
                            {link?.status === "sent" ? "Share again" : "Share link"}
                          </button>
                        )}
                        {open ? (
                          <form
                            className="req"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void requestPay(o.name, true);
                            }}
                          >
                            <label className="lbl" htmlFor={`req-${o.name}`}>
                              Text or email {o.name} a link to pay {money(pay.due)}
                            </label>
                            <div className="inrow">
                              <input
                                id={`req-${o.name}`}
                                className="field"
                                value={requestHandle}
                                onChange={(event) => setRequestHandle(event.target.value)}
                                placeholder="(555) 123-4567 or name@email.com"
                                autoComplete="off"
                              />
                              <button className="btn" type="submit" disabled={requestBusy || !requestHandle.trim()}>
                                {requestBusy ? "Sharing…" : "Share link"}
                              </button>
                            </div>
                            <button className="btn txt" type="button" disabled={requestBusy} onClick={() => void requestPay(o.name, false)}>
                              Copy link instead
                            </button>
                            {requestMsg ? (
                              <p className="msg" role="status">
                                {requestMsg}
                              </p>
                            ) : null}
                          </form>
                        ) : null}
                      </li>
                    );
                  })}
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
                  {data?.list.groupId
                    ? "Choose one or more group members for each item."
                    : "Assign each item to a friend, phone number or email."}{" "}
                  {mine ? "They owe you for their items." : `You owe ${list.paidBy} for yours.`}
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
                      className={`asg-btn${item.who ? " assigned" : ""}${openItem === item.id ? " is-open" : ""}`}
                      type="button"
                      aria-expanded={openItem === item.id}
                      aria-haspopup="menu"
                      aria-label={
                        item.who
                          ? `${item.name}, assigned to ${getAssignees(item.who).join(", ")}. Change assignees`
                          : `Assign ${item.name}`
                      }
                      onClick={() => setOpenItem(openItem === item.id ? null : item.id)}
                    >
                      {getAssignees(item.who).length > 0 ? (
                        <>
                          <span className="stack">
                            {getAssignees(item.who).map((person) => (
                              <Avatar key={person} name={person} me={me} />
                            ))}
                          </span>
                          <span className="asg-name">
                            {getAssignees(item.who).map((person) => label(person, me)).join(", ")}
                          </span>
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
                        {roster.length > 0 ? (
                          <p className="menu-h">{data?.list.groupId ? "Group members" : "Friends and contacts"}</p>
                        ) : null}
                        {roster.map((person) => {
                          const selected = getAssignees(item.who).some(
                            (name) => name.toLocaleLowerCase() === person.name.toLocaleLowerCase(),
                          );
                          return (
                          <button
                            key={person.id}
                            className={`opt${selected ? " selected" : ""}`}
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={selected}
                            onClick={async () => {
                              const result = await togglePerson(item, person);
                              if (!result.success) setMsg(result.error ?? "That person could not be assigned.");
                              else setMsg("");
                            }}
                          >
                            <Avatar name={person.name} me={me} />
                            <span className="on">
                              {person.name}
                              {person.detail && person.detail !== person.name ? <small>{person.detail}</small> : null}
                            </span>
                            {selected ? <span className="chk" aria-hidden="true">✓</span> : null}
                          </button>
                          );
                        })}
                        {getAssignees(item.who).length > 0 ? (
                          <button className="opt un" type="button" role="menuitem" onClick={() => void clearAllPeople(item)}>
                            Clear all assignees
                          </button>
                        ) : null}
                        {!data?.list.groupId ? <form onSubmit={async (event) => addContact(event, item)}>
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
                        </form> : null}
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

            <div className="list-totals-box" aria-label="List totals">
              <div className="list-total-row">
                <span>Subtotal</span>
                <b>{money(s.subtotal)}</b>
              </div>
              <div className="list-total-row">
                <label htmlFor="list-tax">Tax</label>
                <span className="money-input-wrap">
                  <span aria-hidden="true">$</span>
                  <input
                    id="list-tax"
                    className="field"
                    type="text"
                    inputMode="decimal"
                    value={taxInput}
                    aria-label="Tax amount"
                    onChange={(event) => setTaxInput(event.target.value)}
                  />
                </span>
              </div>
              <div className="list-total-row">
                <label htmlFor="list-tip">Tip</label>
                <span className="money-input-wrap">
                  <span aria-hidden="true">$</span>
                  <input
                    id="list-tip"
                    className="field"
                    type="text"
                    inputMode="decimal"
                    value={tipInput}
                    aria-label="Tip amount"
                    onChange={(event) => setTipInput(event.target.value)}
                  />
                </span>
              </div>
              <div className="list-total-row grand">
                <span>Total</span>
                <b>{totalsInputInvalid ? "—" : money(finalTotalCents)}</b>
              </div>
              <div className="list-total-row unassigned">
                <span>Not assigned yet</span>
                <b>{money(s.unassigned)}</b>
              </div>
              <button
                className="btn line"
                type="button"
                disabled={savingTotals || !data}
                onClick={() => void saveTotals()}
              >
                {savingTotals ? "Saving…" : "Save tax and tip"}
              </button>
            </div>
            {totalsInputInvalid || receiptSubtotalMismatch || receiptTotalMismatch ? (
              <p className="list-receipt-warning" role={totalsInputInvalid ? "alert" : "status"}>
                {totalsInputInvalid
                  ? "Enter tax and tip as non-negative amounts with up to two decimal places."
                  : "Receipt mismatch: the item subtotal or calculated total differs from the scanned receipt. Check the item prices, tax and tip."}
              </p>
            ) : null}

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

            <div className="list-chat-toggle">
              <button
                className="btn line"
                type="button"
                aria-expanded={splitChatOpen}
                aria-controls="list-split-chat"
                disabled={!data || list.items.length === 0}
                onClick={() => setSplitChatOpen((open) => !open)}
              >
                {splitChatOpen ? "Close AI bot" : "AI bot"}
              </button>
              <span className="sub">Ask the AI bot to assign items by chat.</span>
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
                <div className="list-chat-heading">
                  <label className="lbl" htmlFor="list-split-message">
                    Tell the assistant how to assign items
                  </label>
                  <button
                    className="list-suggestion-toggle"
                    type="button"
                    aria-pressed={splitSuggestionsEnabled}
                    onClick={() => setSplitSuggestionsEnabled((enabled) => !enabled)}
                  >
                    Item suggestions: {splitSuggestionsEnabled ? "On" : "Off"}
                  </button>
                </div>
                <div className="list-suggestion-field">
                  {splitInlineSuggestion ? (
                    <div className="list-suggestion-preview" aria-hidden="true">
                      <div style={{ transform: `translateY(-${splitInputScrollTop}px)` }}>
                        <span>{splitMessage.slice(0, splitTokenStart)}</span>
                        {splitInlineSuggestion.matchedWord?.startsWith(splitSuggestionQuery) &&
                        splitInlineSuggestion.matchedWordStart === 0 ? (
                          <>
                            <span>{splitTokenBeforeCursor + splitTokenAfterCursor}</span>
                            <span className="list-suggestion-completion">
                              {splitInlineSuggestion.description.slice(
                                splitInlineSuggestion.matchedWordStart + splitSuggestionQuery.length,
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="list-suggestion-replaced">
                              {splitTokenBeforeCursor + splitTokenAfterCursor}
                            </span>
                            <span className="list-suggestion-match">
                              {splitInlineSuggestion.description}
                            </span>
                          </>
                        )}
                        <span>{splitMessage.slice(splitTokenEnd) || "\u200b"}</span>
                      </div>
                    </div>
                  ) : null}
                  <textarea
                    ref={splitInputRef}
                    id="list-split-message"
                    value={splitMessage}
                    maxLength={1000}
                    rows={2}
                    placeholder="Who should get each item?"
                    disabled={splitParsing}
                    aria-autocomplete="list"
                    aria-controls="list-item-suggestions"
                    className={`list-suggestion-textarea${splitInlineSuggestion ? " has-suggestion" : ""}`}
                    onChange={(event) => {
                      setSplitMessage(event.target.value);
                      setSplitCursorPosition(event.currentTarget.selectionStart);
                    }}
                    onClick={(event) => setSplitCursorPosition(event.currentTarget.selectionStart)}
                    onSelect={(event) => setSplitCursorPosition(event.currentTarget.selectionStart)}
                    onKeyUp={(event) => setSplitCursorPosition(event.currentTarget.selectionStart)}
                    onKeyDown={handleSplitInputKeyDown}
                    onScroll={(event) => setSplitInputScrollTop(event.currentTarget.scrollTop)}
                  />
                </div>
                {splitInlineSuggestion ? (
                  <p className="list-suggestion-hint" aria-live="polite">
                    Press <kbd>Tab</kbd> to replace with <strong>{splitInlineSuggestion.description}</strong>
                  </p>
                ) : null}
                {splitItemSuggestions.length > 0 ? (
                  <ul
                    id="list-item-suggestions"
                    className="list-item-suggestions"
                    role="listbox"
                    aria-label="List item suggestions"
                  >
                    {splitItemSuggestions.map((description) => (
                      <li key={description} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected="false"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectSplitItemSuggestion(description)}
                        >
                          {description}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button className="btn" type="submit" disabled={splitParsing || !splitMessage.trim()}>
                  {splitParsing ? "Assigning…" : "Send"}
                </button>
              </form>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
