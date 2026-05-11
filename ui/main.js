import { createInitialGameState } from "../engine/state.js";
import { beginGame } from "../engine/phases.js";
import { dispatch as engineDispatch } from "../engine/reducer.js";
import {
  bindInputHandlers,
  beginMoveInteraction, beginDeployInteraction, beginDisengageInteraction, beginRunInteraction,
  beginDeclareRangedInteraction, beginDeclareChargeInteraction, cancelCurrentInteraction
} from "./input.js";
import { renderAll } from "./renderer.js";
import { autoArrangeModels } from "../engine/coherency.js";
import { performBotTurn } from "../ai/bot.js";
import { screenToBoardPoint } from "./board.js";
import { getTacticalCard } from "../data/tactical_cards.js";
import { snapPointToGrid } from "../engine/geometry.js";

const DEFAULT_SETUP = {
  missionId: "hold_the_keep",
  deploymentId: "valley",
  firstPlayerThisRound: "playerA",
  armyA: [
    { id: "crown_castellan", templateId: "castellan" },
    { id: "crown_crossbows", templateId: "crossbowmen" },
    { id: "crown_knights_1", templateId: "knights" },
    { id: "crown_knights_2", templateId: "knights" },
    { id: "crown_spearmen", templateId: "levy_spearmen" },
    { id: "crown_surgeon", templateId: "battle_surgeon" }
  ],
  armyB: [
    { id: "reaver_champion", templateId: "reaver_champion" },
    { id: "reaver_wolves", templateId: "wolfriders" },
    { id: "reaver_brutes", templateId: "trollkin_brutes" },
    { id: "reaver_berserkers", templateId: "berserkers" },
    { id: "reaver_skirmishers", templateId: "reaver_skirmishers" }
  ],
  tacticalCardsA: ["aim_carefully", "war_banner", "forced_march"],
  tacticalCardsB: ["bloodlust", "drill_master", "veterans"],
  rules: { gridMode: true }
};

function createStore(initialState) {
  let state = initialState;
  const listeners = [];
  return {
    getState() { return state; },
    dispatch(action) {
      const result = engineDispatch(state, action);
      if (result.ok) {
        state = result.state;
        listeners.forEach(fn => fn(state, result.events ?? []));
      }
      return result;
    },
    replaceState(next) {
      state = next;
      listeners.forEach(fn => fn(state, []));
    },
    subscribe(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }
  };
}

const uiState = {
  selectedUnitId: null,
  mode: null,
  previewPath: null,
  previewUnit: null,
  locked: false,
  lastError: null,
  notifications: [],
  lastSeenLogCount: 0,
  pendingPass: false
};

let store;

function buildInitialState() {
  const state = createInitialGameState(DEFAULT_SETUP);
  beginGame(state);
  return state;
}

function getSelectedUnit(state) {
  const id = state.activatingUnitId ?? uiState.selectedUnitId;
  return id ? state.units[id] : null;
}

function selectUnit(unitId) {
  // While a unit is mid-activation, selecting another unit isn't allowed
  const state = store.getState();
  if (state.activatingUnitId && state.activatingUnitId !== unitId) {
    showError("Finish the current activation first.");
    return;
  }
  uiState.selectedUnitId = unitId;
  cancelCurrentInteraction(uiState);
  rerender();
}

function autoSelectNextUnit() {
  const state = store.getState();
  if (state.activePlayer !== "playerA") return;
  if (state.activatingUnitId) {
    uiState.selectedUnitId = state.activatingUnitId;
    return;
  }
  const ids = [
    ...state.players.playerA.battlefieldUnitIds,
    ...state.players.playerA.reserveUnitIds
  ];
  for (const uid of ids) {
    const u = state.units[uid];
    if (u && !u.status.activatedThisRound) {
      uiState.selectedUnitId = uid;
      return;
    }
  }
}

function getActivationChecklist() {
  const state = store.getState();
  if (state.activePlayer !== "playerA") return { total: 0, done: 0, remaining: [] };
  const ids = [
    ...state.players.playerA.battlefieldUnitIds,
    ...state.players.playerA.reserveUnitIds
  ];
  let done = 0;
  const remaining = [];
  for (const uid of ids) {
    const u = state.units[uid];
    if (!u) continue;
    if (u.status.activatedThisRound) done += 1;
    else remaining.push(u.name);
  }
  return { total: ids.length, done, remaining };
}

