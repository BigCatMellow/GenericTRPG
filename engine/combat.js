import { appendLog } from "./state.js";
import { distance, pointInBoard, circleOverlapsTerrain, circleOverlapsCircle, circleOverlapsRect } from "./geometry.js";
import { recomputeUnitCurrentSupply, refreshAllSupply } from "./supply.js";
import { getModifiedValue, onEvent } from "./effects.js";
import { refreshEngagement } from "./movement.js";

const MELEE_REACH_INCHES = 1.5;
const CHARGE_MAX_RANGE_INCHES = 8;
const PILE_IN_DISTANCE_INCHES = 3;
const CONSOLIDATE_DISTANCE_INCHES = 3;

function getAliveModels(unit) {
  return unit.modelIds.map(id => unit.models[id]).filter(m => m.alive && m.x != null);
}

function getLeaderPoint(unit) {
  const leader = unit.models[unit.leadingModelId];
  if (!leader || !leader.alive || leader.x == null) return null;
  return { x: leader.x, y: leader.y };
}

function isPointOccupiedByOther(state, unit, point) {
  for (const otherUnit of Object.values(state.units)) {
    for (const m of Object.values(otherUnit.models)) {
      if (!m.alive || m.x == null) continue;
      if (otherUnit.id === unit.id && m.id === unit.leadingModelId) continue;
      const r = otherUnit.base?.radiusInches ?? unit.base.radiusInches;
      if (circleOverlapsCircle(point, unit.base.radiusInches, { x: m.x, y: m.y }, r)) return true;
    }
  }
  return false;
}

function clampLeaderDestination(state, unit, dest) {
  if (!pointInBoard(dest, state.board, unit.base.radiusInches)) return null;
  if (circleOverlapsTerrain(dest, unit.base.radiusInches, state.board.terrain)) return null;
  if (isPointOccupiedByOther(state, unit, dest)) return null;
  return dest;
}

function pointToward(origin, target, maxDistance) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (!len || len <= maxDistance) return { x: target.x, y: target.y };
  return { x: origin.x + (dx / len) * maxDistance, y: origin.y + (dy / len) * maxDistance };
}

function pointTowardUntilRange(origin, target, maxDistance, keepRange) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (!len) return { x: origin.x, y: origin.y };
  const moveDistance = Math.max(0, Math.min(maxDistance, len - keepRange));
  return { x: origin.x + (dx / len) * moveDistance, y: origin.y + (dy / len) * moveDistance };
}

function moveLeaderToward(state, unit, towardPoint, maxDistance) {
  const leader = unit.models[unit.leadingModelId];
  if (!leader || leader.x == null) return false;
  const desired = pointToward({ x: leader.x, y: leader.y }, towardPoint, maxDistance);
  const dest = clampLeaderDestination(state, unit, desired);
  if (!dest) return false;
  leader.x = dest.x; leader.y = dest.y;
  return true;
}

function moveLeaderTowardMeleeRange(state, unit, towardPoint, maxDistance, keepRange = MELEE_REACH_INCHES) {
  const leader = unit.models[unit.leadingModelId];
  if (!leader || leader.x == null) return false;
  const desired = pointTowardUntilRange({ x: leader.x, y: leader.y }, towardPoint, maxDistance, keepRange);
  const dest = clampLeaderDestination(state, unit, desired);
  if (!dest) return false;
  leader.x = dest.x; leader.y = dest.y;
  return true;
}

function getNearestEnemyLeaderPoint(state, unit) {
  let best = null, bestD = Infinity;
  const src = getLeaderPoint(unit);
  if (!src) return null;
  for (const o of Object.values(state.units)) {
    if (o.owner === unit.owner || o.status.location !== "battlefield") continue;
    const lp = getLeaderPoint(o);
    if (!lp) continue;
    const d = distance(src, lp);
    if (d < bestD) { bestD = d; best = lp; }
  }
  return best;
}

function rollSuccesses(attempts, target, rng) {
  if (attempts <= 0) return 0;
  const t = Math.max(2, Math.min(6, Math.round(target)));
  let s = 0;
  for (let i = 0; i < attempts; i += 1) {
    if (Math.floor(rng() * 6) + 1 >= t) s += 1;
  }
  return s;
}

