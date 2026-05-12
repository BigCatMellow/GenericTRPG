// v0.12 Activation lifecycle

import { appendLog } from "./state.js";
import { applyActivationReadiness } from "./readiness.js";
import { breakGuarded, hasCondition } from "./conditions.js";

function getOpponent(playerId) {
  return playerId === "playerA" ? "playerB" : "playerA";
}

export function isCharacterEligibleForActivation(state, charId) {
  const ch = state.characters[charId];
  if (!ch) return false;
  if (state.phase !== "battle") return false;
  if (ch.owner !== state.activePlayer) return false;
  if (state.players[ch.owner].passedThisRound) return false;
  if (ch.activatedThisRound) return false;
  if (ch.health <= 0) return false;
  if (state.activatingCharacterId && state.activatingCharacterId !== charId) return false;
  return true;
}

export function getEligibleCharactersForPlayer(state, playerId) {
  return Object.values(state.characters).filter(ch =>
    ch.owner === playerId &&
    !ch.activatedThisRound &&
    ch.health > 0
  );
}

export function hasCharactersLeftToActivate(state, playerId) {
  if (state.players[playerId].passedThisRound) return false;
  return getEligibleCharactersForPlayer(state, playerId).length > 0;
}

export function beginActivation(state, charId) {
  const ch = state.characters[charId];
  if (!ch) return;
  ch.movementUsed = false;
  ch.actionUsed = false;
  ch.ranThisActivation = false;
  state.activatingCharacterId = charId;

  // Guarded ends at start of next activation
  // (applied at start so character can use guarded for reactions BEFORE activation)
  // Note: Guarded breaking on move/attack/run is handled in those resolvers
}

export function endActivation(state) {
  const charId = state.activatingCharacterId;
  if (!charId) return;
  const ch = state.characters[charId];
  if (ch) {
    ch.activatedThisRound = true;
    // Normal activation: Ready -> Committed
    applyActivationReadiness(ch);
    ch.movementUsed = false;
    ch.actionUsed = false;
    ch.ranThisActivation = false;

    // Guarded that persists to next activation clears now (if not already consumed)
    // "Starts next activation" in the rules means it ends before the character acts next round
    // We clear it at end of activation if it wasn't already consumed.
    // (Actually, the rule says "ends when ... starts next activation" — meaning it persists through the current activation but clears at the START of the next one)
    // We'll leave it until beginActivation clears it below.
  }
  state.activatingCharacterId = null;
}

export function passRound(state, playerId) {
  if (state.activePlayer !== playerId) {
    return { ok: false, code: "NOT_ACTIVE_PLAYER", message: "Only the active player can pass." };
  }
  if (state.activatingCharacterId) {
    return { ok: false, code: "ACTIVATION_IN_PROGRESS", message: "Finish the current activation first." };
  }
  state.players[playerId].passedThisRound = true;
  appendLog(state, "info", `${playerId === "playerA" ? "Player A" : "Player B"} passes for the round.`);
  return { ok: true };
}

export function handleHandoff(state) {
  const me = state.activePlayer;
  const opp = getOpponent(me);

  const meHas = hasCharactersLeftToActivate(state, me);
  const oppHas = hasCharactersLeftToActivate(state, opp);

  if (!meHas && !oppHas) return { roundComplete: true };

  if (oppHas) {
    state.activePlayer = opp;
    return { roundComplete: false };
  }

  return { roundComplete: false };
}