function getModeText() {
  if (uiState.lastError) return uiState.lastError;
  const state = store.getState();
  const unit = getSelectedUnit(state);
  const ck = getActivationChecklist();
  const progress = ck.total > 0 ? ` [${ck.done}/${ck.total}]` : "";

  if (uiState.pendingPass) return "⚠ Press Pass again to surrender remaining activations this round.";
  if (uiState.locked) return "⏳ Reavers are taking their turn…";
  if (state.activePlayer !== "playerA") return "Waiting for Reavers…";

  if (state.activatingUnitId) {
    const u = state.units[state.activatingUnitId];
    const movePart = u.status.movementUsed ? "Move✓" : "Move available";
    const actPart = u.status.actionUsed ? "Action✓" : "Action available";
    if (uiState.mode === "deploy") return `Deploy ${u.name} — click on your edge to enter.${progress}`;
    if (uiState.mode === "move") return `Move ${u.name} — click within ${u.speed}".${progress}`;
    if (uiState.mode === "run") return `Run ${u.name} — up to ${u.speed + 2}", consumes the whole activation.${progress}`;
    if (uiState.mode === "disengage") return `Disengage ${u.name} — break free; outweighed = no shoot/charge.${progress}`;
    if (uiState.mode === "declare_ranged") {
      const w = u.rangedWeapons?.[0];
      return `Shoot — click an enemy in range.${w ? ` ${w.name}: ${w.rangeInches}" rng, ${w.hitTarget}+ hit.` : ""}${progress}`;
    }
    if (uiState.mode === "declare_charge") return `Charge — click an enemy within 8". Resolves immediately.${progress}`;
    return `${u.name} is acting. ${movePart} · ${actPart}.${progress}`;
  }

  if (uiState.mode === "deploy" && unit) return `Deploy ${unit.name} — click on your edge.${progress}`;

  if (state.phase === "battle") {
    if (ck.remaining.length > 0) {
      return `Pick a unit to activate — Move + one Action (Shoot OR Charge), or Run.${progress}`;
    }
    return `All your units have activated. Pass to end the round.${progress}`;
  }
  return `Round ending…${progress}`;
}

function rerender() {
  const handlers = {
    onUnitSelect: selectUnit,
    onBoardClick: handleBoardClick,
    onModelClick: handleModelClick,
    buildActionButtons,
    buildCardButtons,
    getModeText,
    getPhaseChecklist: getActivationChecklist
  };
  renderAll(store.getState(), uiState, handlers);
  renderNotifications();
}

function showError(msg) {
  uiState.lastError = msg;
  pushToast(msg, "error");
  rerender();
  window.clearTimeout(showError.timer);
  showError.timer = window.setTimeout(() => { uiState.lastError = null; rerender(); }, 4200);
}

function pushToast(message, tone = "info", durationMs = 5200) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  uiState.notifications.push({ id, message, tone });
  if (uiState.notifications.length > 5) uiState.notifications.shift();
  rerender();
  window.setTimeout(() => {
    const idx = uiState.notifications.findIndex(n => n.id === id);
    if (idx >= 0) { uiState.notifications.splice(idx, 1); rerender(); }
  }, durationMs);
}

function renderNotifications() {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  stack.innerHTML = "";
  uiState.notifications.forEach(n => {
    const t = document.createElement("div");
    t.className = `toast ${n.tone}`;
    t.innerHTML = `<div class="toast-meta">Battle Update</div><div>${n.message}</div>`;
    stack.appendChild(t);
  });
}

function publishLogNotifications(state) {
  if (uiState.lastSeenLogCount >= state.log.length) return;
  const newEntries = state.log.slice(uiState.lastSeenLogCount);
  uiState.lastSeenLogCount = state.log.length;
  newEntries.forEach(e => {
    const tone = e.type === "combat" ? "warn" : e.type === "score" ? "success" : "info";
    pushToast(e.text, tone);
  });
}