function woundTargetForProfile(strength, toughness) {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

function applyWeaponKeywordsToWoundTarget(weapon, targetUnit, woundTarget) {
  let next = woundTarget;
  if (weapon.keywords?.includes("anti_infantry") && targetUnit.tags.includes("Infantry")) next = Math.max(2, next - 1);
  if (weapon.keywords?.includes("precise") && targetUnit.tags.includes("Light")) next = Math.max(2, next - 1);
  return next;
}

function getBestSaveTarget(unit, armorPenetration) {
  const armor = Math.min(6, Math.max(2, unit.defense.armorSave + armorPenetration));
  if (unit.defense.invulnerableSave == null) return armor;
  return Math.min(armor, unit.defense.invulnerableSave);
}

function isUnitReceivingCover(state, unit) {
  const cover = state.board.terrain.filter(t => !t.impassable && t.kind === "cover");
  if (!cover.length) return false;
  return unit.modelIds.some(id => {
    const m = unit.models[id];
    if (!m.alive || m.x == null) return false;
    return cover.some(t => circleOverlapsRect({ x: m.x, y: m.y }, unit.base.radiusInches, t.rect));
  });
}

function applyDamageToUnit(unit, totalDamage) {
  let remaining = totalDamage;
  const ordered = unit.modelIds.map(id => unit.models[id]).filter(m => m.alive);
  for (const m of ordered) {
    if (remaining <= 0) break;
    m.woundsRemaining -= remaining;
    if (m.woundsRemaining <= 0) {
      remaining = Math.abs(m.woundsRemaining);
      m.alive = false; m.x = null; m.y = null; m.woundsRemaining = 0;
    } else {
      remaining = 0;
    }
  }
  if (unit.leadingModelId && !unit.models[unit.leadingModelId].alive) {
    const next = unit.modelIds.find(id => unit.models[id].alive);
    unit.leadingModelId = next ?? unit.leadingModelId;
  }
  const removed = ordered.filter(m => !m.alive).length;
  recomputeUnitCurrentSupply(unit);
  return removed;
}

/**
 * Core attack resolution. declaration = { type: "ranged"|"melee", attackerId, targetId, weaponId? }
 * Returns an event object on success, or null if the declaration fizzled.
 */
export function resolveSingleAttack(state, declaration, rng = Math.random) {
  const attacker = state.units[declaration.attackerId];
  const target = state.units[declaration.targetId];
  if (!attacker || !target) return null;
  if (attacker.status.location !== "battlefield" || target.status.location !== "battlefield") return null;
  const isMelee = declaration.type === "melee";
  const weaponPool = isMelee ? attacker.meleeWeapons : attacker.rangedWeapons;
  const weapon = weaponPool?.find(w => w.id === declaration.weaponId) ?? weaponPool?.[0] ?? null;
  if (!weapon) {
    appendLog(state, "combat", `${attacker.name} has no ${isMelee ? "melee" : "ranged"} weapon — attack fizzles.`);
    return null;
  }
  const ap = getLeaderPoint(attacker);
  const tp = getLeaderPoint(target);
  if (!ap || !tp) return null;

  const range = distance(ap, tp);
  if (isMelee) {
    if (range > CHARGE_MAX_RANGE_INCHES + 1e-6) {
      appendLog(state, "combat", `${attacker.name} cannot reach ${target.name} — too far for a charge.`);
      return null;
    }
    // Pile in toward melee range if needed
    const currentRange = distance(ap, tp);
    if (currentRange > MELEE_REACH_INCHES + 1e-6) {
      const moved = moveLeaderTowardMeleeRange(state, attacker, tp, PILE_IN_DISTANCE_INCHES, MELEE_REACH_INCHES);
      if (!moved) {
        appendLog(state, "combat", `${attacker.name} could not pile-in. Charge fails.`);
        return null;
      }
    }
    const reached = distance(getLeaderPoint(attacker), tp) <= MELEE_REACH_INCHES + 1e-6;
    if (!reached) {
      appendLog(state, "combat", `${attacker.name} fails to reach ${target.name} after pile-in.`);
      return null;
    }
  } else {
    const modifiedRange = getModifiedValue(state, { timing: "combat_resolve_attack", unitId: attacker.id, key: "weapon.rangeInches", baseValue: weapon.rangeInches }).value;
    if (range > modifiedRange + 1e-6) {
      appendLog(state, "combat", `${target.name} is out of range.`);
      return null;
    }
  }

  const aliveAttackers = getAliveModels(attacker).length;
  if (!aliveAttackers) return null;

  const attemptsPerModel = getModifiedValue(state, { timing: "combat_resolve_attack", unitId: attacker.id, key: isMelee ? "weapon.attacksPerModel" : "weapon.shotsPerModel", baseValue: isMelee ? weapon.attacksPerModel : weapon.shotsPerModel }).value;
  const hitTargetBase = getModifiedValue(state, { timing: "combat_resolve_attack", unitId: attacker.id, key: "weapon.hitTarget", baseValue: weapon.hitTarget }).value;
  const woundTargetBase = woundTargetForProfile(weapon.strength, target.defense.toughness);
  const woundTarget = applyWeaponKeywordsToWoundTarget(weapon, target, woundTargetBase);
  let saveTarget = getBestSaveTarget(target, weapon.armorPenetration);
  const coverApplies = !isMelee && isUnitReceivingCover(state, target);
  if (coverApplies) saveTarget = Math.max(2, saveTarget - 1);

  const attempts = Math.max(0, Math.floor(aliveAttackers * attemptsPerModel));
  const hits = rollSuccesses(attempts, hitTargetBase, rng);
  const wounds = rollSuccesses(hits, woundTarget, rng);
  const saved = rollSuccesses(wounds, saveTarget, rng);
  const unsaved = Math.max(0, wounds - saved);
  const totalDamage = unsaved * weapon.damage;
  const casualties = applyDamageToUnit(target, totalDamage);

  const targetAlive = getAliveModels(target).length > 0;
  if (isMelee && !targetAlive) {
    const nearest = getNearestEnemyLeaderPoint(state, attacker);
    if (nearest) moveLeaderToward(state, attacker, nearest, CONSOLIDATE_DISTANCE_INCHES);
  }

  appendLog(state, "combat",
    `${attacker.name} ${isMelee ? "charges" : "shoots at"} ${target.name} (${weapon.name}): ${attempts} attempts → ${hits} hits → ${wounds} wounds → ${saved} saved${coverApplies ? " (cover)" : ""}, ${casualties} cas.`);

  const event = {
    type: "combat_attack_resolved",
    payload: {
      mode: isMelee ? "melee" : "ranged",
      attackerId: attacker.id,
      targetId: target.id,
      weaponId: weapon.id,
      attempts, hits, wounds, saved, unsaved, totalDamage, casualties
    }
  };
  state.lastCombatReport.push(event.payload);
  refreshEngagement(state);
  refreshAllSupply(state);
  onEvent(state, event);
  return event;
}
