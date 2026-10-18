import { connection } from "next/server";

const MODEL = "gemini-3.1-flash-lite";

const SYSTEM_PROMPT = `You are a concise bill and shopping list naming assistant.
Generate a short, natural, 2-4 word title for a shared list based on the provided items, merchant name, or receipt text.
Examples: "Trader Joe's Run", "Dinner at Olive Garden", "Apartment Supplies", "Friday Night Pizza", "Costco Groceries", "Weekend Brunch".
Never include quotes, prefixes, punctuation marks at the end, or markdown.
Return only a JSON object with this exact shape:
{ "name": "Suggested List Name" }`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const items: string[] =
    isRecord(body) && Array.isArray(body.items)
      ? body.items.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  const merchant: string =
    isRecord(body) && typeof body.merchant === "string" ? body.merchant.trim() : "";
  const currentName: string =
    isRecord(body) && typeof body.currentName === "string" ? body.currentName.trim() : "";

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AI list naming is not configured. Add GEMINI_API_KEY to the server environment." },
      { status: 503 },
    );
  }

  try {
    const prompt = [
      merchant ? `Merchant/Store: ${merchant}` : null,
      items.length > 0 ? `Items on receipt/list: ${items.slice(0, 15).join(", ")}` : null,
      currentName ? `Current list name: ${currentName}` : null,
    ]
      .filter(Boolean)
      .join("\n") || "Suggest a general, friendly name for a shared list.";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
              },
              required: ["name"],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("AI list name suggestion request failed:", response.status, await response.text());
      return Response.json({ error: "Gemini could not suggest a list name. Try again." }, { status: 502 });
    }

    const result: unknown = await response.json();
    const candidate = isRecord(result) && Array.isArray(result.candidates)
      ? result.candidates[0]
      : null;
    const content = isRecord(candidate) && isRecord(candidate.content)
      ? candidate.content
      : null;
    const parts = content && Array.isArray(content.parts) ? content.parts : [];
    const text = isRecord(parts[0]) && typeof parts[0].text === "string"
      ? parts[0].text
      : "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (isRecord(parsed) && typeof parsed.name === "string" && parsed.name.trim()) {
      return Response.json({ name: parsed.name.trim().replace(/^["']|["']$/g, "") });
    }
    console.error("Gemini returned an invalid list name suggestion.");
    return Response.json({ error: "Gemini returned an invalid list name. Try again." }, { status: 502 });
  } catch (error) {
    console.error("AI list name suggestion error:", error);
    return Response.json({ error: "Gemini could not suggest a list name. Try again." }, { status: 502 });
  }
}
