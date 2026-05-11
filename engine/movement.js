import { appendLog } from "./state.js";
import { isUnitEligibleForActivation, beginActivation, endActivation, handleHandoff } from "./activation.js";
import { pointInBoard, pathLength, pathBlockedForCircle, pathTravelCost, gridDistance, circleOverlapsTerrain, circleOverlapsCircle, distance } from "./geometry.js";
import { autoArrangeModels, applyModelPlacementsAndResolveCoherency } from "./coherency.js";
import { refreshAllSupply } from "./supply.js";
import { getModifiedValue } from "./effects.js";

const ENGAGEMENT_RANGE = 1;
const RUN_BONUS = 2;

function getModel(unit, modelId) {
  if (!unit.models[modelId]) throw new Error(`Unknown model ${modelId} in unit ${unit.id}`);
  return unit.models[modelId];
}

/* ── Engagement bookkeeping (unchanged from original) ── */
function updateUnitEngagementStatus(state) {
  for (const unit of Object.values(state.units)) {
    unit.status.engaged = false;
  }
  const groundUnits = Object.values(state.units).filter(u => u.status.location === "battlefield" && u.tags.includes("Ground"));
  for (let i = 0; i < groundUnits.length; i += 1) {
    for (let j = i + 1; j < groundUnits.length; j += 1) {
      const a = groundUnits[i], b = groundUnits[j];
      if (a.owner === b.owner) continue;
      let engaged = false;
      for (const aModel of Object.values(a.models)) {
        if (!aModel.alive || aModel.x == null) continue;
        for (const bModel of Object.values(b.models)) {
          if (!bModel.alive || bModel.x == null) continue;
          const edge = distance(aModel, bModel) - a.base.radiusInches - b.base.radiusInches;
          if (edge <= ENGAGEMENT_RANGE + 1e-6) { engaged = true; break; }
        }
        if (engaged) break;
      }
      if (engaged) { a.status.engaged = true; b.status.engaged = true; }
    }
  }
}

export function refreshEngagement(state) { updateUnitEngagementStatus(state); }

/* ── Activation gates ── */
function validateCanAct(state, playerId, unitId) {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, code: "UNKNOWN_UNIT", message: "Unit not found." };
  if (unit.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "You do not control that unit." };
  if (state.phase !== "battle") return { ok: false, code: "WRONG_PHASE", message: "Battle phase only." };
  // If no activation in progress, require eligibility to start one
  if (!state.activatingUnitId) {
    if (!isUnitEligibleForActivation(state, unitId)) return { ok: false, code: "UNIT_NOT_ELIGIBLE", message: "Unit is not eligible to activate." };
    return { ok: true, unit, beginningActivation: true };
  }
  if (state.activatingUnitId !== unitId) return { ok: false, code: "WRONG_UNIT", message: "Another unit is mid-activation." };
  return { ok: true, unit, beginningActivation: false };
}

function ensureActivationStarted(state, unitId, beginningActivation) {
  if (beginningActivation) beginActivation(state, unitId);
}

function overlappingModelsAtPoint(state, unit, point, ignoreIds = new Set()) {
  for (const otherUnit of Object.values(state.units)) {
    for (const otherModel of Object.values(otherUnit.models)) {
      if (!otherModel.alive || otherModel.x == null || ignoreIds.has(otherModel.id)) continue;
      if (circleOverlapsCircle(point, unit.base.radiusInches, { x: otherModel.x, y: otherModel.y }, otherUnit.base.radiusInches)) return otherModel.id;
    }
  }
  return null;
}

function pointWithinEnemyGroundEngagement(state, unit, point) {
  for (const otherUnit of Object.values(state.units)) {
    if (otherUnit.owner === unit.owner || !otherUnit.tags.includes("Ground")) continue;
    for (const otherModel of Object.values(otherUnit.models)) {
      if (!otherModel.alive || otherModel.x == null) continue;
      const edge = distance(point, otherModel) - unit.base.radiusInches - otherUnit.base.radiusInches;
      if (edge < ENGAGEMENT_RANGE - 1e-6) return true;
    }
  }
  return false;
}

