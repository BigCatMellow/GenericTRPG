export const TACTICAL_CARDS = {
  aim_carefully: {
    id: 'aim_carefully',
    name: 'Aim Carefully',
    phase: 'attack',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['combat_resolve_attack'],
      modifiers: [{ key: 'weapon.hitTarget', operation: 'add', value: -1, priority: 0 }],
      duration: { type: 'events', eventType: 'combat_attack_resolved', unitRole: 'attacker', remaining: 1 }
    }
  },
  forced_march: {
    id: 'forced_march',
    name: 'Forced March',
    phase: 'movement',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['movement_move', 'movement_disengage'],
      modifiers: [{ key: 'unit.speed', operation: 'add', value: 1, priority: 0 }],
      duration: { type: 'events', eventType: 'unit_moved', remaining: 1 }
    }
  },
  war_banner: {
    id: 'war_banner',
    name: 'War Banner',
    phase: 'attack',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['combat_resolve_attack'],
      modifiers: [{ key: 'weapon.attacksPerModel', operation: 'add', value: 1, priority: 0 }],
      duration: { type: 'events', eventType: 'combat_attack_resolved', unitRole: 'attacker', remaining: 1 }
    }
  },
  veterans: {
    id: 'veterans',
    name: 'Veterans',
    phase: 'attack',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['combat_resolve_attack'],
      modifiers: [{ key: 'weapon.hitTarget', operation: 'add', value: -1, priority: 0 }],
      duration: { type: 'events', eventType: 'combat_attack_resolved', unitRole: 'attacker', remaining: 1 }
    }
  },
  light_foot: {
    id: 'light_foot',
    name: 'Light Foot',
    phase: 'movement',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['movement_move', 'movement_disengage'],
      modifiers: [{ key: 'unit.speed', operation: 'add', value: 1, priority: 0 }],
      duration: { type: 'events', eventType: 'unit_moved', remaining: 1 }
    }
  },
  bloodlust: {
    id: 'bloodlust',
    name: 'Bloodlust',
    phase: 'movement',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['movement_move', 'movement_disengage'],
      modifiers: [{ key: 'unit.speed', operation: 'add', value: 2, priority: 0 }],
      duration: { type: 'events', eventType: 'unit_moved', remaining: 1 }
    }
  },
  field_drill: {
    id: 'field_drill',
    name: 'Field Drill',
    phase: 'movement',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['movement_move', 'movement_disengage'],
      modifiers: [{ key: 'unit.speed', operation: 'add', value: 1, priority: 0 }],
      duration: { type: 'events', eventType: 'unit_moved', remaining: 1 }
    }
  },
  drill_master: {
    id: 'drill_master',
    name: 'Drill Master',
    phase: 'attack',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['combat_resolve_attack'],
      modifiers: [{ key: 'weapon.hitTarget', operation: 'add', value: -1, priority: 0 }],
      duration: { type: 'events', eventType: 'combat_attack_resolved', unitRole: 'attacker', remaining: 1 }
    }
  },
  volley_fire: {
    id: 'volley_fire',
    name: 'Volley Fire',
    phase: 'attack',
    target: 'friendly_battlefield_unit',
    effect: {
      timings: ['combat_resolve_attack'],
      modifiers: [{ key: 'weapon.shotsPerModel', operation: 'add', value: 1, priority: 0 }],
      duration: { type: 'events', eventType: 'combat_attack_resolved', unitRole: 'attacker', remaining: 1 }
    }
  }
};

export function getTacticalCard(cardId) {
  const card = TACTICAL_CARDS[cardId];
  if (!card) throw new Error(`Unknown tactical card: ${cardId}`);
  return card;
}
