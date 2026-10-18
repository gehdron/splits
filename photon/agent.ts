import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { ApiError, Photon } from "@photon-ai/api";
import { chooseList, isSummaryRequest, parseCommitments, renderConfirmation, renderSummary, textWithoutList, type Commitment, type ParsedCommitment } from "./commitments.ts";
import { loadLedger, saveLedger } from "./ledger.ts";
import { assertLiveLists, listsForSender, recordPurchase } from "./lists.ts";
import { naturalReply } from "./voice.ts";

function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.replace(/^export\s+/, "");
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const name = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

type Config = { key: string; project: string; platform: "imessage" | "email"; agent: string; sender: string };

export function configuration(): Config {
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}.`);
    return value;
  };
  const platform = required("PHOTON_PLATFORM");
  if (platform !== "imessage" && platform !== "email") throw new Error("PHOTON_PLATFORM must be imessage or email.");
  const project = required("PHOTON_PROJECT_ID");
  // A project API key is accepted only for its own project. The Beta id starts
  // with pho_prj_; a slug such as "dubhacks" is rejected with 403 FORBIDDEN.
  if (!/^pho_prj_[0-7][0-9a-hjkmnp-tv-z]{25}$/.test(project)) {
    throw new Error("PHOTON_PROJECT_ID must be the Project ID from the Photon Beta dashboard Settings page (pho_prj_...). A project slug is rejected with 403.");
  }
  return {
    key: required("PHOTON_API_KEY"), project,
    platform, agent: required("PHOTON_AGENT_HANDLE"), sender: required("PHOTON_TEST_SENDER"),
  };
}

type Page = Awaited<ReturnType<Photon["projects"]["listMessages"]>>;
type Item = Page["items"][number];

type Inbound = { id: string; spaceId: string; senderId: string; senderHandle: string; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function plainText(m: Item, c: Config): string | undefined {
  const content: unknown = m.content;
  if (!isRecord(content)) return undefined;
  if (content.type === "text" && content.format === "plain" && typeof content.text === "string") return content.text.trim();
  if (c.platform !== "email" || content.type !== "group" || !Array.isArray(content.parts)) return undefined;
  const plain = content.parts.flatMap((part) => {
    if (!isRecord(part) || part.type !== "text" || part.format !== "plain" || typeof part.text !== "string") return [];
    return [part.text];
  });
  return plain.length === 1 ? plain[0].trim() : undefined;
}

// Direct iMessage only. A shared line cannot send in a group.
function inbound(m: Item, c: Config, startedAt: number): Inbound | undefined {
  if (m.platform !== c.platform || m.status !== "received") return undefined;
  if (Date.parse(m.createdAt) < startedAt) return undefined;
  if (m.sentBy.platform !== c.platform || m.receivedBy?.platform !== c.platform || m.space.platform !== c.platform) return undefined;
  if (m.sentBy.kind !== "human" || m.sentBy.handle !== c.sender) return undefined;
  if (m.receivedBy.kind !== "agent" || m.receivedBy.handle !== c.agent) return undefined;
  if (m.sentBy.id === m.receivedBy.id) return undefined;
  if (c.platform === "imessage" && m.space.kind !== "direct") return undefined;
  const text = plainText(m, c);
  if (!text) return undefined;
  return { id: m.id, spaceId: m.space.id, senderId: m.receivedBy.id, senderHandle: m.sentBy.handle, text };
}

const ledgerPath = join(dirname(fileURLToPath(import.meta.url)), "data", "ledger.json");

function priceCents(amount?: string): number {
  if (!amount) return 0;
  const dollars = Number(amount.replace(/[^0-9.]/g, ""));
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}

async function savePurchases(listId: string, parsed: ParsedCommitment[]): Promise<void> {
  for (const item of parsed) {
    await recordPurchase(listId, { name: item.item, priceCents: priceCents(item.amount), person: item.who });
  }
}

function facts(parsed: ParsedCommitment[], senderHandle: string, listName?: string): string[] {
  const tokens = parsed.flatMap((item) => [item.item, item.amount ?? "", item.who === senderHandle ? "you" : item.who]);
  if (listName) tokens.push(listName);
  return tokens;
}

async function replyFor(message: Inbound, commitments: Commitment[], sender: string): Promise<string | undefined> {
  if (isSummaryRequest(message.text)) {
    const mine = commitments.filter((item) => item.spaceId === message.spaceId);
    const summary = renderSummary(mine, message.senderHandle);
    return naturalReply(summary, facts(mine.slice(-12), message.senderHandle));
  }
  const lists = await listsForSender(sender);
  const choice = chooseList(message.text, lists);
  const body = choice.ok ? textWithoutList(message.text, choice.list.name) : message.text;
  const parsed = parseCommitments(body, message.senderHandle);
  if (!choice.ok) return parsed.length === 0 ? undefined : naturalReply(choice.reply, lists.map((list) => list.name));
  if (parsed.length === 0) return undefined;
  await savePurchases(choice.list.id, parsed);
  const at = new Date().toISOString();
  for (const item of parsed) {
    commitments.push({ ...item, messageId: message.id, spaceId: message.spaceId, at });
  }
  return naturalReply(renderConfirmation(parsed, message.senderHandle, choice.list.name), facts(parsed, message.senderHandle, choice.list.name));
}

export async function run(c: Config, pollMs = 2_000) {
  const photon = new Photon({ headers: { Authorization: `Bearer ${c.key}` } });
  const ledger = loadLedger(ledgerPath);
  const startedAt = Date.now();
  const createdSince = new Date(startedAt - 5_000).toISOString();
  const seen = new Set(ledger.commitments.map((item) => item.messageId));
  await assertLiveLists(c.sender);
  const sample = "Noted. Maya will buy chips ($4.50). On Dinner check.";
  const voiced = await naturalReply(sample, ["Maya", "chips", "$4.50", "Dinner check"]);
  console.log(voiced === sample ? "Replies stay in the plain wording." : "Gemini replies are on.");
  console.log("Ready. Purchases are saved on the live site. Text what someone will buy, or text summary. Direct chat only.");
  while (true) {
    let pageToken: string | undefined;
    do {
      const page = await photon.projects.listMessages({
        path: { id: c.project },
        query: { createdSince, direction: "received", order: "asc", pageSize: 100, platform: c.platform, ...(pageToken ? { pageToken } : {}) },
      });
      for (const m of page.items) {
        const message = inbound(m, c, startedAt);
        if (!message || seen.has(message.id)) continue;
        let reply: string | undefined;
        try {
          reply = await replyFor(message, ledger.commitments, c.sender);
        } catch (error) {
          console.error(error instanceof Error ? error.message : "That purchase could not be saved.");
          continue;
        }
        seen.add(message.id);
        if (!reply) continue;
        saveLedger(ledgerPath, ledger);
        await photon.projects.sendMessage({
          path: { id: c.project },
          headers: { "idempotency-key": `commitment:${message.id}` },
          body: {
            spaceId: message.spaceId, senderId: message.senderId,
            ...(c.platform === "email" ? { parentMessageId: message.id } : {}),
            content: { type: "text", format: "plain", text: reply },
          },
        });
        console.log(reply);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    await sleep(pollMs);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
  try {
    await run(configuration());
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body;
      const code = typeof body === "object" && body !== null && "code" in body ? String(body.code) : "unknown";
      const detail = error.message && error.message !== `Photon API returned HTTP ${error.status}` ? ` ${error.message}` : "";
      console.error(`Photon API error ${error.status} ${code}${detail} (request ${error.requestId ?? "unknown"}).`);
    }
    else console.error(error instanceof Error ? error.message : "Agent failed.");
    process.exitCode = 1;
  }
}