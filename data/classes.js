// v0.12 Class ability definitions

export const CLASS_ABILITIES = {
  warrior: {
    classId: "warrior",
    name: "Warrior",
    passive: {
      id: "battle_ready",
      name: "Battle Ready",
      description: "Brace is one step easier when Guarded."
    },
    criticals: {
      attack: { description: "Choose: +1 dmg, push target 1\", or become Guarded." }
    }
  },

  ranger: {
    classId: "ranger",
    name: "Ranger",
    attackModes: {
      standard: { id: "standard_shot", name: "Standard Shot" },
      suppressing: { id: "suppressing_shot", name: "Suppressing Shot", damageMod: -1, appliesPinned: true },
      called: { id: "called_shot", name: "Called Shot", damageMod: -1, appliesExposed: true, oneCategoryHarder: true }
    },
    criticals: {
      standard_shot: { description: "+1 dmg." },
      suppressing_shot: { description: "Pinned cannot be removed until after next activation." },
      called_shot: { description: "Exposed; attack deals normal damage instead of reduced." }
    }
  },

  rogue: {
    classId: "rogue",
    name: "Rogue",
    passive: {
      id: "exploit_opening",
      name: "Exploit Opening",
      description: "Attacks against Exposed or Spent targets are one step easier."
    },
    active: {
      id: "slip_through",
      name: "Slip Through",
      description: "After Quick melee hit, move 3\" in. Only usable if target is Exposed/Spent. Blocked if attacker is Pinned."
    },
    special: {
      id: "backstab",
      name: "Backstab",
      description: "Quick melee action. +1 dmg if target is Exposed or Spent."
    },
    criticals: {
      attack_vs_exposed_spent: { description: "+1 dmg." },
      attack_normal: { description: "Extra Slip Through use." },
      dodge: { description: "Move 2\" instead of 1\"." }
    }
  },

  cleric: {
    classId: "cleric",
    name: "Cleric",
    active: {
      id: "rally",
      name: "Rally",
      description: "Choose a friendly character ≤6\" away. Remove Pinned or Exposed. If Spent→Committed. If condition removed or readiness improved, target becomes Guarded."
    },
    criticals: {
      attack: { description: "One friendly ≤3\" may remove Exposed." },
      rally: { description: "Remove condition + improve readiness + become Guarded." }
    }
  },

  mage: {
    classId: "mage",
    name: "Mage",
    active: {
      id: "disrupt",
      name: "Disrupt",
      description: "Choose enemy ≤8\". Roll 1d6: 4+ applies Exposed +1 dmg (3+ if target already Pinned/Exposed). If target was already Exposed, also becomes Pinned. After resolving, Mage becomes Committed."
    },
    criticals: {
      disrupt: { description: "Exposed + Pinned; if already Exposed/Pinned → +1 dmg." },
      attack: { description: "+1 dmg OR target becomes Exposed." }
    }
  }
};

export function getClassAbility(classId) {
  return CLASS_ABILITIES[classId] ?? null;
}
