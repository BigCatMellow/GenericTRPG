// v0.12 Reducer — dispatch to action handlers

import { passRound, hasCharactersLeftToActivate, handleHandoff, beginActivation, endActivation } from "./activation.js";
import { resolveMove, resolveRun } from "./movement.js";
import { resolveHold, resolveRecover, resolveSecureObjective, resolveAttack, resolveClassAbility, endActivationManually } from "./actions.js";
import { endRound } from "./phases.js";
import { cloneState, appendLog } from "./state.js";

function maybeEndRound(working, result) {
  if (!result.ok) return result;
  if (!result.roundComplete) return result;
  const aHas = hasCharactersLeftToActivate(working, "playerA");
  const bHas = hasCharactersLeftToActivate(working, "playerB");
  if (aHas || bHas) return result;
  return endRound(working);
}

function withHandoff(working, result) {
  if (!result.ok) return result;
  const handoff = handleHandoff(working);
  result.roundComplete = handoff.roundComplete;
  return maybeEndRound(working, result);
}

function ensureActivation(working, charId) {
  if (!working.activatingCharacterId) {
    beginActivation(working, charId);
  }
}

function finalizeActivation(working, charId) {
  endActivation(working);
}

export function dispatch(state, action) {
  const working = cloneState(state);

  switch (action.type) {
    case "PASS_ROUND": {
      const passed = passRound(working, action.payload.playerId);
      if (!passed.ok) return passed;
      const aHas = hasCharactersLeftToActivate(working, "playerA");
      const bHas = hasCharactersLeftToActivate(working, "playerB");
      if (!aHas && !bHas) return endRound(working);
      working.activePlayer = action.payload.playerId === "playerA" ? "playerB" : "playerA";
      return { ok: true, state: working, events: [{ type: "player_passed", payload: { playerId: action.payload.playerId } }] };
    }

    case "HOLD": {
      const { playerId, charId } = action.payload;
      ensureActivation(working, charId);
      const r = resolveHold(working, playerId, charId);
      if (!r.ok) return r;
      finalizeActivation(working, charId);
      return withHandoff(working, r);
    }

    case "MOVE": {
      const { playerId, charId, destination } = action.payload;
      ensureActivation(working, charId);
      const r = resolveMove(working, playerId, charId, destination);
      if (!r.ok) return r;
      return { ok: true, state: working, events: r.events ?? [] };
    }

    case "RUN": {
      const { playerId, charId, destination } = action.payload;
      ensureActivation(working, charId);
      const r = resolveRun(working, playerId, charId, destination);
      if (!r.ok) return r;
      finalizeActivation(working, charId);
      return withHandoff(working, r);
    }

    case "RECOVER": {
      const { playerId, charId } = action.payload;
      ensureActivation(working, charId);
      const r = resolveRecover(working, playerId, charId);
      if (!r.ok) return r;
      finalizeActivation(working, charId);
      return withHandoff(working, r);
    }

    case "SECURE_OBJECTIVE": {
      const { playerId, charId } = action.payload;
      ensureActivation(working, charId);
      const r = resolveSecureObjective(working, playerId, charId);
      if (!r.ok) return r;
      finalizeActivation(working, charId);
      return withHandoff(working, r);
    }

    case "ATTACK": {
      const { playerId, charId, targetId, attackKey } = action.payload;
      ensureActivation(working, charId);
      const r = resolveAttack(working, playerId, charId, targetId, attackKey);
      if (!r.ok) return r;
      finalizeActivation(working, charId);
      return withHandoff(working, r);
    }

    case "CLASS_ABILITY": {
      const { playerId, charId, abilityId, targetId } = action.payload;
      ensureActivation(working, charId);
      const r = resolveClassAbility(working, playerId, charId, abilityId, targetId ?? null);
      if (!r.ok) return r;
      finalizeActivation(working, charId);
      return withHandoff(working, r);
    }

    case "END_ACTIVATION": {
      const { playerId, charId } = action.payload;
      const r = endActivationManually(working, playerId, charId ?? working.activatingCharacterId);
      if (!r.ok) return r;
      if (working.activatingCharacterId) {
        finalizeActivation(working, working.activatingCharacterId);
      }
      return withHandoff(working, r);
    }

    default:
      return { ok: false, code: "UNKNOWN_ACTION", message: `Unknown action type: ${action.type}` };
  }
}
