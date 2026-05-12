// v0.12 Terrain profiles

export const TERRAIN_PROFILES = {
  cover: {
    id: "cover",
    name: "Cover",
    impassable: false,
    traits: ["cover"]
    // attacks against character in cover: one step harder
    // ending move in cover removes one condition (Pinned or Exposed)
  },
  blocking: {
    id: "blocking",
    name: "Blocking Obstacle",
    impassable: true,
    traits: ["blocking"]
    // cannot move or attack through
  },
  difficult: {
    id: "difficult",
    name: "Difficult Ground",
    impassable: false,
    traits: ["difficult"]
    // -2 inches movement; Running through -> Exposed
  },
  hazard: {
    id: "hazard",
    name: "Hazard",
    impassable: false,
    traits: ["hazard"]
    // on enter/end activation: roll 1d6, 4+ no effect, 1-3: 1 dmg or Exposed
  },
  elevated: {
    id: "elevated",
    name: "Elevated Position",
    impassable: false,
    traits: ["elevated"]
    // +2 in range for ranged/magic; attacks from lower ground harder (if also Cover)
  },
  exposing: {
    id: "exposing",
    name: "Exposing Terrain",
    impassable: false,
    traits: ["exposing"]
    // Running through -> Exposed
  },
  concealing: {
    id: "concealing",
    name: "Concealing Terrain",
    impassable: false,
    traits: ["concealing"]
    // attacks harder; ranged from >8" must have attacked this round
  }
};

export function getTerrainProfile(profileId) {
  return TERRAIN_PROFILES[profileId] ?? null;
}

export function terrainHasTrait(terrain, trait) {
  if (terrain.traits) return terrain.traits.includes(trait);
  // Legacy compatibility
  if (trait === "cover" && terrain.kind === "cover") return true;
  if (trait === "blocking" && terrain.impassable) return true;
  return false;
}
