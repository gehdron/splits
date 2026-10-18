"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./item-by-item.css";

// Sample charge: Amazon $38.97. Shares are computed from the items.
const ME = "Gordon Zeng";

function initials(name: string) {
  const w = name.trim().split(/\s+/).filter((x) => /[a-z]/i.test(x));
  const l = (x?: string) => (x?.match(/[a-z]/i)?.[0] ?? "").toUpperCase();
  return w.length ? l(w[0]) + (w.length > 1 ? l(w[w.length - 1]) : "") : "#";
}
function colorClass(name: string) {
  if (name === ME) return "p0";
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `p${1 + (h % 3)}`;
}
const Avatar = ({ name, large = false }: { name: string; large?: boolean }) => (
  <span className={`av ${large ? "lgav " : ""}${colorClass(name)}`} aria-hidden="true">{initials(name)}</span>
);

const Svg = ({ children }: { children: ReactNode }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);
const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
const CloseIcon = () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>;
const BackIcon = () => <Svg><path d="M15 6l-6 6 6 6" /></Svg>;
const SendIcon = () => <Svg><path d="M4 12l16-8-6 16-3-7-7-1z" /></Svg>;
const PersonIcon = () => <Svg><circle cx="12" cy="9" r="3.5" /><path d="M5.5 19c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /></Svg>;
const ReceiptIcon = () => <Svg><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h4" /></Svg>;
const CameraIcon = () => <Svg><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
const LogoMark = () => (
  <svg width="32" height="32" viewBox="3 3 60 60" aria-hidden="true">
    <g strokeWidth="6" strokeLinejoin="round">
      <polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" />
      <polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" />
    </g>
  </svg>
);

const friends = [
  { name: "Brayden", inGroup: true },
  { name: "Maya", inGroup: true },
  { name: "Jay", inGroup: true },
  { name: "Riley", inGroup: false },
];
const FEE = 450;
const CHARGE = 3897;

type Person = { name: string; sub: string };
type ReceiptItem = { id: string; name: string; cents: number; who: string | null };

const starterPeople: Person[] = [
  { name: "Brayden", sub: "(555) 010-0142" },
  { name: "Jay", sub: "(555) 010-0164" },
];
const starterContacts: Person[] = [
  { name: "Maya", sub: "(555) 010-0178" },
  { name: "Riley", sub: "(555) 010-0133" },
  { name: "Priya", sub: "(555) 010-0190" },
  { name: "Marcus", sub: "marcus@example.com" },
];
const starterItems: ReceiptItem[] = [
  { id: "charger", name: "Phone charger", cents: 1499, who: "Jay" },
  { id: "towels", name: "Paper towels, 12 pack", cents: 1149, who: "Brayden" },
  { id: "batteries", name: "AA batteries", cents: 799, who: null },
];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

function money(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function centsFromDollars(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const [dollars, fraction = ""] = cleaned.split(".");
  return Number(dollars || "0") * 100 + Number((fraction + "00").slice(0, 2));
}

function allocate(total: number, weights: { key: string; weight: number }[]): Map<string, number> {
  const sum = weights.reduce((totalWeight, row) => totalWeight + row.weight, 0);
  const shares = new Map<string, number>();
  if (sum <= 0 || total <= 0) return shares;
  const rows = weights.map((row) => {
    const exact = (total * row.weight) / sum;
    const base = Math.floor(exact);
    return { key: row.key, base, frac: exact - base };
  });
  let left = total - rows.reduce((used, row) => used + row.base, 0);
  for (const row of [...rows].sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key))) {
    if (left <= 0) break;
    row.base += 1;
    left -= 1;
  }
  for (const row of rows) shares.set(row.key, row.base);
  return shares;
}

