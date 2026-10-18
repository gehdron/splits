"use client";

import { useActionState, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "../auth/actions";
import { addGroupMember, addSavedFriend, createGroup, removeFriend } from "./actions";
import type { DashboardData } from "./types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "?").charAt(0);
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "").charAt(0) : "";
  return (first + last).toUpperCase();
}

function colorClass(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `p${1 + (h % 3)}`;
}

function Avatar({ name }: { name: string }) {
  return (
    <span className={`av ${colorClass(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />;
const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />;
const LogoMark = () => (
  <svg width="32" height="32" viewBox="3 3 60 60" aria-hidden="true">
    <g strokeWidth="6" strokeLinejoin="round">
      <polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" />
      <polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" />
    </g>
  </svg>
);

export function DashSidebar({ data }: { data: DashboardData }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const selected = search.get("group");
  const group = data.groups.find((entry) => entry.id === selected) ?? data.groups[0] ?? null;
  const members = data.members.filter((member) => member.groupId === group?.id);
  const returnTo = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
  const [friendBy, setFriendBy] = useState<"phone" | "email">("phone");
  const [createState, createAction, createPending] = useActionState(createGroup, undefined);
  const [friendState, friendAction, friendPending] = useActionState(addGroupMember, undefined);
  const [removeState, removeAction, removePending] = useActionState(removeFriend, undefined);
  const [savedState, savedAction, savedPending] = useActionState(addSavedFriend, undefined);

  function groupHref(id: string) {
    const next = new URLSearchParams(search.toString());
    next.set("group", id);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <aside className="side">
      <div className="brand">
        <LogoMark />
        <span>Splits</span>
      </div>

      <section aria-labelledby="g-h">
        <h2 className="sh" id="g-h">
          Your groups
        </h2>
        {data.loadError ? <p className="sub">We couldn’t load your groups. Reload the page to try again.</p> : null}
        {data.groups.length === 0 && !data.loadError ? <p className="sub">No group yet.</p> : null}
        <ul className="groups">
          {data.groups.map((entry) => {
            const count = data.members.filter((member) => member.groupId === entry.id).length;
            const on = entry.id === group?.id;
            return (
              <li key={entry.id}>
                <a className={`gbtn${on ? " on" : ""}`} href={groupHref(entry.id)} aria-current={on ? "page" : undefined}>
                  <span>{entry.name}</span>
                  <span className="cnt">{count}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <form action={createAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="lbl" htmlFor="ng">
            New group
          </label>
          <div className="inrow">
            <input id="ng" className="field" name="name" type="text" placeholder="Group name" required minLength={2} />
            <button className="btn" type="submit" disabled={createPending}>
              {createPending ? "…" : "Create"}
            </button>
          </div>
          {createState?.error ? <p className="err">{createState.error}</p> : null}
        </form>
      </section>

      <section aria-labelledby="f-h">
        <h2 className="sh" id="f-h">
          People
        </h2>
        {data.friendsReady ? null : <p className="sub">Run supabase/friends.sql in the Supabase SQL editor to save contacts.</p>}
        <ul className="friends">
          {data.friends.map((friend) => {
            const inGroup = members.some((member) => member.userId === friend.id);
            return (
              <li key={friend.id} className="fr">
                <Avatar name={friend.name} />
                <div>
                  <b>{friend.name}</b>
                  <small>{inGroup && group ? `In ${group.name}` : friend.phone}</small>
                </div>
                {group?.role === "owner" ? (
                  <form action={savedAction}>
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="friendId" value={friend.id} />
                    <button className="mini" type="submit" disabled={inGroup || savedPending}>
                      {inGroup ? "Added" : "Add"}
                    </button>
                  </form>
                ) : (
                  <span className="mini">{inGroup ? "Added" : ""}</span>
                )}
                <form action={removeAction}>
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="friendId" value={friend.id} />
                  {group ? <input type="hidden" name="groupId" value={group.id} /> : null}
                  <button className="xb" type="submit" aria-label={`Remove ${friend.name}`} disabled={removePending}>
                    <CloseIcon />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        {removeState?.error ? <p className="err">{removeState.error}</p> : null}
        {savedState?.error ? <p className="err">{savedState.error}</p> : null}
        <form action={friendAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          {group ? <input type="hidden" name="groupId" value={group.id} /> : null}
          <input type="hidden" name="by" value={friendBy} />
          <p className="lbl">{group ? `Add someone to ${group.name}` : "Save a friend"}</p>
          <div className="seg" role="group" aria-label="Add by">
            <button className={`sg${friendBy === "phone" ? " on" : ""}`} type="button" aria-pressed={friendBy === "phone"} onClick={() => setFriendBy("phone")}>
              Phone
            </button>
            <button className={`sg${friendBy === "email" ? " on" : ""}`} type="button" aria-pressed={friendBy === "email"} onClick={() => setFriendBy("email")}>
              Email
            </button>
          </div>
          <label className="lbl" htmlFor="friend-contact">
            {friendBy === "phone" ? "Phone number" : "Email"}
          </label>
          <input
            id="friend-contact"
            key={friendBy}
            className="field"
            name="contact"
            type={friendBy === "phone" ? "tel" : "email"}
            autoComplete={friendBy === "phone" ? "tel" : "email"}
            placeholder={friendBy === "phone" ? "(555) 123-4567" : "name@example.com"}
            required
          />
          {friendState?.error ? <p className="err">{friendState.error}</p> : null}
          <button className="btn full" type="submit" disabled={friendPending || !group}>
            <PlusIcon />
            {friendPending ? "Saving…" : "Add to group"}
          </button>
        </form>
      </section>

      <div className="me">
        <span className="av lgav p0">{initials(data.me.name)}</span>
        <div>
          <b>{data.me.name}</b>
          <small>{data.me.email}</small>
        </div>
        <form action={signOut}>
          <button className="btn txt" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
