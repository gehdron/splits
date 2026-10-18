const MODEL = "gemini-3.8-flash";

const SYSTEM = `You rewrite Splits text-message replies.
Sound like a calm friend: plain, short, and warm. One or two sentences for a confirmation. A short lead plus the same lines for a summary.
No emoji, no exclamation marks, and no markdown.
Keep every person, item, dollar amount, and list name exactly as written. Do not add items, prices, or people, and do not change any number.
If the source asks which list to use, keep every list name and ask them to name one in the same text.`;

function tidy(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function replyText(payload: unknown): string {
  const candidate = isRecord(payload) && Array.isArray(payload.candidates) ? payload.candidates[0] : null;
  const content = isRecord(candidate) && isRecord(candidate.content) ? candidate.content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  const text = isRecord(parts[0]) && typeof parts[0].text === "string" ? parts[0].text : "";
  return tidy(text);
}

// Rewrites a factual reply. The fallback is sent unchanged when Gemini is missing or drops a required fact.
export async function naturalReply(source: string, mustKeep: string[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  const required = mustKeep.map((token) => token.trim()).filter((token) => token.length > 0);
  if (!key) return source;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: source }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 240 },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.error(`Gemini reply failed (${response.status}). Sending the plain wording.`);
      return source;
    }
    const text = replyText(await response.json());
    const lower = text.toLowerCase();
    const kept = text.length > 0 && text.length <= 600 && required.every((token) => lower.includes(token.toLowerCase()));
    if (!kept) {
      console.error("Gemini dropped a name, item, or amount. Sending the plain wording.");
      return source;
    }
    return text;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Gemini reply failed. Sending the plain wording.");
    return source;
  }
}
