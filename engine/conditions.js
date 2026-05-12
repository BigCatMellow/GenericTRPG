// v0.12 Conditions: Guarded / Pinned / Exposed / Overwhelmed (derived)
// Max 2 conditions at once. Third condition: keep the 2 most relevant.

const CONDITION_PRIORITY = ["guarded", "pinned", "exposed"];

function normalizeCondition(c) {
  return String(c ?? "").trim().toLowerCase();
}

export function hasCondition(character, condition) {
  const key = normalizeCondition(condition);
  return Array.isArray(character.conditions) && character.conditions.includes(key);
}

export function isOverwhelmed(character) {
  return hasCondition(character, "pinned") && hasCondition(character, "exposed");
}

function enforceConditionLimit(character) {
  // Max 2 conditions. If 3, drop the least relevant (guarded first, then by insertion order).
  while (character.conditions.length > 2) {
    // Drop guarded first; otherwise drop the oldest (index 0).
    const guardedIdx = character.conditions.indexOf("guarded");
    if (guardedIdx !== -1) {
      character.conditions.splice(guardedIdx, 1);
    } else {
      character.conditions.splice(0, 1);
    }
  }
}

export function addCondition(character, condition) {
  const key = normalizeCondition(condition);
  if (!key) return;
  if (!Array.isArray(character.conditions)) character.conditions = [];

  if (key === "pinned" || key === "exposed") {
    // Applying Pinned or Exposed removes Guarded
    removeCondition(character, "guarded");
    // Cancel securing
    character.securingObjectiveId = null;
  }

  if (!character.conditions.includes(key)) {
    character.conditions.push(key);
  }
  enforceConditionLimit(character);
}

export function removeCondition(character, condition) {
  const key = normalizeCondition(condition);
  if (!Array.isArray(character.conditions)) return;
  character.conditions = character.conditions.filter(c => c !== key);
}

export function clearConditions(character, conditions = []) {
  for (const c of conditions) removeCondition(character, c);
}

export function clearAllConditions(character) {
  character.conditions = [];
}

// Exposed also cancels securing
export function applyExposed(character) {
  addCondition(character, "exposed");
  character.securingObjectiveId = null;
}

export function applyPinned(character) {
  addCondition(character, "pinned");
  character.securingObjectiveId = null;
}

export function applyGuarded(character) {
  // Guarded is NOT applied if character is Pinned or Spent
  if (hasCondition(character, "pinned")) return;
  if (character.readiness === "spent") return;
  addCondition(character, "guarded");
}

/** Called when Guarded bonus is used. Remove guarded. */
export function consumeGuarded(character) {
  removeCondition(character, "guarded");
}

/** Called when character moves, attacks, runs, becomes Pinned/Spent. */
export function breakGuarded(character) {
  removeCondition(character, "guarded");
}

export function canReact(character) {
  if (!character) return false;
  if (character.reactionUsedThisRound) return false;
  return character.readiness === "ready" || character.readiness === "committed";
}

export function spendReaction(character) {
  character.reactionUsedThisRound = true;
  if (character.readiness === "ready") character.readiness = "committed";
  else if (character.readiness === "committed") character.readiness = "spent";
}

export function formatConditions(character) {
  const parts = [];
  if (character.readiness) parts.push(character.readiness.toUpperCase());
  if (Array.isArray(character.conditions) && character.conditions.length) {
    parts.push(character.conditions.map(c => c[0].toUpperCase()).join(""));
  }
  return parts.join(" · ");
}
