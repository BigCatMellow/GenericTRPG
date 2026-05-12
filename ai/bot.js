// v0.12 AI Bot
// Priorities: scoring, stopping enemy scoring, Pinning objective holders,
//             Rallying allies, exploiting Overwhelmed, creating Overwhelmed.

import { getLegalActionsForPlayer } from "../engine/legal_actions.js";
import { distance } from "../engine/geometry.js";
import { hasCondition, isOverwhelmed } from "../engine/conditions.js";
import { getObjectiveControlSnapshot } from "../engine/objectives.js";

const OBJECTIVE_RANGE = 3;

const opp = pid => pid === "playerA" ? "playerB" : "playerA";

function charPoint(ch) { return ch.x != null ? { x: ch.x, y: ch.y } : null; }
function isAlive(ch) { return ch.health > 0; }
function onField(ch) { return ch.x != null && ch.y != null && isAlive(ch); }

/* ── Strategic assessment ── */
function assess(state, pid) {
  const me = state.players[pid], them = state.players[opp(pid)];
  const snap = getObjectiveControlSnapshot(state);
  const roundsLeft = 5 - state.round;
  const vpDiff = me.vp - them.vp;

  let posture;
  if (vpDiff < -2 || (vpDiff < 0 && roundsLeft <= 1)) posture = "desperate";
  else if (vpDiff < 0) posture = "aggressive";
  else if (vpDiff > 2 || (vpDiff > 0 && roundsLeft <= 1)) posture = "defensive";
  else posture = "balanced";

  const objectives = state.board.objectives.map(obj => {
    const c = snap[obj.id];
    let priority = 0;
    if (!c || (!c.controller && !c.contested)) priority = 10;
    else if (c.contested) priority = 8;
    else if (c.controller === opp(pid)) priority = 6;
    else {
      const enemyNear = Object.values(state.characters).some(e =>
        e.owner !== pid && onField(e) && distance(charPoint(e), obj) <= OBJECTIVE_RANGE + 5
      );
      priority = enemyNear ? 4 : 1;
    }
    if (roundsLeft <= 2) priority *= 1.5;
    return { ...obj, ...c, priority };
  }).sort((a, b) => b.priority - a.priority);

  return { posture, vpDiff, roundsLeft, objectives, snap };
}

/* ── Position scoring ── */
function scorePosition(state, pid, ch, point, ctx) {
  let score = 0;
  const cp = charPoint(ch);
  for (const obj of ctx.objectives) {
    const d = distance(point, obj);
    if (d <= OBJECTIVE_RANGE) score += obj.priority * 3;
    else if (d <= OBJECTIVE_RANGE + 4) score += obj.priority * (OBJECTIVE_RANGE + 4 - d) / 4;
  }
  // Melee chars: approach enemies
  if (["warrior", "rogue", "cleric"].includes(ch.classId)) {
    const enemies = Object.values(state.characters).filter(e => e.owner !== pid && onField(e));
    for (const e of enemies) {
      const ep = charPoint(e);
      if (!ep) continue;
      const d = distance(point, ep);
      score += Math.max(0, 10 - d) * 0.4;
    }
  }
  // Ranger/Mage: keep distance but within range
  if (ch.classId === "ranger") {
    const enemies = Object.values(state.characters).filter(e => e.owner !== pid && onField(e));
    for (const e of enemies) {
      const ep = charPoint(e);
      if (!ep) continue;
      const d = distance(point, ep);
      if (d < 2) score -= 5;
      else if (d <= 8) score += 3;
    }
  }
  if (ch.classId === "mage") {
    const enemies = Object.values(state.characters).filter(e => e.owner !== pid && onField(e));
    for (const e of enemies) {
      const ep = charPoint(e);
      if (!ep) continue;
      const d = distance(point, ep);
      if (d < 3) score -= 8;
      else if (d <= 8) score += 4;
    }
  }
  // Edge penalty
  const ed = Math.min(point.x, point.y, state.board.widthInches - point.x, state.board.heightInches - point.y);
  if (ed < 3) score -= (3 - ed) * 2;
  return score;
}

