// File-backed list shared by the Next.js app and the iMessage agent.
// Swap this file for a real database later; the API routes only use these functions.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Item = {
  id: string;
  listId: string;
  name: string;
  quantity: number;
  priceCents: number;
  claimedBy: string | null;
  purchased: boolean;
};

export type ListMember = { name: string; userId?: string; phone?: string; email?: string };

export type ListViewer = { userId: string; phone?: string; email?: string };

// ownerId is the signed-in organizer who may request money on this list (null for lists made while signed out).
export type List = {
  id: string;
  name: string;
  createdAt: number;
  ownerId?: string | null;
  groupId?: string;
  members?: ListMember[];
};

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function samePhone(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const left = digits(a);
  const right = digits(b);
  if (left.length < 10 || right.length < 10) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}

export function memberOnList(member: ListMember, viewer: ListViewer): boolean {
  if (member.userId && member.userId === viewer.userId) return true;
  if (samePhone(member.phone, viewer.phone)) return true;
  if (member.email && viewer.email && member.email.toLowerCase() === viewer.email.toLowerCase()) return true;
  return false;
}

export function sameListMember(a: ListMember, b: ListMember): boolean {
  if (a.userId && b.userId && a.userId === b.userId) return true;
  if (samePhone(a.phone, b.phone)) return true;
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) return true;
  return false;
}

// One person's share of a bill, behind https://splits.select/pay/sh_... (see lib/shares.ts).
// This file keeps them only for local runs; production stores them in Supabase.
// "void": replaced by a newer link after the amount changed. It can no longer be paid.
export type ShareStatus = "unpaid" | "sent" | "paid" | "void";
export type Share = {
  id: string;
  amountCents: number;
  currency: string;
  personName: string;
  title: string;
  status: ShareStatus;
  recipientHandle: string | null;
  organizerId: string | null;
  organizerName: string | null;
  stripeConnectAccountId: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  source: "list";
  sourceRef: string | null;
  createdAt: string;
  sentAt: string | null;
  paidAt: string | null;
};

type DB = { lists: Map<string, List>; items: Map<string, Item>; shares: Map<string, Share> };
type Saved = { lists: [string, List][]; items: [string, Item][]; shares?: [string, Share][] };

function storePath(): string {
  return join(process.cwd(), "data", "store.json");
}

function load(): DB {
  try {
    const saved = JSON.parse(readFileSync(storePath(), "utf8")) as Saved;
    return { lists: new Map(saved.lists ?? []), items: new Map(saved.items ?? []), shares: new Map(saved.shares ?? []) };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { lists: new Map(), items: new Map(), shares: new Map() };
    }
    throw error;
  }
}

function save(db: DB): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const saved: Saved = { lists: [...db.lists], items: [...db.items], shares: [...db.shares] };
  writeFileSync(path, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
}

export function renameList(id: string, name: string): List | null {
  const db = load();
  const list = db.lists.get(id);
  if (!list) return null;
  list.name = name.trim();
  save(db);
  return list;
}

export function createList(name: string, ownerId: string | null = null, member?: ListMember): List {
  const db = load();
  const list: List = { id: crypto.randomUUID(), name, createdAt: Date.now(), ownerId };
  if (member?.name.trim()) list.members = [member];
  db.lists.set(list.id, list);
  save(db);
  return list;
}

export function addListMember(listId: string, member: ListMember): List | null {
  const db = load();
  const list = db.lists.get(listId);
  const name = member.name.trim();
  if (!list || !name) return null;
  const next: ListMember = { name };
  if (member.userId) next.userId = member.userId;
  if (member.phone) next.phone = member.phone;
  if (member.email) next.email = member.email.toLowerCase();
  const members = list.members ?? [];
  if (!members.some((entry) => sameListMember(entry, next))) list.members = [...members, next];
  save(db);
  return list;
}

