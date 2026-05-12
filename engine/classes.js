// v0.12 Class special rules implementation
// Warrior, Ranger, Rogue, Cleric, Mage

import { appendLog } from "./state.js";
import { distance } from "./geometry.js";
import {
  hasCondition, applyExposed, applyPinned, applyGuarded,
  removeCondition
} from "./conditions.js";
import { improveReadiness } from "./readiness.js";

function getOpponent(pid) { return pid === "playerA" ? "playerB" : "playerA"; }

function nearbyFriendlies(state, character, rangeInches) {
  return Object.values(state.characters).filter(c =>
    c.id !== character.id &&
    c.owner === character.owner &&
    c.health > 0 &&
    c.x != null && character.x != null &&
    distance({ x: c.x, y: c.y }, { x: character.x, y: character.y }) <= rangeInches + 1e-6
  );
}

function nearbyEnemies(state, character, rangeInches) {
  return Object.values(state.characters).filter(c =>
    c.owner !== character.owner &&
    c.health > 0 &&
    c.x != null && character.x != null &&
    distance({ x: c.x, y: c.y }, { x: character.x, y: character.y }) <= rangeInches + 1e-6
  );
}

/**
 * Cleric Rally action.
 * Choose a friendly ≤6" away.
 * Remove Pinned or Exposed. If Spent→Committed.
 * If condition removed or readiness improved, target becomes Guarded.
 * Crit: remove condition + improve readiness + Guarded.
 */
export function resolveRally(state, clericId, targetId, rng = Math.random) {
  const cleric = state.characters[clericId];
  const target = state.characters[targetId];
  if (!cleric || !target) return { ok: false, reason: "Character not found." };
  if (target.owner !== cleric.owner) return { ok: false, reason: "Rally targets friendly characters." };
  if (target.health <= 0) return { ok: false, reason: "Target is defeated." };

  const d = distance({ x: cleric.x, y: cleric.y }, { x: target.x, y: target.y });
  if (d > 6 + 1e-6) return { ok: false, reason: `Target is ${d.toFixed(1)}" away (max 6").` };

  const roll = Math.floor(rng() * 6) + 1;
  const crit = roll === 6;

  let conditionRemoved = false;
  let readinessImproved = false;
  const log = [];

  if (crit) {
    // Crit: remove condition + improve readiness + Guarded
    if (hasCondition(target, "pinned")) { removeCondition(target, "pinned"); conditionRemoved = true; log.push("Pinned removed."); }
    else if (hasCondition(target, "exposed")) { removeCondition(target, "exposed"); conditionRemoved = true; log.push("Exposed removed."); }
    const prevReadiness = target.readiness;
    improveReadiness(target);
    if (target.readiness !== prevReadiness) { readinessImproved = true; log.push(`Readiness improved to ${target.readiness}.`); }
    applyGuarded(target);
    log.push("Target becomes Guarded.");
    appendLog(state, "action", `${cleric.name} Rally crit on ${target.name}: ${log.join(" ")}`);
    return { ok: true, crit, conditionRemoved, readinessImproved, roll };
  }

  // Normal Rally
  if (hasCondition(target, "pinned")) {
    removeCondition(target, "pinned");
    conditionRemoved = true;
    log.push("Pinned removed.");
  } else if (hasCondition(target, "exposed")) {
    removeCondition(target, "exposed");
    conditionRemoved = true;
    log.push("Exposed removed.");
  }

  const prevReadiness = target.readiness;
  if (target.readiness === "spent") {
    target.readiness = "committed";
    readinessImproved = true;
    log.push("Spent → Committed.");
  }

  if (conditionRemoved || readinessImproved) {
    applyGuarded(target);
    log.push("Target becomes Guarded.");
  }

  appendLog(state, "action", `${cleric.name} rallies ${target.name}: ${log.join(" ") || "no effect."}`);
  cleric.actionUsed = true;
  return { ok: true, crit, conditionRemoved, readinessImproved, roll };
}

