// v0.12 Renderer
import { renderBoard } from "./board.js";
import { getObjectiveControlSnapshot } from "../engine/objectives.js";
import { hasCondition, isOverwhelmed } from "../engine/conditions.js";

function pn(id) { return id === "playerA" ? "Player A" : "Player B"; }
function tc(s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function hpBar(ch) { return `${ch.health}/${ch.maxHealth}`; }

function conditionText(ch) {
  const parts = [];
  if (hasCondition(ch, "guarded")) parts.push("Guarded");
  if (hasCondition(ch, "pinned")) parts.push("Pinned");
  if (hasCondition(ch, "exposed")) parts.push("Exposed");
  if (isOverwhelmed(ch)) parts.push("OVERWHELMED");
  return parts.join(", ") || "—";
}

export function renderAll(state, uiState, handlers) {
  const actionBtns = typeof handlers.buildActionButtons === "function" ? handlers.buildActionButtons() : [];

  // HUD
  const chip = document.getElementById("turnChip");
  chip.textContent = pn(state.activePlayer);
  chip.className = `hud-chip ${state.activePlayer === "playerA" ? "blue" : "red"}`;

  const phase = document.getElementById("phaseChip");
  if (state.activatingCharacterId) {
    const ch = state.characters[state.activatingCharacterId];
    phase.textContent = `${ch?.name ?? "?"} acting`;
  } else {
    phase.textContent = state.phase === "battle" ? "Choose a character" : tc(state.phase);
  }

  document.getElementById("vpA").textContent = state.players.playerA.vp;
  document.getElementById("vpB").textContent = state.players.playerB.vp;
  document.getElementById("roundChip").textContent = `R${state.round}/5`;

  // Mode hint
  const hint = document.getElementById("modeHint");
  hint.textContent = handlers.getModeText();
  hint.className = "mode-strip";
  if (uiState.pendingPass) hint.classList.add("warning");
  else if (uiState.mode) hint.classList.add("active");
  else if (uiState.locked) hint.classList.add("locked");

  // Action bar — selected/activating character
  const showId = state.activatingCharacterId ?? uiState.selectedCharId;
  const ch = showId ? state.characters[showId] : null;
  const abUnit = document.getElementById("abUnit");
  if (ch) {
    const slots = state.activatingCharacterId === ch.id
      ? ` · ${ch.movementUsed ? "Mv✓" : "Mv"} ${ch.actionUsed ? "Act✓" : "Act"}`
      : "";
    const conds = ch.conditions.length ? ` · ${ch.conditions.map(c => c[0].toUpperCase()).join("")}` : "";
    abUnit.innerHTML = `<strong>${ch.name}</strong> [${ch.classId}] HP:${hpBar(ch)} ${tc(ch.readiness)}${conds}${slots}`;
  } else {
    abUnit.textContent = "No character selected";
  }

  const abBtns = document.getElementById("actionButtons");
  abBtns.innerHTML = "";
  actionBtns.forEach(b => { b.classList.add("btn"); abBtns.appendChild(b); });

  const passBtn = document.getElementById("passBtn");
  const canPass = state.activePlayer === "playerA"
    && state.phase === "battle"
    && !state.players.playerA.passedThisRound
    && !state.activatingCharacterId;
  passBtn.disabled = !canPass;
  passBtn.textContent = uiState.pendingPass ? "Confirm Pass" : "Pass Round";
  passBtn.className = uiState.pendingPass ? "ab-pass confirm-flash" : "ab-pass";

  // Drawer: objectives
  const objEl = document.getElementById("objectiveControl");
  if (objEl) {
    objEl.innerHTML = "";
    const snap = getObjectiveControlSnapshot(state);
    for (const obj of state.board.objectives) {
      const r = snap[obj.id];
      const ctrl = r.controller ? `${pn(r.controller)} (A:${r.playerACount} B:${r.playerBCount})`
        : r.contested ? `Contested (A:${r.playerACount} B:${r.playerBCount})` : "—";
      const d = document.createElement("div");
      d.className = "obj-line";
      d.innerHTML = `<span>${obj.id.toUpperCase()}</span><span>${ctrl}</span>`;
      objEl.appendChild(d);
    }
  }

  // Drawer: character lists
  renderCharacterList("playerBattlefield", "playerA", state, uiState, handlers.onCharSelect);
  renderCharacterList("enemyBattlefield", "playerB", state, uiState, handlers.onCharSelect);

  renderSelectedCharacter(state, uiState);
  renderLog(state);
  renderBoard(state, uiState, handlers);
}

function renderCharacterList(containerId, playerId, state, uiState, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  const chars = Object.values(state.characters).filter(c => c.owner === playerId);
  if (!chars.length) { el.innerHTML = '<div class="d-empty">None</div>'; return; }
  for (const ch of chars) {
    const act = ch.activatedThisRound;
    const own = ch.owner === "playerA";
    const need = own && !act && !ch.activatedThisRound && state.activePlayer === "playerA" && ch.health > 0;
    const defeated = ch.health <= 0;
    const card = document.createElement("div");
    card.className = `d-ucard ${uiState.selectedCharId === ch.id ? "selected" : ""} ${need ? "needs-action" : ""} ${act ? "done" : ""} ${defeated ? "done" : ""}`;
    const conds = ch.conditions.map(c => c[0].toUpperCase()).join("") || "";
    card.innerHTML = `<div><div class="d-ucard-name">${ch.name}${defeated ? " ✗" : ""}</div><div class="d-ucard-stats">${ch.classId} · ${ch.readiness[0].toUpperCase()}${conds} · HP:${ch.health}/${ch.maxHealth}</div></div>`;
    if (onSelect && !defeated) card.addEventListener("click", () => onSelect(ch.id));
    el.appendChild(card);
  }
}

function renderSelectedCharacter(state, uiState) {
  const panel = document.getElementById("selectedUnitPanel");
  if (!panel) return;
  const ch = uiState.selectedCharId ? state.characters[uiState.selectedCharId] : null;
  if (!ch) { panel.innerHTML = '<div class="d-empty">Select a character</div>'; return; }

  const attackRows = ch.attacks ? Object.entries(ch.attacks).map(([key, atk]) =>
    `<div class="su-weapon">
      <div class="su-weapon-name">${atk.name} <span class="badge">${atk.attackType}</span></div>
      <div class="su-weapon-stats">
        <div class="su-ws"><span class="su-ws-label">Type</span><span class="su-ws-val">${atk.type}</span></div>
        <div class="su-ws"><span class="su-ws-label">Dmg</span><span class="su-ws-val">${atk.damage}</span></div>
        ${atk.range ? `<div class="su-ws"><span class="su-ws-label">Rng</span><span class="su-ws-val">${atk.range}"</span></div>` : ""}
        ${atk.appliesPinned ? `<div class="su-ws"><span class="su-ws-label">⚑</span><span class="su-ws-val">Pin</span></div>` : ""}
        ${atk.appliesExposed ? `<div class="su-ws"><span class="su-ws-label">⚑</span><span class="su-ws-val">Exp</span></div>` : ""}
      </div>
    </div>`
  ).join("") : "";

  panel.innerHTML = `
    <div class="su-title">${ch.name} <span class="badge">${ch.classId}</span></div>
    <div class="su-stats">
      <div class="su-stat"><div class="k">HP</div><div class="v">${ch.health}/${ch.maxHealth}</div></div>
      <div class="su-stat"><div class="k">Move</div><div class="v">${ch.move}"</div></div>
      <div class="su-stat"><div class="k">Rdy</div><div class="v">${tc(ch.readiness)}</div></div>
      <div class="su-stat"><div class="k">Cond</div><div class="v" style="font-size:10px">${conditionText(ch) || "—"}</div></div>
      <div class="su-stat"><div class="k">Scr</div><div class="v" style="font-size:10px">${ch.securingObjectiveId ?? "—"}</div></div>
    </div>
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-top:6px">Attacks</div>
    ${attackRows}`;
}

function renderLog(state) {
  const el = document.getElementById("logPanel");
  if (!el) return;
  el.innerHTML = "";
  const entries = [...state.log].reverse().slice(0, 30);
  for (const e of entries) {
    const d = document.createElement("div");
    d.className = `log-entry ${e.type === "combat" ? "combat" : e.type === "score" ? "score" : ""}`;
    d.innerHTML = `<div class="meta">R${e.round}</div><div>${e.text}</div>`;
    el.appendChild(d);
  }
}
