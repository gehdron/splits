"use client";

import { useState } from "react";

const items = [
  {
    q: "Do my friends need to install an app?",
    a: "No. They open the link from a text message on their phone and pay in the browser. There is no app and no account.",
  },
  {
    q: "Does Splits work with Apple Pay?",
    a: "Yes. On a supported device, friends confirm with Face ID or Touch ID. Everyone else pays with a card on the same page.",
  },
  {
    q: "How are tax and tip split?",
    a: "In proportion to what each person ordered, so a light order does not cover half of a big one.",
  },
  {
    q: "What happens with shared plates?",
    a: "Anyone who claims a shared item splits it evenly with the other people who claimed it.",
  },
  {
    q: "Where do card details go?",
    a: "Checkout is hosted by the payment provider, so card details do not pass through Splits. This demo takes real payments of a few dollars and refunds them.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="faq">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className={isOpen ? "fq open" : "fq"}>
            <button
              className="fq-b"
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{item.q}</span>
              <span className="pm" aria-hidden="true" />
            </button>
            <div className="fq-p"><div><p>{item.a}</p></div></div>
          </div>
        );
      })}
    </div>
  );
}