function actionButton(label, className, onClick, disabled = false, title = "") {
  const btn = document.createElement("button");
  btn.className = `btn ${className}`;
  btn.textContent = label;
  btn.disabled = disabled;
  if (title) btn.title = title;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildActionButtons() {
  const state = store.getState();
  const buttons = [];
  if (state.activePlayer !== "playerA") return buttons;
  if (state.players.playerA.passedThisRound) return buttons;

  // Cancel button when in interaction mode
  buttons.push(actionButton("Cancel", "secondary", () => {
    cancelCurrentInteraction(uiState);
    rerender();
  }, !uiState.mode, "No active interaction to cancel."));

  const activatingId = state.activatingUnitId;
  const selectedId = uiState.selectedUnitId;
  const id = activatingId ?? selectedId;
  if (!id) return buttons;
  const unit = state.units[id];
  if (!unit || unit.owner !== "playerA") return buttons;
  if (!activatingId && unit.status.activatedThisRound) return buttons;

  const inActivation = !!activatingId;
  const movementUsed = !!unit.status.movementUsed;
  const actionUsed = !!unit.status.actionUsed;

  // Deploy from reserves — always begins activation
  if (unit.status.location === "reserves") {
    if (!inActivation || activatingId === unit.id) {
      buttons.unshift(actionButton("Deploy", "primary", () => {
        beginDeployInteraction(state, uiState, unit.id);
        rerender();
      }));
    }
    return buttons;
  }

  // Battlefield unit
  // Move — available before movement is used and not engaged
  if (!movementUsed && !unit.status.engaged) {
    buttons.unshift(actionButton("Move", "primary", () => {
      beginMoveInteraction(state, uiState, unit.id);
      rerender();
    }));
  }

  // Disengage — when engaged
  if (!movementUsed && unit.status.engaged) {
    buttons.unshift(actionButton("Disengage", "warn", () => {
      beginDisengageInteraction(state, uiState, unit.id);
      rerender();
    }));
  }

  // Run — both slots empty, not engaged. Burns full activation.
  if (!movementUsed && !actionUsed && !unit.status.engaged) {
    buttons.unshift(actionButton("Run", "secondary", () => {
      beginRunInteraction(state, uiState, unit.id);
      rerender();
    }));
  }

  // Action: Shoot or Charge
  if (!actionUsed && !unit.status.runThisActivation) {
    if (unit.rangedWeapons?.length) {
      buttons.unshift(actionButton("Shoot", "secondary", () => {
        beginDeclareRangedInteraction(uiState);
        rerender();
      }));
    }
    if (unit.meleeWeapons?.length) {
      buttons.unshift(actionButton("Charge", "warn", () => {
        beginDeclareChargeInteraction(uiState);
        rerender();
      }));
    }
  }

  // Hold — only when no activation has begun (it's a "do nothing" activation)
  if (!inActivation) {
    buttons.push(actionButton("Hold", "secondary", () => {
      const result = store.dispatch({ type: "HOLD_UNIT", payload: { playerId: "playerA", unitId: unit.id } });
      if (!result.ok) showError(result.message);
      else { autoSelectNextUnit(); rerender(); }
    }));
  }

  // End Activation — when activation in progress (used at least one slot, want to skip the rest)
  if (inActivation) {
    buttons.push(actionButton("End Activation", "secondary", () => {
      const result = store.dispatch({ type: "END_ACTIVATION", payload: { playerId: "playerA" } });
      if (!result.ok) showError(result.message);
      else { autoSelectNextUnit(); rerender(); }
    }));
  }

  return buttons;
}

function buildCardButtons() {
  const state = store.getState();
  const buttons = [];
  if (state.activePlayer !== "playerA") return buttons;
  if (state.players.playerA.passedThisRound) return buttons;
  if (state.phase !== "battle") return buttons;

  const selected = getSelectedUnit(state);
  for (const entry of state.players.playerA.hand ?? []) {
    const card = getTacticalCard(entry.cardId);
    if (card.target === "friendly_battlefield_unit") {
      const ok = selected && selected.owner === "playerA" && selected.status.location === "battlefield";
      const label = ok ? `Play ${card.name} on ${selected.name}` : `Play ${card.name} (select a unit)`;
      buttons.push(actionButton(label, "secondary", () => {
        const result = store.dispatch({
          type: "PLAY_CARD",
          payload: { playerId: "playerA", cardInstanceId: entry.instanceId, targetUnitId: selected.id }
        });
        if (!result.ok) showError(result.message);
      }, !ok, "Select a friendly battlefield unit first."));
      continue;
    }
    buttons.push(actionButton(`Play ${card.name}`, "secondary", () => {
      const result = store.dispatch({
        type: "PLAY_CARD",
        payload: { playerId: "playerA", cardInstanceId: entry.instanceId, targetUnitId: null }
      });
      if (!result.ok) showError(result.message);
    }));
  }
  return buttons;
}

function computeDeployEntryPoint(state, point) {
  const side = state.deployment.entryEdges.playerA.side;
  if (side === "west") return { x: 0, y: point.y };
  if (side === "east") return { x: state.board.widthInches, y: point.y };
  if (side === "north") return { x: point.x, y: 0 };
  return { x: point.x, y: state.board.heightInches };
}

function canFlankAttack(unit) {
  return unit.abilities?.includes("flank_attack");
}

function maybeSnapPoint(state, point) {
  if (!state.rules?.gridMode) return point;
  return snapPointToGrid(point, state.board);
}

function handleBoardClick(point) {
  if (uiState.pendingPass) {
    uiState.pendingPass = false;
    rerender();
    return;
  }
  const state = store.getState();
  const snapped = maybeSnapPoint(state, point);
  const unit = getSelectedUnit(state);
  if (!unit || state.activePlayer !== "playerA") return;

  if (uiState.mode === "deploy") {
    const entry = canFlankAttack(unit) ? snapped : computeDeployEntryPoint(state, snapped);
    const path = canFlankAttack(unit) ? [entry, entry] : [entry, snapped];
    const result = store.dispatch({
      type: "DEPLOY_UNIT",
      payload: {
        playerId: "playerA", unitId: unit.id, leadingModelId: unit.leadingModelId,
        entryPoint: entry, path, modelPlacements: autoArrangeModels(state, unit.id, snapped)
      }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    autoSelectNextUnit();
    rerender();
    return;
  }
  if (uiState.mode === "move") {
    const leader = unit.models[unit.leadingModelId];
    const path = [{ x: leader.x, y: leader.y }, snapped];
    const result = store.dispatch({
      type: "MOVE_UNIT",
      payload: {
        playerId: "playerA", unitId: unit.id, leadingModelId: unit.leadingModelId,
        path, modelPlacements: autoArrangeModels(state, unit.id, snapped)
      }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    rerender();
    return;
  }
  if (uiState.mode === "run") {
    const leader = unit.models[unit.leadingModelId];
    const path = [{ x: leader.x, y: leader.y }, snapped];
    const result = store.dispatch({
      type: "RUN_UNIT",
      payload: {
        playerId: "playerA", unitId: unit.id, leadingModelId: unit.leadingModelId,
        path, modelPlacements: autoArrangeModels(state, unit.id, snapped)
      }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    autoSelectNextUnit();
    rerender();
    return;
  }
  if (uiState.mode === "disengage") {
    const leader = unit.models[unit.leadingModelId];
    const path = [{ x: leader.x, y: leader.y }, snapped];
    const result = store.dispatch({
      type: "DISENGAGE_UNIT",
      payload: {
        playerId: "playerA", unitId: unit.id, leadingModelId: unit.leadingModelId,
        path, modelPlacements: autoArrangeModels(state, unit.id, snapped)
      }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    rerender();
  }
}

function handleModelClick(unitId) {
  if (uiState.pendingPass) {
    uiState.pendingPass = false;
    rerender();
  }
  const state = store.getState();
  const sel = getSelectedUnit(state);
  const clicked = state.units[unitId];

  if (uiState.mode === "declare_ranged" && sel && clicked && sel.owner === "playerA" && clicked.owner === "playerB") {
    const result = store.dispatch({
      type: "DECLARE_RANGED_ATTACK",
      payload: { playerId: "playerA", unitId: sel.id, targetId: clicked.id }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    autoSelectNextUnit();
    rerender();
    return;
  }
  if (uiState.mode === "declare_charge" && sel && clicked && sel.owner === "playerA" && clicked.owner === "playerB") {
    const result = store.dispatch({
      type: "DECLARE_CHARGE",
      payload: { playerId: "playerA", unitId: sel.id, targetId: clicked.id }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    autoSelectNextUnit();
    rerender();
    return;
  }
  selectUnit(unitId);
}

async function maybeRunBot() {
  if (uiState.locked) return;
  const state = store.getState();
  if (state.activePlayer !== "playerB") return;
  if (state.phase !== "battle") return;
  uiState.locked = true;
  rerender();
  await new Promise(r => setTimeout(r, 420));
  const result = await performBotTurn(store, "playerB");
  if (!result.ok) showError(result.message);
  uiState.locked = false;
  if (store.getState().activePlayer === "playerA") autoSelectNextUnit();
  rerender();
  if (store.getState().activePlayer === "playerB" && store.getState().phase === "battle") {
    maybeRunBot();
  }
}

function resetGame() {
  uiState.selectedUnitId = null;
  uiState.pendingPass = false;
  cancelCurrentInteraction(uiState);
  const next = buildInitialState();
  uiState.lastSeenLogCount = next.log.length;
  store.replaceState(next);
}

function sanitize(value) { return value.replace(/[^a-z0-9_-]/gi, "_"); }

function exportSaveFile() {
  const state = store.getState();
  const payload = { version: 2, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `skirmish-save-${sanitize(state.mission.id ?? "mission")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  pushToast("Save exported.", "success");
}

function isValid(s) {
  return Boolean(s && typeof s === "object" && s.board && s.players && s.units);
}

function importSaveFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = parsed?.state ?? parsed;
      if (!isValid(imported)) { showError("Invalid save file."); return; }
      uiState.selectedUnitId = null;
      uiState.pendingPass = false;
      cancelCurrentInteraction(uiState);
      uiState.lastSeenLogCount = imported.log?.length ?? 0;
      store.replaceState(imported);
      document.getElementById("gridModeBtn").textContent = `Grid: ${store.getState().rules.gridMode ? "On" : "Off"}`;
      pushToast("Save loaded.", "success");
    } catch (_e) {
      showError("Could not read this save file.");
    }
  };
  reader.onerror = () => showError("Failed to load save file.");
  reader.readAsText(file);
}

function controller() {
  return {
    onNewGame: resetGame,
    onToggleGridMode: () => {
      const s = store.getState();
      s.rules.gridMode = !s.rules.gridMode;
      document.getElementById("gridModeBtn").textContent = `Grid: ${s.rules.gridMode ? "On" : "Off"}`;
      rerender();
    },
    onExportSave: exportSaveFile,
    onImportSave: () => {
      const input = document.getElementById("importFileInput");
      if (!input) return;
      input.value = "";
      input.click();
    },
    onImportFileSelected: e => importSaveFile(e.target?.files?.[0]),
    onPass: () => {
      const s = store.getState();
      if (s.activatingUnitId) {
        showError("Finish the current activation first.");
        return;
      }
      if (!uiState.pendingPass) {
        uiState.pendingPass = true;
        rerender();
        window.clearTimeout(controller._timer);
        controller._timer = window.setTimeout(() => {
          uiState.pendingPass = false;
          rerender();
        }, 3000);
        return;
      }
      uiState.pendingPass = false;
      const result = store.dispatch({ type: "PASS_ROUND", payload: { playerId: "playerA" } });
      if (!result.ok) showError(result.message);
    }
  };
}
controller._timer = null;

function updatePreviewFromPoint(point) {
  const state = store.getState();
  const snapped = maybeSnapPoint(state, point);
  const unit = getSelectedUnit(state);
  if (!unit) return;
  if (uiState.mode === "deploy") {
    const entry = canFlankAttack(unit) ? snapped : computeDeployEntryPoint(state, snapped);
    uiState.previewPath = { path: canFlankAttack(unit) ? [entry, entry] : [entry, snapped] };
    uiState.previewUnit = { unitId: unit.id, leader: snapped, placements: autoArrangeModels(state, unit.id, snapped) };
  }
  if (uiState.mode === "move" || uiState.mode === "disengage" || uiState.mode === "run") {
    const leader = unit.models[unit.leadingModelId];
    uiState.previewPath = { path: [{ x: leader.x, y: leader.y }, snapped] };
    uiState.previewUnit = { unitId: unit.id, leader: snapped, placements: autoArrangeModels(state, unit.id, snapped) };
  }
}

function wirePreviewEvents() {
  const svg = document.getElementById("battlefield");
  svg.addEventListener("mousemove", evt => {
    if (!uiState.mode) return;
    const p = screenToBoardPoint(svg, evt.clientX, evt.clientY);
    updatePreviewFromPoint(p);
    rerender();
  });
  svg.addEventListener("mouseleave", () => {
    if (!uiState.mode) return;
    uiState.previewPath = null;
    uiState.previewUnit = null;
    rerender();
  });
  svg.addEventListener("touchmove", evt => {
    if (!uiState.mode) return;
    const t = evt.touches[0];
    if (!t) return;
    evt.preventDefault();
    const p = screenToBoardPoint(svg, t.clientX, t.clientY);
    updatePreviewFromPoint(p);
    rerender();
  }, { passive: false });
}

function wireKeyboardShortcuts() {
  document.addEventListener("keydown", evt => {
    if (evt.target.tagName === "INPUT" || evt.target.tagName === "TEXTAREA") return;
    const state = store.getState();
    const unit = getSelectedUnit(state);

    if (evt.key === "Escape") {
      if (uiState.pendingPass) { uiState.pendingPass = false; rerender(); return; }
      if (uiState.mode) { cancelCurrentInteraction(uiState); rerender(); return; }
      if (!state.activatingUnitId) { uiState.selectedUnitId = null; rerender(); }
      return;
    }
    if (evt.key === "Tab") {
      evt.preventDefault();
      if (state.activatingUnitId) return; // can't switch unit mid-activation
      const ids = [
        ...state.players.playerA.reserveUnitIds,
        ...state.players.playerA.battlefieldUnitIds
      ];
      const cur = ids.indexOf(uiState.selectedUnitId);
      for (let i = 1; i <= ids.length; i++) {
        const next = ids[(cur + i) % ids.length];
        const u = state.units[next];
        if (u && !u.status.activatedThisRound) { selectUnit(next); return; }
      }
      if (ids.length) selectUnit(ids[(cur + 1) % ids.length]);
      return;
    }
    if (state.activePlayer !== "playerA" || !unit || unit.owner !== "playerA") return;
    if (evt.key === "m" && unit.status.location === "battlefield" && !unit.status.engaged && !unit.status.movementUsed) {
      beginMoveInteraction(state, uiState, unit.id); rerender();
    }
    if (evt.key === "d" && unit.status.location === "reserves") {
      beginDeployInteraction(state, uiState, unit.id); rerender();
    }
    if (evt.key === "h" && unit.status.location === "battlefield" && !state.activatingUnitId) {
      const result = store.dispatch({ type: "HOLD_UNIT", payload: { playerId: "playerA", unitId: unit.id } });
      if (!result.ok) showError(result.message);
      else { autoSelectNextUnit(); rerender(); }
    }
    if (evt.key === "r" && unit.status.location === "battlefield" && !unit.status.engaged && !unit.status.movementUsed && !unit.status.actionUsed) {
      beginRunInteraction(state, uiState, unit.id); rerender();
    }
  });
}

function init() {
  store = createStore(buildInitialState());
  bindInputHandlers(store, controller());
  document.getElementById("gridModeBtn").textContent = `Grid: ${store.getState().rules.gridMode ? "On" : "Off"}`;
  uiState.lastSeenLogCount = store.getState().log.length;
  store.subscribe((state) => {
    publishLogNotifications(state);
    rerender();
    maybeRunBot();
  });
  autoSelectNextUnit();
  rerender();
  wirePreviewEvents();
  wireKeyboardShortcuts();
}

init();