function Sidebar() {
  return (
    <aside className="side">
      <div className="brand"><LogoMark /><span>Splits</span></div>
      <section aria-labelledby="g-h">
        <h2 className="sh" id="g-h">Your groups</h2>
        <ul className="groups">
          {["Apartment 4B", "Lisbon trip"].map((g) => (
            <li key={g}><button className="gbtn" type="button"><span>{g}</span><span className="cnt" /></button></li>
          ))}
        </ul>
        <label className="lbl" htmlFor="ng">New group</label>
        <div className="inrow">
          <input id="ng" className="field" type="text" placeholder="Group name" />
          <button className="btn" type="button">Create</button>
        </div>
      </section>
      <section aria-labelledby="f-h">
        <h2 className="sh" id="f-h">People</h2>
        <ul className="friends">
          {friends.map((f) => (
            <li key={f.name} className="fr">
              <Avatar name={f.name} />
              <div><b>{f.name}</b><small>{f.inGroup ? "In Apartment 4B" : "Not in this group"}</small></div>
              <button className="mini" type="button" disabled={f.inGroup}>{f.inGroup ? "Added" : "Add"}</button>
              <button className="xb" type="button" aria-label={`Remove ${f.name}`}><CloseIcon /></button>
            </li>
          ))}
        </ul>
        <p className="lbl">Add someone to Apartment 4B</p>
        <div className="seg" role="group" aria-label="Add by">
          <button className="sg on" type="button" aria-pressed="true">Phone</button>
          <button className="sg" type="button" aria-pressed="false">Email</button>
        </div>
        <label className="lbl" htmlFor="ct">Phone number</label>
        <input id="ct" className="field" type="tel" placeholder="(555) 123-4567" />
        <button className="btn full" type="button"><PlusIcon />Add to group</button>
      </section>
      <div className="me">
        <span className="av lgav p0">GZ</span>
        <div><b>Gordon Zeng</b><small>gordon@example.com</small></div>
        <button className="btn txt" type="button">Sign out</button>
      </div>
    </aside>
  );
}

