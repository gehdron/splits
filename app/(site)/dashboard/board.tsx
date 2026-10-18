"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "../auth/actions";
import { addSavedFriend, createGroup, exitGroup, removeFriend, saveFriend } from "./actions";
import type { DashboardData } from "./types";

const charges = [
  { merchant: "Noodle House", date: "Today", amount: "$142.60", status: "split" as const, label: "2 of 3 paid" },
  { merchant: "Uber", date: "Yesterday", amount: "$23.40", status: "none" as const },
  { merchant: "Trader Joe's", date: "Oct 12", amount: "$54.20", status: "split" as const, label: "1 of 3 paid" },
  { merchant: "Amazon", date: "Oct 10", amount: "$38.97", status: "none" as const },
  { merchant: "Comcast Internet", date: "Oct 1", amount: "$60.00", status: "settled" as const, label: "Settled" },
];

type Charge = (typeof charges)[number];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "?").charAt(0);
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "").charAt(0) : "";
  return (first + last).toUpperCase();
}

function colorClass(name: string, mine: boolean): string {
  if (mine) return "p0";
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `p${1 + (h % 3)}`;
}

function Avatar({ name, mine = false }: { name: string; mine?: boolean }) {
  return (
    <span className={`av ${colorClass(name, mine)}`} title={mine ? `${name} (you)` : name}>
      {initials(name)}
    </span>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />;
const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />;
const LogoMark = () => (
  <svg width="32" height="32" viewBox="3 3 60 60" aria-hidden="true">
    <g strokeWidth="6" strokeLinejoin="round">
      <polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" />
      <polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" />
    </g>
  </svg>
);

export function Board({ data }: { data: DashboardData }) {
  const router = useRouter();
  const search = useSearchParams();
  const newListDialog = useRef<HTMLDialogElement>(null);
  const splitDialog = useRef<HTMLDialogElement>(null);
  const [splitTarget, setSplitTarget] = useState<Charge | null>(null);
  const [splitGroupId, setSplitGroupId] = useState<string | null>(null);
  const selected = search.get("group");
  const group = data.groups.find((entry) => entry.id === selected) ?? data.groups[0] ?? null;
  const members = data.members.filter((member) => member.groupId === group?.id);
  const [friendBy, setFriendBy] = useState<"phone" | "email">("phone");
  const [chargeFilter, setChargeFilter] = useState<"all" | "none" | "split">("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [createState, createAction, createPending] = useActionState(createGroup, undefined);
  const [friendState, friendAction, friendPending] = useActionState(saveFriend, undefined);
  const [removeState, removeAction, removePending] = useActionState(removeFriend, undefined);
  const [savedState, savedAction, savedPending] = useActionState(addSavedFriend, undefined);
  const [exitState, exitAction, exitPending] = useActionState(exitGroup, undefined);

  function openList(scan: boolean) {
    newListDialog.current?.close();
    router.push(scan ? "/list?scan=1" : "/list");
  }

  function openSplit(charge: Charge) {
    setSplitGroupId(null);
    setSplitTarget(charge);
  }

  const groupQuery = splitGroupId ? `?group=${encodeURIComponent(splitGroupId)}` : "";
  // The scanner shows which charge it's splitting, so it gets the charge too.
  const itemQuery = new URLSearchParams(splitGroupId ? { group: splitGroupId } : {});
  if (splitTarget) {
    itemQuery.set("merchant", splitTarget.merchant);
    itemQuery.set("amount", splitTarget.amount);
    itemQuery.set("date", splitTarget.date);
  }
  const itemQueryString = itemQuery.toString();
  const itemSplitHref = `/dashboard/item-by-item${itemQueryString ? `?${itemQueryString}` : ""}`;
  const evenSplitHref = `/dashboard/even${groupQuery}`;

  useEffect(() => {
    const dialog = splitDialog.current;
    if (!splitTarget || !dialog || dialog.open) return;
    dialog.showModal();
  }, [splitTarget]);

  const visibleCharges = charges.filter((charge) => {
    if (chargeFilter === "all") return true;
    if (chargeFilter === "none") return charge.status === "none";
    return charge.status !== "none";
  });

  return (
    <div className="db">
      <aside className="side">
        <div className="brand">
          <LogoMark />
          <span>Splits</span>
        </div>

        <section aria-labelledby="g-h">
          <h2 className="sh" id="g-h">
            Your groups
          </h2>
          {data.groups.length === 0 ? <p className="sub">No group yet.</p> : null}
          <ul className="groups">
            {data.groups.map((entry) => {
              const count = data.members.filter((member) => member.groupId === entry.id).length;
              const on = entry.id === group?.id;
              return (
                <li key={entry.id}>
                  <a className={`gbtn${on ? " on" : ""}`} href={`/dashboard?group=${entry.id}`} aria-current={on ? "page" : undefined}>
                    <span>{entry.name}</span>
                    <span className="cnt">{count}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <form action={createAction}>
            <label className="lbl" htmlFor="ng">
              New group
            </label>
            <div className="inrow">
              <input id="ng" className="field" name="name" type="text" placeholder="Group name" required minLength={2} />
              <button className="btn" type="submit" disabled={createPending}>
                {createPending ? "…" : "Create"}
              </button>
            </div>
            {createState?.error ? <p className="err">{createState.error}</p> : null}
          </form>
        </section>

        <section aria-labelledby="f-h">
          <h2 className="sh" id="f-h">
            People
          </h2>
          {data.friendsReady ? null : <p className="sub">Run supabase/friends.sql in the Supabase SQL editor to save contacts.</p>}
          <ul className="friends">
            {data.friends.map((friend) => {
              const inGroup = members.some((member) => member.userId === friend.id);
              return (
                <li key={friend.id} className="fr">
                  <Avatar name={friend.name} />
                  <div>
                    <b>{friend.name}</b>
                    <small>{inGroup && group ? `In ${group.name}` : friend.phone}</small>
                  </div>
                  {group?.role === "owner" ? (
                    <form action={savedAction}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="friendId" value={friend.id} />
                      <button className="mini" type="submit" disabled={inGroup || savedPending}>
                        {inGroup ? "Added" : "Add"}
                      </button>
                    </form>
                  ) : (
                    <span className="mini">{inGroup ? "Added" : ""}</span>
                  )}
                  <form action={removeAction}>
                    <input type="hidden" name="friendId" value={friend.id} />
                    {group ? <input type="hidden" name="groupId" value={group.id} /> : null}
                    <button className="xb" type="submit" aria-label={`Remove ${friend.name}`} disabled={removePending}>
                      <CloseIcon />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
          {removeState?.error ? <p className="err">{removeState.error}</p> : null}
          {savedState?.error ? <p className="err">{savedState.error}</p> : null}
          <form action={friendAction}>
            {group ? <input type="hidden" name="groupId" value={group.id} /> : null}
            <input type="hidden" name="by" value={friendBy} />
            <p className="lbl">Save a friend</p>
            <div className="seg" role="group" aria-label="Save a friend by">
              <button className={`sg${friendBy === "phone" ? " on" : ""}`} type="button" aria-pressed={friendBy === "phone"} onClick={() => setFriendBy("phone")}>
                Phone
              </button>
              <button className={`sg${friendBy === "email" ? " on" : ""}`} type="button" aria-pressed={friendBy === "email"} onClick={() => setFriendBy("email")}>
                Email
              </button>
            </div>
            <label className="lbl" htmlFor="friend-contact">
              {friendBy === "phone" ? "Phone number" : "Email"}
            </label>
            <input
              id="friend-contact"
              key={friendBy}
              className="field"
              name="contact"
              type={friendBy === "phone" ? "tel" : "email"}
              autoComplete={friendBy === "phone" ? "tel" : "email"}
              required
            />
            {friendState?.error ? <p className="err">{friendState.error}</p> : null}
            <button className="btn full" type="submit" disabled={friendPending}>
              <PlusIcon />
              {friendPending ? "Saving…" : "Save friend"}
            </button>
          </form>
        </section>

        <div className="me">
          <span className="av lgav p0">{initials(data.me.name)}</span>
          <div>
            <b>{data.me.name}</b>
            <small>{data.me.email}</small>
          </div>
          <form action={signOut}>
            <button className="btn txt" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="main">
        <div className="wrap">
          {data.loadError ? (
            <>
              <h1>We couldn&apos;t load your groups.</h1>
              <p>{data.loadError}</p>
            </>
          ) : group ? (
            <header className="top">
                <div>
                  <h1>{group.name}</h1>
                  <div className="meta">
                    <div className="stack">
                      {members.map((member) => (
                        <Avatar key={member.id} name={member.name} mine={member.userId === data.me.id} />
                      ))}
                    </div>
                    <span>
                      {group.role === "owner" ? "You own this group." : "You are a member of this group."} {members.length} people.
                    </span>
                  </div>
                </div>
                <div className="acts">
                  {confirmDelete ? (
                    <form action={exitAction}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <p className="sub">{group.role === "owner" ? "Delete this group for everyone?" : "Leave this group?"}</p>
                      {exitState?.error ? <p className="err">{exitState.error}</p> : null}
                      <button className="btn" type="submit" disabled={exitPending}>
                        {exitPending ? "Working…" : group.role === "owner" ? "Delete group" : "Leave group"}
                      </button>
                      <button className="btn txt" type="button" onClick={() => setConfirmDelete(false)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button className="btn txt" type="button" onClick={() => setConfirmDelete(true)}>
                      {group.role === "owner" ? "Delete group" : "Leave group"}
                    </button>
                  )}
                </div>
              </header>
          ) : null}

              <section className="sec" aria-labelledby="rc-h">
                <div className="shead">
                  <div>
                    <h2 id="rc-h">Recent charges</h2>
                    <p className="sub">Sample charges. Choose item by item or an even split.</p>
                  </div>
                  <div className="seg inline" role="group" aria-label="Filter charges">
                    {(
                      [
                        ["all", "All"],
                        ["none", "Not split"],
                        ["split", "Split"],
                      ] as const
                    ).map(([value, label]) => (
                      <button key={value} className={`sg${chargeFilter === value ? " on" : ""}`} type="button" aria-pressed={chargeFilter === value} onClick={() => setChargeFilter(value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="rows">
                  {visibleCharges.map((charge) => (
                    <li key={charge.merchant} className="ch">
                      <span className="mic" aria-hidden="true">
                        {charge.merchant.charAt(0)}
                      </span>
                      <div>
                        <b>{charge.merchant}</b>
                        <small>{charge.date}</small>
                      </div>
                      <span className="amt">{charge.amount}</span>
                      <div className="stc">
                        {charge.status === "none" ? (
                          <button className="btn" type="button" onClick={() => openSplit(charge)}>
                            Split this charge
                          </button>
                        ) : (
                          <span className={`pill ${charge.status === "settled" ? "pn" : "pg"}`}>{charge.label}</span>
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
                    <p className="sub">A new list opens on its own page, blank or from a receipt.</p>
                  </div>
                  <button className="btn" type="button" onClick={() => newListDialog.current?.showModal()}>
                    <PlusIcon />
                    New list
                  </button>
                </div>
              </section>
              <dialog
                ref={splitDialog}
                className="pop"
                aria-labelledby="split-how"
                onClose={() => {
                  setSplitTarget(null);
                  setSplitGroupId(null);
                }}
              >
                <form method="dialog">
                  <h2 id="split-how">How do you want to split it?</h2>
                  <p>
                    {splitTarget ? `${splitTarget.merchant}, ${splitTarget.amount}. ` : null}
                    Assign a group if you want. You can also split it on its own.
                  </p>
                  {data.groups.length > 0 ? (
                    <fieldset className="split-groups">
                      <legend className="lbl">Group</legend>
                      <label className={`gpick${splitGroupId === null ? " on" : ""}`}>
                        <input type="radio" name="split-group" value="" checked={splitGroupId === null} onChange={() => setSplitGroupId(null)} />
                        No group
                      </label>
                      {data.groups.map((entry) => (
                        <label key={entry.id} className={`gpick${splitGroupId === entry.id ? " on" : ""}`}>
                          <input
                            type="radio"
                            name="split-group"
                            value={entry.id}
                            checked={splitGroupId === entry.id}
                            onChange={() => setSplitGroupId(entry.id)}
                          />
                          {entry.name}
                        </label>
                      ))}
                    </fieldset>
                  ) : null}
                  <div className="pop-acts">
                    <Link className="choice" href={itemSplitHref}>
                      <span>
                        <b>Item by item</b>
                        <small>Scan the receipt and give each item to whoever had it.</small>
                      </span>
                      <Icon d="M9 6l6 6-6 6" />
                    </Link>
                    <Link className="choice" href={evenSplitHref}>
                      <span>
                        <b>Split evenly</b>
                        <small>Everyone pays the same share{splitTarget ? ` of ${splitTarget.amount}` : ""}.</small>
                      </span>
                      <Icon d="M9 6l6 6-6 6" />
                    </Link>
                  </div>
                  <button className="btn txt" type="submit">
                    Cancel
                  </button>
                </form>
              </dialog>
              <dialog ref={newListDialog} className="pop">
                <form method="dialog">
                  <h2>New list</h2>
                  <p>Start a blank list, or scan a receipt onto a new one.</p>
                  <div className="pop-acts">
                    <button className="btn" type="button" onClick={() => openList(false)}>
                      Blank list
                    </button>
                    <button className="btn line" type="button" onClick={() => openList(true)}>
                      Scan a receipt
                    </button>
                  </div>
                  <button className="btn txt" type="submit">
                    Cancel
                  </button>
                </form>
              </dialog>
        </div>
      </main>
    </div>
  );
}
