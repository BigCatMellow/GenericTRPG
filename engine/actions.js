import { appendLog } from "./state.js";
import { isUnitEligibleForActivation, beginActivation, endActivation, handleHandoff } from "./activation.js";
import { distance } from "./geometry.js";
import { getModifiedValue } from "./effects.js";
import { resolveSingleAttack } from "./combat.js";

const CHARGE_DECLARE_RANGE = 8;

function getOpponent(playerId) {
  return playerId === "playerA" ? "playerB" : "playerA";
}

function leaderPoint(unit) {
  const m = unit.models[unit.leadingModelId];
  if (!m || m.x == null) return null;
  return { x: m.x, y: m.y };
}

function validateCanAct(state, playerId, unitId) {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, code: "UNKNOWN_UNIT", message: "Unit not found." };
  if (unit.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "You do not control that unit." };
  if (state.phase !== "battle") return { ok: false, code: "WRONG_PHASE", message: "Battle phase only." };
  if (unit.status.location !== "battlefield") return { ok: false, code: "NOT_ON_BATTLEFIELD", message: "Only battlefield units can act." };
  if (!state.activatingUnitId) {
    if (!isUnitEligibleForActivation(state, unitId)) return { ok: false, code: "UNIT_NOT_ELIGIBLE", message: "Unit is not eligible to activate." };
    return { ok: true, unit, beginningActivation: true };
  }
  if (state.activatingUnitId !== unitId) return { ok: false, code: "WRONG_UNIT", message: "Another unit is mid-activation." };
  if (unit.status.actionUsed) return { ok: false, code: "ACTION_USED", message: "This unit has already taken its action." };
  return { ok: true, unit, beginningActivation: false };
}

function ensureActivationStarted(state, unitId, beginningActivation) {
  if (beginningActivation) beginActivation(state, unitId);
}

function findNearestEnemyInRangedReach(state, unit) {
  const primary = unit.rangedWeapons?.[0];
  if (!primary) return null;
  const lp = leaderPoint(unit);
  if (!lp) return null;
  const enemies = state.players[getOpponent(unit.owner)].battlefieldUnitIds
    .map(id => state.units[id])
    .filter(e => e.status.location === "battlefield")
    .map(e => {
      const ep = leaderPoint(e);
      return ep ? { e, d: distance(lp, ep) } : null;
    })
    .filter(Boolean)
    .filter(x => x.d <= primary.rangeInches + 1e-6)
    .sort((a, b) => a.d - b.d);
  return enemies[0]?.e ?? null;
}

function findNearestEnemyForCharge(state, unit) {
  const lp = leaderPoint(unit);
  if (!lp) return null;
  const enemies = state.players[getOpponent(unit.owner)].battlefieldUnitIds
    .map(id => state.units[id])
    .filter(e => e.status.location === "battlefield")
    .map(e => {
      const ep = leaderPoint(e);
      return ep ? { e, d: distance(lp, ep) } : null;
    })
    .filter(Boolean)
    .filter(x => x.d <= CHARGE_DECLARE_RANGE + 1e-6)
    .sort((a, b) => a.d - b.d);
  return enemies[0]?.e ?? null;
}

/* ── RANGED ATTACK ── */
export function validateRangedAttack(state, playerId, unitId, targetId = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const unit = v.unit;
  if (!unit.rangedWeapons?.length) return { ok: false, code: "NO_RANGED", message: "Unit has no ranged weapon." };
  if (unit.status.runThisActivation) return { ok: false, code: "JUST_RAN", message: "A unit that ran cannot shoot." };
  const allowed = getModifiedValue(state, {
    timing: "assault_declare_ranged",
    unitId: unit.id,
    key: "assault.canDeclareRanged",
    baseValue: true
  });
  if (!allowed.value) return { ok: false, code: "RANGED_BLOCKED", message: "This unit cannot shoot right now." };

  if (targetId) {
    const target = state.units[targetId];
    if (!target) return { ok: false, code: "BAD_TARGET", message: "Target does not exist." };
    if (target.owner === unit.owner) return { ok: false, code: "BAD_TARGET", message: "Cannot target a friendly unit." };
    if (target.status.location !== "battlefield") return { ok: false, code: "BAD_TARGET", message: "Target must be on the battlefield." };
    const lp = leaderPoint(unit), tp = leaderPoint(target);
    const primary = unit.rangedWeapons[0];
    if (!lp || !tp) return { ok: false, code: "BAD_TARGET", message: "Bad positions." };
    if (distance(lp, tp) > primary.rangeInches + 1e-6) return { ok: false, code: "OUT_OF_RANGE", message: "Target is out of range." };
    return { ok: true, derived: { targetId } };
  }
  const nearest = findNearestEnemyInRangedReach(state, unit);
  if (!nearest) return { ok: false, code: "NO_TARGET", message: "No enemy in range." };
  return { ok: true, derived: { targetId: nearest.id } };
}

