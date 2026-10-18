"use client";

import { useState } from "react";

type DeviceContact = {
  name?: string[];
  tel?: string[];
  email?: string[];
};

type ContactsNavigator = Navigator & {
  contacts?: {
    select: (
      properties: Array<"name" | "tel" | "email">,
      options?: { multiple?: boolean },
    ) => Promise<DeviceContact[]>;
  };
};

export type PickedContact = {
  name: string;
  phone: string;
  email: string;
};

export function ContactPickerButton({
  className,
  onSelect,
}: {
  className?: string;
  onSelect: (contact: PickedContact) => void;
}) {
  const [error, setError] = useState("");

  async function chooseContact() {
    setError("");
    const contactPicker = (navigator as ContactsNavigator).contacts;
    if (!contactPicker) {
      setError("Contact selection isn’t supported here. Enter a phone number or email instead.");
      return;
    }

    try {
      const [contact] = await contactPicker.select(["name", "tel", "email"], { multiple: false });
      if (!contact) return;
      const name = contact.name?.[0]?.trim() ?? "";
      const phone = contact.tel?.[0]?.trim() ?? "";
      const email = contact.email?.[0]?.trim() ?? "";
      if (!phone && !email) {
        setError("That contact doesn’t have a phone number or email address.");
        return;
      }
      onSelect({ name, phone, email });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("Couldn’t access contacts. You can still enter a phone number or email.");
    }
  }

  return (
    <div className="contact-picker">
      <button className={className} type="button" onClick={chooseContact}>
        Choose from contacts
      </button>
      {error ? <p className="err" role="status">{error}</p> : null}
    </div>
  );
}
