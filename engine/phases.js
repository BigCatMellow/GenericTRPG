// v0.12 Round phases

import { appendLog } from "./state.js";
import { endRoundReadinessCleanup } from "./readiness.js";
import { scoreObjectivesForRound, determineWinner } from "./objectives.js";
import { hasCondition, removeCondition } from "./conditions.js";

function getOpponent(playerId) {
  return playerId === "playerA" ? "playerB" : "playerA";
}

function formatPlayer(pid) {
  return pid === "playerA" ? "Player A" : "Player B";
}

function logObjectiveScoring(state, scoring) {
  if (scoring.skipped) {
    appendLog(state, "score", `Round 1 — no objectives scored yet.`);
    return;
  }
  const parts = Object.values(scoring.snapshot).map(r => {
    if (!r.controller && !r.contested) return `${r.objectiveId}: uncontrolled`;
    if (r.contested) return `${r.objectiveId}: contested (A:${r.playerACount} B:${r.playerBCount})`;
    return `${r.objectiveId}: ${formatPlayer(r.controller)} controls (A:${r.playerACount} B:${r.playerBCount})`;
  });
  appendLog(state, "score",
    `Round ${state.round} scoring — ${parts.join(" | ")}. VP: A=${state.players.playerA.vp} B=${state.players.playerB.vp}.`);
}

export function beginRound(state) {
  // Reset per-round flags for all characters
  for (const ch of Object.values(state.characters)) {
    ch.activatedThisRound = false;
    ch.movementUsed = false;
    ch.actionUsed = false;
    ch.ranThisActivation = false;
    // Guarded clears at start of next activation (tracked separately)
    // Securing breaks if applicable — checked during activation
  }
  state.players.playerA.passedThisRound = false;
  state.players.playerB.passedThisRound = false;
  state.activatingCharacterId = null;
  state.activePlayer = state.firstPlayerThisRound;
  state.phase = "battle";

  appendLog(state, "phase", `Round ${state.round} begins. ${formatPlayer(state.activePlayer)} activates first.`);
  return { ok: true, state, events: [] };
}

export function endRound(state) {
  state.phase = "cleanup";

  // Score objectives (skipped if round 1)
  const scoring = scoreObjectivesForRound(state);
  logObjectiveScoring(state, scoring);

  // Check for winner
  const winner = determineWinner(state);
  if (winner) {
    state.winner = winner;
    appendLog(state, "phase", `${formatPlayer(winner)} wins!`);
    return { ok: true, state, events: [{ type: "game_completed", payload: { winner } }] };
  }

  // Check round limit (draw after 5)
  if (state.round >= 5) {
    state.winner = null;
    appendLog(state, "phase", "Round 5 complete. Game ends in a draw.");
    return { ok: true, state, events: [{ type: "game_completed", payload: { winner: null } }] };
  }

  // Readiness cleanup for all living characters
  for (const ch of Object.values(state.characters)) {
    if (ch.health <= 0) continue;
    endRoundReadinessCleanup(ch);

    // Break securing at start of next round if conditions met
    // (Pinned/Exposed already handled when applied; Spent does NOT break securing)
    // Characters that start a new activation while securing will have it checked then.
  }

  // Alternate first player
  state.firstPlayerThisRound = getOpponent(state.firstPlayerThisRound);
  state.round += 1;

  return beginRound(state);
}

export function beginGame(state) {
  appendLog(state, "info", "Game begins! Round 1. Characters start on the battlefield.");
  return { ok: true, state, events: [] };
}
