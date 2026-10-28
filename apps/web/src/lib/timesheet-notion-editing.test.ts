import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateEditedCards, resetEditedCardHours, setEditedCardHours, toggleEditedCard } from "./timesheet-notion-editing";

test("card edits retain metadata and allocate, reset, toggle and fall back", () => {
  const a = { notionPageId: "a", allocatedHours: 0, allocationMode: "auto" as const, source: "manual" as const, title: "Title" };
  const b = { notionPageId: "b", allocatedHours: 0, allocationMode: "auto" as const, source: "manual" as const };
  const cards = toggleEditedCard([a], b);
  assert.deepEqual(allocateEditedCards(8, cards).map((card) => card.allocatedHours), [4, 4]);
  const manual = setEditedCardHours(cards, "a", 2);
  assert.equal(manual[0]?.title, "Title");
  assert.equal(allocateEditedCards(8, manual)[1]?.allocatedHours, 6);
  assert.equal(resetEditedCardHours(manual)[0]?.allocationMode, "auto");
  assert.deepEqual(toggleEditedCard(cards, b), [a]);
  assert.equal(allocateEditedCards(-1, cards), cards);
  assert.equal(a.allocatedHours, 0);
});
