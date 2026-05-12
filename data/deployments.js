// v0.12 Deployments — 24x24 board, center objective

export const DEPLOYMENT_DATA = {
  standard: {
    id: "standard",
    name: "Standard Skirmish",
    boardWidthInches: 24,
    boardHeightInches: 24,
    missionMarkers: [
      { id: "obj1", x: 12, y: 12 },
      { id: "obj2", x: 8, y: 8 },
      { id: "obj3", x: 16, y: 16 }
    ]
  }
};

export function getDeployment(deploymentId) {
  const deployment = DEPLOYMENT_DATA[deploymentId] ?? DEPLOYMENT_DATA.standard;
  return deployment;
}
