import { renderBoard } from "./board.js";
import { getObjectiveControlSnapshot } from "../engine/objectives.js";
import { getTacticalCard } from "../data/tactical_cards.js";

function pn(id) { return id === "playerA" ? "Crown" : "Reavers"; }
function tc(s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function al(u) { return u.modelIds.filter(id => u.models[id].alive).length; }
function fmtCost(p) { return p === Infinity ? "∞" : String(p); }
function force(state, pid) {
  return state.players[pid].battlefieldUnitIds.reduce((t, id) => t + state.units[id].currentSupplyValue, 0);
}

export function renderAll(state, uiState, handlers) {
  const actionBtns = typeof handlers.buildActionButtons === "function" ? handlers.buildActionButtons() : [];
  const cardBtns = typeof handlers.buildCardButtons === "function" ? handlers.buildCardButtons() : [];

  // HUD
  const chip = document.getElementById("turnChip");
  chip.textContent = pn(state.activePlayer);
  chip.className = `hud-chip ${state.activePlayer === "playerA" ? "blue" : "red"}`;

  const phase = document.getElementById("phaseChip");
  if (state.activatingUnitId) {
    const u = state.units[state.activatingUnitId];
    phase.textContent = `${u?.name ?? "Unit"} acting`;
  } else {
    phase.textContent = state.phase === "battle" ? "Choose a unit" : tc(state.phase);
  }

  document.getElementById("vpA").textContent = state.players.playerA.vp;
  document.getElementById("vpB").textContent = state.players.playerB.vp;
  const rl = state.mission.pacing?.roundLimit ?? state.mission.roundLimit ?? 5;
  document.getElementById("roundChip").textContent = `R${state.round}/${rl}`;

  // Mode hint
  const hint = document.getElementById("modeHint");
  hint.textContent = handlers.getModeText();
  hint.className = "mode-strip";
  if (uiState.pendingPass) hint.classList.add("warning");
  else if (uiState.mode) hint.classList.add("active");
  else if (uiState.locked) hint.classList.add("locked");

  // Action bar — selected/activating unit
  const showUnitId = state.activatingUnitId ?? uiState.selectedUnitId;
  const unit = showUnitId ? state.units[showUnitId] : null;
  const abUnit = document.getElementById("abUnit");
  if (unit) {
    const wpn = unit.rangedWeapons?.[0] ?? unit.meleeWeapons?.[0];
    const slots = state.activatingUnitId === unit.id
      ? ` · ${unit.status.movementUsed ? "Mv✓" : "Mv"} ${unit.status.actionUsed ? "Act✓" : "Act"}`
      : "";
    abUnit.innerHTML = `<strong>${unit.name}</strong> ${unit.currentSupplyValue}C · ${al(unit)}mdl${wpn ? " · " + wpn.name : ""}${slots}`;
  } else abUnit.textContent = "No unit selected";

  const abBtns = document.getElementById("actionButtons");
  abBtns.innerHTML = "";
  actionBtns.forEach(b => { b.classList.add("btn"); abBtns.appendChild(b); });

  const passBtn = document.getElementById("passBtn");
  const canPass = state.activePlayer === "playerA"
    && state.phase === "battle"
    && !state.players.playerA.passedThisRound
    && !state.activatingUnitId;
  passBtn.disabled = !canPass;
  passBtn.textContent = uiState.pendingPass ? "Confirm Pass" : "Pass Round";
  passBtn.className = uiState.pendingPass ? "ab-pass confirm-flash" : "ab-pass";

  // Drawer: force totals
  const sEl = document.getElementById("supplyText");
  if (sEl) sEl.textContent = `${force(state, "playerA")}/${fmtCost(state.players.playerA.supplyPool)} vs ${force(state, "playerB")}/${fmtCost(state.players.playerB.supplyPool)}`;

  // Drawer: objectives
  const objEl = document.getElementById("objectiveControl");
  if (objEl) {
    objEl.innerHTML = "";
    const snap = getObjectiveControlSnapshot(state);
    for (const obj of state.deployment.missionMarkers) {
      const r = snap[obj.id];
      const ctrl = r.controller ? `${pn(r.controller)} (${r.playerASupply}-${r.playerBSupply})` : r.contested ? "Contested" : "—";
      const d = document.createElement("div");
      d.className = "obj-line";
      d.innerHTML = `<span>${obj.id.toUpperCase()}</span><span>${ctrl}</span>`;
      objEl.appendChild(d);
    }
  }

  // Drawer: checklist
  const ck = typeof handlers.getPhaseChecklist === "function" ? handlers.getPhaseChecklist() : null;
  const ckEl = document.getElementById("phaseChecklist");
  if (ckEl && ck) {
    const pct = ck.total > 0 ? Math.round(ck.done / ck.total * 100) : 0;
    ckEl.innerHTML = `<div class="ck-bar"><div class="ck-fill" style="width:${pct}%"></div></div><div class="ck-label">${ck.done}/${ck.total}</div>` +
      (ck.remaining.length ? `<div class="ck-remaining">${ck.remaining.map(n => `<span class="ck-unit">${n}</span>`).join("")}</div>` : "");
  }

  renderUnitList("playerReserves", state.players.playerA.reserveUnitIds, state, uiState, handlers.onUnitSelect);
  renderUnitList("playerBattlefield", state.players.playerA.battlefieldUnitIds, state, uiState, handlers.onUnitSelect);
  renderUnitList("enemyBattlefield", state.players.playerB.battlefieldUnitIds, state, uiState, handlers.onUnitSelect);
  renderUnitList("enemyReserves", state.players.playerB.reserveUnitIds, state, uiState, handlers.onUnitSelect);

  renderSelectedUnit(state, uiState);
  renderCards(state, cardBtns);
  renderLog(state);
  renderBoard(state, uiState, handlers);
}

function renderUnitList(containerId, unitIds, state, uiState, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  if (!unitIds.length) { el.innerHTML = '<div class="d-empty">None</div>'; return; }
  for (const uid of unitIds) {
    const u = state.units[uid];
    if (!u) continue;
    const act = u.status.activatedThisRound;
    const own = u.owner === "playerA";
    const need = own && !act && state.activePlayer === "playerA";
    const card = document.createElement("div");
    card.className = `d-ucard ${uiState.selectedUnitId === u.id ? "selected" : ""} ${need ? "needs-action" : ""} ${act ? "done" : ""}`;
    card.innerHTML = `<div><div class="d-ucard-name">${u.name}</div><div class="d-ucard-stats">Spd${u.speed} ${al(u)}/${u.modelIds.length}mdl</div></div><div style="font-weight:800">${u.currentSupplyValue}C</div>`;
    card.addEventListener("click", () => onSelect(u.id));
    el.appendChild(card);
  }
}

function renderSelectedUnit(state, uiState) {
  const panel = document.getElementById("selectedUnitPanel");
  if (!panel) return;
  const u = uiState.selectedUnitId ? state.units[uiState.selectedUnitId] : null;
  if (!u) { panel.innerHTML = '<div class="d-empty">Tap a unit</div>'; return; }
  const def = u.defense ?? {};
  const wpnHtml = (weapons, label) => {
    if (!weapons?.length) return "";
    return `<div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-top:6px">${label}</div>` +
      weapons.map(w => `<div class="su-weapon"><div class="su-weapon-name">${w.name}</div><div class="su-weapon-stats">
        <div class="su-ws"><span class="su-ws-label">Rng</span><span class="su-ws-val">${w.rangeInches != null ? w.rangeInches : "Mel"}</span></div>
        <div class="su-ws"><span class="su-ws-label">Atk</span><span class="su-ws-val">${w.attacksPerModel ?? w.shotsPerModel ?? 1}</span></div>
        <div class="su-ws"><span class="su-ws-label">Hit</span><span class="su-ws-val">${w.hitTarget ?? "?"}+</span></div>
        <div class="su-ws"><span class="su-ws-label">Dmg</span><span class="su-ws-val">${w.damage ?? 1}</span></div>
        ${w.armorPenetration ? `<div class="su-ws"><span class="su-ws-label">AP</span><span class="su-ws-val">-${w.armorPenetration}</span></div>` : ""}
      </div></div>`).join("");
  };
  panel.innerHTML = `
    <div class="su-title">${u.name}</div>
    ${u.tags?.length ? `<div class="su-tags">${u.tags.join(", ")}</div>` : ""}
    <div class="su-stats">
      <div class="su-stat"><div class="k">Spd</div><div class="v">${u.speed}</div></div>
      <div class="su-stat"><div class="k">Cost</div><div class="v">${u.currentSupplyValue}</div></div>
      <div class="su-stat"><div class="k">Mdl</div><div class="v">${al(u)}/${u.modelIds.length}</div></div>
      <div class="su-stat"><div class="k">Arm</div><div class="v">${def.armorSave ?? "—"}+</div></div>
      <div class="su-stat"><div class="k">Tgh</div><div class="v">${def.toughness ?? "—"}</div></div>
      <div class="su-stat"><div class="k">Loc</div><div class="v">${tc(u.status.location)}</div></div>
    </div>
    ${wpnHtml(u.rangedWeapons, "Ranged")}
    ${wpnHtml(u.meleeWeapons, "Melee")}`;
}

function descCard(card) {
  const mods = card.effect?.modifiers ?? [];
  const parts = mods.map(m => {
    if (m.key === "unit.speed") return `+${m.value} Speed`;
    if (m.key === "weapon.hitTarget") return m.value < 0 ? `+${Math.abs(m.value)} Hit` : `-${m.value} Hit`;
    if (m.key === "weapon.shotsPerModel" || m.key === "weapon.attacksPerModel") return `+${m.value} Atk`;
    return `${m.key} ${m.value > 0 ? "+" : ""}${m.value}`;
  });
  const dur = card.effect?.duration;
  let dt = "";
  if (dur?.type === "phase_starts") dt = `til ${tc(dur.phase)}`;
  else if (dur?.type === "events") dt = "next attack";
  return { effect: parts.join(", ") || "—", dur: dt };
}

function renderCards(state, cardBtns) {
  const el = document.getElementById("tacticalCards");
  if (!el) return;
  el.innerHTML = "";
  const hand = state.players.playerA.hand ?? [];
  if (!hand.length) { el.innerHTML = '<div class="d-empty">No cards</div>'; return; }
  for (const entry of hand) {
    const card = getTacticalCard(entry.cardId);
    const d = descCard(card);
    const playable = state.phase === "battle" && state.activePlayer === "playerA";
    const div = document.createElement("div");
    div.className = `tc-card ${playable ? "playable" : "inactive"}`;
    div.innerHTML = `<div class="tc-name">${card.name} <span class="badge ${playable ? "good" : ""}">${tc(card.phase)}</span></div><div class="tc-effect">${d.effect}</div><div class="tc-meta">${d.dur}</div>`;
    const btn = cardBtns.find(b => b.textContent?.includes(card.name));
    if (btn) { btn.classList.add("btn", "secondary"); div.appendChild(btn); }
    el.appendChild(div);
  }
}

function renderLog(state) {
  const el = document.getElementById("logPanel");
  if (!el) return;
  el.innerHTML = "";
  for (const e of state.log) {
    const d = document.createElement("div");
    d.className = `log-entry ${e.type === "combat" ? "combat" : ""}`;
    d.innerHTML = `<div class="meta">R${e.round}</div><div>${e.text}</div>`;
    el.appendChild(d);
  }
}
