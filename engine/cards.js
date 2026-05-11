import { addEffect } from './effects.js';
import { getTacticalCard } from '../data/tactical_cards.js';
import { appendLog } from './state.js';

function findCardInHand(player, cardInstanceId) {
  return player.hand?.find(c => c.instanceId === cardInstanceId) ?? null;
}

function isCardPlayablePhase(card, state) {
  // In the new single-phase model, all cards are playable during "battle".
  // Cards keep their `phase` field as a flavor hint for UI, but it no longer gates play.
  if (state.phase !== "battle") return false;
  return true;
}

export function validatePlayCard(state, playerId, cardInstanceId, targetUnitId = null) {
  const player = state.players[playerId];
  if (!player) return { ok: false, code: 'BAD_PLAYER', message: 'Unknown player.' };
  if (state.activePlayer !== playerId) return { ok: false, code: 'NOT_ACTIVE_PLAYER', message: 'Only the active player may play cards.' };
  if (state.players[playerId].passedThisRound) return { ok: false, code: 'PASSED', message: 'You have passed for this round.' };
  const cardInHand = findCardInHand(player, cardInstanceId);
  if (!cardInHand) return { ok: false, code: 'CARD_NOT_IN_HAND', message: 'Card is not in hand.' };
  const card = getTacticalCard(cardInHand.cardId);
  if (!isCardPlayablePhase(card, state)) return { ok: false, code: 'WRONG_PHASE', message: `${card.name} cannot be played now.` };
  if (card.target === 'friendly_battlefield_unit') {
    if (!targetUnitId) return { ok: false, code: 'MISSING_TARGET', message: 'This card requires a friendly target unit.' };
    const target = state.units[targetUnitId];
    if (!target || target.owner !== playerId || target.status.location !== 'battlefield') {
      return { ok: false, code: 'BAD_TARGET', message: 'Select a friendly battlefield unit as target.' };
    }
    return { ok: true, card, cardInHand, target };
  }
  return { ok: true, card, cardInHand, target: null };
}

export function resolvePlayCard(state, playerId, cardInstanceId, targetUnitId = null) {
  const v = validatePlayCard(state, playerId, cardInstanceId, targetUnitId);
  if (!v.ok) return v;
  const player = state.players[playerId];
  const { card, cardInHand, target } = v;
  const effectId = addEffect(state, {
    name: card.name,
    source: { kind: 'tactical_card', id: card.id, owner: playerId },
    target: target ? { scope: 'unit', unitId: target.id } : { scope: 'player', playerId },
    timings: card.effect.timings,
    modifiers: card.effect.modifiers,
    duration: structuredClone(card.effect.duration)
  });
  player.hand = player.hand.filter(e => e.instanceId !== cardInstanceId);
  player.discardPile = [...(player.discardPile ?? []), cardInHand];
  appendLog(state, 'card', `${playerId === 'playerA' ? 'Crown' : 'Reavers'} play ${card.name}${target ? ` on ${target.name}` : ''}.`);
  return { ok: true, state, events: [{ type: 'card_played', payload: { playerId, cardId: card.id, cardInstanceId, targetUnitId: target?.id ?? null, effectId } }] };
}

export function getPlayableCardActions(state, playerId) {
  const player = state.players[playerId];
  if (!player || state.activePlayer !== playerId) return [];
  if (state.players[playerId].passedThisRound) return [];
  if (state.phase !== "battle") return [];
  const out = [];
  for (const card of player.hand ?? []) {
    const def = getTacticalCard(card.cardId);
    if (def.target === 'friendly_battlefield_unit') {
      for (const unitId of state.players[playerId].battlefieldUnitIds) {
        out.push({ type: 'PLAY_CARD', cardInstanceId: card.instanceId, cardId: card.cardId, targetUnitId: unitId, enabled: true });
      }
      continue;
    }
    out.push({ type: 'PLAY_CARD', cardInstanceId: card.instanceId, cardId: card.cardId, targetUnitId: null, enabled: true });
  }
  return out;
}