export function resolveRangedAttack(state, playerId, unitId, targetId = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const validation = validateRangedAttack(state, playerId, unitId, targetId);
  if (!validation.ok) return validation;
  ensureActivationStarted(state, unitId, v.beginningActivation);
  const unit = state.units[unitId];
  const weaponId = unit.rangedWeapons[0]?.id ?? null;
  const event = resolveSingleAttack(state, {
    type: "ranged",
    attackerId: unitId,
    targetId: validation.derived.targetId,
    weaponId
  });
  unit.status.actionUsed = true;
  endActivation(state);
  const handoff = handleHandoff(state);
  return { ok: true, state, events: event ? [event] : [], roundComplete: handoff.roundComplete };
}

/* ── CHARGE: resolve melee immediately ── */
export function validateCharge(state, playerId, unitId, targetId = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const unit = v.unit;
  if (!unit.meleeWeapons?.length) return { ok: false, code: "NO_MELEE", message: "Unit has no melee weapon." };
  if (unit.status.runThisActivation) return { ok: false, code: "JUST_RAN", message: "A unit that ran cannot charge." };

  if (targetId) {
    const target = state.units[targetId];
    if (!target) return { ok: false, code: "BAD_TARGET", message: "Target does not exist." };
    if (target.owner === unit.owner) return { ok: false, code: "BAD_TARGET", message: "Cannot target a friendly unit." };
    if (target.status.location !== "battlefield") return { ok: false, code: "BAD_TARGET", message: "Target must be on the battlefield." };
    const lp = leaderPoint(unit), tp = leaderPoint(target);
    if (!lp || !tp) return { ok: false, code: "BAD_TARGET", message: "Bad positions." };
    if (distance(lp, tp) > CHARGE_DECLARE_RANGE + 1e-6) return { ok: false, code: "OUT_OF_RANGE", message: `Target is outside ${CHARGE_DECLARE_RANGE}" charge range.` };
    return { ok: true, derived: { targetId } };
  }
  const nearest = findNearestEnemyForCharge(state, unit);
  if (!nearest) return { ok: false, code: "NO_TARGET", message: `No enemy within ${CHARGE_DECLARE_RANGE}".` };
  return { ok: true, derived: { targetId: nearest.id } };
}

export function resolveCharge(state, playerId, unitId, targetId = null) {
  const v = validateCanAct(state, playerId, unitId);
  if (!v.ok) return v;
  const validation = validateCharge(state, playerId, unitId, targetId);
  if (!validation.ok) return validation;
  ensureActivationStarted(state, unitId, v.beginningActivation);
  const unit = state.units[unitId];
  const weaponId = unit.meleeWeapons[0]?.id ?? null;
  const event = resolveSingleAttack(state, {
    type: "melee",
    attackerId: unitId,
    targetId: validation.derived.targetId,
    weaponId
  });
  unit.status.actionUsed = true;
  endActivation(state);
  const handoff = handleHandoff(state);
  return { ok: true, state, events: event ? [event] : [], roundComplete: handoff.roundComplete };
}

/* ── END ACTIVATION manually (e.g. moved but don't want to act) ── */
export function endActivationManually(state, playerId) {
  if (state.activePlayer !== playerId) return { ok: false, code: "NOT_ACTIVE_PLAYER", message: "Not your turn." };
  if (!state.activatingUnitId) return { ok: false, code: "NO_ACTIVATION", message: "No activation in progress." };
  const unit = state.units[state.activatingUnitId];
  if (!unit) return { ok: false, code: "UNKNOWN_UNIT", message: "Unit not found." };
  appendLog(state, "action", `${unit.name} ends activation.`);
  endActivation(state);
  const handoff = handleHandoff(state);
  return { ok: true, state, events: [], roundComplete: handoff.roundComplete };
}
