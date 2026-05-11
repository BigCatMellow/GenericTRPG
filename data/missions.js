export const MISSION_DATA = {
  hold_the_keep: {
    id: "hold_the_keep",
    name: "Hold the Keep",
    roundLimit: 5,
    startingSupply: 4,
    supplyEscalation: 2,
    objectiveControlRangeInches: 2,
    vpPerControlledObjective: 1,
    pacing: { roundLimit: 5, finalRoundUnlimitedSupply: true },
    setupVariants: { recommendedDeployments: ["valley"], markerLayout: "standard_three_marker" },
    scoringWindows: [
      { id: "primary_cleanup", timing: "cleanup", rounds: "all", type: "controlled_markers", vpPerMarker: 1 }
    ],
    instantWinConditions: [
      { id: "dominate_field", type: "control_all_markers" },
      { id: "decisive_lead", type: "vp_threshold", threshold: 10 }
    ]
  },
  sack_the_ruins: {
    id: "sack_the_ruins",
    name: "Sack the Ruins",
    roundLimit: 5,
    startingSupply: 5,
    supplyEscalation: 2,
    objectiveControlRangeInches: 2,
    vpPerControlledObjective: 1,
    pacing: { roundLimit: 5, finalRoundUnlimitedSupply: true },
    setupVariants: { recommendedDeployments: ["valley"], markerLayout: "center_priority" },
    scoringWindows: [
      { id: "early_cleanup", timing: "cleanup", rounds: [1, 2], type: "controlled_markers", vpPerMarker: 1 },
      { id: "central_treasury", timing: "cleanup", rounds: { min: 3, max: 5 }, type: "specific_marker_control", markerId: "obj1", vpValue: 2 }
    ],
    instantWinConditions: [
      { id: "rout_threshold", type: "vp_threshold", threshold: 12 }
    ]
  }
};

export function getMission(missionId) {
  const mission = MISSION_DATA[missionId];
  if (!mission) throw new Error(`Unknown mission: ${missionId}`);
  return mission;
}