export function listAll(): List[] {
  return [...load().lists.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function listSummaries(): (List & { itemCount: number })[] {
  const db = load();
  const counts = new Map<string, number>();
  for (const item of db.items.values()) counts.set(item.listId, (counts.get(item.listId) ?? 0) + 1);
  return [...db.lists.values()]
    .map((list) => ({ ...list, itemCount: counts.get(list.id) ?? 0 }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function listSummariesFor(viewer: ListViewer): { id: string; name: string; createdAt: number; itemCount: number }[] {
  return listSummaries()
    .filter((list) => list.ownerId === viewer.userId || (list.members ?? []).some((member) => memberOnList(member, viewer)))
    .map((list) => ({ id: list.id, name: list.name, createdAt: list.createdAt, itemCount: list.itemCount }));
}

// The iMessage agent's list. It never returns an organizer's own list, so texts from unrelated
// chats can't land on (and be billed from) someone's private list.
// The agent and /list share this list so a text shows up without a new id.
export function defaultList(): List {
  return listAll().find((list) => !list.ownerId) ?? createList("Shared list");
}

export function getList(id: string) {
  const db = load();
  const list = db.lists.get(id);
  if (!list) return null;
  const items = [...db.items.values()].filter((i) => i.listId === id);
  const totals: Record<string, number> = {};
  for (const i of items) {
    if (i.claimedBy) totals[i.claimedBy] = (totals[i.claimedBy] ?? 0) + i.priceCents * i.quantity;
  }
  return { list, items, totals };
}

export type NewItem = { name: string; quantity?: number; priceCents?: number; claimedBy?: string | null };

export function addItems(listId: string, incoming: NewItem[]) {
  const db = load();
  const existing = new Set(
    [...db.items.values()].filter((i) => i.listId === listId).map((i) => i.name.trim().toLowerCase())
  );
  const duplicates = incoming.filter((i) => existing.has(i.name.trim().toLowerCase())).map((i) => i.name);
  const items = incoming.map((i) => {
    const item: Item = {
      id: crypto.randomUUID(),
      listId,
      name: i.name.trim(),
      quantity: i.quantity ?? 1,
      priceCents: i.priceCents ?? 0,
      claimedBy: i.claimedBy ?? null,
      purchased: false,
    };
    db.items.set(item.id, item);
    return item;
  });
  save(db);
  return { items, duplicates };
}

export function recordPurchase(listId: string, input: { name: string; priceCents: number; person: string }): Item {
  const db = load();
  const name = input.name.trim();
  const existing = [...db.items.values()].find(
    (item) => item.listId === listId && item.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    if (!existing.claimedBy || existing.claimedBy === input.person) existing.claimedBy = input.person;
    if (input.priceCents > 0) existing.priceCents = input.priceCents;
    save(db);
    return existing;
  }
  const item: Item = {
    id: crypto.randomUUID(),
    listId,
    name,
    quantity: 1,
    priceCents: input.priceCents,
    claimedBy: input.person,
    purchased: false,
  };
  db.items.set(item.id, item);
  save(db);
  return item;
}

export function claimItem(id: string, user: string): Item | "taken" | null {
  const db = load();
  const item = db.items.get(id);
  if (!item) return null;
  if (item.claimedBy) return "taken";
  item.claimedBy = user;
  save(db);
  return item;
}

export function unclaimItem(id: string, user: string): Item | "not-yours" | null {
  const db = load();
  const item = db.items.get(id);
  if (!item) return null;
  if (item.claimedBy !== user) return "not-yours";
  item.claimedBy = null;
  save(db);
  return item;
}

export function updateItem(id: string, patch: Partial<Pick<Item, "name" | "quantity" | "priceCents" | "purchased">>) {
  const db = load();
  const item = db.items.get(id);
  if (!item) return null;
  Object.assign(item, patch);
  save(db);
  return item;
}

export function deleteItem(id: string) {
  const db = load();
  const removed = db.items.delete(id);
  if (removed) save(db);
  return removed;
}

export function itemListId(id: string): string | null {
  return load().items.get(id)?.listId ?? null;
}

export function listExists(id: string) {
  return load().lists.has(id);
}

export function fileSaveShare(share: Share): Share {
  const db = load();
  db.shares.set(share.id, share);
  save(db);
  return share;
}

export function fileGetShare(id: string): Share | null {
  return load().shares.get(id) ?? null;
}

export function fileUpdateShare(id: string, patch: Partial<Share>): Share | null {
  const db = load();
  const share = db.shares.get(id);
  if (!share) return null;
  Object.assign(share, patch);
  save(db);
  return share;
}

export function fileListShares(source: Share["source"], sourceRef: string): Share[] {
  return [...load().shares.values()].filter((share) => share.source === source && share.sourceRef === sourceRef);
}
