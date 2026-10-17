// In-memory store for the shared list. Resets when the server restarts.
// Swap this file for a real database later; the API routes only use these functions.

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

// globalThis keeps the data alive across hot reloads in `next dev`
const g = globalThis as unknown as { __splitsDB?: DB };
const db: DB = (g.__splitsDB ??= { lists: new Map(), items: new Map() });

export function createList(name: string): List {
  const list = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  db.lists.set(list.id, list);
  return list;
}

export function getList(id: string) {
  const list = db.lists.get(id);
  if (!list) return null;
  const items = [...db.items.values()].filter((i) => i.listId === id);
  const totals: Record<string, number> = {};
  for (const i of items) {
    if (i.claimedBy) totals[i.claimedBy] = (totals[i.claimedBy] ?? 0) + i.priceCents * i.quantity;
  }
  return { list, items, totals };
}

export type NewItem = { name: string; quantity?: number; priceCents?: number };

export function addItems(listId: string, incoming: NewItem[]) {
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
      claimedBy: null,
      purchased: false,
    };
    db.items.set(item.id, item);
    return item;
  });
  return { items, duplicates };
}

export function claimItem(id: string, user: string): Item | "taken" | null {
  const item = db.items.get(id);
  if (!item) return null;
  if (item.claimedBy) return "taken";
  item.claimedBy = user;
  return item;
}

export function unclaimItem(id: string, user: string): Item | "not-yours" | null {
  const item = db.items.get(id);
  if (!item) return null;
  if (item.claimedBy !== user) return "not-yours";
  item.claimedBy = null;
  return item;
}

export function updateItem(id: string, patch: Partial<Pick<Item, "name" | "quantity" | "priceCents" | "purchased">>) {
  const item = db.items.get(id);
  if (!item) return null;
  Object.assign(item, patch);
  return item;
}

export function deleteItem(id: string) {
  return db.items.delete(id);
}

export function listExists(id: string) {
  return db.lists.has(id);
}