function getEngagedEnemies(state, unit) {
  const enemies = new Set();
  for (const otherUnit of Object.values(state.units)) {
    if (otherUnit.owner === unit.owner) continue;
    let engaged = false;
    for (const m of Object.values(unit.models)) {
      if (!m.alive || m.x == null) continue;
      for (const om of Object.values(otherUnit.models)) {
        if (!om.alive || om.x == null) continue;
        const edge = distance(m, om) - unit.base.radiusInches - otherUnit.base.radiusInches;
        if (edge <= ENGAGEMENT_RANGE + 1e-6) { engaged = true; break; }
      }
      if (engaged) break;
    }
    if (engaged) enemies.add(otherUnit.id);
  }
  return [...enemies].map(id => state.units[id]);
}

function getMovementCost(state, path) {
  if (state.rules?.gridMode) return gridDistance(path[0], path[path.length - 1]);
  return pathTravelCost(path, state.board.terrain);
}

/* ── HOLD: spend the activation doing nothing ── */
export function validateHold(state, playerId, unitId) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  if (v.unit.status.location !== "battlefield") return { ok: false, code: "NOT_ON_BATTLEFIELD", message: "Only battlefield units can Hold." };
  return { ok: true };
}

export function resolveHold(state, playerId, unitId) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  if (v.unit.status.location !== "battlefield") return { ok: false, code: "NOT_ON_BATTLEFIELD", message: "Only battlefield units can Hold." };
  ensureActivationStarted(state, unitId, v.beginningActivation);
  const unit = state.units[unitId];
  unit.status.stationary = true;
  appendLog(state, "action", `${unit.name} holds position.`);
  endActivation(state);
  const handoff = handleHandoff(state);
  return { ok: true, state, events: [{ type: "unit_held", payload: { unitId } }], roundComplete: handoff.roundComplete };
}

/* ── MOVE: consumes movement slot, leaves action available ── */
export function validateMove(state, playerId, unitId, leadingModelId, path, modelPlacements = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const unit = v.unit;
  if (unit.status.location !== "battlefield") return { ok: false, code: "NOT_ON_BATTLEFIELD", message: "Unit is not on the battlefield." };
  if (unit.status.movementUsed) return { ok: false, code: "MOVE_USED", message: "This unit has already moved this activation." };
  if (unit.status.engaged) return { ok: false, code: "UNIT_ENGAGED", message: "Engaged units cannot make a normal Move; Disengage instead." };
  if (!path || path.length < 2) return { ok: false, code: "NO_PATH", message: "Move requires a path." };
  const leader = getModel(unit, leadingModelId);
  if (leader.x == null) return { ok: false, code: "INVALID_LEADER", message: "Leading model must be on the battlefield." };
  const start = path[0];
  if (Math.abs(start.x - leader.x) > 0.01 || Math.abs(start.y - leader.y) > 0.01) return { ok: false, code: "BAD_PATH_START", message: "Path must begin at the leader's current position." };
  const modifiedSpeed = getModifiedValue(state, { timing: "movement_move", unitId: unit.id, key: "unit.speed", baseValue: unit.speed }).value;
  const travelCost = getMovementCost(state, path);
  if (travelCost - modifiedSpeed > 1e-6) return { ok: false, code: "TOO_FAR", message: `${unit.name} can only move ${modifiedSpeed}".` };
  const ignore = new Set(unit.modelIds);
  if (pathBlockedForCircle(path, unit.base.radiusInches, state, ignore)) return { ok: false, code: "PATH_BLOCKED", message: "Path is blocked." };
  const end = path[path.length - 1];
  if (!pointInBoard(end, state.board, unit.base.radiusInches)) return { ok: false, code: "OFF_BOARD", message: "Leading model must end fully on the battlefield." };
  if (circleOverlapsTerrain(end, unit.base.radiusInches, state.board.terrain)) return { ok: false, code: "TERRAIN_OVERLAP", message: "Cannot end on impassable terrain." };
  if (overlappingModelsAtPoint(state, unit, end, ignore)) return { ok: false, code: "BASE_OVERLAP", message: "Would overlap another base." };
  if (pointWithinEnemyGroundEngagement(state, unit, end)) return { ok: false, code: "ENDS_ENGAGED", message: "Move cannot end within engagement range of an enemy." };
  const placements = modelPlacements ?? autoArrangeModels(state, unitId, end);
  return { ok: true, derived: { placements, end } };
}

