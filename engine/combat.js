// v0.12 Combat: Dodge -> Attack roll -> Brace -> Damage
// Attack types: Quick (1 dmg), Standard (2 dmg), Heavy (3 dmg)
// Critical on natural 6.

import { appendLog } from "./state.js";
import { distance } from "./geometry.js";
import {
  hasCondition, isOverwhelmed, applyExposed, applyPinned, applyGuarded,
  breakGuarded, removeCondition
} from "./conditions.js";
import { resolveDodge, resolveBrace } from "./reactions.js";
import { applyHeavyAttackReadiness } from "./readiness.js";

const MELEE_REACH_INCHES = 1.5;

function characterPoint(ch) {
  return ch.x != null && ch.y != null ? { x: ch.x, y: ch.y } : null;
}

function getOpponent(playerId) {
  return playerId === "playerA" ? "playerB" : "playerA";
}

/**
 * Get attack difficulty for the attacker vs target.
 * Base: 4+ (Standard), modified by:
 *   - Attacker's Exploit Opening passive (Rogue): one step easier vs Exposed/Spent
 *   - Target Exposed: one step easier
 *   - Target in cover: one step harder
 *   - Ranged target in concealing terrain from >8": one step harder
 *   - Elevated attacker vs lower target (with cover): one step harder for attacker from below
 */
function getAttackDifficulty(state, attacker, target, attackDef) {
  let diff = 4;

  // Rogue Exploit Opening: one step easier vs Exposed or Spent
  if (attacker.classId === "rogue") {
    if (hasCondition(target, "exposed") || target.readiness === "spent") {
      diff -= 1;
    }
  }

  // Target Exposed: one step easier
  if (hasCondition(target, "exposed")) {
    diff -= 1;
  }

  // Target in cover: one step harder (ranged/magic only)
  if (attackDef.type !== "melee") {
    const inCover = isInCover(state, target);
    if (inCover) diff += 1;
  }

  // Called Shot: one step harder for attacker
  if (attackDef.oneCategoryHarder) diff += 1;

  return Math.max(2, Math.min(6, diff));
}

function isInCover(state, character) {
  if (character.x == null || character.y == null) return false;
  return state.board.terrain.some(t => {
    if (!t.rect) return false;
    const traits = t.traits ?? (t.kind === "cover" ? ["cover"] : []);
    if (!traits.includes("cover")) return false;
    return character.x >= t.rect.minX && character.x <= t.rect.maxX &&
           character.y >= t.rect.minY && character.y <= t.rect.maxY;
  });
}

/**
 * Apply damage to character. Returns actual damage dealt.
 */
function applyDamage(character, amount) {
  const actual = Math.min(character.health, Math.max(0, amount));
  character.health -= actual;
  return actual;
}

/**
 * Resolve Overwhelmed payoff: if both Pinned and Exposed (Overwhelmed),
 * next successful attack deals +1 dmg, then remove Exposed.
 */
function checkAndApplyOverwhelmed(target) {
  if (isOverwhelmed(target)) {
    removeCondition(target, "exposed");
    return 1; // +1 damage bonus
  }
  return 0;
}

/**
 * Check if target is "pressured" for Heavy attack rule
 * (Spent/Pinned/Exposed/Overwhelmed).
 */
function isTargetPressured(target) {
  return target.readiness === "spent" ||
    hasCondition(target, "pinned") ||
    hasCondition(target, "exposed") ||
    isOverwhelmed(target);
}

/**
 * Main combat resolution function.
 * declaration = {
 *   attackerId, targetId,
 *   attackKey,      // key in attacker.attacks (e.g. "standard", "heavy", "suppressing", "backstab")
 *   useDodge,       // whether defender declared dodge (auto-resolved)
 *   useBrace        // whether defender declared brace (auto-resolved)
 * }
 *
 * Returns a result object with all details.
 */
