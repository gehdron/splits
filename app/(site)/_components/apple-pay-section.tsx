"use client";

import { useState } from "react";

type PayMethod = "apple" | "card";

const payStates: Record<PayMethod, { text: string; label: string; tint: string }> = {
  apple: {
    text: "On a supported phone, Apple Pay takes one confirmation with Face ID or Touch ID. No card number to type.",
    label: "Checkout placeholder: Apple Pay",
    tint: "#E4F8EF",
  },
  card: {
    text: "In any browser, friends enter a card on a hosted checkout page. No account and no app.",
    label: "Checkout placeholder: card",
    tint: "#ECE8FF",
  },
};

const methods: { id: PayMethod; name: string }[] = [
  { id: "apple", name: "Apple Pay" },
  { id: "card", name: "Card" },
];

export function ApplePaySection() {
  const [method, setMethod] = useState<PayMethod>("apple");
  const state = payStates[method];

  return (
    <div className="paysplit">
      <div>
        <h2>Apple Pay or a card, their choice</h2>
        <p className="lead" id="payText">{state.text}</p>
        <div className="seg" role="group" aria-label="Payment method">
          {methods.map((m) => (
            <button
              key={m.id}
              className={m.id === method ? "sg on" : "sg"}
              type="button"
              aria-pressed={m.id === method}
              onClick={() => setMethod(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
        <ul className="plist">
          <li>One link per person<span>Each person sees only their own share.</span></li>
          <li>No account and no app<span>Friends pay straight from the text message.</span></li>
        </ul>
        <p className="inl"><a href="#faq">Questions about Apple Pay? Read the FAQ.</a></p>
      </div>
      <div className="ph" id="payLabel" style={{ background: state.tint }}>{state.label}</div>
    </div>
  );
}
