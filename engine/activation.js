import { appendLog } from "./state.js";

/**
 * Activation lifecycle:
 *   beginActivation(state, unitId) — sets state.activatingUnitId, clears per-activation flags
 *   endActivation(state)           — marks unit activatedThisRound, clears activatingUnitId, hands off to opponent
 *
 * Round lifecycle:
 *   handleHandoff(state)  — after activation ends, decide whose turn it is next
 *                           (alternation, with spillover when one side has no units left)
 *   advanceRound(state)   — if both sides are done, run cleanup and start next round
 *                           (returns end-of-round result instead of continuing handoff)
 */

function getOpponent(playerId) {
  return playerId === "playerA" ? "playerB" : "playerA";
}

export function isUnitEligibleForActivation(state, unitId) {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (state.phase !== "battle") return false;
  if (unit.owner !== state.activePlayer) return false;
  if (state.players[unit.owner].passedThisRound) return false;
  if (unit.status.activatedThisRound) return false;
  if (state.activatingUnitId && state.activatingUnitId !== unitId) return false;
  // Battlefield units always eligible; reserve units only via Deploy
  return unit.status.location === "battlefield" || unit.status.location === "reserves";
}

export function getEligibleUnitsForPlayer(state, playerId) {
  return Object.values(state.units).filter(unit =>
    unit.owner === playerId &&
    !unit.status.activatedThisRound &&
    (unit.status.location === "battlefield" || unit.status.location === "reserves")
  );
}

export function hasUnitsLeftToActivate(state, playerId) {
  if (state.players[playerId].passedThisRound) return false;
  return getEligibleUnitsForPlayer(state, playerId).length > 0;
}

export function beginActivation(state, unitId) {
  const unit = state.units[unitId];
  unit.status.movementUsed = false;
  unit.status.actionUsed = false;
  unit.status.runThisActivation = false;
  state.activatingUnitId = unitId;
}

export function endActivation(state) {
  const unitId = state.activatingUnitId;
  if (!unitId) return;
  const unit = state.units[unitId];
  unit.status.activatedThisRound = true;
  unit.status.movementUsed = false;
  unit.status.actionUsed = false;
  // Keep runThisActivation through end-of-round? No — it's per-activation. Reset.
  unit.status.runThisActivation = false;
  state.activatingUnitId = null;
}

/**
 * Mark passed: surrender all remaining activations this round.
 * The opponent gets to use any remaining activations they have.
 */
export function passRound(state, playerId) {
  if (state.activePlayer !== playerId) {
    return { ok: false, code: "NOT_ACTIVE_PLAYER", message: "Only the active player can pass." };
  }
  if (state.activatingUnitId) {
    return { ok: false, code: "ACTIVATION_IN_PROGRESS", message: "Finish the current activation first." };
  }
  state.players[playerId].passedThisRound = true;
  appendLog(state, "info", `${playerId === "playerA" ? "Crown Levy" : "Border Reavers"} pass for the round.`);
  return { ok: true };
}

/**
 * After an activation ends, choose whose turn it is next.
 * Pure alternation, but if the would-be next player has nothing to do
 * (passed or no eligible units), control stays with the current player.
 *
 * Returns { roundComplete: boolean }. Caller decides what to do next.
 */
export function handleHandoff(state) {
  const me = state.activePlayer;
  const opp = getOpponent(me);

  const meHas = hasUnitsLeftToActivate(state, me);
  const oppHas = hasUnitsLeftToActivate(state, opp);

  if (!meHas && !oppHas) return { roundComplete: true };

  // Strict alternation when both have units
  if (oppHas) {
    state.activePlayer = opp;
    return { roundComplete: false };
  }

  // Spillover: opponent is out, I keep going
  return { roundComplete: false };
}

/** Mark the given unit activated, clear activation pointers, hand off if possible. */
export function endActivationAndHandoff(state) {
  endActivation(state);
  return handleHandoff(state);
}