export function resolveCombat(state, declaration, rng = Math.random) {
  const attacker = state.characters[declaration.attackerId];
  const target = state.characters[declaration.targetId];
  if (!attacker || !target) return { ok: false, reason: "Character not found." };
  if (attacker.health <= 0 || target.health <= 0) return { ok: false, reason: "Character is defeated." };

  const attackDef = attacker.attacks?.[declaration.attackKey];
  if (!attackDef) return { ok: false, reason: `Unknown attack: ${declaration.attackKey}` };

  // Range check
  const ap = characterPoint(attacker), tp = characterPoint(target);
  if (!ap || !tp) return { ok: false, reason: "Characters not placed." };
  const dist = distance(ap, tp);

  if (attackDef.type === "melee") {
    if (dist > MELEE_REACH_INCHES + 1e-6) {
      return { ok: false, reason: `Target out of melee reach (${dist.toFixed(1)}" > ${MELEE_REACH_INCHES}").` };
    }
  } else {
    const range = attackDef.range ?? 8;
    if (dist > range + 1e-6) {
      return { ok: false, reason: `Target out of range (${dist.toFixed(1)}" > ${range}").` };
    }
  }

  const result = {
    ok: true,
    attackerId: attacker.id,
    targetId: target.id,
    attackKey: declaration.attackKey,
    attackType: attackDef.attackType,
    dodgeResult: null,
    attackRoll: null,
    hit: false,
    braceResult: null,
    baseDamage: 0,
    overwhelmedBonus: 0,
    totalDamage: 0,
    actualDamage: 0,
    targetDefeated: false,
    critEffects: [],
    log: []
  };

  // ── Dodge phase ──
  const targetPressuredBefore = isTargetPressured(target);
  const canDodge = !target.reactionUsedThisRound && target.readiness !== "spent" && !hasCondition(target, "pinned");
  // AI/auto: attempt dodge if possible (for AI bot; human player declares explicitly)
  if (declaration.targetDeclaresDodge && canDodge) {
    const dodge = resolveDodge(target, attackDef.attackType, rng);
    result.dodgeResult = dodge;
    if (dodge.ok && dodge.miss) {
      result.log.push(`${target.name} dodges! (rolled ${dodge.roll} vs ${dodge.difficulty}+)${dodge.crit ? " Critical dodge — moves " + dodge.moveDistance + '"!' : ""}`);
      appendLog(state, "combat", result.log.join(" "));
      return result;
    } else if (dodge.ok) {
      result.log.push(`${target.name} fails to dodge (rolled ${dodge.roll} vs ${dodge.difficulty}+).`);
    }
  }

  // ── Attack roll ──
  const attackDiff = getAttackDifficulty(state, attacker, target, attackDef);
  const attackRoll = Math.floor(rng() * 6) + 1;
  const attackCrit = attackRoll === 6;
  const attackHit = attackRoll >= attackDiff;
  result.attackRoll = { roll: attackRoll, difficulty: attackDiff, crit: attackCrit, hit: attackHit };
  result.hit = attackHit;

  if (!attackHit) {
    result.log.push(`${attacker.name} attacks ${target.name} with ${attackDef.name} (rolled ${attackRoll} vs ${attackDiff}+) — miss!`);
    appendLog(state, "combat", result.log.join(" "));
    return result;
  }

  result.log.push(`${attacker.name} attacks ${target.name} with ${attackDef.name} (rolled ${attackRoll} vs ${attackDiff}+${attackCrit ? " CRIT" : ""}) — hit!`);

  // ── Calculate base damage ──
  let baseDamage = attackDef.damage ?? 0;

  // Backstab: +1 dmg if target is Exposed or Spent
  if (declaration.attackKey === "backstab") {
    if (hasCondition(target, "exposed") || target.readiness === "spent") {
      baseDamage += 1;
    }
  }

  // Called Shot crit: deals normal damage instead of reduced
  if (declaration.attackKey === "called" && attackCrit) {
    const template = state.characters[declaration.attackerId];
    const stdAttack = attacker.attacks?.standard;
    if (stdAttack) baseDamage = stdAttack.damage;
    result.critEffects.push("called_shot_crit_normal_dmg");
  }

  // ── Apply on-hit conditions (before damage) ──
  let suppressingCrit = false;
  if (attackDef.appliesPinned) {
    applyPinned(target);
    result.log.push(`${target.name} is Pinned.`);
    if (attackCrit) {
      suppressingCrit = true;
      result.critEffects.push("suppressing_crit_locked_pinned");
      result.log.push("Suppressing Shot crit — Pinned cannot be removed until after next activation.");
    }
  }
  if (attackDef.appliesExposed) {
    applyExposed(target);
    result.log.push(`${target.name} is Exposed.`);
  }

  // ── Overwhelmed check (must be BEFORE brace, triggered by hit) ──
  const overwhelmedBonus = checkAndApplyOverwhelmed(target);
  if (overwhelmedBonus > 0) {
    result.log.push(`${target.name} was Overwhelmed! +1 dmg, Exposed removed.`);
  }
  result.overwhelmedBonus = overwhelmedBonus;

  let totalDamage = baseDamage + overwhelmedBonus;

  // ── Class crit effects on attack ──
  if (attackCrit && !declaration.attackKey.startsWith("suppressing") && !declaration.attackKey.startsWith("called")) {
    if (attacker.classId === "warrior") {
      // Choose: +1 dmg, push 1", or become Guarded
      // Auto: +1 dmg if target has health, else Guarded
      if (target.health > 1) {
        totalDamage += 1;
        result.critEffects.push("warrior_crit_plus1dmg");
        result.log.push("Warrior crit: +1 dmg!");
      } else {
        applyGuarded(attacker);
        result.critEffects.push("warrior_crit_guarded");
        result.log.push("Warrior crit: Warrior becomes Guarded!");
      }
    } else if (attacker.classId === "ranger" && declaration.attackKey === "standard") {
      totalDamage += 1;
      result.critEffects.push("ranger_crit_plus1dmg");
      result.log.push("Ranger Standard Shot crit: +1 dmg!");
    } else if (attacker.classId === "rogue") {
      if (hasCondition(target, "exposed") || target.readiness === "spent") {
        totalDamage += 1;
        result.critEffects.push("rogue_crit_plus1dmg");
        result.log.push("Rogue crit vs Exposed/Spent: +1 dmg!");
      } else {
        result.critEffects.push("rogue_crit_slip_through");
        result.log.push("Rogue crit: Extra Slip Through use!");
      }
    } else if (attacker.classId === "cleric") {
      result.critEffects.push("cleric_crit_friendly_remove_exposed");
      result.log.push("Cleric crit: One friendly within 3\" may remove Exposed.");
    } else if (attacker.classId === "mage" && attackDef.type === "magic") {
      // +1 dmg OR target becomes Exposed (auto: +1 dmg)
      totalDamage += 1;
      result.critEffects.push("mage_crit_plus1dmg");
      result.log.push("Mage magic crit: +1 dmg!");
    }
  }

  result.baseDamage = baseDamage;

  // ── Brace phase ──
  const canBrace = !target.reactionUsedThisRound && target.readiness !== "spent";
  if (declaration.targetDeclaresBrace && canBrace) {
    const brace = resolveBrace(target, rng);
    result.braceResult = brace;
    if (brace.ok && brace.success) {
      totalDamage = Math.max(0, totalDamage - brace.damageReduced);
      result.log.push(`${target.name} braces! (rolled ${brace.roll} vs ${brace.difficulty}+${brace.crit ? " CRIT" : ""}) — reduces dmg by ${brace.damageReduced}.`);
    } else if (brace.ok) {
      result.log.push(`${target.name} fails to brace (rolled ${brace.roll} vs ${brace.difficulty}+).`);
    }
  }

  result.totalDamage = totalDamage;

  // ── Apply damage ──
  const actualDamage = applyDamage(target, totalDamage);
  result.actualDamage = actualDamage;

  // Break securing if character suffers damage
  if (actualDamage > 0) {
    target.securingObjectiveId = null;
  }

  result.targetDefeated = target.health <= 0;
  result.log.push(`${target.name} suffers ${actualDamage} dmg (${target.health}/${target.maxHealth} remaining).${result.targetDefeated ? " DEFEATED!" : ""}`);

  // ── Heavy attack readiness ──
  if (attackDef.attackType === "heavy") {
    const pressuredHit = targetPressuredBefore && attackHit;
    applyHeavyAttackReadiness(attacker, pressuredHit);
    result.log.push(`${attacker.name} becomes ${attacker.readiness} after Heavy attack.`);
  }

  // Break Guarded when attacker attacks
  breakGuarded(attacker);

  appendLog(state, "combat", result.log.join(" "));
  return result;
}

// Export helper used by other modules
export { isInCover };
