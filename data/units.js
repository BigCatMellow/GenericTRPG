export const UNIT_DATA = {
  /* ── CROWN LEVY (playerA, blue) ── */
  levy_spearmen: {
    id: "levy_spearmen",
    name: "Levy Spearmen",
    tags: ["Ground", "Infantry", "Ranged"],
    abilities: ["drilled"],
    speed: 6,
    size: 1,
    base: { shape: "circle", diameterMm: 25, radiusInches: 0.5 },
    startingModelCount: 6,
    woundsPerModel: 1,
    defense: { toughness: 3, armorSave: 4, invulnerableSave: null },
    rangedWeapons: [{
      id: "shortbow", name: "Shortbow",
      rangeInches: 15, shotsPerModel: 1, hitTarget: 4,
      strength: 4, armorPenetration: 1, damage: 1, keywords: ["volley"]
    }],
    meleeWeapons: [{
      id: "spear", name: "Spear",
      attacksPerModel: 1, hitTarget: 5, strength: 3, armorPenetration: 0, damage: 1, keywords: []
    }],
    supplyProfile: [
      { minModels: 5, supply: 2 }, { minModels: 3, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  crossbowmen: {
    id: "crossbowmen",
    name: "Crossbowmen",
    tags: ["Ground", "Infantry", "Ranged", "Core"],
    abilities: ["battle_drill"],
    speed: 6,
    size: 1,
    base: { shape: "circle", diameterMm: 25, radiusInches: 0.5 },
    startingModelCount: 6,
    woundsPerModel: 1,
    defense: { toughness: 3, armorSave: 4, invulnerableSave: null },
    rangedWeapons: [{
      id: "crossbow", name: "Heavy Crossbow",
      rangeInches: 16, shotsPerModel: 1, hitTarget: 4,
      strength: 4, armorPenetration: 1, damage: 1, keywords: ["volley"]
    }],
    meleeWeapons: [{
      id: "shortsword", name: "Shortsword",
      attacksPerModel: 1, hitTarget: 5, strength: 3, armorPenetration: 0, damage: 1, keywords: []
    }],
    supplyProfile: [
      { minModels: 5, supply: 2 }, { minModels: 3, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  knights: {
    id: "knights",
    name: "Knights",
    tags: ["Ground", "Infantry", "Core", "Armoured"],
    abilities: ["crushing_blows"],
    speed: 5,
    size: 1,
    base: { shape: "circle", diameterMm: 32, radiusInches: 0.6 },
    startingModelCount: 3,
    woundsPerModel: 2,
    defense: { toughness: 5, armorSave: 4, invulnerableSave: null },
    rangedWeapons: [{
      id: "throwing_axes", name: "Throwing Axes",
      rangeInches: 14, shotsPerModel: 2, hitTarget: 4,
      strength: 5, armorPenetration: 1, damage: 2, keywords: ["heavy"]
    }],
    meleeWeapons: [{
      id: "warhammer", name: "Warhammer",
      attacksPerModel: 2, hitTarget: 4, strength: 5, armorPenetration: 1, damage: 1, keywords: []
    }],
    supplyProfile: [
      { minModels: 3, supply: 2 }, { minModels: 2, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  battle_surgeon: {
    id: "battle_surgeon",
    name: "Battle Surgeon",
    tags: ["Ground", "Infantry", "Support"],
    abilities: ["field_medicine"],
    speed: 6,
    size: 1,
    base: { shape: "circle", diameterMm: 25, radiusInches: 0.5 },
    startingModelCount: 2,
    woundsPerModel: 2,
    defense: { toughness: 4, armorSave: 5, invulnerableSave: null },
    rangedWeapons: [{
      id: "hand_crossbow", name: "Hand Crossbow",
      rangeInches: 10, shotsPerModel: 1, hitTarget: 4,
      strength: 4, armorPenetration: 1, damage: 1, keywords: []
    }],
    meleeWeapons: [{
      id: "ceremonial_mace", name: "Ceremonial Mace",
      attacksPerModel: 1, hitTarget: 5, strength: 3, armorPenetration: 0, damage: 1, keywords: []
    }],
    supplyProfile: [
      { minModels: 2, supply: 1 }, { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  castellan: {
    id: "castellan",
    name: "Castellan",
    tags: ["Ground", "Infantry", "Hero", "Ranged"],
    abilities: ["captaincy"],
    speed: 6,
    size: 1,
    base: { shape: "circle", diameterMm: 32, radiusInches: 0.6 },
    startingModelCount: 1,
    woundsPerModel: 6,
    defense: { toughness: 5, armorSave: 3, invulnerableSave: 5 },
    rangedWeapons: [{
      id: "warbow", name: "Warbow",
      rangeInches: 18, shotsPerModel: 3, hitTarget: 3,
      strength: 6, armorPenetration: 2, damage: 2, keywords: ["heroic"]
    }],
    meleeWeapons: [{
      id: "bastard_sword", name: "Bastard Sword",
      attacksPerModel: 3, hitTarget: 4, strength: 4, armorPenetration: 1, damage: 1, keywords: []
    }],
    supplyProfile: [
      { minModels: 1, supply: 3 }, { minModels: 0, supply: 0 }
    ]
  },

  royal_champion: {
    id: "royal_champion",
    name: "Royal Champion",
    tags: ["Ground", "Hero", "Armoured"],
    abilities: ["braced"],
    speed: 5,
    size: 2,
    base: { shape: "circle", diameterMm: 50, radiusInches: 1 },
    startingModelCount: 1,
    woundsPerModel: 4,
    defense: { toughness: 6, armorSave: 3, invulnerableSave: 5 },
    rangedWeapons: [{
      id: "heavy_javelins", name: "Heavy Javelins",
      rangeInches: 18, shotsPerModel: 4, hitTarget: 4,
      strength: 7, armorPenetration: 2, damage: 2, keywords: ["piercing"]
    }],
    meleeWeapons: [{
      id: "greatsword", name: "Greatsword",
      attacksPerModel: 2, hitTarget: 4, strength: 6, armorPenetration: 1, damage: 1, keywords: ["brutal"]
    }],
    supplyProfile: [
      { minModels: 1, supply: 3 }, { minModels: 0, supply: 0 }
    ]
  },

  veteran_swords: {
    id: "veteran_swords",
    name: "Veteran Swords",
    tags: ["Ground", "Infantry", "Melee"],
    abilities: ["battle_cry"],
    speed: 7,
    size: 1,
    base: { shape: "circle", diameterMm: 32, radiusInches: 0.6 },
    startingModelCount: 4,
    woundsPerModel: 2,
    defense: { toughness: 4, armorSave: 4, invulnerableSave: 5 },
    rangedWeapons: [],
    meleeWeapons: [{
      id: "longsword", name: "Longsword",
      attacksPerModel: 2, hitTarget: 4, strength: 5, armorPenetration: 2, damage: 1, keywords: ["precise"]
    }],
    supplyProfile: [
      { minModels: 3, supply: 2 }, { minModels: 2, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  /* ── BORDER REAVERS (playerB, red) ── */
  reaver_skirmishers: {
    id: "reaver_skirmishers",
    name: "Reaver Skirmishers",
    tags: ["Ground", "Swarm", "Light", "Infantry"],
    abilities: ["loose_order"],
    speed: 8,
    size: 1,
    base: { shape: "circle", diameterMm: 25, radiusInches: 0.45 },
    startingModelCount: 8,
    woundsPerModel: 1,
    defense: { toughness: 3, armorSave: 6, invulnerableSave: null },
    rangedWeapons: [],
    meleeWeapons: [{
      id: "hatchets", name: "Hand Axes",
      attacksPerModel: 2, hitTarget: 4, strength: 3, armorPenetration: 0, damage: 1, keywords: ["anti_infantry"]
    }],
    supplyProfile: [
      { minModels: 6, supply: 2 }, { minModels: 4, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  reaver_raiders: {
    id: "reaver_raiders",
    name: "Reaver Raiders",
    tags: ["Ground", "Swarm", "Core", "Melee"],
    abilities: ["endurance"],
    speed: 8,
    size: 1,
    base: { shape: "circle", diameterMm: 25, radiusInches: 0.45 },
    startingModelCount: 6,
    woundsPerModel: 1,
    defense: { toughness: 3, armorSave: 6, invulnerableSave: null },
    rangedWeapons: [],
    meleeWeapons: [{
      id: "raider_axes", name: "Raider Axes",
      attacksPerModel: 2, hitTarget: 4, strength: 3, armorPenetration: 0, damage: 1, keywords: ["anti_infantry"]
    }],
    supplyProfile: [
      { minModels: 5, supply: 1 }, { minModels: 3, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  berserkers: {
    id: "berserkers",
    name: "Berserkers",
    tags: ["Ground", "Swarm", "Core", "Melee"],
    abilities: ["rage"],
    speed: 9,
    size: 1,
    base: { shape: "circle", diameterMm: 25, radiusInches: 0.45 },
    startingModelCount: 8,
    woundsPerModel: 1,
    defense: { toughness: 3, armorSave: 6, invulnerableSave: null },
    rangedWeapons: [],
    meleeWeapons: [{
      id: "berserker_axes", name: "Frenzied Axes",
      attacksPerModel: 3, hitTarget: 4, strength: 3, armorPenetration: 0, damage: 1, keywords: ["anti_infantry"]
    }],
    supplyProfile: [
      { minModels: 6, supply: 2 }, { minModels: 4, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  wolfriders: {
    id: "wolfriders",
    name: "Wolfriders",
    tags: ["Ground", "Elite", "Melee"],
    abilities: ["quickfoot"],
    speed: 9,
    size: 1,
    base: { shape: "circle", diameterMm: 25, radiusInches: 0.45 },
    startingModelCount: 6,
    woundsPerModel: 1,
    defense: { toughness: 4, armorSave: 5, invulnerableSave: null },
    rangedWeapons: [],
    meleeWeapons: [{
      id: "wolfrider_axes", name: "Hand-Axes & Fangs",
      attacksPerModel: 3, hitTarget: 4, strength: 4, armorPenetration: 1, damage: 1, keywords: ["anti_infantry"]
    }],
    supplyProfile: [
      { minModels: 5, supply: 2 }, { minModels: 3, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  trollkin_brutes: {
    id: "trollkin_brutes",
    name: "Trollkin Brutes",
    tags: ["Ground", "Elite", "Armoured"],
    abilities: ["war_paint"],
    speed: 5,
    size: 1,
    base: { shape: "circle", diameterMm: 32, radiusInches: 0.6 },
    startingModelCount: 3,
    woundsPerModel: 3,
    defense: { toughness: 6, armorSave: 4, invulnerableSave: null },
    rangedWeapons: [{
      id: "rune_javelins", name: "Rune-Carved Javelins",
      rangeInches: 12, shotsPerModel: 2, hitTarget: 4,
      strength: 6, armorPenetration: 2, damage: 2, keywords: ["heavy"]
    }],
    meleeWeapons: [{
      id: "warclubs", name: "Warclubs",
      attacksPerModel: 2, hitTarget: 4, strength: 5, armorPenetration: 1, damage: 1, keywords: []
    }],
    supplyProfile: [
      { minModels: 3, supply: 2 }, { minModels: 2, supply: 1 },
      { minModels: 1, supply: 0 }, { minModels: 0, supply: 0 }
    ]
  },

  reaver_champion: {
    id: "reaver_champion",
    name: "Reaver Champion",
    tags: ["Ground", "Hero", "Melee"],
    abilities: ["bloody_prowess", "flank_attack"],
    speed: 8,
    size: 1,
    base: { shape: "circle", diameterMm: 40, radiusInches: 0.8 },
    startingModelCount: 1,
    woundsPerModel: 6,
    defense: { toughness: 6, armorSave: 3, invulnerableSave: 4 },
    rangedWeapons: [{
      id: "throwing_spears", name: "Throwing Spears",
      rangeInches: 12, shotsPerModel: 2, hitTarget: 3,
      strength: 6, armorPenetration: 2, damage: 2, keywords: ["heavy"]
    }],
    meleeWeapons: [{
      id: "great_axe", name: "Great Axe",
      attacksPerModel: 5, hitTarget: 3, strength: 7, armorPenetration: 3, damage: 2, keywords: ["lethal"]
    }],
    supplyProfile: [
      { minModels: 1, supply: 3 }, { minModels: 0, supply: 0 }
    ]
  }
};

export function getUnitTemplate(templateId) {
  const template = UNIT_DATA[templateId];
  if (!template) throw new Error(`Unknown unit template: ${templateId}`);
  return template;
}

export function computeCurrentSupplyValue(template, aliveModelCount) {
  const sorted = [...template.supplyProfile].sort((a, b) => b.minModels - a.minModels);
  for (const bracket of sorted) {
    if (aliveModelCount >= bracket.minModels) return bracket.supply;
  }
  return 0;
}

export function createUnitStateFromTemplate(templateId, owner, unitId) {
  const template = getUnitTemplate(templateId);
  const models = {};
  const modelIds = [];
  for (let i = 0; i < template.startingModelCount; i += 1) {
    const id = `${unitId}_m${i + 1}`;
    modelIds.push(id);
    models[id] = {
      id, alive: true, x: null, y: null, elevation: "ground",
      woundsRemaining: template.woundsPerModel
    };
  }
  const rangedWeapons = template.rangedWeapons?.map(w => ({ ...w })) ?? [];
  return {
    id: unitId, owner, templateId,
    name: template.name,
    leadingModelId: modelIds[0] ?? null,
    modelIds, models,
    tags: [...template.tags],
    abilities: [...(template.abilities ?? [])],
    speed: template.speed,
    size: template.size,
    base: { ...template.base },
    defense: { ...template.defense },
    rangedWeapons,
    meleeWeapons: template.meleeWeapons?.map(w => ({ ...w })) ?? [],
    ranged: rangedWeapons.length ? {
      rangeInches: rangedWeapons[0].rangeInches,
      shotsPerModel: rangedWeapons[0].shotsPerModel,
      hitTarget: rangedWeapons[0].hitTarget
    } : null,
    supplyProfile: [...template.supplyProfile],
    currentSupplyValue: computeCurrentSupplyValue(template, template.startingModelCount),
    status: {
      location: "reserves",
      activatedThisRound: false,
      movementUsed: false,
      actionUsed: false,
      runThisActivation: false,
      engaged: false,
      outOfCoherency: false,
      stationary: false
    },
    activationMarkers: []
  };
}
