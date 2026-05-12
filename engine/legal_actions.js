// v0.12 Legal actions

import { distance } from "./geometry.js";
import { hasCondition } from "./conditions.js";
import { OBJECTIVE_CONTROL_RANGE } from "./objectives.js";

function getCharacter(state, charId) {
  return state.characters[charId] ?? null;
}

function getOpponent(pid) { return pid === "playerA" ? "playerB" : "playerA"; }

function isNearObjective(state, ch) {
  if (ch.x == null) return false;
  return state.board.objectives.some(obj =>
    distance({ x: ch.x, y: ch.y }, { x: obj.x, y: obj.y }) <= OBJECTIVE_CONTROL_RANGE + 1e-6
  );
}

export function getLegalActionsForPlayer(state, playerId) {
  const out = [];
  if (state.activePlayer !== playerId) return out;
  if (state.players[playerId].passedThisRound) return out;

  out.push({ type: "PASS_ROUND", enabled: !state.activatingCharacterId });

  const activatingId = state.activatingCharacterId;
  if (activatingId) {
    const ch = getCharacter(state, activatingId);
    if (ch && ch.owner === playerId) {
      out.push(...getLegalActionsForCharacter(state, playerId, activatingId));
      out.push({ type: "END_ACTIVATION", charId: activatingId, enabled: true });
    }
    return out;
  }

  // No active character — list first-action options for each eligible character
  for (const ch of Object.values(state.characters)) {
    if (ch.owner !== playerId || ch.activatedThisRound || ch.health <= 0) continue;
    out.push(...getLegalActionsForCharacter(state, playerId, ch.id));
  }
  return out;
}

export function getLegalActionsForCharacter(state, playerId, charId) {
  const ch = getCharacter(state, charId);
  if (!ch || ch.owner !== playerId || ch.health <= 0) return [];
  if (ch.x == null) return [];
  const desc = [];
  const movementUsed = !!ch.movementUsed;
  const actionUsed = !!ch.actionUsed;
  const inActivation = state.activatingCharacterId === charId;

  // Hold — only when no activation begun yet
  if (!inActivation && !ch.activatedThisRound) {
    desc.push({ type: "HOLD", charId, enabled: true });
  }

  // Move
  if (!movementUsed) {
    desc.push({ type: "MOVE", charId, enabled: true, uiHints: { requiresBoardClick: true } });
  }

  // Run — both slots available, not Pinned
  if (!movementUsed && !actionUsed && !hasCondition(ch, "pinned")) {
    desc.push({ type: "RUN", charId, enabled: true, uiHints: { requiresBoardClick: true } });
  }

  // Actions
  if (!actionUsed) {
    // Recover
    desc.push({ type: "RECOVER", charId, enabled: true });

    // Secure Objective
    if (!hasCondition(ch, "pinned") && isNearObjective(state, ch)) {
      desc.push({ type: "SECURE_OBJECTIVE", charId, enabled: true });
    }

    // Attacks
    if (ch.attacks) {
      for (const [key, atk] of Object.entries(ch.attacks)) {
        // Check range feasibility
        let feasible = false;
        if (atk.type === "melee") {
          feasible = Object.values(state.characters).some(t =>
            t.owner !== playerId && t.health > 0 && t.x != null &&
            distance({ x: ch.x, y: ch.y }, { x: t.x, y: t.y }) <= 1.5 + 1e-6
          );
        } else {
          const range = atk.range ?? 8;
          feasible = Object.values(state.characters).some(t =>
            t.owner !== playerId && t.health > 0 && t.x != null &&
            distance({ x: ch.x, y: ch.y }, { x: t.x, y: t.y }) <= range + 1e-6
          );
        }
        // Backstab requires target to be Exposed or Spent
        if (key === "backstab") {
          feasible = Object.values(state.characters).some(t =>
            t.owner !== playerId && t.health > 0 && t.x != null &&
            (hasCondition(t, "exposed") || t.readiness === "spent") &&
            distance({ x: ch.x, y: ch.y }, { x: t.x, y: t.y }) <= 1.5 + 1e-6
          );
        }
        desc.push({
          type: "ATTACK",
          charId,
          attackKey: key,
          enabled: feasible,
          uiHints: { requiresTargetClick: true }
        });
      }
    }

    // Class abilities
    if (ch.classId === "cleric") {
      const hasTarget = Object.values(state.characters).some(t =>
        t.owner === playerId && t.id !== charId && t.health > 0 && t.x != null &&
        distance({ x: ch.x, y: ch.y }, { x: t.x, y: t.y }) <= 6 + 1e-6
      );
      desc.push({ type: "CLASS_ABILITY", charId, abilityId: "rally", enabled: hasTarget, uiHints: { requiresTargetClick: true } });
    }
    if (ch.classId === "mage") {
      const hasTarget = Object.values(state.characters).some(t =>
        t.owner !== playerId && t.health > 0 && t.x != null &&
        distance({ x: ch.x, y: ch.y }, { x: t.x, y: t.y }) <= 8 + 1e-6
      );
      desc.push({ type: "CLASS_ABILITY", charId, abilityId: "disrupt", enabled: hasTarget, uiHints: { requiresTargetClick: true } });
    }
  }

  return desc;
}

/** Get legal move destinations on a 1" grid */
export function getLegalMoveDestinations(state, playerId, charId) {
  const ch = getCharacter(state, charId);
  if (!ch || ch.x == null) return [];
  const maxDist = ch.move;
  const pts = [];
  for (let x = 0.5; x < state.board.widthInches; x += 1) {
    for (let y = 0.5; y < state.board.heightInches; y += 1) {
      const dist = Math.max(Math.abs(x - ch.x), Math.abs(y - ch.y));
      if (dist <= maxDist + 1e-6 && dist > 1e-6) pts.push({ x, y });
    }
  }
  return pts;
}

/** Get legal run destinations */
export function getLegalRunDestinations(state, playerId, charId) {
  const ch = getCharacter(state, charId);
  if (!ch || ch.x == null) return [];
  const pts = [];
  for (let x = 0.5; x < state.board.widthInches; x += 1) {
    for (let y = 0.5; y < state.board.heightInches; y += 1) {
      const dist = Math.max(Math.abs(x - ch.x), Math.abs(y - ch.y));
      if (dist <= 9 + 1e-6 && dist > 1e-6) pts.push({ x, y });
    }
  }
  return pts;
}
