import {
  getLegalDeployDestinations,
  getLegalMoveDestinations,
  getLegalDisengageDestinations,
  getLegalRunDestinations,
  getLegalActionsForPlayer
} from "../engine/legal_actions.js";
import { autoArrangeModels } from "../engine/coherency.js";
import { distance } from "../engine/geometry.js";
import { getObjectiveControlSnapshot, getObjectiveControlRange } from "../engine/objectives.js";
import { getTacticalCard } from "../data/tactical_cards.js";

/* ── Tiny helpers ── */
const opp = pid => pid === "playerA" ? "playerB" : "playerA";
const lp = u => { const m = u.models[u.leadingModelId]; return m?.alive && m.x != null ? { x: m.x, y: m.y } : null; };
const alive = u => u.modelIds.filter(id => u.models[id].alive).length;
const wounds = u => u.modelIds.reduce((s, id) => { const m = u.models[id]; return s + (m.alive ? (m.woundsRemaining ?? 1) : 0); }, 0);
const onField = u => u.status.location === "battlefield";
const inReserves = u => u.status.location === "reserves";
const mxRange = u => Math.max(0, ...(u.rangedWeapons ?? []).map(w => w.rangeInches ?? 0));
const hasR = u => u.rangedWeapons?.length > 0;
const hasM = u => u.meleeWeapons?.length > 0;
const hasROnly = u => hasR(u) && !hasM(u);

function availSupply(state, pid) {
  const pool = state.players[pid].supplyPool;
  const used = state.players[pid].battlefieldUnitIds.reduce((t, id) => t + state.units[id].currentSupplyValue, 0);
  return pool === Infinity ? Infinity : pool - used;
}

function bPath(u, p) { const l = u.models[u.leadingModelId]; return [{ x: l.x, y: l.y }, { x: p.x, y: p.y }]; }

/* ══════════════════════════════════════════════════════════════
   STRATEGIC ASSESSMENT — runs once per activation pick
   ══════════════════════════════════════════════════════════════ */
function assess(state, pid) {
  const me = state.players[pid], them = state.players[opp(pid)];
  const snap = getObjectiveControlSnapshot(state);
  const cr = getObjectiveControlRange(state);
  const rl = state.mission.pacing?.roundLimit ?? state.mission.roundLimit ?? 5;
  const roundsLeft = rl - state.round;
  const vpDiff = me.vp - them.vp;

  let posture;
  if (vpDiff < -2 || (vpDiff < 0 && roundsLeft <= 1)) posture = "desperate";
  else if (vpDiff < 0) posture = "aggressive";
  else if (vpDiff > 2 || (vpDiff > 0 && roundsLeft <= 1)) posture = "defensive";
  else posture = "balanced";

  const objPriorities = state.deployment.missionMarkers.map(obj => {
    const c = snap[obj.id];
    let priority = 0;
    if (!c.controller && !c.contested) priority = 10;
    else if (c.contested) priority = 8;
    else if (c.controller === opp(pid)) priority = 5;
    else {
      const enemyNear = Object.values(state.units).some(e =>
        e.owner !== pid && onField(e) && lp(e) && distance(lp(e), obj) <= cr + 8
      );
      priority = enemyNear ? 4 : 1;
    }
    if (roundsLeft <= 2) priority *= 1.5;
    return { ...obj, ...c, priority };
  }).sort((a, b) => b.priority - a.priority);

  return { posture, vpDiff, roundsLeft, roundLimit: rl, objPriorities, snap, cr };
}

/* ══════════════════════════════════════════════════════════════
   POSITION SCORING — for picking move destinations
   ══════════════════════════════════════════════════════════════ */
function scorePosition(state, pid, unit, point, ctx) {
  let score = 0;
  // Objective proximity
  for (const obj of ctx.objPriorities) {
    const d = distance(point, obj);
    if (d <= ctx.cr) score += obj.priority * 3;
    else if (d <= ctx.cr + 5) score += obj.priority * Math.max(0, (ctx.cr + 5 - d) / 5);
  }
  // Ranged sweet-spot vs enemies
  const enemies = Object.values(state.units).filter(u => u.owner === opp(pid) && onField(u));
  for (const e of enemies) {
    const ep = lp(e);
    if (!ep) continue;
    const d = distance(point, ep);
    if (hasR(unit)) {
      const mr = mxRange(unit);
      if (mr > 0) {
        const ideal = mr * 0.7;
        score -= Math.abs(d - ideal) * 0.4;
        if (d <= 1.5) score -= hasROnly(unit) ? 12 : 5;
      }
    }
    if (hasM(unit) && !hasR(unit) && ctx.posture !== "defensive") {
      score += Math.max(0, 8 - d) * 0.6;
    }
  }
  // Edge penalty
  const ed = Math.min(point.x, point.y, state.board.widthInches - point.x, state.board.heightInches - point.y);
  if (ed < 3) score -= (3 - ed) * 3;
  return score;
}