/* ── Target scoring ── */
function scoreTarget(state, pid, attacker, target, ctx) {
  const tp = charPoint(target), ap = charPoint(attacker);
  if (!tp || !ap) return -Infinity;
  let s = 0;
  // Wounded targets easier to finish
  const pct = target.health / target.maxHealth;
  if (pct <= 0.25) s += 20;
  else if (pct <= 0.5) s += 12;
  else if (pct <= 0.75) s += 6;
  // Target near objective
  for (const obj of ctx.objectives) {
    if (distance(tp, obj) <= OBJECTIVE_RANGE) s += 8;
  }
  // Overwhelmed targets are high priority
  if (isOverwhelmed(target)) s += 10;
  // Exposed/Spent targets are easier
  if (hasCondition(target, "exposed") || target.readiness === "spent") s += 6;
  return s;
}

/* ── Activation priority ── */
function scoreActivationPriority(state, pid, ch, ctx) {
  let s = 0;
  const cp = charPoint(ch);
  if (!cp) return -10;
  // Near objectives
  for (const obj of ctx.objectives) {
    const d = distance(cp, obj);
    if (d <= OBJECTIVE_RANGE + 1) s += 6;
  }
  // Can attack an enemy
  const enemies = Object.values(state.characters).filter(e => e.owner !== pid && onField(e));
  for (const e of enemies) {
    const ep = charPoint(e);
    if (!ep) continue;
    const d = distance(cp, ep);
    if (d <= 2) s += 5; // melee range
    if (d <= 8 && ["ranger", "mage"].includes(ch.classId)) s += 5; // ranged
  }
  // Cleric with wounded/conditioned friendlies nearby: high priority
  if (ch.classId === "cleric") {
    const friends = Object.values(state.characters).filter(f =>
      f.owner === pid && f.id !== ch.id && onField(f) && distance(cp, charPoint(f)) <= 6
    );
    for (const f of friends) {
      if (hasCondition(f, "pinned") || hasCondition(f, "exposed") || f.readiness === "spent") s += 8;
    }
  }
  // Pinned chars need action to recover
  if (hasCondition(ch, "pinned")) s += 4;
  return s;
}

/* ── Pick unit to activate ── */
function pickNextCharacter(state, pid, ctx) {
  const eligible = Object.values(state.characters).filter(ch =>
    ch.owner === pid && !ch.activatedThisRound && ch.health > 0
  );
  if (!eligible.length) return null;
  return eligible
    .map(ch => ({ ch, s: scoreActivationPriority(state, pid, ch, ctx) }))
    .sort((a, b) => b.s - a.s)[0].ch;
}

