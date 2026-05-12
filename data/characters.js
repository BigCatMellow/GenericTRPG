// v0.12 Character class templates and factory

export const CHARACTER_TEMPLATES = {
  warrior: {
    classId: "warrior",
    name: "Warrior",
    health: 5,
    maxHealth: 5,
    move: 6,
    attacks: {
      standard: { type: "melee", name: "Standard Strike", attackType: "standard", damage: 2 },
      heavy: { type: "melee", name: "Heavy Blow", attackType: "heavy", damage: 3 }
    }
  },
  ranger: {
    classId: "ranger",
    name: "Ranger",
    health: 4,
    maxHealth: 4,
    move: 6,
    attacks: {
      quick: { type: "ranged", name: "Quick Shot", attackType: "quick", damage: 1 },
      standard: { type: "ranged", name: "Standard Shot", attackType: "standard", damage: 2 },
      suppressing: { type: "ranged", name: "Suppressing Shot", attackType: "standard", damage: 1, appliesPinned: true },
      called: { type: "ranged", name: "Called Shot", attackType: "standard", damage: 1, appliesExposed: true, oneCategoryHarder: true }
    }
  },
  rogue: {
    classId: "rogue",
    name: "Rogue",
    health: 4,
    maxHealth: 4,
    move: 7,
    attacks: {
      quick: { type: "melee", name: "Quick Strike", attackType: "quick", damage: 1 },
      standard: { type: "melee", name: "Standard Strike", attackType: "standard", damage: 2 },
      backstab: { type: "melee", name: "Backstab", attackType: "quick", damage: 1, bonusDmgIfExposedOrSpent: 1 }
    }
  },
  cleric: {
    classId: "cleric",
    name: "Cleric",
    health: 4,
    maxHealth: 4,
    move: 6,
    attacks: {
      standard: { type: "melee", name: "Divine Strike", attackType: "standard", damage: 1 }
    }
  },
  mage: {
    classId: "mage",
    name: "Mage",
    health: 3,
    maxHealth: 3,
    move: 6,
    attacks: {
      standard: { type: "magic", name: "Arcane Bolt", attackType: "standard", damage: 2, range: 8 }
    }
  }
};

export function getCharacterTemplate(classId) {
  const t = CHARACTER_TEMPLATES[classId];
  if (!t) throw new Error(`Unknown character class: ${classId}`);
  return t;
}

export function createCharacterState(classId, owner, characterId) {
  const template = getCharacterTemplate(classId);
  return {
    id: characterId,
    owner,
    templateId: classId,
    name: template.name,
    classId,

    health: template.health,
    maxHealth: template.maxHealth,
    move: template.move,
    attacks: structuredClone(template.attacks),

    x: null,
    y: null,

    readiness: "ready",        // "ready" | "committed" | "spent"
    conditions: [],            // array of "guarded" | "pinned" | "exposed"

    reactionUsedThisRound: false,
    activatedThisRound: false,
    movementUsed: false,
    actionUsed: false,
    ranThisActivation: false,

    securingObjectiveId: null,
    location: "battlefield"    // characters start on the battlefield in v0.12
  };
}