/* ══════════════════════════════════════════════════════════════
   TARGET SCORING — for picking who to shoot/charge
   ══════════════════════════════════════════════════════════════ */
function scoreTarget(state, pid, atk, tgt, ctx) {
  const tp = lp(tgt), ap = lp(atk);
  if (!tp || !ap) return -Infinity;
  const d = distance(ap, tp);
  let s = 0;
  // Wounded targets are easier kills
  const w = wounds(tgt);
  if (w <= 1) s += 18;
  else if (w <= 2) s += 12;
  else if (w <= 4) s += 6;
  // Cost
  s += tgt.currentSupplyValue * 3;
  // Objective presence
  for (const obj of state.deployment.missionMarkers) {
    if (distance(tp, obj) <= ctx.cr) s += 8;
  }
  return s;
}

function scoreRangedRange(atk, tgt) {
  const ap = lp(atk), tp = lp(tgt);
  if (!ap || !tp) return -Infinity;
  const d = distance(ap, tp), mr = mxRange(atk);
  if (mr <= 0 || d > mr + 1e-6) return -Infinity;
  return Math.max(0, 12 - d) * 0.5;
}

function scoreChargeViability(atk, tgt) {
  const ap = lp(atk), tp = lp(tgt);
  if (!ap || !tp) return -Infinity;
  const d = distance(ap, tp);
  if (d > 8 + 1e-6) return -Infinity;
  let s = tgt.currentSupplyValue * 2 + Math.max(0, 8 - d);
  if (hasROnly(atk)) s -= 20;
  if (tgt.currentSupplyValue >= atk.currentSupplyValue * 2 && alive(atk) <= 2) s -= 10;
  return s;
}

/* ══════════════════════════════════════════════════════════════
   ACTIVATION-ORDER SCORING — which unit should we activate now?
   ══════════════════════════════════════════════════════════════ */
function scoreActivationPriority(state, pid, unit, ctx) {
  let s = 0;
  // Reserves: deploy cheap stuff early, expensive stuff late
  if (inReserves(unit)) {
    const cheapFirst = ctx.roundsLeft >= ctx.roundLimit - 2;
    s += cheapFirst ? (10 - unit.currentSupplyValue) : unit.currentSupplyValue;
    // Penalize if we can't afford it
    if (unit.currentSupplyValue > availSupply(state, pid)) s -= 100;
    return s;
  }
  // Battlefield: prioritize units that can immediately threaten or score
  const up = lp(unit);
  if (!up) return -10;
  // Engaged units act first to disengage or charge back
  if (unit.status.engaged) s += 4;
  // Units adjacent to objectives are valuable activations
  for (const obj of ctx.objPriorities) {
    const d = distance(up, obj);
    if (d <= ctx.cr + 1) s += 6;
  }
  // Ranged units near sweet-spot — high priority to fire
  if (hasR(unit)) {
    const enemies = Object.values(state.units).filter(u => u.owner === opp(pid) && onField(u));
    const inRange = enemies.some(e => {
      const ep = lp(e);
      return ep && distance(up, ep) <= mxRange(unit);
    });
    if (inRange) s += 5;
  }
  // Charge-ready units
  if (hasM(unit)) {
    const enemies = Object.values(state.units).filter(u => u.owner === opp(pid) && onField(u));
    const closeTarget = enemies.some(e => {
      const ep = lp(e);
      return ep && distance(up, ep) <= 8;
    });
    if (closeTarget) s += 4;
  }
  // Hero units are valuable — save unless desperate
  if (unit.tags.includes("Hero") && ctx.posture !== "desperate") s -= 1;
  return s;
}

/* ══════════════════════════════════════════════════════════════
   PICK NEXT UNIT
   ══════════════════════════════════════════════════════════════ */
function pickNextUnit(state, pid, ctx) {
  const avail = availSupply(state, pid);
  const eligible = Object.values(state.units).filter(u => {
    if (u.owner !== pid) return false;
    if (u.status.activatedThisRound) return false;
    if (onField(u)) return true;
    if (inReserves(u)) {
      // Skip reserves we can't afford — they'd just deadlock the planner
      return u.currentSupplyValue <= avail;
    }
    return false;
  });
  if (!eligible.length) return null;
  return eligible
    .map(u => ({ u, s: scoreActivationPriority(state, pid, u, ctx) }))
    .sort((a, b) => b.s - a.s)[0].u;
}

/* ══════════════════════════════════════════════════════════════
   DECIDE WHAT THE PICKED UNIT DOES
   Returns an array of actions (the bot dispatches them sequentially).
   ══════════════════════════════════════════════════════════════ */
