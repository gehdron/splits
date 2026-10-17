/**
 * Splits app: Home (the dashboard), plain version.
 * Semantic HTML only. No styling. Add classes and CSS later (see CLAUDE.md).
 *
 * Money is stored in whole cents so totals never drift.
 * The derived numbers (owed to you, you owe, net) are computed in code, never typed in.
 * Sample data below gives: owed to you $63.80, you owe $21.60, net $42.20.
 */
import { useMemo, useState } from "react";

/* ------------------------------------------------------------------ types */

export type PersonId = string;

export interface Person {
  id: PersonId;
  name: string;
}

export interface Share {
  personId: PersonId;
  cents: number;
  paid: boolean; // the payer's own share counts as paid
}

export interface Bill {
  id: string;
  name: string;
  dateLabel: string; // "Today", "Yesterday", "Oct 12"
  paidBy: PersonId;
  totalCents: number;
  shares: Share[];
}

export interface PersonBalance {
  personId: PersonId;
  cents: number;
  billNames: string[];
}

export interface Ledger {
  owedToYouCents: number;
  youOweCents: number;
  netCents: number;
  owedToYou: PersonBalance[]; // people who owe you
  youOwe: PersonBalance[]; // people you owe
}

/* ------------------------------------------------------------ sample data */

export const ME: PersonId = "alex";

export const SAMPLE_PEOPLE: Person[] = [
  { id: "alex", name: "Alex" },
  { id: "maya", name: "Maya" },
  { id: "jay", name: "Jay" },
  { id: "sam", name: "Sam" },
];

export const SAMPLE_GROUPS: string[] = ["Apartment 4B", "Lisbon trip"];

export const SAMPLE_BILLS: Bill[] = [
  {
    id: "noodle-house",
    name: "Noodle House dinner",
    dateLabel: "Today",
    paidBy: "alex",
    totalCents: 14260,
    shares: [
      { personId: "alex", cents: 3360, paid: true },
      { personId: "maya", cents: 3820, paid: true },
      { personId: "jay", cents: 3410, paid: true },
      { personId: "sam", cents: 3670, paid: false },
    ],
  },
  {
    id: "costco-run",
    name: "Costco run",
    dateLabel: "Yesterday",
    paidBy: "maya",
    totalCents: 8640,
    shares: [
      { personId: "alex", cents: 2160, paid: false },
      { personId: "maya", cents: 2160, paid: true },
      { personId: "jay", cents: 2160, paid: true },
      { personId: "sam", cents: 2160, paid: true },
    ],
  },
  {
    id: "groceries",
    name: "Groceries",
    dateLabel: "Oct 12",
    paidBy: "alex",
    totalCents: 5420,
    shares: [
      { personId: "alex", cents: 1355, paid: true },
      { personId: "maya", cents: 1355, paid: true },
      { personId: "jay", cents: 1355, paid: false },
      { personId: "sam", cents: 1355, paid: false },
    ],
  },
  {
    id: "internet",
    name: "Internet",
    dateLabel: "Oct 1",
    paidBy: "jay",
    totalCents: 6000,
    shares: [
      { personId: "alex", cents: 1500, paid: true },
      { personId: "maya", cents: 1500, paid: true },
      { personId: "jay", cents: 1500, paid: true },
      { personId: "sam", cents: 1500, paid: true },
    ],
  },
];

/* -------------------------------------------------------------- the logic */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUSD(cents: number): string {
  return usd.format(cents / 100);
}

function addTo(list: PersonBalance[], personId: PersonId, cents: number, billName: string): void {
  const existing = list.find((entry) => entry.personId === personId);
  if (existing) {
    existing.cents += cents;
    existing.billNames.push(billName);
  } else {
    list.push({ personId, cents, billNames: [billName] });
  }
}

/** Owed to you = unpaid shares on bills you paid. You owe = your unpaid shares on bills others paid. */
export function computeLedger(bills: Bill[], meId: PersonId): Ledger {
  const owedToYou: PersonBalance[] = [];
  const youOwe: PersonBalance[] = [];

  for (const bill of bills) {
    if (bill.paidBy === meId) {
      for (const share of bill.shares) {
        if (share.personId !== meId && !share.paid) {
          addTo(owedToYou, share.personId, share.cents, bill.name);
        }
      }
    } else {
      const mine = bill.shares.find((share) => share.personId === meId);
      if (mine && !mine.paid) {
        addTo(youOwe, bill.paidBy, mine.cents, bill.name);
      }
    }
  }

  const owedToYouCents = owedToYou.reduce((sum, entry) => sum + entry.cents, 0);
  const youOweCents = youOwe.reduce((sum, entry) => sum + entry.cents, 0);
  return { owedToYouCents, youOweCents, netCents: owedToYouCents - youOweCents, owedToYou, youOwe };
}

/** "2 of 3 paid", "You owe" or "Settled". */
export function billStatus(bill: Bill, meId: PersonId): string {
  if (bill.paidBy === meId) {
    const others = bill.shares.filter((share) => share.personId !== meId);
    const paid = others.filter((share) => share.paid).length;
    return paid === others.length ? "Settled" : `${paid} of ${others.length} paid`;
  }
  const mine = bill.shares.find((share) => share.personId === meId);
  return mine && !mine.paid ? "You owe" : "Settled";
}

