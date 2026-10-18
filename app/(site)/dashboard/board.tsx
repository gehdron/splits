"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { rememberedChargeIds, releaseListCharge, rememberListCharge, replaceRememberedChargeIds } from "@/lib/split-charges";
import { exitGroup } from "./actions";
import { DashSidebar } from "./sidebar";
import type { DashboardData } from "./types";

type Charge = {
  id: string;
  merchant: string;
  date: string;
  amount: string;
  status: "none" | "split" | "settled";
  label?: string;
};

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
const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
  </svg>
);

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
  const [suggestingName, setSuggestingName] = useState(false);
  const [sharedLists, setSharedLists] = useState<{ id: string; name: string; itemCount: number }[] | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [deleteListError, setDeleteListError] = useState("");
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [remembered, setRemembered] = useState<Set<string>>(new Set());
  const [chargesNote, setChargesNote] = useState("");
  const [bankLinked, setBankLinked] = useState<boolean | null>(null);
  const listNameInput = useRef<HTMLInputElement>(null);
  const creatingRef = useRef(false);
  const [exitState, exitAction, exitPending] = useActionState(exitGroup, undefined);

  function openNewListScanner() {
    newListDialog.current?.close();
    const query = group
      ? `?newList=1&group=${encodeURIComponent(group.id)}`
      : "?newList=1";
    router.push(`/dashboard/item-by-item${query}`);
  }

  function resetNewList() {
    // A re-render can close the dialog while create is still running. Keep the name step up.
    if (creatingRef.current) {
      requestAnimationFrame(() => {
        if (!creatingRef.current) return;
        const dialog = newListDialog.current;
        if (dialog && !dialog.open) dialog.showModal();
      });
      return;
    }
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

  async function suggestBlankListName() {
    setSuggestingName(true);
    setListError("");
    try {
      const res = await fetch("/api/suggest-list-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentName: listName }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Gemini could not suggest a list name.";
        throw new Error(message);
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "name" in data &&
        typeof data.name === "string" &&
        data.name.trim()
      ) {
        const suggested = data.name.trim();
        setListName(suggested);
        if (listNameInput.current) listNameInput.current.value = suggested;
      } else {
        throw new Error("Gemini returned an invalid list name.");
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Could not suggest a name.");
    } finally {
      setSuggestingName(false);
    }
  }

  async function createBlankList(event?: React.FormEvent) {
    event?.preventDefault();
    if (creatingRef.current) return;
    const name = (listNameInput.current?.value ?? listName).trim();
    if (!name) {
      setListError("Every list needs a name.");
      listNameInput.current?.focus();
      return;
    }
    creatingRef.current = true;
    setCreatingList(true);
    setListError("");
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; name?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        setNamingList(true);
        setListError(body?.error || "The list could not be created.");
        const dialog = newListDialog.current;
        if (dialog && !dialog.open) dialog.showModal();
        return;
      }
      const created = { id: body.id, name: body.name || name, itemCount: 0 };
      setSharedLists((current) => [created, ...(current ?? []).filter((list) => list.id !== created.id)]);
      creatingRef.current = false;
      newListDialog.current?.close();
      router.push(`/list?id=${encodeURIComponent(body.id)}`);
    } catch {
      setListError("The list could not be created.");
    } finally {
      creatingRef.current = false;
      setCreatingList(false);
    }
  }

  useEffect(() => {
    if (!namingList) return;
    listNameInput.current?.focus();
  }, [namingList]);

  useEffect(() => {
    let cancel = false;
    const params = new URLSearchParams(window.location.search);
    const linkedList = params.get("list");
    const linkedCharge = params.get("charge");
    if (linkedList && linkedCharge) {
      rememberListCharge(linkedList, linkedCharge);
      params.delete("charge");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }
    (async () => {
      const res = await fetch("/api/plaid/transactions");
      const body = (await res.json().catch(() => null)) as {
        charges?: Charge[];
        linked?: boolean;
        error?: string;
        chargeSplitsReady?: boolean;
      } | null;
      if (cancel) return;
      const loaded = Array.isArray(body?.charges) ? body.charges : [];
      if (body?.chargeSplitsReady) {
        const ids = loaded.filter((charge) => charge.status !== "none").map((charge) => charge.id);
        replaceRememberedChargeIds(ids);
        setRemembered(new Set(ids));
      } else {
        setRemembered(new Set(rememberedChargeIds()));
      }
      setBankLinked(body?.linked !== false);
      setCharges(loaded);
      setChargesNote(body?.error ?? "");
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await fetch("/api/lists");
      if (!res.ok || cancel) return;
      const rows = (await res.json()) as { id: string; name: string; itemCount: number }[];
      if (!cancel && Array.isArray(rows)) setSharedLists(rows);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function removeDashList(listId: string, name: string) {
    if (deletingListId) return;
    if (!window.confirm(`Delete ${name}? A bank charge attached to it can be split again.`)) return;
    setDeletingListId(listId);
    setDeleteListError("");
    try {
      const response = await fetch(`/api/lists/${encodeURIComponent(listId)}`, { method: "DELETE" });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "The list could not be deleted.";
        throw new Error(message);
      }
      const serverCharge =
        typeof result === "object" && result !== null && "chargeId" in result && typeof result.chargeId === "string"
          ? result.chargeId
          : null;
      const chargeId = releaseListCharge(listId, serverCharge);
      if (chargeId) {
        setRemembered((current) => {
          const next = new Set(current);
          next.delete(chargeId);
          return next;
        });
        setCharges((current) =>
          current?.map((charge) =>
            charge.id === chargeId && charge.status === "split" ? { ...charge, status: "none" } : charge,
          ) ?? current,
        );
      }
      setRemovedIds((current) => [...current, listId]);
      setSharedLists((current) => current?.filter((list) => list.id !== listId) ?? current);
      router.refresh();
    } catch (error) {
      setDeleteListError(error instanceof Error ? error.message : "The list could not be deleted.");
    } finally {
      setDeletingListId(null);
    }
  }

  function openSplit(charge: Charge) {
    setSplitGroupId(null);
    setSplitTarget(charge);
  }

  // Both split pages show which charge it's splitting, so they get the charge too.
  const splitQuery = new URLSearchParams(splitGroupId ? { group: splitGroupId } : {});
  if (splitTarget) {
    splitQuery.set("merchant", splitTarget.merchant);
    splitQuery.set("amount", splitTarget.amount);
    splitQuery.set("date", splitTarget.date);
    splitQuery.set("charge", splitTarget.id);
  }
  const splitQueryString = splitQuery.toString();
  const splitSuffix = splitQueryString ? `?${splitQueryString}` : "";
  const itemSplitHref = `/dashboard/item-by-item${splitSuffix}`;
  const evenSplitHref = `/dashboard/even${splitSuffix}`;

  useEffect(() => {
    const dialog = splitDialog.current;
    if (!splitTarget || !dialog || dialog.open) return;
    dialog.showModal();
  }, [splitTarget]);

  const markedCharges = (charges ?? []).map((charge) =>
    charge.status === "none" && remembered.has(charge.id) ? { ...charge, status: "split" as const } : charge,
  );
  const visibleCharges = markedCharges.filter((charge) => {
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
                    <p className="sub">
                      {bankLinked === false ? (
                        <>
                          Link your bank to see recent charges. <Link href="/account">Go to account</Link>
                        </>
                      ) : bankLinked ? (
                        <>
                          From your linked bank. Choose item by item or an even split. <Link href="/account">Relink bank</Link>
                        </>
                      ) : (
                        "From your linked bank. Choose item by item or an even split."
                      )}
                    </p>
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
                {charges === null ? (
                  <p className="empty">Loading charges…</p>
                ) : visibleCharges.length === 0 ? (
                  <p className="empty">
                    {bankLinked === false
                      ? "Recent charges show up here after your bank is linked."
                      : chargesNote
                        ? chargesNote
                        : chargeFilter === "all"
                          ? "No recent charges on that bank."
                          : "No charges in this filter."}
                  </p>
                ) : (
                <ul className="rows">
                  {visibleCharges.map((charge) => (
                    <li key={charge.id} className="ch">
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
                          <button className="btn" type="button" disabled>
                            Already split
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                )}
              </section>

              <section className="sec" aria-labelledby="sl-h">
                <div className="shead">
                  <div>
                    <h2 id="sl-h">Shared lists</h2>
                    <p className="sub">Only you and the people added to a list can see it. Open a list to add or assign items.</p>
                  </div>
                  <button className="btn" type="button" onClick={() => newListDialog.current?.showModal()}>
                    <PlusIcon />
                    New list
                  </button>
                </div>
                {deleteListError ? <p className="err">{deleteListError}</p> : null}
                {sharedLists && sharedLists.length > 0 ? (
                  <ul className="rows">
                    {sharedLists.map((list) => (
                      <li key={list.id}>
                        <div className="list-line">
                          <Link className="lrow slist" href={`/list?id=${encodeURIComponent(list.id)}`}>
                            <span className="lic" aria-hidden="true">
                              {(list.name.trim().charAt(0) || "S").toUpperCase()}
                            </span>
                            <span className="lmain">
                              <b>{list.name}</b>
                              <small>{list.itemCount === 1 ? "1 item" : `${list.itemCount} items`}</small>
                              {list.itemCount === 0 ? (
                                <small className="list-empty-hint">No items yet. Open this list to add items.</small>
                              ) : null}
                            </span>
                            <span className="chev">
                              <Icon d="M9 6l6 6-6 6" />
                            </span>
                          </Link>
                          <button
                            className="xb xlist"
                            type="button"
                            aria-label={`Delete ${list.name}`}
                            disabled={deletingListId === list.id}
                            onClick={() => void removeDashList(list.id, list.name)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">
                    {sharedLists
                      ? data.loadError
                        ? "Shared lists could not be loaded."
                        : "No lists yet."
                      : "Loading lists…"}
                  </p>
                )}
                {visibleLists.some((list) => !removedIds.includes(list.id)) ? (
                  <ul className="rows">
                    {visibleLists.filter((list) => !removedIds.includes(list.id)).map((list) => {
                      return (
                        <li key={list.id}>
                          <div className="list-line">
                            <Link className="lrow slist" href={`/list?id=${encodeURIComponent(list.id)}`}>
                              <span className="lic" aria-hidden="true">
                                {list.name.trim().charAt(0).toUpperCase() || "L"}
                              </span>
                              <span className="lmain">
                                <b>{list.name}</b>
                                <small>
                                  {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                                  {" · "}
                                  {money(list.totalCents)}
                                </small>
                                {list.itemCount === 0 ? (
                                  <small className="list-empty-hint">No items yet. Open this list to add items.</small>
                                ) : null}
                              </span>
                              <span className="chev">
                                <Icon d="M9 6l6 6-6 6" />
                              </span>
                            </Link>
                            <button
                              className="xb xlist"
                              type="button"
                              aria-label={`Delete ${list.name}`}
                              disabled={deletingListId === list.id}
                              onClick={() => void removeDashList(list.id, list.name)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
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
                    <p>Every list needs a name. Type one or let AI suggest one.</p>
                    <div>
                      <label className="lbl" htmlFor="new-list-name">
                        List name
                      </label>
                      <div className="inrow" style={{ gap: 8 }}>
                        <input
                          ref={listNameInput}
                          id="new-list-name"
                          className="field"
                          value={listName}
                          maxLength={80}
                          placeholder="e.g. Apartment Groceries"
                          required
                          onChange={(event) => {
                            setListName(event.target.value);
                            setListError("");
                          }}
                        />
                        <button
                          type="button"
                          className="btn line"
                          disabled={creatingList || suggestingName}
                          onClick={suggestBlankListName}
                        >
                          {suggestingName ? "Suggesting…" : "✨ AI suggest"}
                        </button>
                      </div>
                    </div>
                    {listError ? <p className="err">{listError}</p> : null}
                    <div className="pop-acts">
                      <button className="btn" type="submit" disabled={creatingList || !listName.trim()}>
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
