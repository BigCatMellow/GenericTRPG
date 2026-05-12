// v0.12 Movement
// Move: up to move value
// Run: move 9", become Spent, cannot also take Action
// No coherency, no engagement, no disengage.
// Run through Difficult/Exposing -> Exposed
// Ending move in cover removes one condition (Pinned or Exposed)

import { appendLog } from "./state.js";
import { pointInBoard, gridDistance } from "./geometry.js";
import { hasCondition, removeCondition, applyExposed, breakGuarded } from "./conditions.js";
import { applyRunReadiness } from "./readiness.js";

const RUN_DISTANCE = 9;

function characterAt(state, charId) {
  return state.characters[charId] ?? null;
}

function isInTerrain(state, x, y, traitFn) {
  return state.board.terrain.some(t => {
    if (!t.rect) return false;
    const traits = t.traits ?? (t.kind === "cover" ? ["cover"] : t.impassable ? ["blocking"] : []);
    if (!traitFn(traits)) return false;
    return x >= t.rect.minX && x <= t.rect.maxX && y >= t.rect.minY && y <= t.rect.maxY;
  });
}

function isBlocking(state, x, y) {
  return isInTerrain(state, x, y, traits => traits.includes("blocking"));
}

function isInCoverTerrain(state, x, y) {
  return isInTerrain(state, x, y, traits => traits.includes("cover"));
}

function isInDifficultTerrain(state, x, y) {
  return isInTerrain(state, x, y, traits => traits.includes("difficult"));
}

function isInExposingTerrain(state, x, y) {
  return isInTerrain(state, x, y, traits => traits.includes("exposing"));
}

function getMoveDistance(state, character) {
  // Difficult terrain: -2 inches
  let dist = character.move;
  if (isInDifficultTerrain(state, character.x, character.y)) {
    dist = Math.max(0, dist - 2);
  }
  return dist;
}

function applyEndOfMoveEffects(state, character, fromX, fromY, toX, toY, wasRun = false) {
  // Running through Difficult/Exposing -> Exposed
  if (wasRun) {
    if (isInDifficultTerrain(state, toX, toY) || isInExposingTerrain(state, toX, toY)) {
      applyExposed(character);
      appendLog(state, "action", `${character.name} is Exposed from running through difficult/exposing terrain.`);
    }
  }

  // Ending move in cover removes one condition (Pinned or Exposed)
  if (isInCoverTerrain(state, toX, toY)) {
    if (hasCondition(character, "pinned")) {
      removeCondition(character, "pinned");
      appendLog(state, "action", `${character.name} reaches cover — Pinned removed.`);
    } else if (hasCondition(character, "exposed")) {
      removeCondition(character, "exposed");
      appendLog(state, "action", `${character.name} reaches cover — Exposed removed.`);
    }
  }
}

export function validateMove(state, playerId, charId, destination) {
  const ch = characterAt(state, charId);
  if (!ch) return { ok: false, code: "UNKNOWN_CHAR", message: "Character not found." };
  if (ch.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "Not your character." };
  if (state.phase !== "battle") return { ok: false, code: "WRONG_PHASE", message: "Battle phase only." };
  if (ch.movementUsed) return { ok: false, code: "MOVE_USED", message: "Movement already used this activation." };
  if (ch.x == null) return { ok: false, code: "NOT_PLACED", message: "Character not on battlefield." };
  if (!destination) return { ok: false, code: "NO_DEST", message: "No destination." };

  const maxDist = getMoveDistance(state, ch);
  const dist = gridDistance({ x: ch.x, y: ch.y }, destination);
  if (dist > maxDist + 1e-6) return { ok: false, code: "TOO_FAR", message: `Can only move ${maxDist}".` };

  if (!pointInBoard(destination, state.board, 0)) return { ok: false, code: "OFF_BOARD", message: "Destination off board." };
  if (isBlocking(state, destination.x, destination.y)) return { ok: false, code: "BLOCKED", message: "Destination is blocked terrain." };

  return { ok: true };
}

export function resolveMove(state, playerId, charId, destination) {
  const v = validateMove(state, playerId, charId, destination);
  if (!v.ok) return v;
  const ch = state.characters[charId];
  const fromX = ch.x, fromY = ch.y;
  ch.x = destination.x;
  ch.y = destination.y;
  ch.movementUsed = true;
  // Moving breaks Guarded
  breakGuarded(ch);
  applyEndOfMoveEffects(state, ch, fromX, fromY, destination.x, destination.y, false);
  appendLog(state, "action", `${ch.name} moves to (${destination.x.toFixed(1)}, ${destination.y.toFixed(1)}).`);
  return { ok: true, state, events: [{ type: "character_moved", payload: { charId } }] };
}

export function validateRun(state, playerId, charId, destination) {
  const ch = characterAt(state, charId);
  if (!ch) return { ok: false, code: "UNKNOWN_CHAR", message: "Character not found." };
  if (ch.owner !== playerId) return { ok: false, code: "WRONG_OWNER", message: "Not your character." };
  if (state.phase !== "battle") return { ok: false, code: "WRONG_PHASE", message: "Battle phase only." };
  if (ch.movementUsed) return { ok: false, code: "MOVE_USED", message: "Movement already used." };
  if (ch.actionUsed) return { ok: false, code: "ACTION_USED", message: "Action already used; cannot run." };
  if (ch.x == null) return { ok: false, code: "NOT_PLACED", message: "Character not on battlefield." };
  if (hasCondition(ch, "pinned")) return { ok: false, code: "PINNED", message: "Pinned characters cannot Run." };
  if (!destination) return { ok: false, code: "NO_DEST", message: "No destination." };

  const dist = gridDistance({ x: ch.x, y: ch.y }, destination);
  if (dist > RUN_DISTANCE + 1e-6) return { ok: false, code: "TOO_FAR", message: `Can only run ${RUN_DISTANCE}".` };
  if (!pointInBoard(destination, state.board, 0)) return { ok: false, code: "OFF_BOARD", message: "Destination off board." };
  if (isBlocking(state, destination.x, destination.y)) return { ok: false, code: "BLOCKED", message: "Destination is blocked terrain." };

  return { ok: true };
}

export function resolveRun(state, playerId, charId, destination) {
  const v = validateRun(state, playerId, charId, destination);
  if (!v.ok) return v;
  const ch = state.characters[charId];
  const fromX = ch.x, fromY = ch.y;
  ch.x = destination.x;
  ch.y = destination.y;
  ch.movementUsed = true;
  ch.actionUsed = true;
  ch.ranThisActivation = true;
  applyRunReadiness(ch);
  applyEndOfMoveEffects(state, ch, fromX, fromY, destination.x, destination.y, true);
  appendLog(state, "action", `${ch.name} runs to (${destination.x.toFixed(1)}, ${destination.y.toFixed(1)}). Becomes ${ch.readiness}.`);
  return { ok: true, state, events: [{ type: "character_ran", payload: { charId } }] };
}