/* ── Plan activation for a character ── */
function planActivation(state, pid, ch, ctx) {
  const actions = [];
  const cp = charPoint(ch);
  if (!cp) return [{ type: "HOLD", payload: { playerId: pid, charId: ch.id } }];

  const enemies = Object.values(state.characters).filter(e => e.owner !== pid && onField(e));
  const friends = Object.values(state.characters).filter(f => f.owner === pid && f.id !== ch.id && onField(f));

  // Cleric: Rally if a friend needs it
  if (ch.classId === "cleric") {
    const needsRally = friends
      .filter(f => {
        const d = distance(cp, charPoint(f));
        return d <= 6 && (hasCondition(f, "pinned") || hasCondition(f, "exposed") || f.readiness === "spent");
      })
      .sort((a, b) => {
        // Prioritize most damaged / worst conditions
        const aScore = (hasCondition(a, "pinned") ? 3 : 0) + (hasCondition(a, "exposed") ? 2 : 0) + (a.readiness === "spent" ? 1 : 0);
        const bScore = (hasCondition(b, "pinned") ? 3 : 0) + (hasCondition(b, "exposed") ? 2 : 0) + (b.readiness === "spent" ? 1 : 0);
        return bScore - aScore;
      });
    if (needsRally.length) {
      // Move toward the friend first if needed
      const target = needsRally[0];
      const td = distance(cp, charPoint(target));
      if (td > 6) {
        // move closer
        const moveDest = moveToward(state, pid, ch, charPoint(target), ch.move);
        if (moveDest) actions.push({ type: "MOVE", payload: { playerId: pid, charId: ch.id, destination: moveDest } });
      }
      actions.push({ type: "CLASS_ABILITY", payload: { playerId: pid, charId: ch.id, abilityId: "rally", targetId: target.id } });
      return actions;
    }
  }

  // Mage: Disrupt if enemy in range
  if (ch.classId === "mage") {
    const inRange = enemies.filter(e => distance(cp, charPoint(e)) <= 8);
    if (inRange.length) {
      // Target highest priority
      const target = inRange
        .map(e => ({ e, s: scoreTarget(state, pid, ch, e, ctx) }))
        .sort((a, b) => b.s - a.s)[0]?.e;
      if (target) {
        // Move first if beneficial
        const moveDest = bestMoveDestination(state, pid, ch, ctx);
        if (moveDest) actions.push({ type: "MOVE", payload: { playerId: pid, charId: ch.id, destination: moveDest } });
        actions.push({ type: "CLASS_ABILITY", payload: { playerId: pid, charId: ch.id, abilityId: "disrupt", targetId: target.id } });
        return actions;
      }
    }
  }

  // Attack: find best target
  let bestAttackAction = null;
  let bestAttackScore = -Infinity;

  if (ch.attacks) {
    for (const [attackKey, atk] of Object.entries(ch.attacks)) {
      const range = atk.type === "melee" ? 1.5 : (atk.range ?? 8);
      for (const e of enemies) {
        const ep = charPoint(e);
        if (!ep) continue;
        const d = distance(cp, ep);
        if (d > range + 1e-6) continue;
        // Backstab requires Exposed/Spent
        if (attackKey === "backstab" && !hasCondition(e, "exposed") && e.readiness !== "spent") continue;
        let s = scoreTarget(state, pid, ch, e, ctx);
        // Prefer attacks that create conditions (Suppressing, Called)
        if (atk.appliesPinned) s += 5;
        if (atk.appliesExposed) s += 4;
        if (s > bestAttackScore) {
          bestAttackScore = s;
          bestAttackAction = { type: "ATTACK", payload: { playerId: pid, charId: ch.id, targetId: e.id, attackKey } };
        }
      }
    }
  }

  // If can attack from here
  if (bestAttackAction) {
    // Try to move first for better position
    const moveDest = bestMoveDestination(state, pid, ch, ctx);
    if (moveDest && !ch.movementUsed) {
      actions.push({ type: "MOVE", payload: { playerId: pid, charId: ch.id, destination: moveDest } });
    }
    actions.push(bestAttackAction);
    return actions;
  }

  // Check if moving puts us in attack range
  const moveDest = bestMoveDestination(state, pid, ch, ctx);
  if (moveDest) {
    // After moving, can we attack?
    const movedPos = moveDest;
    let bestAfterMove = null;
    let bestAfterMoveScore = -Infinity;
    if (ch.attacks) {
      for (const [attackKey, atk] of Object.entries(ch.attacks)) {
        const range = atk.type === "melee" ? 1.5 : (atk.range ?? 8);
        for (const e of enemies) {
          const ep = charPoint(e);
          if (!ep) continue;
          const d = distance(movedPos, ep);
          if (d > range + 1e-6) continue;
          if (attackKey === "backstab" && !hasCondition(e, "exposed") && e.readiness !== "spent") continue;
          const s = scoreTarget(state, pid, ch, e, ctx);
          if (s > bestAfterMoveScore) {
            bestAfterMoveScore = s;
            bestAfterMove = { type: "ATTACK", payload: { playerId: pid, charId: ch.id, targetId: e.id, attackKey } };
          }
        }
      }
    }
    if (bestAfterMove) {
      actions.push({ type: "MOVE", payload: { playerId: pid, charId: ch.id, destination: moveDest } });
      actions.push(bestAfterMove);
      return actions;
    }
    // Secure objective if near one
    const nearObj = state.board.objectives.find(obj => distance(movedPos, obj) <= OBJECTIVE_RANGE);
    if (nearObj && !hasCondition(ch, "pinned")) {
      actions.push({ type: "MOVE", payload: { playerId: pid, charId: ch.id, destination: moveDest } });
      actions.push({ type: "SECURE_OBJECTIVE", payload: { playerId: pid, charId: ch.id } });
      return actions;
    }
    // Just move
    actions.push({ type: "MOVE", payload: { playerId: pid, charId: ch.id, destination: moveDest } });
    return actions;
  }

  // Recover if Pinned/Exposed/Spent
  if (hasCondition(ch, "pinned") || hasCondition(ch, "exposed") || ch.readiness === "spent") {
    actions.push({ type: "RECOVER", payload: { playerId: pid, charId: ch.id } });
    return actions;
  }

  // Secure nearby objective
  const nearObj = state.board.objectives.find(obj => distance(cp, obj) <= OBJECTIVE_RANGE);
  if (nearObj && !hasCondition(ch, "pinned") && !ch.actionUsed) {
    actions.push({ type: "SECURE_OBJECTIVE", payload: { playerId: pid, charId: ch.id } });
    return actions;
  }

  // Last resort: Hold
  return [{ type: "HOLD", payload: { playerId: pid, charId: ch.id } }];
}

