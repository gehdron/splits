"use client";

import { useActionState } from "react";
import { signOut } from "../auth/actions";
import { addGroupMember, createGroup } from "./actions";
import type { DashboardData } from "./types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number) => usd.format(cents / 100);

export function DashboardHome({ data }: { data: DashboardData }) {
  const [createState, createAction, createPending] = useActionState(createGroup, undefined);
  const [addState, addAction, addPending] = useActionState(addGroupMember, undefined);
  const group = data.groups.find((entry) => entry.id === data.selectedGroupId) ?? null;
  const members = data.members.filter((member) => member.groupId === group?.id);
  const items = data.items.filter((item) => item.groupId === group?.id);
  const totals = data.totals.filter((total) => total.groupId === group?.id);
  const mine = totals.find((total) => total.userId === data.me.id);
  const others = totals.filter((total) => total.userId !== data.me.id);

  return (
    <div className="dash">
      <aside>
        <p className="brand">Splits</p>
        <p className="label">Your groups</p>
        {data.groups.length === 0 ? <p className="quiet">No group yet.</p> : null}
        <ul className="groups">
          {data.groups.map((entry) => (
            <li key={entry.id}>
              <a href={`/dashboard?group=${entry.id}`} aria-current={entry.id === group?.id ? "page" : undefined}>
                {entry.name}
              </a>
            </li>
          ))}
        </ul>
        <form action={createAction}>
          <label>
            New group
            <input name="name" required minLength={2} />
          </label>
          {createState?.error ? <p className="err">{createState.error}</p> : null}
          <button type="submit" disabled={createPending}>
            {createPending ? "Creating…" : "Create group"}
          </button>
        </form>
        <p className="you">
          <strong>{data.me.name}</strong>
          <span>{data.me.email}</span>
          {data.me.phone ? <span>{data.me.phone}</span> : null}
        </p>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </aside>
      <main>
        {data.loadError ? (
          <>
            <h1>We couldn&apos;t load your groups.</h1>
            <p>{data.loadError}</p>
          </>
        ) : !group ? (
          <>
            <h1>You are not in a group yet.</h1>
            <p>Create a group, or ask an owner to add the phone number on your account.</p>
          </>
        ) : (
          <>
            <h1>{group.name}</h1>
            <p>{group.role === "owner" ? "You own this group." : "You are a member of this group."}</p>
            <p>{mine ? `Your share is ${money(mine.totalCents)}.` : "You have not claimed anything in this group."}</p>

            <section>
              <h2>People</h2>
              <ul>
                {members.map((member) => (
                  <li key={member.id}>
                    {member.name}
                    {member.userId === data.me.id ? " (you)" : ""}, {member.role}
                  </li>
                ))}
              </ul>
              {group.role === "owner" ? (
                <form action={addAction}>
                  <input type="hidden" name="groupId" value={group.id} />
                  <label>
                    Add someone by phone
                    <input name="phone" type="tel" autoComplete="tel" required />
                  </label>
                  {addState?.error ? <p className="err">{addState.error}</p> : null}
                  <button type="submit" disabled={addPending}>
                    {addPending ? "Adding…" : "Add to group"}
                  </button>
                </form>
              ) : (
                <p className="quiet">An owner adds people. Only members can see these items.</p>
              )}
            </section>

            <section>
              <h2>Who owes what</h2>
              {totals.length === 0 ? <p className="quiet">Nothing claimed yet.</p> : null}
              <ul>
                {mine ? (
                  <li>
                    You, {money(mine.totalCents)}
                  </li>
                ) : null}
                {others.map((total) => (
                  <li key={total.userId}>
                    {total.name}, {money(total.totalCents)}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2>Items</h2>
              {items.length === 0 ? (
                <p className="quiet">No items in this group yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">List</th>
                      <th scope="col">Price</th>
                      <th scope="col">Claimed by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.name}
                          {item.quantity > 1 ? ` x${item.quantity}` : ""}
                        </td>
                        <td>{item.listName}</td>
                        <td>{money(item.priceCents * item.quantity)}</td>
                        <td>{item.claimedBy.length > 0 ? item.claimedBy.join(", ") : "Unclaimed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p>
                <a href="/detect">Split a bill</a>
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