export function resolveMove(state, playerId, unitId, leadingModelId, path, modelPlacements = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const validation = validateMove(state, playerId, unitId, leadingModelId, path, modelPlacements);
  if (!validation.ok) return validation;
  ensureActivationStarted(state, unitId, v.beginningActivation);
  const unit = state.units[unitId];
  unit.leadingModelId = leadingModelId;
  const leader = unit.models[leadingModelId];
  leader.x = validation.derived.end.x;
  leader.y = validation.derived.end.y;
  const coherency = applyModelPlacementsAndResolveCoherency(state, unitId, validation.derived.placements);
  unit.status.stationary = false;
  unit.status.movementUsed = true;
  refreshEngagement(state);
  refreshAllSupply(state);
  const removedText = coherency.removedModelIds.length ? ` ${coherency.removedModelIds.length} model(s) lost from coherency.` : "";
  const coherencyText = coherency.outOfCoherency ? " Unit is out of coherency." : "";
  appendLog(state, "action", `${unit.name} moves ${pathLength(path).toFixed(1)}".${removedText}${coherencyText}`);
  return { ok: true, state, events: [{ type: "unit_moved", payload: { unitId } }] };
}

/* ── RUN: consumes movement AND action — unit ends activation ── */
export function validateRun(state, playerId, unitId, leadingModelId, path, modelPlacements = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const unit = v.unit;
  if (unit.status.location !== "battlefield") return { ok: false, code: "NOT_ON_BATTLEFIELD", message: "Unit is not on the battlefield." };
  if (unit.status.movementUsed) return { ok: false, code: "MOVE_USED", message: "This unit has already moved this activation." };
  if (unit.status.engaged) return { ok: false, code: "UNIT_ENGAGED", message: "Engaged units cannot Run." };
  if (!path || path.length < 2) return { ok: false, code: "NO_PATH", message: "Run requires a path." };
  const leader = unit.models[leadingModelId];
  if (!leader || leader.x == null) return { ok: false, code: "INVALID_LEADER", message: "Leading model must be on the battlefield." };
  const start = path[0];
  if (Math.abs(start.x - leader.x) > 0.01 || Math.abs(start.y - leader.y) > 0.01) return { ok: false, code: "BAD_PATH_START", message: "Path must begin at the leader's current position." };
  const maxDistance = unit.speed + RUN_BONUS;
  const travelCost = state.rules?.gridMode ? gridDistance(path[0], path[path.length - 1]) : pathTravelCost(path, state.board.terrain);
  if (travelCost - maxDistance > 1e-6) return { ok: false, code: "TOO_FAR", message: `${unit.name} can only Run ${maxDistance}".` };
  const ignore = new Set(unit.modelIds);
  if (pathBlockedForCircle(path, unit.base.radiusInches, state, ignore)) return { ok: false, code: "PATH_BLOCKED", message: "Path is blocked." };
  const end = path[path.length - 1];
  if (!pointInBoard(end, state.board, unit.base.radiusInches)) return { ok: false, code: "OFF_BOARD", message: "Leading model must end on the battlefield." };
  if (circleOverlapsTerrain(end, unit.base.radiusInches, state.board.terrain)) return { ok: false, code: "TERRAIN_OVERLAP", message: "Cannot end on impassable terrain." };
  if (overlappingModelsAtPoint(state, unit, end, ignore)) return { ok: false, code: "BASE_OVERLAP", message: "Would overlap another base." };
  const placements = modelPlacements ?? autoArrangeModels(state, unitId, end);
  return { ok: true, derived: { end, placements, runDistance: pathLength(path), travelCost, maxDistance } };
}

export function resolveRun(state, playerId, unitId, leadingModelId, path, modelPlacements = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const validation = validateRun(state, playerId, unitId, leadingModelId, path, modelPlacements);
  if (!validation.ok) return validation;
  ensureActivationStarted(state, unitId, v.beginningActivation);
  const unit = state.units[unitId];
  unit.leadingModelId = leadingModelId;
  const leader = unit.models[leadingModelId];
  leader.x = validation.derived.end.x;
  leader.y = validation.derived.end.y;
  const coherency = applyModelPlacementsAndResolveCoherency(state, unitId, validation.derived.placements);
  unit.status.stationary = false;
  unit.status.movementUsed = true;
  unit.status.actionUsed = true;
  unit.status.runThisActivation = true;
  refreshEngagement(state);
  refreshAllSupply(state);
  appendLog(state, "action",
    `${unit.name} runs ${validation.derived.runDistance.toFixed(1)}" (max ${validation.derived.maxDistance}").${coherency.outOfCoherency ? " Out of coherency." : ""}`);
  endActivation(state);
  const handoff = handleHandoff(state);
  return { ok: true, state, events: [{ type: "unit_ran", payload: { unitId } }], roundComplete: handoff.roundComplete };
}

