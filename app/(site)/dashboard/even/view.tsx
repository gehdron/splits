"use client";

import Link from "next/link";
import { useState } from "react";
import { DashSidebar } from "../sidebar";
import type { DashboardData } from "../types";
import "./even.css";

/* Sample charge: Amazon $38.97. Money is computed here, never by a model. */

/* ------------------------------------------------------------- helpers */

const ME = "Gordon Zeng";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length === 0) return "#";
  const letter = (w: string) => (w.match(/[a-z]/i)?.[0] ?? "").toUpperCase();
  return letter(words[0] ?? "") + (words.length > 1 ? letter(words[words.length - 1] ?? "") : "");
}

function colorClass(name: string): string {
  if (name === ME) return "p0";
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `p${1 + (h % 3)}`;
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span className={`av ${large ? "lgav " : ""}${colorClass(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* --------------------------------------------------------------- icons */

const Icon = ({ d, className = "i" }: { d: string; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />;
const BackIcon = () => <Icon d="M15 6l-6 6 6 6" />;
const CheckIcon = () => <Icon d="M5 12l5 5 9-10" />;
const SendIcon = () => <Icon d="M4 12l16-8-6 16-3-7-7-1z" />;

/* ---------------------------------------------------------- sample data */

const TOTAL = 3897;

type Person = { name: string; sub: string };
type Mode = "even" | "amount" | "percent";

const starter: Person[] = [
  { name: "Brayden", sub: "(555) 010-0142" },
  { name: "Maya", sub: "(555) 010-0178" },
];

const starterContacts: Person[] = [
  { name: "Jay", sub: "jay@example.com" },
  { name: "Riley", sub: "(555) 010-0133" },
  { name: "Priya", sub: "(555) 010-0190" },
  { name: "Marcus", sub: "marcus@example.com" },
];

function money(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function splitEven(cents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(cents / count);
  const extra = cents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

function centsFromDollars(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const [dollars, fraction = ""] = cleaned.split(".");
  return Number(dollars || "0") * 100 + Number((fraction + "00").slice(0, 2));
}

/* ---------------------------------------------------------------- page */

export function EvenSplitView({ data }: { data: DashboardData }) {
  const [others, setOthers] = useState(starter);
  const [contacts, setContacts] = useState(starterContacts);
  const [includeMe, setIncludeMe] = useState(true);
  const [mode, setMode] = useState<Mode>("even");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState(false);
  const [reminded, setReminded] = useState<Record<string, boolean>>({});

  const names = includeMe ? [ME, ...others.map((person) => person.name)] : others.map((person) => person.name);
  const evenParts = splitEven(TOTAL, names.length);
  const percentDefaults = splitEven(100, names.length);
  const amountCents = names.map((name, index) =>
    amounts[name] === undefined ? (evenParts[index] ?? 0) : centsFromDollars(amounts[name]),
  );
  const percentNumbers = names.map((name, index) =>
    percents[name] === undefined ? (percentDefaults[index] ?? 0) : Math.min(100, Number(percents[name] || "0")),
  );
  const percentSum = percentNumbers.reduce((sum, value) => sum + value, 0);
  const percentParts = names.map((_, index) => Math.floor((TOTAL * percentNumbers[index]) / 100));
  if (percentSum === 100) {
    let left = TOTAL - percentParts.reduce((sum, value) => sum + value, 0);
    const order = percentParts
      .map((value, index) => ({ index, frac: (TOTAL * percentNumbers[index]) / 100 - value }))
      .sort((a, b) => b.frac - a.frac);
    for (const slot of order) {
      if (left <= 0) break;
      percentParts[slot.index] += 1;
      left -= 1;
    }
  }
  const shares = names.map((name, index) => {
    const person = others.find((entry) => entry.name === name);
    const cents = mode === "even" ? evenParts[index] ?? 0 : mode === "amount" ? amountCents[index] : percentParts[index];
    return {
      name,
      label: name === ME ? "Gordon (you)" : name,
      note: name === ME ? "You paid, so your share stays with you." : `Gets a link at ${person?.sub ?? "the address you added"}`,
      cents,
    };
  });
  const covered =
    names.length > 0 &&
    (mode === "even" ||
      (mode === "amount" && amountCents.reduce((sum, value) => sum + value, 0) === TOTAL) ||
      (mode === "percent" && percentSum === 100));
  const request = shares.filter((share) => share.name !== ME).reduce((sum, share) => sum + share.cents, 0);
  const requestCount = shares.filter((share) => share.name !== ME && share.cents > 0).length;
  const shown = contacts.filter((contact) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return contact.name.toLowerCase().includes(needle) || contact.sub.toLowerCase().includes(needle);
  });

  function resetSent() {
    setSent(false);
  }

  function addPerson(person: Person) {
    if (others.some((entry) => entry.name === person.name) || person.name === ME) return;
    setOthers((current) => [...current, person]);
    setContacts((current) => current.filter((entry) => entry.name !== person.name));
    setQuery("");
    resetSent();
  }

  function addTyped() {
    const value = query.trim();
    if (!value) return;
    const known = contacts.find(
      (contact) => contact.name.toLowerCase() === value.toLowerCase() || contact.sub.toLowerCase() === value.toLowerCase(),
    );
    addPerson(known ?? { name: value, sub: value });
  }

  return (
    <div className="db">
      <DashSidebar data={data} />

      <main className="main">
        <div className="wrap">
          <Link className="back" href="/dashboard">
            <BackIcon />
            Recent charges
          </Link>
          <div className="chg">
            <span className="mic" aria-hidden="true">
              A
            </span>
            <span>
              <b>Amazon</b>
              <small>Oct 10, from your linked card</small>
            </span>
          </div>

          <header className="top">
            <div>
              <h1>Split {money(TOTAL)}</h1>
              <p className="meta">Add people from your contacts, choose how to split, and send everyone a link.</p>
            </div>
          </header>

          <section className="sec" aria-labelledby="split-with-h">
            <div className="shead">
              <div>
                <h2 id="split-with-h">Split with</h2>
                <p className="sub">Anyone in your contacts. They don’t need the app to pay.</p>
              </div>
              <button className={`chip${includeMe ? " on" : ""}`} type="button" aria-pressed={includeMe} onClick={() => { setIncludeMe((value) => !value); resetSent(); }}>
                <Avatar name={ME} />
                Include my share
                <span className="tick">
                  <CheckIcon />
                </span>
              </button>
            </div>
            <div className="pchips">
              {others.map((person) => (
                <span key={person.name} className="pchip">
                  <Avatar name={person.name} />
                  {person.name}
                  <button
                    className="xb"
                    type="button"
                    aria-label={`Remove ${person.name}`}
                    onClick={() => {
                      setOthers((current) => current.filter((entry) => entry.name !== person.name));
                      resetSent();
                    }}
                  >
                    <CloseIcon />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="addp"
              onSubmit={(event) => {
                event.preventDefault();
                addTyped();
              }}
            >
              <label className="lbl" htmlFor="contact-search">
                Add people
              </label>
              <div className="inrow">
                <input
                  id="contact-search"
                  className="field"
                  type="text"
                  placeholder="Search your contacts, or type a phone number or email"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button className="btn" type="submit" disabled={!query.trim()}>
                  Add
                </button>
              </div>
              <p className="sugg-h">From your contacts</p>
              <ul className="sugg">
                {shown.map((contact) => (
                  <li key={contact.name} className="sg-row">
                    <Avatar name={contact.name} />
                    <span>
                      <b>{contact.name}</b>
                      <small>{contact.sub}</small>
                    </span>
                    <button className="mini" type="button" onClick={() => addPerson(contact)}>
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </form>
          </section>

          <section className="sec" aria-labelledby="how-h">
            <div className="shead">
              <div>
                <h2 id="how-h">How to split</h2>
                <p className="sub">
                  {mode === "even"
                    ? "Everyone pays the same. Any extra cents go to the first people."
                    : mode === "amount"
                      ? "Type what each person pays. The amounts need to add up to the charge."
                      : "Type a percent for each person. The percents need to add up to 100."}
                </p>
              </div>
              <div className="seg inline" role="group" aria-label="Split method">
                {(
                  [
                    ["even", "Evenly"],
                    ["amount", "By amount"],
                    ["percent", "By percent"],
                  ] as const
                ).map(([value, label]) => (
                  <button key={value} className={`sg${mode === value ? " on" : ""}`} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); resetSent(); }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="shares">
              {shares.map((share) => (
                <li key={share.name} className="sh-row">
                  <Avatar name={share.name} large />
                  <div>
                    <b>{share.label}</b>
                    <small>{share.note}</small>
                  </div>
                  {mode === "even" ? (
                    <span className="sh-amt">{money(share.cents)}</span>
                  ) : mode === "amount" ? (
                    <input
                      className="sh-input"
                      aria-label={`${share.label} amount`}
                      inputMode="decimal"
                      value={amounts[share.name] ?? ((evenParts[names.indexOf(share.name)] ?? 0) / 100).toFixed(2)}
                      onChange={(event) => {
                        setAmounts((current) => ({ ...current, [share.name]: event.target.value }));
                        resetSent();
                      }}
                    />
                  ) : (
                    <input
                      className="sh-input"
                      aria-label={`${share.label} percent`}
                      inputMode="numeric"
                      value={percents[share.name] ?? String(percentDefaults[names.indexOf(share.name)] ?? 0)}
                      onChange={(event) => {
                        setPercents((current) => ({ ...current, [share.name]: event.target.value.replace(/[^0-9]/g, "") }));
                        resetSent();
                      }}
                    />
                  )}
                  {share.name !== ME && share.cents > 0 ? (
                    <button
                      className="btn line remind"
                      type="button"
                      disabled={reminded[share.name]}
                      onClick={() => setReminded((current) => ({ ...current, [share.name]: true }))}
                    >
                      {reminded[share.name] ? "Reminded" : "Remind"}
                    </button>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
            <p className={`status${covered ? " ok" : ""}`}>
              {names.length === 0
                ? "Add at least one person to split this charge."
                : covered && requestCount === 0
                  ? "This stays with you. Add someone if you want to request a share."
                  : covered
                    ? `Every cent of ${money(TOTAL)} is covered.`
                    : mode === "percent"
                      ? `These percents add up to ${percentSum}. They need to add up to 100.`
                      : `These shares add up to ${money(amountCents.reduce((sum, value) => sum + value, 0))}. They need to add up to ${money(TOTAL)}.`}
            </p>
          </section>

          <div className="sumbar">
            <div>
              <small>{sent ? "Requested" : "You’ll request"}</small>
              <b>{money(request)}</b>
              <small>
                {sent ? "Links sent" : `from ${requestCount} ${requestCount === 1 ? "person" : "people"}`}
              </small>
            </div>
            <button className="btn" type="button" disabled={!covered || sent || requestCount === 0} onClick={() => setSent(true)}>
              <SendIcon />
              {sent ? "Links sent" : "Send payment links"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
