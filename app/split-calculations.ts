import type { AiReceiptItem, AiReceiptTotals } from "./receipt-types";
import type { ReceiptAssignment } from "./split-types";

export type SplitLineResult = {
  itemIndex: number;
  description: string;
  amountCents: number | null;
  shares: { person: string; amountCents: number }[];
};

export type PersonSplitTotal = {
  person: string;
  itemsCents: number;
  taxCents: number;
  tipCents: number;
};

export type TipSplitMode = "proportional" | "manual" | "disabled";

export type TipSplitOptions = {
  mode?: TipSplitMode;
  manualAmounts?: Record<string, string>;
};

export type SplitCalculation = {
  lines: SplitLineResult[];
  people: PersonSplitTotal[];
  unassignedCents: number;
  unassignedTaxCents: number;
  unassignedTipCents: number;
  canAllocateTaxAndTip: boolean;
  manualTipNeedsReview: boolean;
};

function parseCents(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[$€£¥\s,]/g, "")
    .replace(/(?:USD|CR|DR)$/i, "");
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;

  const cents =
    Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents * (match[1] === "-" ? -1 : 1) : null;
}

function addProportionalCents(
  amountCents: number,
  weights: Map<string, number>,
  totals: Map<string, number>
) {
  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  if (amountCents <= 0 || totalWeight <= 0) return;

  const allocations = [...weights.entries()].map(([person, weight]) => {
    const exact = (amountCents * weight) / totalWeight;
    const base = Math.floor(exact);
    return { person, cents: base, remainder: exact - base };
  });
  const remainder =
    amountCents - allocations.reduce((sum, entry) => sum + entry.cents, 0);

  allocations.sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < remainder; index += 1) {
    allocations[index % allocations.length].cents += 1;
  }

  for (const allocation of allocations) {
    totals.set(
      allocation.person,
      (totals.get(allocation.person) ?? 0) + allocation.cents
    );
  }
}

export function calculateReceiptSplits(
  items: AiReceiptItem[],
  receiptTotals: AiReceiptTotals,
  assignments: ReceiptAssignment[],
  tipOptions: TipSplitOptions = {}
): SplitCalculation {
  const tipMode = tipOptions.mode ?? "proportional";
  const assignmentByIndex = new Map(
    assignments.map((assignment) => [assignment.itemIndex, assignment.people])
  );
  const people = new Map<string, PersonSplitTotal>();
  const itemWeights = new Map<string, number>();
  let totalItemsCents = 0;
  let assignedItemsCents = 0;

  const lines = items.map((item, itemIndex) => {
    const amountCents = parseCents(item.amount);
    const names = (assignmentByIndex.get(itemIndex) ?? [])
      .map((person) => person.trim())
      .filter(Boolean)
      .filter(
        (person, index, all) =>
          all.findIndex(
            (candidate) => candidate.toLowerCase() === person.toLowerCase()
          ) === index
      );

    if (amountCents !== null && amountCents > 0) totalItemsCents += amountCents;
    const shares: SplitLineResult["shares"] = [];
    if (amountCents !== null && amountCents > 0 && names.length > 0) {
      const baseShare = Math.floor(amountCents / names.length);
      let extraCents = amountCents - baseShare * names.length;

      for (const person of names) {
        const shareCents = baseShare + (extraCents > 0 ? 1 : 0);
        if (extraCents > 0) extraCents -= 1;
        shares.push({ person, amountCents: shareCents });

        const entry = people.get(person.toLowerCase()) ?? {
          person,
          itemsCents: 0,
          taxCents: 0,
          tipCents: 0,
        };
        entry.itemsCents += shareCents;
        people.set(person.toLowerCase(), entry);
        itemWeights.set(
          person.toLowerCase(),
          (itemWeights.get(person.toLowerCase()) ?? 0) + shareCents
        );
      }
      assignedItemsCents += amountCents;
    }

    return { itemIndex, description: item.description, amountCents, shares };
  });

  const canAllocateTaxAndTip =
    items.length > 0 &&
    totalItemsCents > 0 &&
    lines.every((line) => line.amountCents !== null && line.amountCents >= 0);
  const unassignedCents = Math.max(0, totalItemsCents - assignedItemsCents);
  const allWeights = new Map(itemWeights);
  if (unassignedCents > 0) allWeights.set("__unassigned__", unassignedCents);

  const taxAllocations = new Map<string, number>();
  const tipAllocations = new Map<string, number>();
  const taxCents = parseCents(receiptTotals.tax);
  const tipCents = parseCents(receiptTotals.tip);
  const manualTipNeedsReview =
    tipMode === "manual" &&
    Object.values(tipOptions.manualAmounts ?? {}).some((value) => {
      if (value.trim() === "") return false;
      const amount = parseCents(value);
      return amount === null || amount < 0;
    });

  if (canAllocateTaxAndTip) {
    if (taxCents !== null) addProportionalCents(taxCents, allWeights, taxAllocations);
    if (tipMode === "proportional" && tipCents !== null) {
      addProportionalCents(tipCents, allWeights, tipAllocations);
    } else if (tipMode === "manual") {
      for (const key of [...people.keys(), "__unassigned__"]) {
        const value = tipOptions.manualAmounts?.[key] ?? "0";
        const amount = value.trim() === "" ? 0 : parseCents(value);
        if (amount === null || amount < 0) continue;
        tipAllocations.set(key, amount);
      }
    }
  }

  for (const [key, person] of people) {
    person.taxCents = taxAllocations.get(key) ?? 0;
    person.tipCents = tipAllocations.get(key) ?? 0;
  }

  return {
    lines,
    people: [...people.values()],
    unassignedCents,
    unassignedTaxCents: taxAllocations.get("__unassigned__") ?? 0,
    unassignedTipCents: tipAllocations.get("__unassigned__") ?? 0,
    canAllocateTaxAndTip,
    manualTipNeedsReview,
  };
}

export function formatCents(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}
