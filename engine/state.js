// v0.12 State management
import { createCharacterState } from "../data/characters.js";
import { getMission } from "../data/missions.js";
import { getDeployment } from "../data/deployments.js";

// 5v5 standard mirror game: one of each class per side
const CLASS_ROSTER = ["warrior", "ranger", "rogue", "cleric", "mage"];

// Starting positions for playerA (bottom) and playerB (top)
const STARTING_POSITIONS_A = [
  { x: 4.5, y: 20.5 },
  { x: 8.5, y: 21.5 },
  { x: 12.5, y: 22.5 },
  { x: 16.5, y: 21.5 },
  { x: 20.5, y: 20.5 }
];
const STARTING_POSITIONS_B = [
  { x: 4.5, y: 3.5 },
  { x: 8.5, y: 2.5 },
  { x: 12.5, y: 1.5 },
  { x: 16.5, y: 2.5 },
  { x: 20.5, y: 3.5 }
];

function createTerrain() {
  return [
    { id: "t1", kind: "blocking", impassable: true, traits: ["blocking"], rect: { minX: 10, minY: 10, maxX: 14, maxY: 14 }, label: "RUIN" },
    { id: "t2", kind: "cover", impassable: false, traits: ["cover"], rect: { minX: 3, minY: 8, maxX: 7, maxY: 11 }, label: "WOODS" },
    { id: "t3", kind: "cover", impassable: false, traits: ["cover"], rect: { minX: 17, minY: 13, maxX: 21, maxY: 16 }, label: "HEDGE" },
    { id: "t4", kind: "difficult", impassable: false, traits: ["difficult"], rect: { minX: 5, minY: 14, maxX: 9, maxY: 18 }, label: "MUD" },
    { id: "t5", kind: "cover", impassable: false, traits: ["cover"], rect: { minX: 15, minY: 6, maxX: 19, maxY: 9 }, label: "GROVE" }
  ];
}

export function createInitialGameState({ firstPlayerThisRound = "playerA" } = {}) {
  const deployment = getDeployment("standard");
  const mission = getMission("standard");

  const characters = {};

  CLASS_ROSTER.forEach((classId, i) => {
    const idA = `playerA_${classId}`;
    const idB = `playerB_${classId}`;
    const chA = createCharacterState(classId, "playerA", idA);
    const chB = createCharacterState(classId, "playerB", idB);
    chA.x = STARTING_POSITIONS_A[i].x;
    chA.y = STARTING_POSITIONS_A[i].y;
    chB.x = STARTING_POSITIONS_B[i].x;
    chB.y = STARTING_POSITIONS_B[i].y;
    characters[idA] = chA;
    characters[idB] = chB;
  });

  return {
    round: 1,
    phase: "battle",
    activePlayer: firstPlayerThisRound,
    firstPlayerThisRound,
    activatingCharacterId: null,

    characters,
    board: {
      widthInches: 24,
      heightInches: 24,
      terrain: createTerrain(),
      objectives: deployment.missionMarkers
    },

    players: {
      playerA: { vp: 0, characterIds: Object.keys(characters).filter(k => k.startsWith("playerA")), passedThisRound: false, hand: [], discardPile: [] },
      playerB: { vp: 0, characterIds: Object.keys(characters).filter(k => k.startsWith("playerB")), passedThisRound: false, hand: [], discardPile: [] }
    },

    objectiveControl: {},
    effects: [],
    log: [
      { type: "phase", text: "Round 1 begins.", round: 1, phase: "battle" }
    ],
    winner: null
  };
}

export function cloneState(state) {
  return structuredClone(state);
}

export function appendLog(state, type, text) {
  state.log.push({ type, text, round: state.round, phase: state.phase });
}

export function getCharacter(state, charId) {
  return state.characters[charId] ?? null;
}

export function getPlayerCharacters(state, playerId) {
  return Object.values(state.characters).filter(ch => ch.owner === playerId);
}

export function getLivingCharacters(state, playerId) {
  return getPlayerCharacters(state, playerId).filter(ch => ch.health > 0);
}