export default function ItemByItemPage() {
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [people, setPeople] = useState(starterPeople);
  const [contacts, setContacts] = useState(starterContacts);
  const [items, setItems] = useState(starterItems);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [sent, setSent] = useState(false);
  const [receiptFileName, setReceiptFileName] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const [scanning, setScanning] = useState(false);

  async function scanReceipt(file: File) {
    const isPdf = file.type === "application/pdf";
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!isPdf && !isImage) {
      setReceiptError("Choose a JPEG, PNG, WebP, or PDF receipt.");
      return;
    }
    if (file.size > (isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) {
      setReceiptError(
        isPdf
          ? "PDF receipts must be 4 MB or smaller."
          : "Image receipts must be 8 MB or smaller."
      );
      return;
    }

    setScanning(true);
    setReceiptError("");
    try {
      let response: Response;
      if (isPdf) {
        const formData = new FormData();
        formData.append("receiptFile", file);
        response = await fetch("/api/parse-receipt", {
          method: "POST",
          body: formData,
        });
      } else {
        const imageDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("That image could not be read."));
          reader.readAsDataURL(file);
        });
        response = await fetch("/api/parse-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl }),
        });
      }

      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "The receipt could not be read. Try another image or PDF.";
        throw new Error(message);
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("items" in result) ||
        !Array.isArray(result.items)
      ) {
        throw new Error("The receipt parser returned an invalid result. Try again.");
      }

      const parsedItems = result.items.flatMap((item, index): ReceiptItem[] => {
        if (
          typeof item !== "object" ||
          item === null ||
          !("description" in item) ||
          typeof item.description !== "string" ||
          !("amount" in item) ||
          typeof item.amount !== "string"
        ) {
          return [];
        }
        const name = item.description.trim();
        if (!name || !item.amount.trim()) return [];
        return [{
          id: `receipt-${Date.now()}-${index}`,
          name,
          cents: centsFromDollars(item.amount),
          who: null,
        }];
      });

      if (parsedItems.length === 0) {
        throw new Error("No receipt items were found. Upload a clearer receipt.");
      }
      setItems(parsedItems);
      setReceiptFileName(file.name);
      setSent(false);
    } catch (error) {
      setReceiptError(
        error instanceof Error
          ? error.message
          : "The receipt could not be read. Try again."
      );
    } finally {
      setScanning(false);
    }
  }

  function handleReceiptSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void scanReceipt(file);
  }

  useEffect(() => {
    if (!openId) return;
    function close(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".asg")) return;
      setOpenId(null);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openId]);

  const itemTotal = items.reduce((sum, item) => sum + item.cents, 0);
  const itemized = itemTotal + FEE;
  const costs = new Map<string, number>();
  for (const item of items) costs.set(item.who ?? "Unassigned", (costs.get(item.who ?? "Unassigned") ?? 0) + item.cents);
  const fees = allocate(FEE, [...costs].map(([key, weight]) => ({ key, weight })));
  const totals = new Map<string, number>();
  for (const [key, cost] of costs) totals.set(key, cost + (fees.get(key) ?? 0));
  const unassigned = totals.get("Unassigned") ?? 0;
  const payers = people
    .map((person) => ({
      name: person.name,
      label: person.name,
      note: `${items.filter((item) => item.who === person.name).length} ${items.filter((item) => item.who === person.name).length === 1 ? "item" : "items"} plus their share of fees`,
      cents: totals.get(person.name) ?? 0,
    }))
    .filter((person) => person.cents > 0);
  const request = payers.reduce((sum, person) => sum + person.cents, 0);
  const ready = items.length > 0 && items.every((item) => item.who) && payers.length > 0;
  const shown = contacts.filter((contact) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return contact.name.toLowerCase().includes(needle) || contact.sub.toLowerCase().includes(needle);
  });

  function addPerson(person: Person) {
    if (people.some((entry) => entry.name === person.name)) return;
    setPeople((current) => [...current, person]);
    setContacts((current) => current.filter((entry) => entry.name !== person.name));
    setQuery("");
    setSent(false);
  }

  function assign(id: string, who: string | null) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, who } : item)));
    setOpenId(null);
    setSent(false);
  }

  return (
    <div className="db">
      <Sidebar />
      <main className="main">
        <div className="wrap">
          <Link className="back" href="/dashboard"><BackIcon />Recent charges</Link>
          <div className="chg">
            <span className="mic" aria-hidden="true">A</span>
            <span><b>Amazon</b><small>Oct 10, from your linked card</small></span>
          </div>
          <header className="top">
            <div>
              <h1>Item by item</h1>
              <p className="meta">Scan the receipt, check the items, then assign each one to whoever had it.</p>
            </div>
          </header>

          <section className="sec rcpt" aria-labelledby="scan-h">
            <input
              ref={cameraInput}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              aria-label="Take a photo of a receipt"
              onChange={handleReceiptSelection}
            />
            <input
              ref={uploadInput}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-label="Upload a receipt photo or PDF"
              onChange={handleReceiptSelection}
            />
            <div className="rc-ph" role="img" aria-label="Receipt photo placeholder">
              <ReceiptIcon />
              <b>{receiptFileName || "Receipt photo"}</b>
              <small>
                {receiptFileName
                  ? "Receipt uploaded"
                  : "[Placeholder for the scanned receipt]"}
              </small>
            </div>
            <div>
              <h2 id="scan-h">Scan the receipt</h2>
              <p className="sub">Take a photo of the receipt and Splits lists every item and price for you. Check them below and fix anything that’s off.</p>
              <div className="acts2">
                <button
                  className="btn"
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  disabled={scanning}
                >
                  <CameraIcon />{scanning ? "Reading receipt…" : "Scan receipt"}
                </button>
                <button
                  className="btn line"
                  type="button"
                  onClick={() => uploadInput.current?.click()}
                  disabled={scanning}
                >
                  Upload a photo
                </button>
              </div>
              {receiptError ? (
                <p className="scanned" role="alert">{receiptError}</p>
              ) : receiptFileName ? (
                <p className="scanned" role="status">
                  <span className="pill">Scanned</span>Found {items.length}{" "}
                  {items.length === 1 ? "item" : "items"}.
                </p>
              ) : null}
            </div>
          </section>

          <section className="sec" aria-labelledby="sw-h">
            <div className="shead">
              <div>
                <h2 id="sw-h">Split with</h2>
                <p className="sub">Add people from your contacts. You can assign items to anyone you add.</p>
              </div>
            </div>
            <div className="pchips">
              {people.map((person) => (
                <span key={person.name} className="pchip">
                  <Avatar name={person.name} />{person.name}
                  <button
                    className="xb"
                    type="button"
                    aria-label={`Remove ${person.name}`}
                    onClick={() => {
                      setPeople((current) => current.filter((entry) => entry.name !== person.name));
                      setItems((current) => current.map((item) => (item.who === person.name ? { ...item, who: null } : item)));
                      setSent(false);
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
                const value = query.trim();
                if (!value) return;
                const known = contacts.find((contact) => contact.name.toLowerCase() === value.toLowerCase() || contact.sub.toLowerCase() === value.toLowerCase());
                addPerson(known ?? { name: value, sub: value });
              }}
            >
              <label className="lbl" htmlFor="cs">Add people</label>
              <div className="inrow">
                <input id="cs" className="field" type="text" placeholder="Search your contacts, or type a phone number or email" value={query} onChange={(event) => setQuery(event.target.value)} />
                <button className="btn" type="submit" disabled={!query.trim()}>Add</button>
              </div>
              <p className="sugg-h">From your contacts</p>
              <ul className="sugg">
                {shown.map((contact) => (
                  <li key={contact.name}>
                    <button className="sg-row" type="button" onClick={() => addPerson(contact)}>
                      <Avatar name={contact.name} />
                      <span><b>{contact.name}</b><small>{contact.sub}</small></span>
                      <span className="addtag">Add</span>
                    </button>
                  </li>
                ))}
              </ul>
            </form>
          </section>

          <div className="grid2">
            <section className="sec" aria-labelledby="it-h">
              <h2 id="it-h">Items from the receipt</h2>
              <div className="prog" role="img" aria-label={`Itemized ${money(itemized)} of ${money(CHARGE)}`}><i style={{ width: `${Math.min(100, Math.round((itemized / CHARGE) * 100))}%` }} /></div>
              <div className="progtxt"><span>Itemized <b>{money(itemized)}</b> of {money(CHARGE)}</span><span>{itemized === CHARGE ? "Matches the charge" : "Doesn’t match the charge"}</span></div>
              <div className="lt lh" aria-hidden="true"><span>Item</span><span className="r">Price</span><span>Assignee</span><span /></div>
              <ul className="rows">
                {items.map((item) => (
                  <li key={item.id} className="lt li">
                    <span className="iname">{item.name}{!item.who && <small>Unassigned</small>}</span>
                    <span className="r">{money(item.cents)}</span>
                    <div className="asg">
                      <button
                        className={`asg-btn${openId === item.id ? " is-open" : ""}`}
                        type="button"
                        aria-expanded={openId === item.id}
                        aria-haspopup="menu"
                        aria-label={item.who ? `${item.name}, assigned to ${item.who}. Change` : `Assign ${item.name}`}
                        onClick={() => setOpenId((current) => (current === item.id ? null : item.id))}
                      >
                        {item.who ? (
                          <><Avatar name={item.who} /><span className="asg-name">{item.who}</span></>
                        ) : (
                          <><span className="ph-ic"><PersonIcon /></span><span className="asg-name muted">Assign</span></>
                        )}
                      </button>
                      {openId === item.id ? (
                        <div className="menu" role="menu">
                          {people.map((person) => (
                            <button key={person.name} className="opt" type="button" role="menuitem" onClick={() => assign(item.id, person.name)}>
                              <Avatar name={person.name} />
                              {person.name}
                            </button>
                          ))}
                          {item.who ? (
                            <button className="opt un" type="button" role="menuitem" onClick={() => assign(item.id, null)}>
                              Unassign
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <button className="xb" type="button" aria-label={`Delete ${item.name}`} onClick={() => { setItems((current) => current.filter((entry) => entry.id !== item.id)); setSent(false); }}>
                      <CloseIcon />
                    </button>
                  </li>
                ))}
                <li className="lt li fee">
                  <span className="iname">Tax and shipping</span><span className="r">{money(FEE)}</span>
                  <span className="feenote">Split by item cost</span><span />
                </li>
              </ul>
              <form
                className="addrow"
                onSubmit={(event) => {
                  event.preventDefault();
                  const cents = centsFromDollars(itemPrice);
                  if (!itemName.trim() || cents <= 0) return;
                  setItems((current) => [...current, { id: crypto.randomUUID(), name: itemName.trim(), cents, who: null }]);
                  setItemName("");
                  setItemPrice("");
                  setSent(false);
                }}
              >
                <div><label className="lbl" htmlFor="ni">Missing something? Add it</label><input id="ni" className="field" type="text" placeholder="Dish soap" value={itemName} onChange={(event) => setItemName(event.target.value)} /></div>
                <div><label className="lbl" htmlFor="np">Price</label><input id="np" className="field" type="text" inputMode="decimal" placeholder="0.00" value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} /></div>
                <button className="btn" type="submit" disabled={!itemName.trim() || centsFromDollars(itemPrice) <= 0}><PlusIcon />Add</button>
              </form>
            </section>

            <aside className="stick" aria-label="Summary">
              <section className="sec" aria-labelledby="ep-h">
                <h2 id="ep-h" className="sh">Each person pays</h2>
                <ul className="each">
                  <li className="er">
                    <Avatar name={ME} />
                    <div><b>Gordon (you)</b><small>You paid. This stays with you.</small></div>
                    <span className="pa">{money(0)}</span>
                  </li>
                  {payers.map((person) => (
                    <li key={person.name} className="er">
                      <Avatar name={person.name} />
                      <div><b>{person.label}</b><small>{person.note}</small></div>
                      <span className="pa">{money(person.cents)}</span>
                    </li>
                  ))}
                  {unassigned > 0 ? (
                    <li className="er un">
                      <span className="ph-ic"><PersonIcon /></span>
                      <div><b>Unassigned</b><small>Assign these to finish</small></div>
                      <span className="pa">{money(unassigned)}</span>
                    </li>
                  ) : null}
                </ul>
                <div className="sumbar">
                  <div>
                    <small>{sent ? "Requested" : "You’ll request"}</small>
                    <b>{money(request)}</b>
                    <small>{sent ? "Links sent" : `from ${payers.length} ${payers.length === 1 ? "person" : "people"}`}</small>
                  </div>
                  <button className="btn" type="button" disabled={!ready || sent} onClick={() => setSent(true)}>
                    <SendIcon />{sent ? "Links sent" : "Send payment links"}
                  </button>
                </div>
                <p className="after">Each person gets a link with their items listed, and pays with Apple Pay or a card.</p>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
