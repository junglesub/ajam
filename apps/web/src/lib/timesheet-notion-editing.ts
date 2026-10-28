import { allocateNotionCardHours, type TimesheetEntryNotionCardDraft } from "@timesheet/domain";

type Card = TimesheetEntryNotionCardDraft;

export function allocateEditedCards(hours: number, cards: Card[]): Card[] {
  try {
    return allocateNotionCardHours({ entryHours: hours, links: cards });
  } catch {
    return cards;
  }
}

export function toggleEditedCard(cards: Card[], card: Card): Card[] {
  return cards.some((item) => item.notionPageId === card.notionPageId)
    ? cards.filter((item) => item.notionPageId !== card.notionPageId)
    : [...cards, card];
}

export function setEditedCardHours(cards: Card[], pageId: string, hours: number): Card[] {
  return cards.map((card) => card.notionPageId === pageId
    ? { ...card, allocatedHours: Math.max(hours, 0), allocationMode: "manual" }
    : card);
}

export function resetEditedCardHours(cards: Card[]): Card[] {
  return cards.map((card) => ({ ...card, allocatedHours: 0, allocationMode: "auto" }));
}
