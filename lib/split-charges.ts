const KEY = "splits-split-charges";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  } catch {
    return [];
  }
}

export function rememberedChargeIds(): string[] {
  return read();
}

export function rememberChargeId(id: string): void {
  if (!id || typeof window === "undefined") return;
  const next = new Set(read());
  next.add(id);
  window.localStorage.setItem(KEY, JSON.stringify([...next]));
}

export function forgetChargeId(id: string): void {
  if (!id || typeof window === "undefined") return;
  const next = read().filter((saved) => saved !== id);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function replaceRememberedChargeIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(ids));
}

const LINKS = "splits-list-charges";

function readLinks(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LINKS) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const links: Record<string, string> = {};
    for (const [listId, chargeId] of Object.entries(parsed)) {
      if (typeof chargeId === "string" && chargeId) links[listId] = chargeId;
    }
    return links;
  } catch {
    return {};
  }
}

export function rememberListCharge(listId: string, chargeId: string): void {
  if (!listId || !chargeId || typeof window === "undefined") return;
  rememberChargeId(chargeId);
  const links = readLinks();
  links[listId] = chargeId;
  window.localStorage.setItem(LINKS, JSON.stringify(links));
}

// Drop the list-to-charge link and return the charge that can be split again.
export function releaseListCharge(listId: string, serverChargeId?: string | null): string | null {
  if (typeof window === "undefined") return serverChargeId || null;
  const links = readLinks();
  const local = links[listId] ?? "";
  delete links[listId];
  window.localStorage.setItem(LINKS, JSON.stringify(links));
  if (local) forgetChargeId(local);
  if (serverChargeId && serverChargeId !== local) forgetChargeId(serverChargeId);
  return serverChargeId || local || null;
}
