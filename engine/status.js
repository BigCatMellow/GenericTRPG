export const READINESS = {
  READY: "ready",
  COMMITTED: "committed",
  SPENT: "spent"
};

export const CONDITIONS = {
  GUARDED: "guarded",
  PINNED: "pinned",
  EXPOSED: "exposed"
};

const CONDITION_SEVERITY = {
  [CONDITIONS.PINNED]: 3,
  [CONDITIONS.EXPOSED]: 2,
  [CONDITIONS.GUARDED]: 1
};

export function ensureBattleStatus(unit) {
  if (!unit.status) unit.status = {};
  unit.status.readiness ??= READINESS.READY;
  unit.status.conditions ??= [];
  unit.status.reactedThisRound ??= false;
  unit.status.openingExploit ??= false;
  return unit.status;
}

export function getReadiness(unit) {
  return ensureBattleStatus(unit).readiness;
}

export function setReadiness(unit, readiness) {
  ensureBattleStatus(unit).readiness = readiness;
  if (readiness === READINESS.SPENT) removeCondition(unit, CONDITIONS.GUARDED);
}

export function markCommittedIfAble(unit) {
  const status = ensureBattleStatus(unit);
  if (status.readiness === READINESS.READY) status.readiness = READINESS.COMMITTED;
}

export function markSpent(unit) {
  setReadiness(unit, READINESS.SPENT);
}

export function improveReadiness(unit) {
  const status = ensureBattleStatus(unit);
  if (status.readiness === READINESS.SPENT) status.readiness = READINESS.COMMITTED;
  else if (status.readiness === READINESS.COMMITTED) status.readiness = READINESS.READY;
}

export function cleanupReadinessForNewRound(unit) {
  const status = ensureBattleStatus(unit);
  if (status.readiness === READINESS.COMMITTED) status.readiness = READINESS.READY;
  else if (status.readiness === READINESS.SPENT) status.readiness = READINESS.COMMITTED;
  status.reactedThisRound = false;
}

export function hasCondition(unit, condition) {
  return ensureBattleStatus(unit).conditions.includes(condition);
}

export function addCondition(unit, condition) {
  const status = ensureBattleStatus(unit);
  if (!Object.values(CONDITIONS).includes(condition)) return;
  if (condition === CONDITIONS.PINNED) removeCondition(unit, CONDITIONS.GUARDED);
  if (!status.conditions.includes(condition)) status.conditions.push(condition);
  status.conditions = [...new Set(status.conditions)]
    .sort((a, b) => (CONDITION_SEVERITY[b] ?? 0) - (CONDITION_SEVERITY[a] ?? 0))
    .slice(0, 2);
}

export function removeCondition(unit, condition) {
  const status = ensureBattleStatus(unit);
  status.conditions = status.conditions.filter(c => c !== condition);
}

export function clearConditions(unit) {
  ensureBattleStatus(unit).conditions = [];
}

export function canReact(unit) {
  const status = ensureBattleStatus(unit);
  return unit.status.location === "battlefield" &&
    !status.reactedThisRound &&
    status.readiness !== READINESS.SPENT;
}

export function applyReactionCost(unit) {
  const status = ensureBattleStatus(unit);
  status.reactedThisRound = true;
  if (status.readiness === READINESS.READY) status.readiness = READINESS.COMMITTED;
  else if (status.readiness === READINESS.COMMITTED) status.readiness = READINESS.SPENT;
  if (status.readiness === READINESS.SPENT) removeCondition(unit, CONDITIONS.GUARDED);
}

export function getStartingHealth(unit) {
  return unit.modelIds.reduce((sum, id) => {
    const model = unit.models[id];
    return sum + (model?.startingWounds ?? model?.woundsRemaining ?? 0);
  }, 0);
}

export function getRemainingHealth(unit) {
  return unit.modelIds.reduce((sum, id) => {
    const model = unit.models[id];
    return sum + (model?.alive ? Math.max(0, model.woundsRemaining ?? 0) : 0);
  }, 0);
}

export function isBloodied(unit) {
  const starting = getStartingHealth(unit);
  if (starting <= 0) return false;
  return getRemainingHealth(unit) <= starting / 2;
}

export function getLeaderPoint(unit) {
  const leader = unit.models[unit.leadingModelId];
  if (!leader || !leader.alive || leader.x == null || leader.y == null) return null;
  return { x: leader.x, y: leader.y };
}

export function consumeOpeningExploit(unit) {
  const status = ensureBattleStatus(unit);
  const active = Boolean(status.openingExploit);
  status.openingExploit = false;
  return active;
}

export function titleStatus(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}
