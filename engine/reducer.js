import { passRound, hasUnitsLeftToActivate } from "./activation.js";
import { resolveHold, resolveMove, resolveDisengage, resolveRun } from "./movement.js";
import { resolveDeploy } from "./deployment.js";
import { resolveRangedAttack, resolveCharge, endActivationManually } from "./actions.js";
import { resolvePlayCard } from "./cards.js";
import { endRound } from "./phases.js";
import { cloneState, appendLog } from "./state.js";

function maybeEndRound(working, result) {
  if (!result.ok) return result;
  if (!result.roundComplete) return result;
  // Check both sides really are out
  const aHas = hasUnitsLeftToActivate(working, "playerA");
  const bHas = hasUnitsLeftToActivate(working, "playerB");
  if (aHas || bHas) return result;
  return endRound(working);
}

export function dispatch(state, action) {
  const working = cloneState(state);
  switch (action.type) {
    case "PASS_ROUND": {
      const passed = passRound(working, action.payload.playerId);
      if (!passed.ok) return passed;
      // After passing, check if round should end
      const aHas = hasUnitsLeftToActivate(working, "playerA");
      const bHas = hasUnitsLeftToActivate(working, "playerB");
      if (!aHas && !bHas) return endRound(working);
      // Hand off to opponent
      working.activePlayer = action.payload.playerId === "playerA" ? "playerB" : "playerA";
      return { ok: true, state: working, events: [{ type: "player_passed", payload: { playerId: action.payload.playerId } }] };
    }
    case "END_ACTIVATION": {
      const r = endActivationManually(working, action.payload.playerId);
      return maybeEndRound(working, r);
    }
    case "HOLD_UNIT": {
      const r = resolveHold(working, action.payload.playerId, action.payload.unitId);
      return maybeEndRound(working, r);
    }
    case "MOVE_UNIT": {
      const r = resolveMove(working, action.payload.playerId, action.payload.unitId, action.payload.leadingModelId, action.payload.path, action.payload.modelPlacements);
      // MOVE keeps the activation open (action slot remains)
      return r;
    }
    case "DISENGAGE_UNIT": {
      const r = resolveDisengage(working, action.payload.playerId, action.payload.unitId, action.payload.leadingModelId, action.payload.path, action.payload.modelPlacements);
      return r;
    }
    case "RUN_UNIT": {
      const r = resolveRun(working, action.payload.playerId, action.payload.unitId, action.payload.leadingModelId, action.payload.path, action.payload.modelPlacements);
      return maybeEndRound(working, r);
    }
    case "DEPLOY_UNIT": {
      const r = resolveDeploy(working, action.payload.playerId, action.payload.unitId, action.payload.leadingModelId, action.payload.entryPoint, action.payload.path, action.payload.modelPlacements);
      return maybeEndRound(working, r);
    }
    case "DECLARE_RANGED_ATTACK": {
      const r = resolveRangedAttack(working, action.payload.playerId, action.payload.unitId, action.payload.targetId ?? null);
      return maybeEndRound(working, r);
    }
    case "DECLARE_CHARGE": {
      const r = resolveCharge(working, action.payload.playerId, action.payload.unitId, action.payload.targetId ?? null);
      return maybeEndRound(working, r);
    }
    case "PLAY_CARD":
      return resolvePlayCard(working, action.payload.playerId, action.payload.cardInstanceId, action.payload.targetUnitId ?? null);
    default:
      return { ok: false, code: "UNKNOWN_ACTION", message: `Unknown action type: ${action.type}` };
  }
}
