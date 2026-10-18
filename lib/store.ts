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

export type List = { id: string; name: string; createdAt: number };

type DB = { lists: Map<string, List>; items: Map<string, Item> };
type Saved = { lists: [string, List][]; items: [string, Item][] };

function storePath(): string {
  return join(process.cwd(), "data", "store.json");
}

function load(): DB {
  try {
    const saved = JSON.parse(readFileSync(storePath(), "utf8")) as Saved;
    return { lists: new Map(saved.lists ?? []), items: new Map(saved.items ?? []) };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { lists: new Map(), items: new Map() };
    }
    throw error;
  }
}

function save(db: DB): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const saved: Saved = { lists: [...db.lists], items: [...db.items] };
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

export function createList(name: string): List {
  const db = load();
  const list = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  db.lists.set(list.id, list);
  save(db);
  return list;
}

export function listAll(): List[] {
  return [...load().lists.values()].sort((a, b) => a.createdAt - b.createdAt);
}

// The agent and /list share this list so a text shows up without a new id.
export function defaultList(): List {
  return listAll()[0] ?? createList("Shared list");
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

export function listExists(id: string) {
  return load().lists.has(id);
}