/**
 * Mage Disrupt action.
 * Choose enemy ≤8". Roll 1d6:
 *   4+ applies Exposed + 1 dmg (3+ if target already Pinned/Exposed)
 *   If target was already Exposed, also becomes Pinned.
 *   Crit: Exposed + Pinned; if already Exposed/Pinned → +1 dmg.
 * After resolving, Mage becomes Committed.
 */
export function resolveDisrupt(state, mageId, targetId, rng = Math.random) {
  const mage = state.characters[mageId];
  const target = state.characters[targetId];
  if (!mage || !target) return { ok: false, reason: "Character not found." };
  if (target.owner === mage.owner) return { ok: false, reason: "Disrupt targets enemies." };
  if (target.health <= 0) return { ok: false, reason: "Target is defeated." };

  const d = distance({ x: mage.x, y: mage.y }, { x: target.x, y: target.y });
  if (d > 8 + 1e-6) return { ok: false, reason: `Target is ${d.toFixed(1)}" away (max 8").` };

  const targetAlreadyConditioned = hasCondition(target, "pinned") || hasCondition(target, "exposed");
  const targetAlreadyExposed = hasCondition(target, "exposed");
  const threshold = targetAlreadyConditioned ? 3 : 4;

  const roll = Math.floor(rng() * 6) + 1;
  const crit = roll === 6;
  const log = [];

  if (crit) {
    const alreadyConditioned = hasCondition(target, "exposed") || hasCondition(target, "pinned");
    applyExposed(target);
    applyPinned(target);
    if (alreadyConditioned) {
      target.health = Math.max(0, target.health - 1);
      log.push("Disrupt crit: Exposed + Pinned; already conditioned → +1 dmg!");
    } else {
      log.push("Disrupt crit: Exposed + Pinned!");
    }
  } else if (roll >= threshold) {
    if (targetAlreadyExposed) {
      applyPinned(target);
      log.push("Target was already Exposed — also becomes Pinned.");
    }
    applyExposed(target);
    target.health = Math.max(0, target.health - 1);
    log.push(`Disrupt hits (${roll} ≥ ${threshold}): Exposed + 1 dmg.`);
    if (target.health <= 0) log.push(`${target.name} DEFEATED!`);
  } else {
    log.push(`Disrupt fails (${roll} < ${threshold}).`);
  }

  // After resolving, Mage becomes Committed
  mage.readiness = "committed";
  mage.actionUsed = true;

  appendLog(state, "action", `${mage.name} disrupts ${target.name}: ${log.join(" ")}`);
  return { ok: true, crit, roll, threshold };
}

/**
 * Rogue Slip Through: after Quick melee hit, move 3" in.
 * Only if target is Exposed/Spent. Blocked if Pinned.
 */
export function resolveSlipThrough(state, rogueId, destination, rng = Math.random) {
  const rogue = state.characters[rogueId];
  if (!rogue) return { ok: false, reason: "Character not found." };
  if (hasCondition(rogue, "pinned")) return { ok: false, reason: "Rogue is Pinned — cannot Slip Through." };

  const d = distance({ x: rogue.x, y: rogue.y }, destination);
  if (d > 3 + 1e-6) return { ok: false, reason: `Slip Through moves up to 3" (attempted ${d.toFixed(1)}").` };

  rogue.x = destination.x;
  rogue.y = destination.y;
  appendLog(state, "action", `${rogue.name} slips through to (${destination.x.toFixed(1)}, ${destination.y.toFixed(1)}).`);
  return { ok: true };
}

/**
 * Cleric crit effect: nearby friendly removes Exposed.
 */
export function applyClericCritEffect(state, clericId, friendlyId) {
  const cleric = state.characters[clericId];
  const friendly = state.characters[friendlyId];
  if (!cleric || !friendly) return { ok: false };
  if (friendly.owner !== cleric.owner) return { ok: false };
  const d = distance({ x: cleric.x, y: cleric.y }, { x: friendly.x, y: friendly.y });
  if (d > 3 + 1e-6) return { ok: false, reason: "Target not within 3\"." };
  if (hasCondition(friendly, "exposed")) {
    removeCondition(friendly, "exposed");
    appendLog(state, "action", `${friendly.name} removes Exposed (Cleric crit).`);
  }
  return { ok: true };
}
