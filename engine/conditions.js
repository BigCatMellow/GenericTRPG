const PRESSURE_LIMIT = 2;
const PRESSURE_SEVERITY = ["shaken", "flanked", "pinned", "exposed", "guarded"];

function normalizeCondition(condition) {
  return String(condition ?? "").trim().toLowerCase();
}

export function getPressureConditions(unit) {
  if (!unit?.status) return [];
  if (!Array.isArray(unit.status.pressureConditions)) unit.status.pressureConditions = [];
  return unit.status.pressureConditions;
}

export function hasCondition(unit, condition) {
  const key = normalizeCondition(condition);
  return getPressureConditions(unit).includes(key);
}

export function removeCondition(unit, condition) {
  const key = normalizeCondition(condition);
  unit.status.pressureConditions = getPressureConditions(unit).filter(c => c !== key);
}

export function clearConditions(unit, conditions) {
  for (const condition of conditions) removeCondition(unit, condition);
}

function severityIndex(condition) {
  const idx = PRESSURE_SEVERITY.indexOf(condition);
  return idx === -1 ? PRESSURE_SEVERITY.length : idx;
}

export function addCondition(unit, condition) {
  const key = normalizeCondition(condition);
  if (!key) return;
  const conditions = getPressureConditions(unit);
  if (conditions.includes(key)) return;

  // Guarded is fragile. It is lost when pressure meaningfully breaks the posture.
  if (["pinned", "flanked", "shaken"].includes(key)) {
    removeCondition(unit, "guarded");
  }

  conditions.push(key);
  conditions.sort((a, b) => severityIndex(a) - severityIndex(b));
  while (conditions.length > PRESSURE_LIMIT) conditions.pop();
  unit.status.pressureConditions = conditions;
}

export function setReadiness(unit, readiness) {
  if (!unit?.status) return;
  unit.status.readiness = readiness;
}

export function improveReadiness(unit) {
  const r = unit.status.readiness ?? "ready";
  if (r === "spent") unit.status.readiness = "committed";
  else if (r === "committed") unit.status.readiness = "ready";
}

export function canReact(unit) {
  if (!unit?.status) return false;
  if (unit.status.reactionUsedThisRound) return false;
  return unit.status.readiness === "ready" || unit.status.readiness === "committed";
}

export function spendReaction(unit) {
  if (!unit?.status) return;
  unit.status.reactionUsedThisRound = true;
  if (unit.status.readiness === "ready") unit.status.readiness = "committed";
  else if (unit.status.readiness === "committed") unit.status.readiness = "spent";
}

export function completeNormalActivation(unit) {
  if (!unit?.status) return;
  if (unit.status.keepReadyAfterActivation) return;
  if (!unit.status.readiness || unit.status.readiness === "ready") unit.status.readiness = "committed";
}

export function cleanupReadinessForNewRound(unit) {
  if (!unit?.status) return;
  const r = unit.status.readiness ?? "ready";
  if (r === "committed") unit.status.readiness = "ready";
  else if (r === "spent") unit.status.readiness = "committed";
  unit.status.reactionUsedThisRound = false;
  unit.status.keepReadyAfterActivation = false;
}

export function formatConditions(unit) {
  const parts = [];
  if (unit?.status?.readiness) parts.push(unit.status.readiness.toUpperCase());
  const pressure = getPressureConditions(unit);
  if (pressure.length) parts.push(pressure.map(c => c.toUpperCase()).join("/"));
  return parts.join(" · ");
}