function planActivation(state, pid, unit, ctx) {
  // Reserve unit → deploy
  if (inReserves(unit)) {
    if (unit.currentSupplyValue > availSupply(state, pid)) return null; // cannot afford
    const pts = getLegalDeployDestinations(state, pid, unit.id, unit.leadingModelId);
    if (!pts.length) return null;
    const scored = pts.map(p => ({ p, s: scorePosition(state, pid, unit, p, ctx) }))
      .sort((a, b) => b.s - a.s);
    const best = scored[0].p;
    return [{
      type: "DEPLOY_UNIT",
      payload: {
        playerId: pid, unitId: unit.id, leadingModelId: unit.leadingModelId,
        entryPoint: best.entryPoint,
        path: [best.entryPoint, { x: best.x, y: best.y }],
        modelPlacements: autoArrangeModels(state, unit.id, best)
      }
    }];
  }

  // Battlefield unit
  // Engaged → try Disengage with Tactical Mass; else Charge if hasM; else Hold
  if (unit.status.engaged) {
    if (hasM(unit)) {
      // Charge back at the engaging enemy
      const enemies = Object.values(state.units).filter(u => u.owner === opp(pid) && onField(u));
      const targets = enemies
        .map(t => ({ t, s: scoreChargeViability(unit, t) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s);
      if (targets.length) {
        return [{
          type: "DECLARE_CHARGE",
          payload: { playerId: pid, unitId: unit.id, targetId: targets[0].t.id }
        }];
      }
    }
    // Disengage if we have tactical mass
    const pts = getLegalDisengageDestinations(state, pid, unit.id, unit.leadingModelId);
    if (pts.length) {
      const scored = pts.map(p => ({ p, s: scorePosition(state, pid, unit, p, ctx) }))
        .sort((a, b) => b.s - a.s);
      return [{
        type: "DISENGAGE_UNIT",
        payload: {
          playerId: pid, unitId: unit.id, leadingModelId: unit.leadingModelId,
          path: bPath(unit, scored[0].p),
          modelPlacements: autoArrangeModels(state, unit.id, scored[0].p)
        }
      }];
    }
    return [{ type: "HOLD_UNIT", payload: { playerId: pid, unitId: unit.id } }];
  }

  // Free unit. Decide between (Move + Action), Run, or Charge from current position.
  const enemies = Object.values(state.units).filter(u => u.owner === opp(pid) && onField(u));

  // Can we charge from here?
  let bestCharge = null;
  if (hasM(unit)) {
    const candidates = enemies
      .map(t => ({ t, s: scoreChargeViability(unit, t) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s);
    if (candidates.length) bestCharge = candidates[0];
  }
  // Can we shoot from here?
  let bestShot = null;
  if (hasR(unit)) {
    const candidates = enemies
      .map(t => ({ t, s: scoreTarget(state, pid, unit, t, ctx) + scoreRangedRange(unit, t) }))
      .filter(x => x.s > -Infinity)
      .sort((a, b) => b.s - a.s);
    if (candidates.length) bestShot = candidates[0];
  }

  // Movement candidates
  const movePts = getLegalMoveDestinations(state, pid, unit.id, unit.leadingModelId);
  const moveBest = movePts.length
    ? movePts.map(p => ({ p, s: scorePosition(state, pid, unit, p, ctx) })).sort((a, b) => b.s - a.s)[0]
    : null;

  // Strategy: if charge available and viable, prefer it
  if (bestCharge && bestCharge.s >= 6) {
    return [{
      type: "DECLARE_CHARGE",
      payload: { playerId: pid, unitId: unit.id, targetId: bestCharge.t.id }
    }];
  }
  // If shot available and a clear win, prefer move-then-shoot
  if (bestShot && bestShot.s >= 4) {
    const actions = [];
    if (moveBest) {
      actions.push({
        type: "MOVE_UNIT",
        payload: {
          playerId: pid, unitId: unit.id, leadingModelId: unit.leadingModelId,
          path: bPath(unit, moveBest.p),
          modelPlacements: autoArrangeModels(state, unit.id, moveBest.p)
        }
      });
    }
    actions.push({
      type: "DECLARE_RANGED_ATTACK",
      payload: { playerId: pid, unitId: unit.id, targetId: bestShot.t.id }
    });
    return actions;
  }
  // No good attack — Run if it'd improve position significantly
  if (moveBest) {
    const runPts = getLegalRunDestinations(state, pid, unit.id, unit.leadingModelId);
    if (runPts.length) {
      const runBest = runPts.map(p => ({ p, s: scorePosition(state, pid, unit, p, ctx) }))
        .sort((a, b) => b.s - a.s)[0];
      if (runBest && runBest.s > moveBest.s + 4) {
        return [{
          type: "RUN_UNIT",
          payload: {
            playerId: pid, unitId: unit.id, leadingModelId: unit.leadingModelId,
            path: bPath(unit, runBest.p),
            modelPlacements: autoArrangeModels(state, unit.id, runBest.p)
          }
        }];
      }
    }
    // Just move
    return [{
      type: "MOVE_UNIT",
      payload: {
        playerId: pid, unitId: unit.id, leadingModelId: unit.leadingModelId,
        path: bPath(unit, moveBest.p),
        modelPlacements: autoArrangeModels(state, unit.id, moveBest.p)
      }
    }];
  }
  // Last resort
  return [{ type: "HOLD_UNIT", payload: { playerId: pid, unitId: unit.id } }];
}

/* ══════════════════════════════════════════════════════════════
   CARD PLAY
   ══════════════════════════════════════════════════════════════ */
function bestCard(state, pid, ctx, aboutToActId) {
  const actions = getLegalActionsForPlayer(state, pid).filter(x => x.type === "PLAY_CARD" && x.enabled);
  if (!actions.length) return null;
  let bc = null, bs = -1;
  for (const act of actions) {
    const card = getTacticalCard(act.cardId);
    let sc = 3;
    if (card.effect?.modifiers?.some(m => m.key === "unit.speed")) {
      if (!act.targetUnitId || !state.units[act.targetUnitId] || !onField(state.units[act.targetUnitId])) continue;
      const u = state.units[act.targetUnitId];
      const p = lp(u);
      if (!p) continue;
      const nd = Math.min(...ctx.objPriorities.filter(o => o.controller !== pid).map(o => distance(p, o)).concat([999]));
      sc += Math.min(12, nd) + u.currentSupplyValue * 1.5;
    }
    if (card.effect?.modifiers?.some(m => ["weapon.hitTarget", "weapon.attacksPerModel", "weapon.shotsPerModel"].includes(m.key))) {
      if (!act.targetUnitId) continue;
      const u = state.units[act.targetUnitId];
      if (!u || !onField(u)) continue;
      if (aboutToActId && act.targetUnitId === aboutToActId) sc += 20;
      else if (aboutToActId) continue;
      sc += alive(u) * 2 + u.currentSupplyValue * 2;
    }
    if (sc > bs) { bs = sc; bc = act; }
  }
  if (!bc) return null;
  return { type: "PLAY_CARD", payload: { playerId: pid, cardInstanceId: bc.cardInstanceId, targetUnitId: bc.targetUnitId ?? null } };
}

/* ══════════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════════ */

/**
 * performBotTurn dispatches one or more actions to advance the bot's turn.
 * In the new model, an "activation" is a sequence of actions, so this may
 * dispatch a Move followed by a Shoot, etc. Returns the result of the last
 * dispatch.
 */
export async function performBotTurn(store, pid) {
  const state = store.getState();
  if (state.activePlayer !== pid) return { ok: true, state };
  if (state.phase !== "battle") return { ok: true, state };
  if (state.players[pid].passedThisRound) return { ok: true, state };

  // Already mid-activation? Continue with that unit.
  if (state.activatingUnitId) {
    const unit = state.units[state.activatingUnitId];
    if (!unit) return store.dispatch({ type: "END_ACTIVATION", payload: { playerId: pid } });
    const ctx = assess(state, pid);
    const actions = planActivation(state, pid, unit, ctx);
    if (!actions || !actions.length) {
      return store.dispatch({ type: "END_ACTIVATION", payload: { playerId: pid } });
    }
    let last = { ok: true, state };
    for (const act of actions) {
      last = store.dispatch(act);
      if (!last.ok) return last;
      // tiny delay between sub-actions
      await new Promise(r => setTimeout(r, 200));
    }
    return last;
  }

  const ctx = assess(state, pid);

  // No more units? Pass.
  const next = pickNextUnit(state, pid, ctx);
  if (!next) {
    return store.dispatch({ type: "PASS_ROUND", payload: { playerId: pid } });
  }

  // Maybe play a card before activating
  const card = bestCard(state, pid, ctx, next.id);
  if (card) {
    const r = store.dispatch(card);
    if (r.ok) await new Promise(r => setTimeout(r, 250));
  }

  // Plan and execute actions
  const actions = planActivation(state, pid, next, ctx);
  if (!actions || !actions.length) {
    // Reserve units can't Hold; fall back to passing the round
    if (inReserves(next)) {
      return store.dispatch({ type: "PASS_ROUND", payload: { playerId: pid } });
    }
    return store.dispatch({ type: "HOLD_UNIT", payload: { playerId: pid, unitId: next.id } });
  }
  let last = { ok: true, state };
  for (const act of actions) {
    last = store.dispatch(act);
    if (!last.ok) {
      // If a planned action fails (e.g. position changed mid-sequence), try to clean up
      if (store.getState().activatingUnitId) {
        store.dispatch({ type: "END_ACTIVATION", payload: { playerId: pid } });
      }
      return last;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return last;
}
