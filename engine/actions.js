// v0.12 Actions: Hold, Recover, Secure Objective, Attack, Class Ability

import { appendLog } from "./state.js";
import { distance } from "./geometry.js";
import {
  hasCondition, applyGuarded, removeCondition, breakGuarded
} from "./conditions.js";
import { improveReadiness } from "./readiness.js";
import { resolveCombat } from "./combat.js";
import { resolveRally, resolveDisrupt, resolveSlipThrough } from "./classes.js";
import { OBJECTIVE_CONTROL_RANGE } from "./objectives.js";

function getCharacter(state, charId) {
  return state.characters[charId] ?? null;
}

function getOpponent(pid) { return pid === "playerA" ? "playerB" : "playerA"; }

function isNearObjective(state, character) {
  if (character.x == null) return null;
  for (const obj of state.board.objectives) {
    const d = distance({ x: character.x, y: character.y }, { x: obj.x, y: obj.y });
    if (d <= OBJECTIVE_CONTROL_RANGE + 1e-6) return obj;
  }
  return null;
}

/* ── HOLD ── */
export function resolveHold(state, playerId, charId) {
  const ch = getCharacter(state, charId);
  if (!ch) return { ok: false, code: "UNKNOWN_CHAR", message: "Character not found." };
  if (ch.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "Not your character." };
  if (ch.activatedThisRound) return { ok: false, code: "ALREADY_ACTIVATED", message: "Character already activated." };

  // Hold: become Guarded; remove Exposed
  applyGuarded(ch);
  if (hasCondition(ch, "exposed")) removeCondition(ch, "exposed");
  ch.activatedThisRound = true;
  // Hold: readiness unchanged
  appendLog(state, "action", `${ch.name} holds — becomes Guarded, Exposed removed.`);
  return { ok: true, state, events: [{ type: "character_held", payload: { charId } }] };
}

/* ── RECOVER ── */
export function resolveRecover(state, playerId, charId) {
  const ch = getCharacter(state, charId);
  if (!ch) return { ok: false, code: "UNKNOWN_CHAR", message: "Character not found." };
  if (ch.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "Not your character." };
  if (ch.actionUsed) return { ok: false, code: "ACTION_USED", message: "Action already used." };

  const nearObj = isNearObjective(state, ch);
  const prevReadiness = ch.readiness;

  // Choose one: remove Pinned, remove Exposed, or improve readiness
  // Auto-priority: remove worst condition first, then readiness
  let recovered = false;
  let logMsg = "";
  if (hasCondition(ch, "pinned")) {
    removeCondition(ch, "pinned");
    recovered = true;
    logMsg = "Pinned removed.";
  } else if (hasCondition(ch, "exposed")) {
    removeCondition(ch, "exposed");
    recovered = true;
    logMsg = "Exposed removed.";
  } else {
    const before = ch.readiness;
    improveReadiness(ch);
    if (ch.readiness !== before) {
      recovered = true;
      logMsg = `Readiness improved: ${before} → ${ch.readiness}.`;
    }
  }

  // If within 3" of objective, may also become Guarded
  if (nearObj) {
    applyGuarded(ch);
    logMsg += " Guarded (near objective).";
  }

  ch.actionUsed = true;
  appendLog(state, "action", `${ch.name} recovers: ${logMsg || "no change."}`);
  return { ok: true, state, events: [{ type: "character_recovered", payload: { charId } }] };
}

/* ── SECURE OBJECTIVE ── */
export function resolveSecureObjective(state, playerId, charId, rng = Math.random) {
  const ch = getCharacter(state, charId);
  if (!ch) return { ok: false, code: "UNKNOWN_CHAR", message: "Character not found." };
  if (ch.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "Not your character." };
  if (ch.actionUsed) return { ok: false, code: "ACTION_USED", message: "Action already used." };
  if (hasCondition(ch, "pinned")) return { ok: false, code: "PINNED", message: "Pinned characters cannot Secure Objectives." };

  const nearObj = isNearObjective(state, ch);
  if (!nearObj) return { ok: false, code: "NOT_NEAR_OBJECTIVE", message: "Not within 3\" of an objective." };

  const roll = Math.floor(rng() * 6) + 1;
  const crit = roll === 6;
  const success = roll >= 4;

  if (success || crit) {
    ch.securingObjectiveId = nearObj.id;
    if (crit) {
      applyGuarded(ch);
      appendLog(state, "action", `${ch.name} secures ${nearObj.id} (rolled ${roll})! Crit — also Guarded!`);
    } else {
      appendLog(state, "action", `${ch.name} secures ${nearObj.id} (rolled ${roll}).`);
    }
  } else {
    appendLog(state, "action", `${ch.name} fails to secure ${nearObj.id} (rolled ${roll}, needed 4+).`);
  }

  ch.actionUsed = true;
  return { ok: true, success: success || crit, crit, roll, state, events: [{ type: "secure_attempted", payload: { charId, objectiveId: nearObj.id, success, crit } }] };
}

