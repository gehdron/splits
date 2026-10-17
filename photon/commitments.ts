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

const selfFuture = new RegExp(`^(?:${FUTURE})\\s+(${ACTION})\\s+(.+)$`, "i");
const selfOngoing = new RegExp(`^(?:i'm|im|i am)\\s+(${ONGOING})\\s+(.+)$`, "i");
const otherFuture = new RegExp(
  `^([A-Za-z][A-Za-z.'-]{0,40})\\s+(?:will|is going to|'ll)\\s+(${ACTION})\\s+(.+)$`,
  "i",
);

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
    .map((clause) => clause.trim())
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
    const other = self ? null : clause.match(otherFuture);
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

export function renderConfirmation(parsed: ParsedCommitment[], senderHandle: string): string {
  const lines = parsed.map((commitment) => describe(commitment, senderHandle));
  return lines.length === 1 ? `Noted. ${lines[0]}` : `Noted.\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
