import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Commitment } from "./commitments.ts";

export type Ledger = { commitments: Commitment[] };

export function loadLedger(path: string): Ledger {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Ledger;
    return { commitments: Array.isArray(parsed.commitments) ? parsed.commitments : [] };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { commitments: [] };
    throw error;
  }
}

export function saveLedger(path: string, ledger: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}
