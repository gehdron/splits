export type SplitListItem = {
  name: string;
  quantity: number;
  priceCents: number;
  claimedBy: string | null;
};

export type PersonListTotal = {
  name: string;
  itemCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  items: { name: string; cents: number }[];
};

function allocateCents(amount: number, weights: { key: string; cents: number }[]) {
  const totalWeight = weights.reduce((sum, entry) => sum + entry.cents, 0);
  const allocations = new Map<string, number>();
  if (amount <= 0 || totalWeight <= 0) return allocations;

  let allocated = 0;
  const remainders = weights.map((entry, index) => {
    const numerator = amount * entry.cents;
    const cents = Math.floor(numerator / totalWeight);
    allocations.set(entry.key, cents);
    allocated += cents;
    return { key: entry.key, index, remainder: numerator % totalWeight };
  });
  remainders.sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < amount - allocated; index += 1) {
    const entry = remainders[index];
    allocations.set(entry.key, (allocations.get(entry.key) ?? 0) + 1);
  }
  return allocations;
}

export function calculateListAmounts(
  items: SplitListItem[],
  taxCents = 0,
  tipCents = 0,
) {
  const people = new Map<string, PersonListTotal>();
  let subtotal = 0;
  let unassignedItems = 0;

  for (const item of items) {
    const lineCents = item.priceCents * item.quantity;
    subtotal += lineCents;
    const assignees = [...new Map(
      (item.claimedBy ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => [name.toLocaleLowerCase(), name] as const),
    ).values()];
    if (assignees.length === 0) {
      unassignedItems += lineCents;
      continue;
    }

    const baseCents = Math.floor(lineCents / assignees.length);
    const remainder = lineCents - baseCents * assignees.length;
    assignees.forEach((name, index) => {
      const key = name.toLocaleLowerCase();
      const cents = baseCents + (index < remainder ? 1 : 0);
      const entry = people.get(key) ?? {
        name,
        itemCents: 0,
        taxCents: 0,
        tipCents: 0,
        totalCents: 0,
        items: [],
      };
      entry.itemCents += cents;
      entry.items.push({
        name: assignees.length > 1 ? `${item.name} (1/${assignees.length})` : item.name,
        cents,
      });
      people.set(key, entry);
    });
  }

  const weights = [...people.entries()].map(([key, entry]) => ({
    key,
    cents: entry.itemCents,
  }));
  if (unassignedItems > 0) weights.push({ key: "__unassigned__", cents: unassignedItems });
  const taxes = allocateCents(taxCents, weights);
  const tips = allocateCents(tipCents, weights);
  for (const [key, entry] of people) {
    entry.taxCents = taxes.get(key) ?? 0;
    entry.tipCents = tips.get(key) ?? 0;
    entry.totalCents = entry.itemCents + entry.taxCents + entry.tipCents;
  }

  return {
    subtotal,
    unassigned:
      unassignedItems +
      (taxes.get("__unassigned__") ?? 0) +
      (tips.get("__unassigned__") ?? 0),
    people: [...people.values()],
  };
}