function bestMoveDestination(state, pid, ch, ctx) {
  const cp = charPoint(ch);
  if (!cp || ch.movementUsed) return null;
  let best = null, bestScore = -Infinity;
  const maxDist = ch.move;
  for (let x = 0.5; x < state.board.widthInches; x += 1) {
    for (let y = 0.5; y < state.board.heightInches; y += 1) {
      const d = Math.max(Math.abs(x - cp.x), Math.abs(y - cp.y));
      if (d > maxDist + 1e-6 || d < 0.5) continue;
      // Skip blocking terrain
      const blocked = state.board.terrain.some(t => {
        if (!t.impassable || !t.rect) return false;
        return x >= t.rect.minX && x <= t.rect.maxX && y >= t.rect.minY && y <= t.rect.maxY;
      });
      if (blocked) continue;
      const pt = { x, y };
      const s = scorePosition(state, pid, ch, pt, ctx);
      if (s > bestScore) { bestScore = s; best = pt; }
    }
  }
  return best;
}

function moveToward(state, pid, ch, target, maxDist) {
  const cp = charPoint(ch);
  if (!cp) return null;
  // Move directly toward target up to maxDist
  const dx = target.x - cp.x, dy = target.y - cp.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return null;
  const actualDist = Math.min(maxDist, len);
  const nx = Math.round(cp.x + (dx / len) * actualDist - 0.5) + 0.5;
  const ny = Math.round(cp.y + (dy / len) * actualDist - 0.5) + 0.5;
  return { x: Math.max(0.5, Math.min(state.board.widthInches - 0.5, nx)), y: Math.max(0.5, Math.min(state.board.heightInches - 0.5, ny)) };
}

/* ── Public API ── */
export async function performBotTurn(store, pid) {
  const state = store.getState();
  if (state.activePlayer !== pid) return { ok: true, state };
  if (state.phase !== "battle") return { ok: true, state };
  if (state.players[pid].passedThisRound) return { ok: true, state };

  // Mid-activation: continue with active character
  if (state.activatingCharacterId) {
    const ch = state.characters[state.activatingCharacterId];
    if (!ch) return await store.dispatch({ type: "END_ACTIVATION", payload: { playerId: pid, charId: state.activatingCharacterId } });
    const ctx = assess(state, pid);
    const actions = planActivation(state, pid, ch, ctx);
    let last = { ok: true, state };
    for (const act of actions) {
      const current = store.getState();
      if (current.activatingCharacterId !== ch.id && act.type !== "HOLD") continue;
      last = await store.dispatch(act);
      if (!last.ok) {
        if (store.getState().activatingCharacterId) {
          await store.dispatch({ type: "END_ACTIVATION", payload: { playerId: pid, charId: ch.id } });
        }
        return last;
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return last;
  }

  const ctx = assess(state, pid);
  const next = pickNextCharacter(state, pid, ctx);
  if (!next) {
    return await store.dispatch({ type: "PASS_ROUND", payload: { playerId: pid } });
  }

  const actions = planActivation(state, pid, next, ctx);
  if (!actions || !actions.length) {
    return await store.dispatch({ type: "HOLD", payload: { playerId: pid, charId: next.id } });
  }

  let last = { ok: true, state };
  for (const act of actions) {
    last = await store.dispatch(act);
    if (!last.ok) {
      if (store.getState().activatingCharacterId) {
        await store.dispatch({ type: "END_ACTIVATION", payload: { playerId: pid, charId: next.id } });
      }
      return last;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return last;
}
