import Link from "next/link";
import "./even.css";

/* Split evenly: static UI only, no functionality yet.
   Sample data: the Amazon charge ($38.97) split with Brayden and Maya.
   TODO: load the real charge from the URL, real contacts, and wire up the buttons. */

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
const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />;
const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />;
const BackIcon = () => <Icon d="M15 6l-6 6 6 6" />;
const CheckIcon = () => <Icon d="M5 12l5 5 9-10" />;
const SendIcon = () => <Icon d="M4 12l16-8-6 16-3-7-7-1z" />;
const LogoMark = () => (
  <svg width="32" height="32" viewBox="3 3 60 60" aria-hidden="true">
    <g strokeWidth="6" strokeLinejoin="round">
      <polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" />
      <polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" />
    </g>
  </svg>
);

/* ---------------------------------------------------------- sample data */

const splitWith = [
  { name: "Brayden", sub: "(555) 010-0142" },
  { name: "Maya", sub: "(555) 010-0178" },
];

const suggestions = [
  { name: "Jay", sub: "jay@example.com" },
  { name: "Riley", sub: "(555) 010-0133" },
  { name: "Priya", sub: "(555) 010-0190" },
  { name: "Marcus", sub: "marcus@example.com" },
];

const shares = [
  { name: ME, label: "Gordon (you)", note: "You paid, so your share stays with you.", amount: "$12.99" },
  { name: "Brayden", label: "Brayden", note: "Gets a link at (555) 010-0142", amount: "$12.99" },
  { name: "Maya", label: "Maya", note: "Gets a link at (555) 010-0178", amount: "$12.99" },
];

/* ------------------------------------------------------------- sidebar */

const friends = [
  { name: "Brayden", inGroup: true },
  { name: "Maya", inGroup: true },
  { name: "Jay", inGroup: true },
  { name: "Riley", inGroup: false },
];

function Sidebar() {
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
          <li>
            <button className="gbtn" type="button">
              <span>Apartment 4B</span>
              <span className="cnt" />
            </button>
          </li>
          <li>
            <button className="gbtn" type="button">
              <span>Lisbon trip</span>
              <span className="cnt" />
            </button>
          </li>
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
          {friends.map((f) => (
            <li key={f.name} className="fr">
              <Avatar name={f.name} />
              <div>
                <b>{f.name}</b>
                <small>{f.inGroup ? "In Apartment 4B" : "Not in this group"}</small>
              </div>
              <button className="mini" type="button" disabled={f.inGroup}>
                {f.inGroup ? "Added" : "Add"}
              </button>
              <button className="xb" type="button" aria-label={`Remove ${f.name}`}>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
        <p className="lbl">Add someone to Apartment 4B</p>
        <div className="seg" role="group" aria-label="Add by">
          <button className="sg on" type="button" aria-pressed="true">
            Phone
          </button>
          <button className="sg" type="button" aria-pressed="false">
            Email
          </button>
        </div>
        <label className="lbl" htmlFor="ct">
          Phone number
        </label>
        <input id="ct" className="field" type="tel" placeholder="(555) 123-4567" />
        <button className="btn full" type="button">
          <PlusIcon />
          Add to group
        </button>
      </section>

      <div className="me">
        <span className="av lgav p0">GZ</span>
        <div>
          <b>Gordon Zeng</b>
          <small>gordon@example.com</small>
        </div>
        <button className="btn txt" type="button">
          Sign out
        </button>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- page */

export default function EvenSplitPage() {
  return (
    <div className="db">
      <Sidebar />

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
              <h1>Split $38.97</h1>
              <p className="meta">Add people from your contacts, choose how to split, and send everyone a link.</p>
            </div>
          </header>

          <section className="sec" aria-labelledby="split-with-h">
            <div className="shead">
              <div>
                <h2 id="split-with-h">Split with</h2>
                <p className="sub">Anyone in your contacts. They don’t need the app to pay.</p>
              </div>
              <button className="chip on" type="button" aria-pressed="true">
                <Avatar name={ME} />
                Include my share
                <span className="tick">
                  <CheckIcon />
                </span>
              </button>
            </div>
            <div className="pchips">
              {splitWith.map((p) => (
                <span key={p.name} className="pchip">
                  <Avatar name={p.name} />
                  {p.name}
                  <button className="xb" type="button" aria-label={`Remove ${p.name}`}>
                    <CloseIcon />
                  </button>
                </span>
              ))}
            </div>
            <div className="addp">
              <label className="lbl" htmlFor="contact-search">
                Add people
              </label>
              <input id="contact-search" className="field" type="text" placeholder="Search your contacts, or type a phone number or email" />
              <p className="sugg-h">From your contacts</p>
              <ul className="sugg">
                {suggestions.map((c) => (
                  <li key={c.name}>
                    <button className="sg-row" type="button">
                      <Avatar name={c.name} />
                      <span>
                        <b>{c.name}</b>
                        <small>{c.sub}</small>
                      </span>
                      <span className="addtag">Add</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="sec" aria-labelledby="how-h">
            <div className="shead">
              <div>
                <h2 id="how-h">How to split</h2>
                <p className="sub">Everyone pays the same. Any extra cents go to the first people.</p>
              </div>
              <div className="seg inline" role="group" aria-label="Split method">
                <button className="sg on" type="button" aria-pressed="true">
                  Evenly
                </button>
                <button className="sg" type="button" aria-pressed="false">
                  By amount
                </button>
                <button className="sg" type="button" aria-pressed="false">
                  By percent
                </button>
              </div>
            </div>

            <ul className="shares">
              {shares.map((s) => (
                <li key={s.label} className="sh-row">
                  <Avatar name={s.name} large />
                  <div>
                    <b>{s.label}</b>
                    <small>{s.note}</small>
                  </div>
                  <span className="sh-amt">{s.amount}</span>
                </li>
              ))}
            </ul>
            <p className="status ok">Every cent of $38.97 is covered.</p>
          </section>

          <div className="sumbar">
            <div>
              <small>You’ll request</small>
              <b>$25.98</b>
              <small>from 2 people</small>
            </div>
            <button className="btn" type="button">
              <SendIcon />
              Send payment links
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
