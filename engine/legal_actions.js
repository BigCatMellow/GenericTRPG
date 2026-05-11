import { getEligibleUnitsForPlayer } from "./activation.js";
import { validateHold, validateMove, validateDisengage, validateRun } from "./movement.js";
import { validateRangedAttack, validateCharge } from "./actions.js";
import { validateDeploy } from "./deployment.js";
import { getPlayableCardActions } from "./cards.js";

export function getLegalActionsForPlayer(state, playerId) {
  const out = [];
  out.push(...getPlayableCardActions(state, playerId));
  if (state.activePlayer !== playerId) return out;
  if (state.players[playerId].passedThisRound) return out;
  out.push({ type: "PASS_ROUND", enabled: !state.activatingUnitId });

  if (state.activatingUnitId) {
    const unit = state.units[state.activatingUnitId];
    if (unit && unit.owner === playerId) {
      out.push(...getLegalActionsForUnit(state, playerId, unit.id));
      out.push({ type: "END_ACTIVATION", unitId: unit.id, enabled: true });
    }
    return out;
  }

  for (const unit of getEligibleUnitsForPlayer(state, playerId)) {
    out.push(...getLegalActionsForUnit(state, playerId, unit.id));
  }
  return out;
}

export function getLegalActionsForUnit(state, playerId, unitId) {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== playerId) return [];
  const desc = [];
  if (unit.status.location === "reserves") {
    desc.push({ type: "DEPLOY_UNIT", unitId, enabled: true, uiHints: { requiresBoardClick: true } });
    return desc;
  }
  // Battlefield unit
  const movementUsed = !!unit.status.movementUsed;
  const actionUsed = !!unit.status.actionUsed;
  desc.push({ type: "HOLD_UNIT", unitId, enabled: validateHold(state, playerId, unitId).ok });
  if (!movementUsed && !actionUsed) {
    // Run is "all-in", so it requires both slots empty
    desc.push({ type: "RUN_UNIT", unitId, enabled: validateRun(state, playerId, unitId, unit.leadingModelId, [{ x: 0, y: 0 }, { x: 0, y: 0 }]).ok || !unit.status.engaged, uiHints: { requiresBoardClick: true } });
  }
  if (!movementUsed) {
    desc.push({ type: "MOVE_UNIT", unitId, enabled: !unit.status.engaged, uiHints: { requiresBoardClick: true } });
    desc.push({ type: "DISENGAGE_UNIT", unitId, enabled: unit.status.engaged, uiHints: { requiresBoardClick: true } });
  }
  if (!actionUsed) {
    if (unit.rangedWeapons?.length) {
      desc.push({ type: "DECLARE_RANGED_ATTACK", unitId, enabled: validateRangedAttack(state, playerId, unitId).ok });
    }
    if (unit.meleeWeapons?.length) {
      desc.push({ type: "DECLARE_CHARGE", unitId, enabled: validateCharge(state, playerId, unitId).ok });
    }
  }
  return desc;
}

/* ── Legal destinations (used by UI/AI for spatial choice) ── */
export function getLegalMoveDestinations(state, playerId, unitId, leadingModelId) {
  const unit = state.units[unitId];
  const leader = unit.models[leadingModelId];
  const points = [];
  for (let x = 0.5; x < state.board.widthInches; x += 1) {
    for (let y = 0.5; y < state.board.heightInches; y += 1) {
      const path = [{ x: leader.x, y: leader.y }, { x, y }];
      if (validateMove(state, playerId, unitId, leadingModelId, path).ok) points.push({ x, y });
    }
  }
  return points;
}

export function getLegalDeployDestinations(state, playerId, unitId, leadingModelId) {
  const points = [];
  const entrySide = state.deployment.entryEdges[playerId].side;
  const entryX = entrySide === "west" ? 0 : state.board.widthInches;
  for (let x = 0.5; x < state.board.widthInches; x += 1) {
    for (let y = 0.5; y < state.board.heightInches; y += 1) {
      const entryPoint = entrySide === "west" || entrySide === "east"
        ? { x: entryX, y }
        : { x, y: entrySide === "north" ? 0 : state.board.heightInches };
      const path = [entryPoint, { x, y }];
      if (validateDeploy(state, playerId, unitId, leadingModelId, entryPoint, path).ok) points.push({ x, y, entryPoint });
    }
  }
  return points;
}

export function getLegalDisengageDestinations(state, playerId, unitId, leadingModelId) {
  const unit = state.units[unitId];
  const leader = unit.models[leadingModelId];
  const points = [];
  for (let x = 0.5; x < state.board.widthInches; x += 1) {
    for (let y = 0.5; y < state.board.heightInches; y += 1) {
      const path = [{ x: leader.x, y: leader.y }, { x, y }];
      if (validateDisengage(state, playerId, unitId, leadingModelId, path).ok) points.push({ x, y });
    }
  }
  return points;
}

export function getLegalRunDestinations(state, playerId, unitId, leadingModelId) {
  const unit = state.units[unitId];
  const leader = unit.models[leadingModelId];
  const points = [];
  for (let x = 0.5; x < state.board.widthInches; x += 1) {
    for (let y = 0.5; y < state.board.heightInches; y += 1) {
      const path = [{ x: leader.x, y: leader.y }, { x, y }];
      if (validateRun(state, playerId, unitId, leadingModelId, path).ok) points.push({ x, y });
    }
  }
  return points;
}
