import assert from "node:assert/strict";
import { chooseList, describe, isSummaryRequest, parseCommitments, renderSummary, textWithoutList } from "./commitments.ts";

const sender = "+12065550100";

const pizza = parseCommitments("I'll buy pizza", sender);
assert.deepEqual(pizza, [{ who: sender, action: "buy", item: "pizza" }]);

const drinks = parseCommitments("I will get the drinks for $12", sender);
assert.deepEqual(drinks, [{ who: sender, action: "get", item: "drinks", amount: "$12" }]);

assert.deepEqual(parseCommitments("I won't buy cake", sender), []);
assert.deepEqual(parseCommitments("Will you buy milk?", sender), []);

const cake = parseCommitments("Maya will buy the cake", sender);
assert.equal(cake[0]?.who, "Maya");
assert.equal(cake[0]?.action, "buy");
assert.equal(cake[0]?.item, "cake");

const both = parseCommitments("I will buy pizza for $18. Maya will buy the cake.", sender);
assert.deepEqual(both, [
  { who: sender, action: "buy", item: "pizza", amount: "$18" },
  { who: "Maya", action: "buy", item: "cake" },
]);

const casual = parseCommitments("oh this guy is buying this thing", sender);
assert.deepEqual(casual, [{ who: "this guy", action: "buy", item: "this thing" }]);

const maya = parseCommitments("oh Maya is buying the chips for $4.50", sender);
assert.deepEqual(maya, [{ who: "Maya", action: "buy", item: "chips", amount: "$4.50" }]);

const brayden = parseCommitments("Brayden is getting dish soap", sender);
assert.deepEqual(brayden, [{ who: "Brayden", action: "get", item: "dish soap" }]);

const uber = parseCommitments("I'm going to cover the Uber $23", sender);
assert.deepEqual(uber, [{ who: sender, action: "cover", item: "Uber", amount: "$23" }]);

assert.equal(isSummaryRequest("summary"), true);
assert.equal(isSummaryRequest("I'll buy pizza"), false);

const summary = renderSummary(
  [{ messageId: "m", spaceId: "s", who: sender, action: "buy", item: "pizza", amount: "$18", at: "t" }],
  sender,
);
assert.equal(summary, "So far:\n- You will buy pizza ($18).");
assert.match(describe({ who: "Maya", action: "buy", item: "cake" }, sender), /^Maya will buy cake/);

const lists = [
  { id: "house", name: "House supplies" },
  { id: "shared", name: "Shared list" },
];
const house = chooseList("on House supplies, Maya is buying the chips", lists);
assert.equal(house.ok && house.list.id, "house");
assert.equal(textWithoutList("on House supplies, Maya is buying the chips", "House supplies"), "Maya is buying the chips");
assert.deepEqual(parseCommitments("Maya is buying the chips", sender), [{ who: "Maya", action: "buy", item: "chips" }]);

const unclear = chooseList("Maya is buying the chips", lists);
assert.equal(unclear.ok, false);
if (!unclear.ok) assert.match(unclear.reply, /House supplies/);

const only = chooseList("Maya is buying the chips", [lists[0]]);
assert.equal(only.ok && only.list.id, "house");

console.log("commitment parser ok");
