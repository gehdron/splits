"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { exitGroup } from "./actions";
import { DashboardListAssistant } from "./list-assistant";
import { DashSidebar } from "./sidebar";
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

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

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
  const visibleLists = data.lists.filter(
    (entry) => !group || entry.groupId === group.id,
  );
  const [chargeFilter, setChargeFilter] = useState<"all" | "none" | "split">("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [namingList, setNamingList] = useState(false);
  const [listName, setListName] = useState("");
  const [listError, setListError] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const listNameInput = useRef<HTMLInputElement>(null);
  const [exitState, exitAction, exitPending] = useActionState(exitGroup, undefined);

  function openNewListScanner() {
    newListDialog.current?.close();
    const query = group
      ? `?newList=1&group=${encodeURIComponent(group.id)}`
      : "?newList=1";
    router.push(`/dashboard/item-by-item${query}`);
  }

  function resetNewList() {
    setNamingList(false);
    setListName("");
    setListError("");
    setCreatingList(false);
  }

  function chooseBlankList() {
    setNamingList(true);
    // Replacing the dialog's buttons can close it. Reopen on the name step.
    requestAnimationFrame(() => {
      const dialog = newListDialog.current;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  async function createBlankList(event?: React.FormEvent) {
    event?.preventDefault();
    if (creatingList) return;
    setCreatingList(true);
    setListError("");
    const name = listName.trim() || "Shared list";
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setCreatingList(false);
      setListError("The list could not be created.");
      return;
    }
    const list = (await res.json()) as { id: string };
    router.push(`/list?id=${encodeURIComponent(list.id)}`);
    newListDialog.current?.close();
  }

  useEffect(() => {
    if (!namingList) return;
    listNameInput.current?.focus();
  }, [namingList]);

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
      <DashSidebar data={data} />

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
                    <p className="sub">Open a list’s AI bot to assign its items by chat.</p>
                  </div>
                  <button className="btn" type="button" onClick={() => newListDialog.current?.showModal()}>
                    <PlusIcon />
                    New list
                  </button>
                </div>
                {visibleLists.length > 0 ? (
                  <ul className="dashboard-list-rows">
                    {visibleLists.map((list) => {
                      const listItems = data.items.filter(
                        (item) => item.listId === list.id,
                      );
                      return (
                        <li className="dashboard-list-row" key={list.id}>
                          <span className="dashboard-list-icon" aria-hidden="true">
                            {list.name.trim().charAt(0).toUpperCase() || "L"}
                          </span>
                          <div className="dashboard-list-info">
                            <b>{list.name}</b>
                            <small>
                              {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                              {" · "}
                              {money(list.totalCents)}
                            </small>
                          </div>
                          <DashboardListAssistant
                            list={list}
                            items={listItems}
                            members={members}
                            currentUser={data.me.name}
                            canAssign={group?.role === "owner"}
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="empty">
                    {data.loadError
                      ? "Shared lists could not be loaded."
                      : group
                        ? "No shared lists in this group yet."
                        : "Create a group to start a shared list."}
                  </p>
                )}
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
                    <div>
                      <label className="lbl" htmlFor="split-group">
                        Group
                      </label>
                      <select
                        id="split-group"
                        className="field"
                        value={splitGroupId ?? ""}
                        onChange={(event) => setSplitGroupId(event.target.value || null)}
                      >
                        <option value="">No group</option>
                        {data.groups.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </div>
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
              <dialog ref={newListDialog} className="pop" onClose={resetNewList}>
                {namingList ? (
                  <form onSubmit={createBlankList}>
                    <h2>Name this list</h2>
                    <p>Leave it blank to keep the name Shared list.</p>
                    <div>
                      <label className="lbl" htmlFor="new-list-name">
                        List name
                      </label>
                      <input
                        ref={listNameInput}
                        id="new-list-name"
                        className="field"
                        value={listName}
                        placeholder="Shared list"
                        onChange={(event) => setListName(event.target.value)}
                      />
                    </div>
                    {listError ? <p className="err">{listError}</p> : null}
                    <div className="pop-acts">
                      <button className="btn" type="submit" disabled={creatingList}>
                        {creatingList ? "Creating…" : "Create list"}
                      </button>
                      <button className="btn txt" type="button" onClick={() => setNamingList(false)} disabled={creatingList}>
                        Back
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="pop-body">
                    <h2>New list</h2>
                    <p>Start a blank list, or scan a receipt onto a new one.</p>
                    <div className="pop-acts">
                      <button className="btn" type="button" onClick={chooseBlankList}>
                        Blank list
                      </button>
                      <button
                        className="btn line"
                        type="button"
                        onClick={openNewListScanner}
                      >
                        Scan a receipt
                      </button>
                    </div>
                    <button className="btn txt" type="button" onClick={() => newListDialog.current?.close()}>
                      Cancel
                    </button>
                  </div>
                )}
              </dialog>
        </div>
      </main>
    </div>
  );
}
