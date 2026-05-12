// v0.12 Missions — character-presence objective control, no supply

export const MISSION_DATA = {
  standard: {
    id: "standard",
    name: "Standard Engagement",
    roundLimit: 5,
    objectiveControlRangeInches: 3,
    vpPerControlledObjective: 1,
    noScoringRound1: true,
    winVp: 3
  }
};

export function getMission(missionId) {
  const mission = MISSION_DATA[missionId] ?? MISSION_DATA.standard;
  return mission;
}
