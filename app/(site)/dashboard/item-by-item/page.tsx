import Link from "next/link";
import type { ReactNode } from "react";
import "./item-by-item.css";

// Item by item: static UI only. Sample data: Amazon $38.97 split with Brayden and Jay.
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
const splitWith = ["Brayden", "Jay"];
const suggestions = [
  { name: "Maya", sub: "(555) 010-0178" },
  { name: "Riley", sub: "(555) 010-0133" },
  { name: "Priya", sub: "(555) 010-0190" },
  { name: "Marcus", sub: "marcus@example.com" },
];
const items: { name: string; price: string; who: string | null }[] = [
  { name: "Phone charger", price: "$14.99", who: "Jay" },
  { name: "Paper towels, 12 pack", price: "$11.49", who: "Brayden" },
  { name: "AA batteries", price: "$7.99", who: null },
];
const eachPays = [
  { name: ME, label: "Gordon (you)", note: "You paid. This stays with you.", amount: "$0.00" },
  { name: "Brayden", label: "Brayden", note: "1 item plus their share of fees", amount: "$12.99" },
  { name: "Jay", label: "Jay", note: "1 item plus their share of fees", amount: "$16.95" },
];

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
            <div className="rc-ph" role="img" aria-label="Receipt photo placeholder">
              <ReceiptIcon /><b>Receipt photo</b><small>[Placeholder for the scanned receipt]</small>
            </div>
            <div>
              <h2 id="scan-h">Scan the receipt</h2>
              <p className="sub">Take a photo of the receipt and Splits lists every item and price for you. Check them below and fix anything that’s off.</p>
              <div className="acts2">
                <button className="btn" type="button"><CameraIcon />Scan receipt</button>
                <button className="btn line" type="button">Upload a photo</button>
              </div>
              <p className="scanned"><span className="pill">Scanned</span>Found 3 items, plus tax and shipping.</p>
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
              {splitWith.map((n) => (
                <span key={n} className="pchip">
                  <Avatar name={n} />{n}
                  <button className="xb" type="button" aria-label={`Remove ${n}`}><CloseIcon /></button>
                </span>
              ))}
            </div>
            <div className="addp">
              <label className="lbl" htmlFor="cs">Add people</label>
              <input id="cs" className="field" type="text" placeholder="Search your contacts, or type a phone number or email" />
              <p className="sugg-h">From your contacts</p>
              <ul className="sugg">
                {suggestions.map((c) => (
                  <li key={c.name}>
                    <button className="sg-row" type="button">
                      <Avatar name={c.name} />
                      <span><b>{c.name}</b><small>{c.sub}</small></span>
                      <span className="addtag">Add</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <div className="grid2">
            <section className="sec" aria-labelledby="it-h">
              <h2 id="it-h">Items from the receipt</h2>
              <div className="prog" role="img" aria-label="Itemized $38.97 of $38.97"><i style={{ width: "100%" }} /></div>
              <div className="progtxt"><span>Itemized <b>$38.97</b> of $38.97</span><span>Matches the charge</span></div>
              <div className="lt lh" aria-hidden="true"><span>Item</span><span className="r">Price</span><span>Assignee</span><span /></div>
              <ul className="rows">
                {items.map((it) => (
                  <li key={it.name} className="lt li">
                    <span className="iname">{it.name}{!it.who && <small>Unassigned</small>}</span>
                    <span className="r">{it.price}</span>
                    <button className="asg-btn" type="button" aria-label={it.who ? `${it.name}, assigned to ${it.who}. Change` : `Assign ${it.name}`}>
                      {it.who ? (
                        <><Avatar name={it.who} /><span className="asg-name">{it.who}</span></>
                      ) : (
                        <><span className="ph-ic"><PersonIcon /></span><span className="asg-name muted">Assign</span></>
                      )}
                    </button>
                    <button className="xb" type="button" aria-label={`Delete ${it.name}`}><CloseIcon /></button>
                  </li>
                ))}
                <li className="lt li fee">
                  <span className="iname">Tax and shipping</span><span className="r">$4.50</span>
                  <span className="feenote">Split by item cost</span><span />
                </li>
              </ul>
              <div className="addrow">
                <div><label className="lbl" htmlFor="ni">Missing something? Add it</label><input id="ni" className="field" type="text" placeholder="Dish soap" /></div>
                <div><label className="lbl" htmlFor="np">Price</label><input id="np" className="field" type="text" inputMode="decimal" placeholder="0.00" /></div>
                <button className="btn" type="button"><PlusIcon />Add</button>
              </div>
            </section>

            <aside className="stick" aria-label="Summary">
              <section className="sec" aria-labelledby="ep-h">
                <h2 id="ep-h" className="sh">Each person pays</h2>
                <ul className="each">
                  {eachPays.map((p) => (
                    <li key={p.label} className="er">
                      <Avatar name={p.name} />
                      <div><b>{p.label}</b><small>{p.note}</small></div>
                      <span className="pa">{p.amount}</span>
                    </li>
                  ))}
                  <li className="er un">
                    <span className="ph-ic"><PersonIcon /></span>
                    <div><b>Unassigned</b><small>Assign these to finish</small></div>
                    <span className="pa">$9.03</span>
                  </li>
                </ul>
                <div className="sumbar">
                  <div><small>You’ll request</small><b>$29.94</b><small>from 2 people</small></div>
                  <button className="btn" type="button" disabled><SendIcon />Send payment links</button>
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
