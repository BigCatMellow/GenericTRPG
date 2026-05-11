# Skirmish Engine — Alternating-Activations Refactor

A low-fantasy grid skirmish game between **Crown Levy** (blue) and **Border Reavers** (red).
Forked from the StarCraft-themed phase-based version; rebuilt around Bolt-Action-style
alternating activations.

## Turn structure (new)

There is one phase per round called **battle**. Within a round, players strictly
alternate one-unit-at-a-time activations until both sides are out, then the round
ends and VP is scored.

Each activation is **Move + one Action**:
- **Move** (or **Run** for double-move at the cost of the Action slot)
- **One Action**: Shoot OR Charge
- Charge resolves melee **immediately**, on the spot — there is no combat phase
- **Hold** is "spend the activation doing nothing"
- **End Activation** finishes a unit early (e.g. moved but don't want to act)

**Initiative alternates each round** — whoever started round 1 doesn't start round 2.
**Pass Round** surrenders the rest of your activations for the round (the opponent
keeps spending their remaining activations as spillover).

## What changed from the previous build

### Engine
- `engine/state.js` — new shape. Single `phase: "battle"`, `activatingUnitId`,
  `firstPlayerThisRound`. `combatQueue` removed (no more queue).
- `engine/activation.js` — the new turn machine: `beginActivation`,
  `endActivation`, `handleHandoff` (with spillover), `passRound`.
- `engine/phases.js` — round lifecycle only.
- `engine/movement.js` — Move/Run/Disengage/Hold adapted to per-activation slots.
  Run consumes both slots. Disengage without Tactical Mass burns the Action.
- `engine/actions.js` (new) — Ranged Attack and Charge. Both resolve **immediately**.
- `engine/combat.js` — pure attack-math module; queue orchestration removed.
- `engine/deployment.js` — Deploy consumes a full activation. `deep_strike`
  ability renamed to `flank_attack`.
- `engine/legal_actions.js` — derives legal actions from activation state.
- `engine/reducer.js` — wires actions; triggers `endRound` when both sides are out.
- `engine/cards.js` — relaxed phase gate (cards play during your activation).

### Data
- `data/units.js` — full reskin. Crown Levy roster (Castellan, Crossbowmen,
  Knights, Levy Spearmen, Battle Surgeon, Royal Champion, Veteran Swords) and
  Border Reavers roster (Reaver Champion, Wolfriders, Trollkin Brutes, Berserkers,
  Reaver Skirmishers, Reaver Raiders). Stats preserved for balance; weapons and
  tags reflavored.
- `data/tactical_cards.js` — full reskin (Aim Carefully, Forced March, War Banner,
  Veterans, Light Foot, Bloodlust, Field Drill, Drill Master, Volley Fire).
  Mechanics unchanged.
- `data/missions.js` — "Hold the Keep" / "Sack the Ruins" (was Take and Hold /
  Domination Protocol).
- `data/deployments.js` — "Valley Engagement" (was Crossfire).

### UI
- `index.html` — title and HUD updated; combat queue panel removed.
- `ui/main.js` — controller rewritten around activation slots.
- `ui/board.js` — switched from PNG sprites to **single colored squares** per
  unit. Gold dashed outline marks the currently-activating unit.
- `ui/renderer.js` — drops combat queue panel; phase strip shows "{Unit} acting"
  during an activation. "SP" displayed as "C" (Cost).
- `ui/input.js` — small tweaks for the unified interaction modes.
- `css/styles.css` — earthen board background, unit-block styles, activating-unit
  indicator.

### AI
- `ai/bot.js` — full rewrite for the new model. Two decisions per activation:
  (a) **which** of my unactivated units should go now (`pickNextUnit`), and
  (b) **what** that unit should do (`planActivation`). Unaffordable reserves are
  filtered out to avoid deadlocks when the force pool is full.

### What was dropped
- Multi-block sprite rendering (back to single-block colored squares per the
  memory).
- `combatQueue` and the entire Combat phase.
- Overwatch reactions (the assault.js code had an overwatch hook — it's gone).
  Was flagged as v2 work; reactions need an event-stack architecture that's a
  bigger lift.
- StarCraft rules HTML, sprite assets (`img/`), `app.bundle.js` — none referenced
  by the live build.
- `mnt/data/...` mirror tree from the original zip.
- `ui/panels.js` — wasn't imported by the new renderer and had no callers.

## Files changed

```
engine/state.js          rewrite
engine/activation.js     rewrite
engine/phases.js         rewrite
engine/movement.js       rewrite
engine/combat.js         rewrite
engine/actions.js        NEW (replaces assault.js)
engine/deployment.js     rewrite
engine/legal_actions.js  rewrite
engine/reducer.js        rewrite
engine/cards.js          rewrite (relaxed gate)
engine/effects.js        unchanged
engine/objectives.js     unchanged
engine/coherency.js      unchanged
engine/geometry.js       unchanged
engine/supply.js         unchanged
engine/reserves.js       unchanged
engine/mission_rules.js  unchanged

data/units.js            full reskin
data/tactical_cards.js   full reskin
data/missions.js         reflavor
data/deployments.js      reflavor
data/terrain_profiles.js unchanged

ui/main.js               rewrite
ui/board.js              rewrite (single-block, no sprites)
ui/renderer.js           rewrite (drop combat queue)
ui/input.js              minor

index.html               rewrite
css/styles.css           tweaks (earthen palette, unit-block styles)

ai/bot.js                full rewrite

REMOVED: assault.js, panels.js, img/, Rules/, app.bundle.js, mnt/, tests/
```

## Tests

Tests under `tests/` from the previous build reference the phase-based engine
and **will not pass** without rewriting. They're not shipped here. Worth doing
in a follow-up pass — the smoke test in this iteration just drives both sides
through 5 rounds with the bot and verifies the loop completes.

## Open work
- Bot tuning. The new bot completes games but tends to be passive on the Crown
  side — needs an "advance to contest objectives" bias when score is even or
  ahead.
- Tactical card timing. Cards trigger off `events.unit_moved` with no
  `unitRole` filter, which can consume the buff on a different unit's move.
  Pre-existing in the effects engine; worth fixing.
- Reactions / overwatch — natural v2 add. Will need an event-stack so the
  off-side has something to do during the opponent's activation.
- The mobile build (`SCG2-mobile.zip`) is unchanged. Same engine and data
  modules apply once you re-cut the mobile UI.