function headline(netCents: number): string {
  if (netCents > 0) return `You're owed ${formatUSD(netCents)}`;
  if (netCents < 0) return `You owe ${formatUSD(-netCents)}`;
  return "You're all square";
}

/* ------------------------------------------------------------- component */

const NAV = ["Home", "Bills", "Groups", "Need list", "Activity"] as const;

export interface HomeProps {
  bills?: Bill[];
  people?: Person[];
  groups?: string[];
  meId?: PersonId;
  userEmail?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onSplitBill?: () => void;
  onRemind?: (personId: PersonId) => void;
  onPay?: (personId: PersonId) => void;
  onOpenBill?: (billId: string) => void;
}

export default function Home({
  bills = SAMPLE_BILLS,
  people = SAMPLE_PEOPLE,
  groups = SAMPLE_GROUPS,
  meId = ME,
  userEmail = "alex@example.com",
  loading = false,
  error = false,
  onRetry,
  onSplitBill,
  onRemind,
  onPay,
  onOpenBill,
}: HomeProps) {
  const [reminded, setReminded] = useState<ReadonlySet<PersonId>>(new Set());

  const ledger = useMemo(() => computeLedger(bills, meId), [bills, meId]);
  const nameOf = (id: PersonId): string => people.find((p) => p.id === id)?.name ?? "Someone";
  const me = nameOf(meId);

  function remind(personId: PersonId): void {
    setReminded((prev) => new Set(prev).add(personId));
    onRemind?.(personId);
  }

  const sidebar = (
    <>
      <p>
        <strong>Splits</strong>
      </p>
      <nav aria-label="Main">
        <ul>
          {NAV.map((label) => (
            <li key={label}>
              <a href="#" aria-current={label === "Home" ? "page" : undefined}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <p>Your groups</p>
      <ul>
        {groups.map((group) => (
          <li key={group}>
            <a href="#">{group}</a>
          </li>
        ))}
      </ul>
      <p>
        {me}, {userEmail}
      </p>
    </>
  );

  if (loading) {
    return (
      <div>
        {sidebar}
        <main aria-busy="true">
          <h1>Loading your bills</h1>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {sidebar}
        <main>
          <h1>We couldn't load your bills.</h1>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </main>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div>
        {sidebar}
        <main>
          <h1>No bills yet.</h1>
          <button type="button" onClick={onSplitBill}>
            Split a bill
          </button>
        </main>
      </div>
    );
  }

  const total = ledger.owedToYouCents + ledger.youOweCents;

  return (
    <div>
      {sidebar}
      <main>
        <h1>{headline(ledger.netCents)}</h1>
        <p>
          {formatUSD(ledger.owedToYouCents)} owed to you, minus {formatUSD(ledger.youOweCents)} you owe.
        </p>

        {total > 0 && (
          <p>
            <progress
              value={ledger.owedToYouCents}
              max={total}
              aria-label={`Owed to you ${formatUSD(ledger.owedToYouCents)}, you owe ${formatUSD(ledger.youOweCents)}`}
            />
            <br />
            Owed to you {formatUSD(ledger.owedToYouCents)} | You owe {formatUSD(ledger.youOweCents)}
          </p>
        )}

        <p>
          <button type="button" onClick={onSplitBill}>
            Split a bill
          </button>
        </p>

        {ledger.owedToYou.length > 0 && (
          <section aria-labelledby="owed-heading">
            <h2 id="owed-heading">Owed to you: {formatUSD(ledger.owedToYouCents)}</h2>
            <ul>
              {ledger.owedToYou.map((entry) => (
                <li key={entry.personId}>
                  {nameOf(entry.personId)}, {formatUSD(entry.cents)}. {entry.billNames.join(", ")}.{" "}
                  <button
                    type="button"
                    disabled={reminded.has(entry.personId)}
                    onClick={() => remind(entry.personId)}
                  >
                    {reminded.has(entry.personId) ? "Sent" : "Remind"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {ledger.youOwe.length > 0 && (
          <section aria-labelledby="owe-heading">
            <h2 id="owe-heading">You owe: {formatUSD(ledger.youOweCents)}</h2>
            <ul>
              {ledger.youOwe.map((entry) => (
                <li key={entry.personId}>
                  {nameOf(entry.personId)}, {formatUSD(entry.cents)}. {entry.billNames.join(", ")}.{" "}
                  <button type="button" onClick={() => onPay?.(entry.personId)}>
                    Pay
                  </button>{" "}
                  Apple Pay or card.
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="bills-heading">
          <h2 id="bills-heading">Recent bills</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Bill</th>
                <th scope="col">Paid by</th>
                <th scope="col">Total</th>
                <th scope="col">Your share</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const myShare = bill.shares.find((share) => share.personId === meId);
                return (
                  <tr key={bill.id}>
                    <td>
                      <a
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          onOpenBill?.(bill.id);
                        }}
                      >
                        {bill.name}
                      </a>
                      , {bill.dateLabel}
                    </td>
                    <td>{bill.paidBy === meId ? "You" : nameOf(bill.paidBy)}</td>
                    <td>{formatUSD(bill.totalCents)}</td>
                    <td>{myShare ? formatUSD(myShare.cents) : "Not in this bill"}</td>
                    <td>{billStatus(bill, meId)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
