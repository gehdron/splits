"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  SplitAssistantResult,
  SplitInstructionMessage,
} from "@/app/split-types";
import type { DashItem, DashList, DashMember } from "./types";

function isAssistantResult(value: unknown): value is SplitAssistantResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "reply" in value &&
    typeof value.reply === "string" &&
    "clarification" in value &&
    typeof value.clarification === "string" &&
    "assignments" in value &&
    Array.isArray(value.assignments) &&
    value.assignments.every(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "itemIndex" in entry &&
        typeof entry.itemIndex === "number" &&
        Number.isInteger(entry.itemIndex) &&
        entry.itemIndex >= 0 &&
        "people" in entry &&
        Array.isArray(entry.people) &&
        entry.people.length === 1 &&
        entry.people.every(
          (person: unknown) =>
            typeof person === "string" && person.trim().length > 0,
        ),
    )
  );
}

function errorMessage(value: unknown, fallback: string): string {
  return typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
    ? value.error
    : fallback;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function DashboardListAssistant({
  list,
  items,
  members,
  currentUser,
  canAssign,
}: {
  list: DashList;
  items: DashItem[];
  members: DashMember[];
  currentUser: string;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SplitInstructionMessage[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = message.trim();
    if (!content || pending || items.length === 0 || !canAssign) return;

    const nextMessages: SplitInstructionMessage[] = [
      ...messages.slice(-19),
      { role: "user", content },
    ];
    setPending(true);
    setError("");

    try {
      const subtotalCents = items.reduce(
        (sum, item) => sum + item.priceCents * item.quantity,
        0,
      );
      const participantNames = [
        currentUser,
        ...members.map((member) => member.name),
      ];
      const existingAssignments = items.flatMap((item, itemIndex) => {
        const claimedBy =
          item.claimedBy.length === 1 ? item.claimedBy[0].name : null;
        return claimedBy ? [{ itemIndex, people: [claimedBy] }] : [];
      });
      const response = await fetch("/api/split-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "list",
          currentUser,
          participants: participantNames,
          items: items.map((item) => ({
            description: item.name,
            quantity: String(item.quantity),
            amount: (item.priceCents * item.quantity / 100).toFixed(2),
          })),
          totals: {
            subtotal: (subtotalCents / 100).toFixed(2),
            tax: "0",
            tip: "0",
            total: (subtotalCents / 100).toFixed(2),
          },
          assignments: existingAssignments,
          messages: nextMessages,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          errorMessage(result, "The AI bot could not process that message."),
        );
      }
      if (
        !isAssistantResult(result) ||
        result.assignments.some(
          (assignment) => assignment.itemIndex >= items.length,
        )
      ) {
        throw new Error("The AI bot returned invalid assignments.");
      }

      const assignments = result.assignments.flatMap((assignment) => {
        const item = items[assignment.itemIndex];
        const assignee = assignment.people[0];
        if (
          !item ||
          item.claimedBy.length === 1 &&
            normalizeName(item.claimedBy[0].name) === normalizeName(assignee)
        ) {
          return [];
        }
        return [{ itemId: item.id, assignee }];
      });

      let savedCount = 0;
      if (assignments.length > 0) {
        const saveResponse = await fetch(
          `/api/dashboard/lists/${encodeURIComponent(list.id)}/assignments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignments }),
          },
        );
        const saved: unknown = await saveResponse.json();
        if (!saveResponse.ok) {
          const partial =
            typeof saved === "object" &&
            saved !== null &&
            "updatedCount" in saved &&
            typeof saved.updatedCount === "number"
              ? saved.updatedCount
              : 0;
          if (
            partial > 0 ||
            typeof saved === "object" &&
              saved !== null &&
              "refreshRequired" in saved &&
              saved.refreshRequired === true
          ) {
            router.refresh();
          }
          throw new Error(
            `${errorMessage(saved, "The assignments could not be saved.")}${partial > 0 ? ` ${partial} assignment(s) were saved before the error.` : ""}`,
          );
        }
        savedCount =
          typeof saved === "object" &&
          saved !== null &&
          "updatedCount" in saved &&
          typeof saved.updatedCount === "number"
            ? saved.updatedCount
            : 0;
      }

      const reply =
        result.clarification ||
        (savedCount > 0
          ? `${result.reply} ${savedCount} ${savedCount === 1 ? "assignment" : "assignments"} saved.`
          : result.reply);
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
      setMessage("");
      if (savedCount > 0) router.refresh();
    } catch (caught) {
      console.error(caught);
      setMessages(nextMessages);
      setError(
        caught instanceof Error
          ? caught.message
          : "The AI bot could not process that message.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="dash-list-assistant">
      <button
        className="btn line"
        type="button"
        aria-expanded={open}
        aria-controls={`list-assistant-${list.id}`}
        disabled={items.length === 0 || !canAssign}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close AI bot" : "AI bot"}
      </button>
      {!canAssign ? (
        <span className="sub">Only the group owner can assign items with the AI bot.</span>
      ) : null}
      {items.length === 0 ? (
        <span className="sub">Add items before asking the AI bot to assign them.</span>
      ) : null}
      <section
        className="dash-list-chat"
        id={`list-assistant-${list.id}`}
        aria-label={`AI bot for ${list.name}`}
        hidden={!open}
      >
        <div className="dash-list-chat-messages" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? (
            <p className="dash-list-chat-welcome">
              Tell me who should get each item. For example, “Alex is bringing the plates and I’ll take the drinks.”
            </p>
          ) : (
            messages.map((entry, index) => (
              <p className={`dash-list-chat-message ${entry.role}`} key={`${index}-${entry.role}`}>
                {entry.content}
              </p>
            ))
          )}
          {pending ? <p className="dash-list-chat-pending">Working on the assignments…</p> : null}
        </div>
        {error ? <p className="dash-list-chat-error" role="alert">{error}</p> : null}
        <form className="dash-list-chat-form" onSubmit={sendMessage}>
          <label className="sr" htmlFor={`list-message-${list.id}`}>
            Tell the AI bot how to assign items
          </label>
          <textarea
            id={`list-message-${list.id}`}
            value={message}
            maxLength={1000}
            rows={2}
            placeholder="Who should get each item?"
            disabled={pending}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button className="btn" type="submit" disabled={pending || !message.trim()}>
            {pending ? "Assigning…" : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}
