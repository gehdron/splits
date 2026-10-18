export type Commitment = {
  messageId: string;
  spaceId: string;
  who: string;
  action: "buy" | "get" | "grab" | "pick up" | "pay for" | "cover";
  item: string;
  amount?: string;
  at: string;
};

export type ParsedCommitment = Pick<Commitment, "who" | "action" | "item" | "amount">;

const FUTURE =
  "i'll|i will|i'm going to|im going to|i am going to|i can";
const ACTION = "buy|get|grab|pick up|pay for|cover";
const ONGOING = "buying|getting|grabbing|picking up|paying for|covering";
const WHO = "[A-Za-z][A-Za-z.'-]{0,40}(?:\\s+[A-Za-z][A-Za-z.'-]{0,40}){0,3}";

const selfFuture = new RegExp(`^(?:${FUTURE})\\s+(${ACTION})\\s+(.+)$`, "i");
const selfOngoing = new RegExp(`^(?:i'm|im|i am)\\s+(${ONGOING})\\s+(.+)$`, "i");
const otherFuture = new RegExp(`^(${WHO})\\s+(?:will|is going to|'ll)\\s+(${ACTION})\\s+(.+)$`, "i");
const otherOngoing = new RegExp(`^(${WHO})\\s+is\\s+(${ONGOING})\\s+(.+)$`, "i");

