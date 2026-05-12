// v0.12 Objective control
// Characters within 3" of objective count.
// Pinned characters do NOT count.
// Securing character counts as 2.
// Player with more effective count controls. Tie = contested = no score.
// 1 VP for controlling at round end. First to 3 VP wins.
// No round 1 scoring.

import { distance } from "./geometry.js";
import { hasCondition } from "./conditions.js";

export const OBJECTIVE_CONTROL_RANGE = 3;

function getCharactersNearObjective(state, objective) {
  const result = { playerA: [], playerB: [] };
  for (const ch of Object.values(state.characters)) {
    if (ch.health <= 0 || ch.x == null || ch.y == null) continue;
    if (hasCondition(ch, "pinned")) continue; // Pinned cannot contest
    const d = distance({ x: ch.x, y: ch.y }, { x: objective.x, y: objective.y });
    if (d <= OBJECTIVE_CONTROL_RANGE + 1e-6) {
      result[ch.owner].push(ch);
    }
  }
  return result;
}

function getEffectiveCount(characters) {
  let count = 0;
  for (const ch of characters) {
    if (ch.securingObjectiveId != null) {
      count += 2; // Securing counts as 2
    } else {
      count += 1;
    }
  }
  return count;
}

export function resolveObjectiveController(state, objectiveId) {
  const objective = state.board.objectives.find(o => o.id === objectiveId);
  if (!objective) return { objectiveId, controller: null, playerACount: 0, playerBCount: 0, contested: false };

  const nearby = getCharactersNearObjective(state, objective);
  const playerACount = getEffectiveCount(nearby.playerA);
  const playerBCount = getEffectiveCount(nearby.playerB);

  if (playerACount === 0 && playerBCount === 0) {
    return { objectiveId, controller: null, playerACount, playerBCount, contested: false };
  }
  if (playerACount === playerBCount) {
    return { objectiveId, controller: null, playerACount, playerBCount, contested: true };
  }
  return {
    objectiveId,
    controller: playerACount > playerBCount ? "playerA" : "playerB",
    playerACount,
    playerBCount,
    contested: false
  };
}

export function getObjectiveControlSnapshot(state) {
  const snapshot = {};
  for (const obj of state.board.objectives) {
    snapshot[obj.id] = resolveObjectiveController(state, obj.id);
  }
  return snapshot;
}

export function scoreObjectivesForRound(state) {
  // No scoring in round 1
  if (state.round < 2) {
    return { snapshot: getObjectiveControlSnapshot(state), gained: { playerA: 0, playerB: 0 }, skipped: true };
  }

  const snapshot = getObjectiveControlSnapshot(state);
  const gained = { playerA: 0, playerB: 0 };

  for (const result of Object.values(snapshot)) {
    if (!result.controller) continue;
    gained[result.controller] += 1;
  }

  state.players.playerA.vp += gained.playerA;
  state.players.playerB.vp += gained.playerB;
  state.objectiveControl = snapshot;

  return { snapshot, gained };
}

export function determineWinner(state) {
  const { playerA, playerB } = state.players;
  if (playerA.vp >= 3) return "playerA";
  if (playerB.vp >= 3) return "playerB";
  // After 5 rounds
  if (state.round >= 5) {
    if (playerA.vp === playerB.vp) return null; // draw
    return playerA.vp > playerB.vp ? "playerA" : "playerB";
  }
  return null;
}
