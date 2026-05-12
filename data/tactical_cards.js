// v0.12 Tactical cards — simplified

export const TACTICAL_CARDS = {};

export function getTacticalCard(cardId) {
  const card = TACTICAL_CARDS[cardId];
  if (!card) return { id: cardId, name: cardId, phase: "battle", target: null, effect: null };
  return card;
}