/* ── ATTACK ── */
export function resolveAttack(state, playerId, charId, targetId, attackKey, rng = Math.random) {
  const ch = getCharacter(state, charId);
  if (!ch) return { ok: false, code: "UNKNOWN_CHAR", message: "Attacker not found." };
  if (ch.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "Not your character." };
  if (ch.actionUsed) return { ok: false, code: "ACTION_USED", message: "Action already used." };
  if (ch.x == null) return { ok: false, code: "NOT_PLACED", message: "Attacker not placed." };

  const target = getCharacter(state, targetId);
  if (!target) return { ok: false, code: "UNKNOWN_TARGET", message: "Target not found." };
  if (target.owner === playerId) return { ok: false, code: "FRIENDLY_FIRE", message: "Cannot attack friendly characters." };
  if (target.health <= 0) return { ok: false, code: "TARGET_DEFEATED", message: "Target already defeated." };
  if (target.x == null) return { ok: false, code: "TARGET_NOT_PLACED", message: "Target not placed." };

  // Check attack exists
  const attackDef = ch.attacks?.[attackKey];
  if (!attackDef) return { ok: false, code: "UNKNOWN_ATTACK", message: `Unknown attack: ${attackKey}` };

  // Slip Through validation for Backstab / Quick melee
  if (attackKey === "backstab") {
    if (!hasCondition(target, "exposed") && target.readiness !== "spent") {
      return { ok: false, code: "BACKSTAB_INVALID", message: "Backstab requires target to be Exposed or Spent." };
    }
  }

  // Auto Dodge/Brace for AI (always attempt if possible)
  const targetDeclaresDodge = !target.reactionUsedThisRound && target.readiness !== "spent" && !hasCondition(target, "pinned");
  const targetDeclaresBrace = false; // brace declared after seeing if dodge failed — handled in combat

  const combatResult = resolveCombat(state, {
    attackerId: charId,
    targetId,
    attackKey,
    targetDeclaresDodge,
    targetDeclaresBrace
  }, rng);

  if (!combatResult.ok) return { ok: false, code: "COMBAT_FAILED", message: combatResult.reason };

  // Mark action used and breaking guarded
  ch.actionUsed = true;
  breakGuarded(ch);

  // Check Slip Through eligibility (Rogue, after Quick melee hit)
  let slipThroughEligible = false;
  if (ch.classId === "rogue" && attackDef.attackType === "quick" && attackDef.type === "melee" && combatResult.hit) {
    if ((hasCondition(target, "exposed") || target.readiness === "spent") && !hasCondition(ch, "pinned")) {
      slipThroughEligible = true;
    }
    // Rogue crit: extra slip through
    if (combatResult.attackRoll?.crit && (!hasCondition(target, "exposed") && target.readiness !== "spent")) {
      slipThroughEligible = true;
    }
  }

  return {
    ok: true,
    state,
    combatResult,
    slipThroughEligible,
    events: [{ type: "attack_resolved", payload: { attackerId: charId, targetId, attackKey, hit: combatResult.hit, damage: combatResult.actualDamage } }]
  };
}

/* ── CLASS ABILITY ── */
export function resolveClassAbility(state, playerId, charId, abilityId, targetId = null, rng = Math.random) {
  const ch = getCharacter(state, charId);
  if (!ch) return { ok: false, code: "UNKNOWN_CHAR", message: "Character not found." };
  if (ch.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "Not your character." };
  if (ch.actionUsed) return { ok: false, code: "ACTION_USED", message: "Action already used." };

  if (abilityId === "rally" && ch.classId === "cleric") {
    if (!targetId) return { ok: false, code: "NO_TARGET", message: "Rally requires a target friendly character." };
    const result = resolveRally(state, charId, targetId, rng);
    if (!result.ok) return { ok: false, code: "RALLY_FAILED", message: result.reason };
    ch.actionUsed = true;
    return { ok: true, state, abilityResult: result, events: [{ type: "rally_resolved", payload: { clericId: charId, targetId } }] };
  }

  if (abilityId === "disrupt" && ch.classId === "mage") {
    if (!targetId) return { ok: false, code: "NO_TARGET", message: "Disrupt requires an enemy target." };
    const result = resolveDisrupt(state, charId, targetId, rng);
    if (!result.ok) return { ok: false, code: "DISRUPT_FAILED", message: result.reason };
    // actionUsed set inside resolveDisrupt
    return { ok: true, state, abilityResult: result, events: [{ type: "disrupt_resolved", payload: { mageId: charId, targetId } }] };
  }

  if (abilityId === "slip_through" && ch.classId === "rogue") {
    if (!targetId) return { ok: false, code: "NO_TARGET", message: "Slip Through requires a destination." };
    // targetId here is used as destination point { x, y }
    const result = resolveSlipThrough(state, charId, targetId, rng);
    if (!result.ok) return { ok: false, code: "SLIP_THROUGH_FAILED", message: result.reason };
    return { ok: true, state, abilityResult: result, events: [{ type: "slip_through_resolved", payload: { rogueId: charId } }] };
  }

  return { ok: false, code: "UNKNOWN_ABILITY", message: `Unknown ability: ${abilityId}` };
}

/* ── END ACTIVATION ── */
export function endActivationManually(state, playerId, charId) {
  const ch = getCharacter(state, charId);
  if (!ch) return { ok: false, code: "UNKNOWN_CHAR", message: "Character not found." };
  if (ch.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "Not your character." };

  appendLog(state, "action", `${ch.name} ends activation.`);
  return { ok: true, state, events: [] };
}
