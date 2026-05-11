import { appendLog } from "./state.js";
import { refreshAllSupply } from "./supply.js";
import { determineWinner } from "./objectives.js";
import { checkMissionInstantWin, resolveMissionScoringAtCleanup } from "./mission_rules.js";
import { onRoundStart } from "./effects.js";

function formatPlayer(playerId) {
  if (!playerId) return "No one";
  return playerId === "playerA" ? "Crown Levy" : "Border Reavers";
}

function getOpponent(playerId) {
  return playerId === "playerA" ? "playerB" : "playerA";
}

function logObjectiveScoring(state, scoring) {
  const objectiveSummaries = Object.values(scoring.snapshot).map(result => {
    if (!result.controller) {
      if (result.contested) return `${result.objectiveId}: contested (${result.playerASupply}-${result.playerBSupply})`;
      return `${result.objectiveId}: uncontrolled`;
    }
    return `${result.objectiveId}: ${formatPlayer(result.controller)} controls (${result.playerASupply}-${result.playerBSupply})`;
  });
  appendLog(state, "score",
    `Round ${state.round} objectives — ${objectiveSummaries.join(" | ")}`);
  appendLog(state, "score",
    `VP this round — Crown ${scoring.gained.playerA}, Reavers ${scoring.gained.playerB}. Totals — Crown ${state.players.playerA.vp}, Reavers ${state.players.playerB.vp}.`);
}

export function beginGame(state) {
  refreshAllSupply(state);
  appendLog(state, "info", "Both warbands begin off-table. Deploy units as you activate them.");
  return { ok: true, state, events: [] };
}

/** Reset per-round flags and start a new round of activations. */
export function beginRound(state) {
  for (const unit of Object.values(state.units)) {
    unit.status.activatedThisRound = false;
    unit.status.movementUsed = false;
    unit.status.actionUsed = false;
    unit.status.runThisActivation = false;
  }
  state.players.playerA.passedThisRound = false;
  state.players.playerB.passedThisRound = false;
  state.activatingUnitId = null;
  state.activePlayer = state.firstPlayerThisRound;
  onRoundStart(state);
  refreshAllSupply(state);
  state.phase = "battle";
  appendLog(state, "phase", `Round ${state.round} — ${formatPlayer(state.activePlayer)} activate first.`);
  return { ok: true, state, events: [] };
}

/**
 * Called when both sides are out of activations. Score, check win, advance round.
 */
export function endRound(state) {
  state.phase = "cleanup";
  const scoring = resolveMissionScoringAtCleanup(state);
  logObjectiveScoring(state, scoring);
  state.lastRoundSummary = {
    round: state.round,
    scoring,
    combatEvents: state.lastCombatReport ?? []
  };
  state.lastCombatReport = [];

  const instantWin = checkMissionInstantWin(state, scoring);
  if (instantWin) {
    state.winner = instantWin.winner;
    appendLog(state, "phase", `Decisive victory: ${instantWin.reason}`);
    return { ok: true, state, events: [{ type: "game_completed", payload: { winner: state.winner, reason: instantWin.reason } }] };
  }

  const roundLimit = state.mission.pacing?.roundLimit ?? state.mission.roundLimit;
  if (state.round >= roundLimit) {
    state.winner = determineWinner(state);
    if (state.winner) {
      appendLog(state, "phase", `Final round reached. ${formatPlayer(state.winner)} win on VP.`);
    } else {
      appendLog(state, "phase", "Final round reached. The battle ends in a draw.");
    }
    return { ok: true, state, events: [{ type: "game_completed", payload: { winner: state.winner } }] };
  }

  // Initiative alternates each round
  state.firstPlayerThisRound = getOpponent(state.firstPlayerThisRound);
  state.round += 1;
  return beginRound(state);
}
