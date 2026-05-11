import { createUnitStateFromTemplate } from "../data/units.js";
import { getMission } from "../data/missions.js";
import { getDeployment } from "../data/deployments.js";

function createTerrain() {
  return [
    { id: "t1", kind: "blocker", impassable: true, rect: { minX: 11, minY: 14, maxX: 15, maxY: 18 } },
    { id: "t2", kind: "blocker", impassable: true, rect: { minX: 21, minY: 18, maxX: 25, maxY: 22 } },
    { id: "t3", kind: "cover", impassable: false, rect: { minX: 15, minY: 7, maxX: 20, maxY: 11 } },
    { id: "t4", kind: "cover", impassable: false, rect: { minX: 16, minY: 24, maxX: 22, maxY: 28 } }
  ];
}

function createDefaultHand(playerId, cardIds = ["aim_carefully", "forced_march"]) {
  return cardIds.map((cardId, index) => ({
    instanceId: `${playerId}_card_${cardId}_${index + 1}`,
    cardId
  }));
}

/**
 * Top-level state shape:
 *   round            — 1-indexed round counter
 *   phase            — "battle" or "cleanup". The old movement/assault/combat phases are gone.
 *   activePlayer     — whose activation it is
 *   activatingUnitId — the unit currently mid-activation (null when between activations)
 *   firstPlayerThisRound — who started this round; alternates each round
 *
 * Per-unit:
 *   status.activatedThisRound  — single flag, replaces the three phase flags
 *   status.movementUsed        — within an activation, tracks whether the move slot is spent
 *   status.actionUsed          — within an activation, tracks whether the action slot is spent
 *   status.runThisActivation   — flag so post-run rules (no shoot/charge) can apply
 */
export function createInitialGameState({
  missionId,
  deploymentId,
  armyA,
  armyB,
  tacticalCardsA = ["aim_carefully", "forced_march"],
  tacticalCardsB = ["aim_carefully", "forced_march"],
  rules = { gridMode: true },
  firstPlayerThisRound = "playerA"
}) {
  const mission = getMission(missionId);
  const deployment = getDeployment(deploymentId);
  const units = {};
  const reserveA = [];
  const reserveB = [];

  for (const entry of armyA) {
    const unit = createUnitStateFromTemplate(entry.templateId, "playerA", entry.id);
    units[unit.id] = unit;
    reserveA.push(unit.id);
  }
  for (const entry of armyB) {
    const unit = createUnitStateFromTemplate(entry.templateId, "playerB", entry.id);
    units[unit.id] = unit;
    reserveB.push(unit.id);
  }

  return {
    round: 1,
    phase: "battle",
    mission,
    deployment,
    board: {
      widthInches: deployment.boardWidthInches,
      heightInches: deployment.boardHeightInches,
      terrain: createTerrain()
    },
    rules: { gridMode: Boolean(rules?.gridMode) },
    players: {
      playerA: {
        vp: 0,
        reserveUnitIds: reserveA,
        battlefieldUnitIds: [],
        supplyPool: mission.startingSupply,
        availableSupply: mission.startingSupply,
        passedThisRound: false,
        hand: createDefaultHand("playerA", tacticalCardsA),
        discardPile: []
      },
      playerB: {
        vp: 0,
        reserveUnitIds: reserveB,
        battlefieldUnitIds: [],
        supplyPool: mission.startingSupply,
        availableSupply: mission.startingSupply,
        passedThisRound: false,
        hand: createDefaultHand("playerB", tacticalCardsB),
        discardPile: []
      }
    },
    units,
    effects: [],
    lastCombatReport: [],
    lastRoundSummary: null,
    objectiveControl: Object.fromEntries(
      deployment.missionMarkers.map(marker => [marker.id, {
        objectiveId: marker.id, controller: null, playerASupply: 0, playerBSupply: 0, contested: false
      }])
    ),
    winner: null,
    firstPlayerThisRound,
    activePlayer: firstPlayerThisRound,
    activatingUnitId: null,
    log: [
      {
        type: "phase",
        text: `Round 1 begins. ${firstPlayerThisRound === "playerA" ? "Crown Levy" : "Border Reavers"} have first activation.`,
        round: 1,
        phase: "battle"
      }
    ]
  };
}

export function cloneState(state) {
  return structuredClone(state);
}

export function appendLog(state, type, text) {
  state.log.push({ type, text, round: state.round, phase: state.phase });
}

export function getUnit(state, unitId) {
  return state.units[unitId] ?? null;
}

export function getPlayerUnits(state, playerId) {
  return Object.values(state.units).filter(unit => unit.owner === playerId);
}

export function getBattlefieldUnits(state, playerId) {
  return getPlayerUnits(state, playerId).filter(unit => unit.status.location === "battlefield");
}

export function getReserveUnits(state, playerId) {
  return getPlayerUnits(state, playerId).filter(unit => unit.status.location === "reserves");
}
