"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut } from "../auth/actions";
import { addGroupMember, addSavedFriend, changeItem, createGroup, exitGroup, removeFriend, saveFriend } from "./actions";
import type { DashboardData } from "./types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number) => usd.format(cents / 100);

export function DashboardHome({ data }: { data: DashboardData }) {
  const [createState, createAction, createPending] = useActionState(createGroup, undefined);
  const [addState, addAction, addPending] = useActionState(addGroupMember, undefined);
  const [exitState, exitAction, exitPending] = useActionState(exitGroup, undefined);
  const [itemState, itemAction, itemPending] = useActionState(changeItem, undefined);
  const [friendState, friendAction, friendPending] = useActionState(saveFriend, undefined);
  const [removeState, removeAction, removePending] = useActionState(removeFriend, undefined);
  const [savedState, savedAction, savedPending] = useActionState(addSavedFriend, undefined);
  const [addBy, setAddBy] = useState<"phone" | "email">("phone");
  const [friendBy, setFriendBy] = useState<"phone" | "email">("phone");
  const [armedGroup, setArmedGroup] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const selected = searchParams.get("group");
  const group = data.groups.find((entry) => entry.id === selected) ?? data.groups[0] ?? null;
  const members = data.members.filter((member) => member.groupId === group?.id);
  const items = data.items.filter((item) => item.groupId === group?.id);
  const totals = data.totals.filter((total) => total.groupId === group?.id);
  const mine = totals.find((total) => total.userId === data.me.id);
  const others = totals.filter((total) => total.userId !== data.me.id);
  const subtotal = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const claimed = totals.reduce((sum, total) => sum + total.totalCents, 0);
  const note = searchParams.get("note");

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
        <p className="label">Friends</p>
        {data.friendsReady ? null : (
          <p className="quiet">Run supabase/friends.sql in the Supabase SQL editor to save contacts.</p>
        )}
        {data.friends.length === 0 && data.friendsReady ? <p className="quiet">No friends yet.</p> : null}
        <ul className="contacts">
          {data.friends.map((friend) => (
            <li key={friend.id}>
              <span>
                {friend.name}
                <span className="quiet">{friend.phone}</span>
              </span>
              <form action={removeAction}>
                <input type="hidden" name="friendId" value={friend.id} />
                {group ? <input type="hidden" name="groupId" value={group.id} /> : null}
                <button className="tiny" type="submit" disabled={removePending}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
        {removeState?.error ? <p className="err">{removeState.error}</p> : null}
        <form action={friendAction}>
          {group ? <input type="hidden" name="groupId" value={group.id} /> : null}
          <input type="hidden" name="by" value={friendBy} />
          <div className="pick" role="group" aria-label="Save a friend by">
            <button type="button" aria-pressed={friendBy === "phone"} onClick={() => setFriendBy("phone")}>
              Phone
            </button>
            <button type="button" aria-pressed={friendBy === "email"} onClick={() => setFriendBy("email")}>
              Email
            </button>
          </div>
          <label>
            {friendBy === "phone" ? "Phone number" : "Email"}
            <input
              key={friendBy}
              name="contact"
              type={friendBy === "phone" ? "tel" : "email"}
              autoComplete={friendBy === "phone" ? "tel" : "email"}
              required
            />
          </label>
          {friendState?.error ? <p className="err">{friendState.error}</p> : null}
          <button type="submit" disabled={friendPending}>
            {friendPending ? "Saving…" : "Save friend"}
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
            {armedGroup === group.id ? (
              <form className="row" action={exitAction}>
                <input type="hidden" name="groupId" value={group.id} />
                <p>{group.role === "owner" ? "Delete this group for everyone?" : "Leave this group?"}</p>
                {exitState?.error ? <p className="err">{exitState.error}</p> : null}
                <button type="submit" disabled={exitPending}>
                  {exitPending ? "Working…" : group.role === "owner" ? "Delete group" : "Leave group"}
                </button>
                <button type="button" className="quiet" onClick={() => setArmedGroup(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <button type="button" className="quiet" onClick={() => setArmedGroup(group.id)}>
                {group.role === "owner" ? "Delete group" : "Leave group"}
              </button>
            )}
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
                <>
                  {data.friends.some((friend) => !members.some((member) => member.userId === friend.id)) ? (
                    <ul className="contacts">
                      {data.friends
                        .filter((friend) => !members.some((member) => member.userId === friend.id))
                        .map((friend) => (
                          <li key={friend.id}>
                            <span>{friend.name}</span>
                            <form action={savedAction}>
                              <input type="hidden" name="groupId" value={group.id} />
                              <input type="hidden" name="friendId" value={friend.id} />
                              <button className="tiny" type="submit" disabled={savedPending}>
                                Add
                              </button>
                            </form>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {savedState?.error ? <p className="err">{savedState.error}</p> : null}
                <form action={addAction}>
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="by" value={addBy} />
                  <div className="pick" role="group" aria-label="Add by">
                    <button type="button" aria-pressed={addBy === "phone"} onClick={() => setAddBy("phone")}>
                      Phone
                    </button>
                    <button type="button" aria-pressed={addBy === "email"} onClick={() => setAddBy("email")}>
                      Email
                    </button>
                  </div>
                  <label>
                    {addBy === "phone" ? "Phone number" : "Email"}
                    <input
                      key={addBy}
                      name="contact"
                      type={addBy === "phone" ? "tel" : "email"}
                      autoComplete={addBy === "phone" ? "tel" : "email"}
                      required
                    />
                  </label>
                  {addState?.error ? <p className="err">{addState.error}</p> : null}
                  <button type="submit" disabled={addPending}>
                    {addPending ? "Adding…" : "Add to group"}
                  </button>
                </form>
                </>
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
              {note === "already" ? <p className="quiet">That name is already on the list. It was added again.</p> : null}
              {itemState?.error ? <p className="err">{itemState.error}</p> : null}
              {items.length === 0 ? <p className="quiet">No items in this group yet.</p> : null}
              {items.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">List</th>
                      <th scope="col">Price</th>
                      <th scope="col">Claimed by</th>
                      <th scope="col">
                        <span className="sr">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const claimedByMe = item.claimedBy.some((person) => person.userId === data.me.id);
                      return (
                        <tr key={item.id}>
                          <td>
                            {item.name}
                            {item.quantity > 1 ? ` x${item.quantity}` : ""}
                          </td>
                          <td>{item.listName}</td>
                          <td>{money(item.priceCents * item.quantity)}</td>
                          <td>{item.claimedBy.length > 0 ? item.claimedBy.map((person) => person.name).join(", ") : "Unclaimed"}</td>
                          <td className="acts">
                            <form action={itemAction}>
                              <input type="hidden" name="intent" value={claimedByMe ? "unclaim" : "claim"} />
                              <input type="hidden" name="groupId" value={group.id} />
                              <input type="hidden" name="itemId" value={item.id} />
                              <button className="tiny" type="submit" disabled={itemPending}>
                                {claimedByMe ? "Unclaim" : "Claim"}
                              </button>
                            </form>
                            {group.role === "owner" ? (
                              <form action={itemAction}>
                                <input type="hidden" name="intent" value="delete" />
                                <input type="hidden" name="groupId" value={group.id} />
                                <input type="hidden" name="itemId" value={item.id} />
                                <button className="tiny" type="submit" disabled={itemPending}>
                                  Delete
                                </button>
                              </form>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
              {items.length > 0 ? (
                <p>
                  Subtotal {money(subtotal)}
                  {subtotal - claimed > 0 ? `. Not claimed yet ${money(subtotal - claimed)}` : ""}.
                </p>
              ) : null}
              {group.role === "owner" ? (
                <form className="split" action={itemAction}>
                  <input type="hidden" name="intent" value="add" />
                  <input type="hidden" name="groupId" value={group.id} />
                  <label>
                    Add item
                    <input name="name" required />
                  </label>
                  <label>
                    Price
                    <input name="price" inputMode="decimal" placeholder="$--.--" />
                  </label>
                  <button type="submit" disabled={itemPending}>
                    {itemPending ? "Saving…" : "Add"}
                  </button>
                </form>
              ) : (
                <p className="quiet">An owner adds items. Claim what you ordered.</p>
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
