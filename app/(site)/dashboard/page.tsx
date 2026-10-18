import Link from "next/link";
import "./dashboard.css";

/* Static UI only. Swap the sample data below for real data when you wire it up. */

const ME = "Gordon Zeng";

const groups = [
  { name: "Apartment 4B", count: 4, active: true },
  { name: "Lisbon trip", count: null, active: false },
];

const friends = [
  { name: "Brayden", inGroup: true },
  { name: "Maya", inGroup: true },
  { name: "Jay", inGroup: true },
  { name: "Riley", inGroup: false },
];

const members = [ME, "Brayden", "Maya", "Jay"];

type Charge = { merchant: string; date: string; amount: string; status: "split" | "none" | "settled"; label?: string };
const charges: Charge[] = [
  { merchant: "Noodle House", date: "Today", amount: "$142.60", status: "split", label: "2 of 3 paid" },
  { merchant: "Uber", date: "Yesterday", amount: "$23.40", status: "none" },
  { merchant: "Trader Joe’s", date: "Oct 12", amount: "$54.20", status: "split", label: "1 of 3 paid" },
  { merchant: "Amazon", date: "Oct 10", amount: "$38.97", status: "none" },
  { merchant: "Comcast Internet", date: "Oct 1", amount: "$60.00", status: "settled", label: "Settled" },
];

type SharedList = { id: string; name: string; meta: string; pill: string; pillClass: string; position: string; positionClass: string; total: string };
const lists: SharedList[] = [
  { id: "l1", name: "House supplies", meta: "5 items, you paid", pill: "2 unassigned", pillClass: "pv", position: "You’re owed $19.49", positionClass: "pos", total: "$45.22" },
  { id: "l2", name: "Costco run", meta: "5 items, Maya paid", pill: "All assigned", pillClass: "pg", position: "You owe $17.98", positionClass: "neg", total: "$67.95" },
  { id: "l3", name: "Party supplies", meta: "3 items, you paid", pill: "3 unassigned", pillClass: "pv", position: "Nothing owed", positionClass: "zero", total: "$17.47" },
];

/* ---------------------------------------------------------------- helpers */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "?").charAt(0);
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "").charAt(0) : "";
  return (first + last).toUpperCase();
}

function colorClass(name: string): string {
  if (name === ME) return "p0";
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `p${1 + (h % 3)}`;
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span className={`av ${large ? "lgav " : ""}${colorClass(name)}`} title={name === ME ? "Gordon (you)" : name}>
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ icons */

const Icon = ({ d }: { d: string }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />;
const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />;
const ChevronIcon = () => (
  <svg className="i chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const ListIcon = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
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

const EvenIcon = () => <Icon d="M5 9h14M5 15h14" />;

/* --------------------------------------------------------- split chooser */

/* Native popover: opens from the "Split this charge" button, closes on Esc or a click outside. No client JS.
   TODO: pass the charge to both pages once they load real data. */
function SplitChooser({ id, charge }: { id: string; charge: Charge }) {
  return (
    <div className="sdlg" id={id} popover="auto" role="dialog" aria-labelledby={`${id}-h`}>
      <div className="sd-top">
        <span className="mic" aria-hidden="true">
          {charge.merchant.charAt(0)}
        </span>
        <div>
          <b>{charge.merchant}</b>
          <small>
            {charge.amount}, {charge.date}
          </small>
        </div>
        <button className="xb" type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <h2 id={`${id}-h`}>How do you want to split it?</h2>
      <p className="sub">You can add people and check the amounts on the next screen.</p>
      <ul className="sd-opts">
        <li>
          <Link className="sd-opt" href="/dashboard/item-by-item">
            <span className="sd-ic">
              <ListIcon />
            </span>
            <span>
              <b>Item by item</b>
              <small>Scan the receipt and give each item to whoever had it.</small>
            </span>
            <ChevronIcon />
          </Link>
        </li>
        <li>
          <Link className="sd-opt" href="/dashboard/even">
            <span className="sd-ic">
              <EvenIcon />
            </span>
            <span>
              <b>Split evenly</b>
              <small>Everyone pays the same share of {charge.amount}.</small>
            </span>
            <ChevronIcon />
          </Link>
        </li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export default function DashboardPage() {
  const groupName = "Apartment 4B";

  return (
    <div className="db">
      {/* ---------------------------------------------------------- sidebar */}
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
            {friends.map((f) => (
              <li key={f.name} className="fr">
                <Avatar name={f.name} />
                <div>
                  <b>{f.name}</b>
                  <small>{f.inGroup ? `In ${groupName}` : "Not in this group"}</small>
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
          <p className="lbl">Add someone to {groupName}</p>
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

      {/* ------------------------------------------------------------- main */}
      <main className="main">
        <div className="wrap">
          <header className="top">
            <div>
              <h1>{groupName}</h1>
              <div className="meta">
                <div className="stack">
                  {members.map((m) => (
                    <Avatar key={m} name={m} />
                  ))}
                </div>
                <span>You own this group. {members.length} people.</span>
              </div>
            </div>
            <div className="acts">
              <button className="btn txt" type="button">
                Delete group
              </button>
              <button className="btn lg" type="button">
                <PlusIcon />
                Split a bill
              </button>
            </div>
          </header>

          <section className="sec" aria-labelledby="rc-h">
            <div className="shead">
              <div>
                <h2 id="rc-h">Recent charges</h2>
                <p className="sub">From your linked card. Splitting a charge opens it as a list.</p>
              </div>
              <div className="seg inline" role="group" aria-label="Filter charges">
                <button className="sg on" type="button" aria-pressed="true">
                  All
                </button>
                <button className="sg" type="button" aria-pressed="false">
                  Not split
                </button>
                <button className="sg" type="button" aria-pressed="false">
                  Split
                </button>
              </div>
            </div>
            <ul className="rows">
              {charges.map((c, i) => (
                <li key={c.merchant} className="ch">
                  <span className="mic" aria-hidden="true">
                    {c.merchant.charAt(0)}
                  </span>
                  <div>
                    <b>{c.merchant}</b>
                    <small>{c.date}</small>
                  </div>
                  <span className="amt">{c.amount}</span>
                  <div className="stc">
                    {c.status === "none" ? (
                      <>
                        <button className="btn" type="button" popoverTarget={`split-${i}`}>
                          Split this charge
                        </button>
                        <SplitChooser id={`split-${i}`} charge={c} />
                      </>
                    ) : (
                      <span className={`pill ${c.status === "settled" ? "pn" : "pg"}`}>{c.label}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="sec" aria-labelledby="sl-h">
            <div className="shead">
              <div>
                <h2 id="sl-h">Shared lists</h2>
                <p className="sub">Open a list to assign items and see who owes what.</p>
              </div>
              <div className="inrow newlist">
                <label className="sr" htmlFor="nl">
                  New list name
                </label>
                <input id="nl" className="field" type="text" placeholder="New list name" />
                <button className="btn" type="button">
                  <PlusIcon />
                  New list
                </button>
              </div>
            </div>
            <ul className="rows">
              {lists.map((l) => (
                <li key={l.id}>
                  <Link className="lrow" href={`/list?id=${l.id}`} aria-label={`Open ${l.name}`}>
                    <span className="lic" aria-hidden="true">
                      <ListIcon />
                    </span>
                    <span className="lmain">
                      <b>{l.name}</b>
                      <small>{l.meta}</small>
                    </span>
                    <span className={`pill ${l.pillClass}`}>{l.pill}</span>
                    <span className={`lpos ${l.positionClass}`}>{l.position}</span>
                    <span className="amt">{l.total}</span>
                    <ChevronIcon />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}