// v0.12 Reactions: Dodge and Brace
// Each character may react once per round (reactionUsedThisRound).
// Spent cannot react.

import { hasCondition, isOverwhelmed, consumeGuarded, applyExposed, spendReaction } from "./conditions.js";

/**
 * Get the base dodge difficulty (4+), adjusted for conditions and attack type.
 * Quick attack: difficulty 5+ (one step harder)
 * Heavy attack: difficulty 3+ (one step easier)
 * Pinned: one step harder (+1)
 * Committed reaction: one step harder (+1)
 * Guarded: one step easier (-1), and consumes Guarded
 */
export function getDodgeDifficulty(target, attackType, reactingCharacterReadiness) {
  let diff = 4;
  // Attack type modifiers
  if (attackType === "quick") diff += 1;  // harder
  if (attackType === "heavy") diff -= 1;  // easier
  // Pinned modifier
  if (hasCondition(target, "pinned")) diff += 1;
  // Committed reaction is one step harder
  if (reactingCharacterReadiness === "committed") diff += 1;
  // Guarded: one step easier (applied separately when resolving)
  return Math.max(2, Math.min(6, diff));
}

/**
 * Get the base brace difficulty (4+), adjusted for conditions.
 * Pinned: one step harder (+1)
 * Committed reaction: one step harder (+1)
 * Warrior Battle-Ready passive: one step easier when Guarded (-1)
 */
export function getBraceDifficulty(target, reactingCharacterReadiness) {
  let diff = 4;
  if (hasCondition(target, "pinned")) diff += 1;
  if (reactingCharacterReadiness === "committed") diff += 1;
  return Math.max(2, Math.min(6, diff));
}

/**
 * Resolve a Dodge reaction.
 * Returns { ok, miss, crit, moved, moveDistance, difficulty, roll }
 * miss=true means attack is cancelled.
 * crit=true means miss + move 1" (or 2" for Rogue).
 * A failed Dodge does NOT create Exposed.
 */
export function resolveDodge(target, attackType, rng = Math.random) {
  if (target.reactionUsedThisRound) return { ok: false, reason: "Reaction already used." };
  if (target.readiness === "spent") return { ok: false, reason: "Spent characters cannot react." };
  if (hasCondition(target, "pinned")) {
    // Pinned makes dodge one step harder — allowed but harder
  }

  let diff = getDodgeDifficulty(target, attackType, target.readiness);
  const isGuarded = hasCondition(target, "guarded");
  if (isGuarded) {
    diff = Math.max(2, diff - 1); // one step easier
    consumeGuarded(target); // guarded bonus used
  }

  const roll = Math.floor(rng() * 6) + 1;
  const crit = roll === 6;
  const miss = roll >= diff;

  spendReaction(target);

  const moveDistance = crit ? (target.classId === "rogue" ? 2 : 1) : 0;

  return { ok: true, miss, crit, moved: crit, moveDistance, difficulty: diff, roll };
}

/**
 * Resolve a Brace reaction.
 * Returns { ok, damageReduced, crit, difficulty, roll }
 * Guarded: reduce 2 (or 3 on crit) instead of 1 (or 2).
 */
export function resolveBrace(target, rng = Math.random) {
  if (target.reactionUsedThisRound) return { ok: false, reason: "Reaction already used." };
  if (target.readiness === "spent") return { ok: false, reason: "Spent characters cannot react." };

  const isGuarded = hasCondition(target, "guarded");
  const isWarrior = target.classId === "warrior";
  let diff = getBraceDifficulty(target, target.readiness);

  // Warrior Battle-Ready passive: Brace one step easier when Guarded
  if (isGuarded && isWarrior) {
    diff = Math.max(2, diff - 1);
  }

  if (isGuarded) {
    consumeGuarded(target);
  }

  const roll = Math.floor(rng() * 6) + 1;
  const crit = roll === 6;
  const success = roll >= diff;

  spendReaction(target);

  let damageReduced = 0;
  if (success) {
    if (isGuarded) {
      damageReduced = crit ? 3 : 2;
    } else {
      damageReduced = crit ? 2 : 1;
    }
  }

  return { ok: true, success, crit, damageReduced, difficulty: diff, roll };
}