/* ── DISENGAGE: spend movement to break engagement ── */
export function validateDisengage(state, playerId, unitId, leadingModelId, path, modelPlacements = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const unit = v.unit;
  if (unit.status.location !== "battlefield") return { ok: false, code: "NOT_ON_BATTLEFIELD", message: "Unit is not on the battlefield." };
  if (unit.status.movementUsed) return { ok: false, code: "MOVE_USED", message: "This unit has already moved this activation." };
  if (!unit.status.engaged) return { ok: false, code: "NOT_ENGAGED", message: "Only engaged units can Disengage." };
  if (!path || path.length < 2) return { ok: false, code: "NO_PATH", message: "Disengage requires a path." };
  const leader = getModel(unit, leadingModelId);
  if (leader.x == null) return { ok: false, code: "INVALID_LEADER", message: "Leading model must be on the battlefield." };
  const modifiedSpeed = getModifiedValue(state, { timing: "movement_disengage", unitId: unit.id, key: "unit.speed", baseValue: unit.speed }).value;
  const travelCost = getMovementCost(state, path);
  if (travelCost - modifiedSpeed > 1e-6) return { ok: false, code: "TOO_FAR", message: `${unit.name} can only move ${modifiedSpeed}".` };
  const ignore = new Set(unit.modelIds);
  if (pathBlockedForCircle(path, unit.base.radiusInches, state, ignore)) return { ok: false, code: "PATH_BLOCKED", message: "Path is blocked." };
  const end = path[path.length - 1];
  if (!pointInBoard(end, state.board, unit.base.radiusInches)) return { ok: false, code: "OFF_BOARD", message: "Leading model must end on the battlefield." };
  const placements = modelPlacements ?? autoArrangeModels(state, unitId, end);
  const engagedEnemies = getEngagedEnemies(state, unit);
  const enemySupplyTotal = engagedEnemies.reduce((t, e) => t + e.currentSupplyValue, 0);
  const tacticalMass = unit.currentSupplyValue > enemySupplyTotal;
  return { ok: true, derived: { end, placements, tacticalMass, engagedEnemies } };
}

export function resolveDisengage(state, playerId, unitId, leadingModelId, path, modelPlacements = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const validation = validateDisengage(state, playerId, unitId, leadingModelId, path, modelPlacements);
  if (!validation.ok) return validation;
  ensureActivationStarted(state, unitId, v.beginningActivation);
  const unit = state.units[unitId];
  unit.leadingModelId = leadingModelId;
  const leader = unit.models[leadingModelId];
  leader.x = validation.derived.end.x;
  leader.y = validation.derived.end.y;
  const coherency = applyModelPlacementsAndResolveCoherency(state, unitId, validation.derived.placements);
  refreshEngagement(state);
  // If still engaged after move, leader & in-engagement models are removed
  const stillEngaged = pointWithinEnemyGroundEngagement(state, unit, { x: leader.x, y: leader.y });
  if (stillEngaged) {
    leader.alive = false; leader.x = null; leader.y = null;
    appendLog(state, "action", `${unit.name} fails to break clear; leader cut down during disengage.`);
  }
  for (const modelId of unit.modelIds) {
    if (modelId === leadingModelId) continue;
    const m = unit.models[modelId];
    if (!m.alive || m.x == null) continue;
    if (pointWithinEnemyGroundEngagement(state, unit, { x: m.x, y: m.y })) {
      m.alive = false; m.x = null; m.y = null;
      appendLog(state, "info", `${unit.name} loses a model failing to clear engagement.`);
    }
  }
  // Tactical Mass: if outweighed, lose the action this activation (no shoot/charge)
  if (!validation.derived.tacticalMass) {
    unit.status.actionUsed = true;
  }
  unit.status.stationary = false;
  unit.status.movementUsed = true;
  refreshEngagement(state);
  refreshAllSupply(state);
  const massNote = validation.derived.tacticalMass ? " Tactical Mass — they may still act." : " Outweighed — cannot shoot or charge this activation.";
  appendLog(state, "action", `${unit.name} disengages.${massNote}${coherency.outOfCoherency ? " Out of coherency." : ""}`);
  return { ok: true, state, events: [{ type: "unit_disengaged", payload: { unitId } }] };
}