const summaryRequest =
  /^(?:summary|commitments|what(?:'s| is| are) (?:the )?(?:plan|list|commitments)|what did (?:i|we) (?:say|agree))[?.!]*$/i;

const ongoingAction: Record<string, Commitment["action"]> = {
  buying: "buy",
  getting: "get",
  grabbing: "grab",
  "picking up": "pick up",
  "paying for": "pay for",
  covering: "cover",
};

function normalize(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function clauses(text: string): string[] {
  return normalize(text)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((clause) => clause.replace(/^(?:(?:oh|hey|yo|so|yeah|yea|btw|ok|okay|well|um|uh|and)[, ]+)+/i, "").trim())
    .filter((clause) => clause.length > 0 && !clause.endsWith("?"));
}

function money(raw: string): { item: string; amount?: string } {
  const cleaned = raw.replace(/[.,!]+$/, "").trim();
  const match = cleaned.match(/\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:dollars|bucks)\b/i);
  const remainder = match ? cleaned.replace(match[0], " ") : cleaned;
  const item = remainder
    .replace(/\s+\bfor\s*$/i, "")
    .replace(/\b(?:please|thanks|thank you)\b/gi, " ")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!match) return { item };
  const dollars = Number(match[1] ?? match[2]);
  const amount = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  return { item, amount };
}

function asAction(value: string): Commitment["action"] | undefined {
  const normalized = value.toLowerCase();
  if (normalized in ongoingAction) return ongoingAction[normalized];
  if (
    normalized === "buy" ||
    normalized === "get" ||
    normalized === "grab" ||
    normalized === "pick up" ||
    normalized === "pay for" ||
    normalized === "cover"
  ) {
    return normalized;
  }
  return undefined;
}

export function parseCommitments(text: string, senderHandle: string): ParsedCommitment[] {
  const found: ParsedCommitment[] = [];
  const seen = new Set<string>();
  for (const clause of clauses(text)) {
    const self = clause.match(selfFuture) ?? clause.match(selfOngoing);
    const other = self ? null : clause.match(otherFuture) ?? clause.match(otherOngoing);
    const match = self ?? other;
    if (!match) continue;
    const who = self ? senderHandle : match[1];
    if (/^(?:i|i'm|im)$/i.test(who)) continue;
    const action = asAction(match[self ? 1 : 2]);
    if (!action) continue;
    const { item, amount } = money(match[self ? 2 : 3]);
    if (item.length < 2) continue;
    const key = `${who.toLowerCase()}|${action}|${item.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ who, action, item, ...(amount ? { amount } : {}) });
  }
  return found;
}

export function isSummaryRequest(text: string): boolean {
  return summaryRequest.test(normalize(text));
}

export function describe(commitment: Pick<Commitment, "who" | "action" | "item" | "amount">, senderHandle: string): string {
  const who = commitment.who === senderHandle ? "You" : commitment.who;
  const amount = commitment.amount ? ` (${commitment.amount})` : "";
  return `${who} will ${commitment.action} ${commitment.item}${amount}.`;
}

export function renderSummary(commitments: Commitment[], senderHandle: string): string {
  if (commitments.length === 0) return "Nothing recorded yet. Text what you or someone else will buy.";
  const shown = commitments.slice(-12);
  const lines = shown.map((commitment) => `- ${describe(commitment, senderHandle)}`);
  const earlier = commitments.length - shown.length;
  const heading = earlier > 0 ? `So far, plus ${earlier} earlier:` : "So far:";
  return [heading, ...lines].join("\n");
}

function say(commitment: Pick<Commitment, "who" | "action" | "item" | "amount">, senderHandle: string): string {
  const who = commitment.who === senderHandle ? "You'll" : `${commitment.who} will`;
  const amount = commitment.amount ? ` for ${commitment.amount}` : "";
  return `${who} ${commitment.action} ${commitment.item}${amount}`;
}

export function renderConfirmation(parsed: ParsedCommitment[], senderHandle: string, listName?: string): string {
  if (parsed.length === 1 && parsed[0]) {
    const where = listName ? ` I'll put that on ${listName}.` : "";
    return `Got it. ${say(parsed[0], senderHandle)}.${where}`;
  }
  const where = listName ? ` on ${listName}` : "";
  return `Got it${where}.\n${parsed.map((commitment) => `- ${say(commitment, senderHandle)}.`).join("\n")}`;
}

// "on the dinner check" names a list. It is not part of the item.
export function explicitCheck(text: string): string | undefined {
  const match = normalize(text).match(/\b(?:on|for)\s+(?:the\s+)?([a-z][a-z0-9' -]{0,40}?)\s+check\b/i);
  if (!match?.[1]) return undefined;
  return `${match[1]} check`.replace(/\s+/g, " ").trim();
}

export function textWithoutCheck(text: string): string {
  return normalize(text)
    .replace(/\b(?:on|for)\s+(?:the\s+)?[a-z][a-z0-9' -]{0,40}?\s+check\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ListTarget = { id: string; name: string };

function listKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\blist\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsList(text: string, name: string): boolean {
  const needle = listKey(name);
  if (needle.length < 2) return false;
  return ` ${listKey(text)} `.includes(` ${needle} `);
}

export function textWithoutList(text: string, listName: string): string {
  const escaped = listName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalize(text)
    .replace(new RegExp(`\\b${escaped}\\b`, "ig"), " ")
    .replace(/^(?:(?:add|put)\s+)?(?:on|for|in|to)\s+(?:the\s+)?/i, "")
    .replace(/^[:.,\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function chooseList(text: string, lists: ListTarget[]): { ok: true; list: ListTarget } | { ok: false; reply: string } {
  const hinted = explicitCheck(text);
  if (hinted) {
    const matched = lists.filter((list) => listKey(list.name) === listKey(hinted) || mentionsList(hinted, list.name));
    if (matched.length === 1 && matched[0]) return { ok: true, list: matched[0] };
    const names = lists.map((list) => list.name);
    const owned = names.length === 0 ? "" : names.length === 1 ? ` You've got ${names[0]}.` : ` You've got ${names.join(", ")}.`;
    return {
      ok: false,
      reply: `I don't have a list called ${hinted}.${owned} Name the list in the same text if you mean one of those.`,
    };
  }
  const named = lists.filter((list) => mentionsList(text, list.name));
  const longest =
    named.length === 0
      ? undefined
      : named.reduce((best, list) => (listKey(list.name).length > listKey(best.name).length ? list : best));
  const winners = longest ? named.filter((list) => listKey(list.name).length === listKey(longest.name).length) : [];
  if (winners.length === 1 && longest) return { ok: true, list: longest };
  if (lists.length === 1 && lists[0]) return { ok: true, list: lists[0] };
  const names = (winners.length > 1 ? winners : lists).map((list) => list.name);
  const sample = names[0] ?? "House supplies";
  const lead = winners.length > 1 ? "That name fits more than one list." : "Which list should this go on?";
  return {
    ok: false,
    reply: `${lead} Add it to the same text, like "on ${sample}, Maya is buying chips." You've got ${names.join(", ")}.`,
  };
}
