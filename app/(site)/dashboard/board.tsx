"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { exitGroup } from "./actions";
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

export function Board({ data }: { data: DashboardData }) {
  const router = useRouter();
  const search = useSearchParams();
  const newListDialog = useRef<HTMLDialogElement>(null);
  const splitDialog = useRef<HTMLDialogElement>(null);
  const newListReceiptInput = useRef<HTMLInputElement>(null);
  const [splitTarget, setSplitTarget] = useState<Charge | null>(null);
  const [splitGroupId, setSplitGroupId] = useState<string | null>(null);
  const selected = search.get("group");
  const group = data.groups.find((entry) => entry.id === selected) ?? data.groups[0] ?? null;
  const members = data.members.filter((member) => member.groupId === group?.id);
  const [chargeFilter, setChargeFilter] = useState<"all" | "none" | "split">("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [namingList, setNamingList] = useState(false);
  const [listName, setListName] = useState("");
  const [listError, setListError] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const listNameInput = useRef<HTMLInputElement>(null);
  const [exitState, exitAction, exitPending] = useActionState(exitGroup, undefined);

  function resetNewList() {
    setNamingList(false);
    setListName("");
    setListError("");
    setCreatingList(false);
  }

  function startNewListReceiptScan() {
    setListError("");
    newListReceiptInput.current?.click();
  }

  async function scanReceiptToNewList(file: File) {
    const isPdf = file.type === "application/pdf";
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!isPdf && !isImage) {
      setListError("Choose a JPEG, PNG, WebP, or PDF receipt.");
      return;
    }
    if (file.size > (isPdf ? 4 : 8) * 1024 * 1024) {
      setListError(
        isPdf
          ? "PDF receipts must be 4 MB or smaller."
          : "Image receipts must be 8 MB or smaller."
      );
      return;
    }

    setCreatingList(true);
    setListError("");
    try {
      let parseResponse: Response;
      if (isPdf) {
        const formData = new FormData();
        formData.append("receiptFile", file);
        parseResponse = await fetch("/api/parse-receipt", {
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
        parseResponse = await fetch("/api/parse-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl }),
        });
      }

      const parsed: unknown = await parseResponse.json();
      if (!parseResponse.ok) {
        throw new Error(
          typeof parsed === "object" &&
            parsed !== null &&
            "error" in parsed &&
            typeof parsed.error === "string"
            ? parsed.error
            : "The receipt could not be read."
        );
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("items" in parsed) ||
        !Array.isArray(parsed.items)
      ) {
        throw new Error("The receipt parser returned an invalid result.");
      }

      const items = parsed.items.flatMap((item) => {
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
        const description = item.description.trim();
        const lineCents = Math.round(
          Number(item.amount.replace(/[^0-9.]/g, "")) * 100
        );
        if (!description || !Number.isFinite(lineCents) || lineCents < 0) {
          return [];
        }
        const quantityText =
          "quantity" in item && typeof item.quantity === "string"
            ? item.quantity
            : "";
        const parsedQuantity = Math.round(Number(quantityText));
        const quantity =
          Number.isInteger(parsedQuantity) && parsedQuantity >= 1
            ? parsedQuantity
            : 1;
        const exactUnitPrice = lineCents % quantity === 0;
        return [
          {
            name:
              exactUnitPrice || quantity === 1
                ? description
                : `${description} x${quantity}`,
            quantity: exactUnitPrice ? quantity : 1,
            priceCents: exactUnitPrice ? lineCents / quantity : lineCents,
          },
        ];
      });
      if (items.length === 0) {
        throw new Error("No receipt items were found. Upload a clearer receipt.");
      }

      const listResponse = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: listName.trim() || "Shared list" }),
      });
      const listResult: unknown = await listResponse.json();
      if (
        !listResponse.ok ||
        typeof listResult !== "object" ||
        listResult === null ||
        !("id" in listResult) ||
        typeof listResult.id !== "string"
      ) {
        throw new Error("The new list could not be created.");
      }

      const saveResponse = await fetch(
        `/api/lists/${encodeURIComponent(listResult.id)}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(items),
        }
      );
      if (!saveResponse.ok) {
        const saveResult: unknown = await saveResponse.json();
        throw new Error(
          typeof saveResult === "object" &&
            saveResult !== null &&
            "error" in saveResult &&
            typeof saveResult.error === "string"
            ? saveResult.error
            : "The receipt items could not be added to the new list."
        );
      }

      newListDialog.current?.close();
      router.push(`/list?id=${encodeURIComponent(listResult.id)}`);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : "The receipt could not be added. Try again."
      );
    } finally {
      setCreatingList(false);
    }
  }

  function handleNewListReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void scanReceiptToNewList(file);
  }

  async function createBlankList(event: React.FormEvent) {
    event.preventDefault();
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
    newListDialog.current?.close();
    router.push(`/list?id=${encodeURIComponent(list.id)}`);
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
              <dialog ref={newListDialog} className="pop" onClose={resetNewList}>
                <input
                  ref={newListReceiptInput}
                  className="sr"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  aria-label="Choose a receipt image or PDF"
                  disabled={creatingList}
                  onChange={handleNewListReceipt}
                />
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
                  <form method="dialog">
                    <h2>New list</h2>
                    <p>Start a blank list, or scan a receipt onto a new one.</p>
                    <div className="pop-acts">
                      <button className="btn" type="button" onClick={() => setNamingList(true)}>
                        Blank list
                      </button>
                      <button
                        className="btn line"
                        type="button"
                        onClick={startNewListReceiptScan}
                        disabled={creatingList}
                      >
                        Scan a receipt
                      </button>
                    </div>
                    {creatingList ? (
                      <p className="sub" role="status">Reading receipt and creating list…</p>
                    ) : null}
                    {listError ? <p className="err" role="alert">{listError}</p> : null}
                    <button className="btn txt" type="submit" disabled={creatingList}>
                      Cancel
                    </button>
                  </form>
                )}
              </dialog>
        </div>
      </main>
    </div>
  );
}
