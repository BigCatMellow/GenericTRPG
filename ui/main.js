// v0.12 Main UI controller
import { createInitialGameState } from "../engine/state.js";
import { beginGame } from "../engine/phases.js";
import { dispatch as engineDispatch } from "../engine/reducer.js";
import {
  bindInputHandlers,
  beginMoveInteraction, beginRunInteraction,
  beginAttackInteraction, beginClassAbilityInteraction,
  cancelCurrentInteraction
} from "./input.js";
import { renderAll } from "./renderer.js";
import { performBotTurn } from "../ai/bot.js";
import { screenToBoardPoint } from "./board.js";
import { snapPointToGrid } from "../engine/geometry.js";
import { hasCondition } from "../engine/conditions.js";

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
  selectedCharId: null,
  mode: null,
  previewPath: null,
  previewUnit: null,
  pendingAttackKey: null,
  pendingAbilityId: null,
  locked: false,
  lastError: null,
  notifications: [],
  lastSeenLogCount: 0,
  pendingPass: false,
  gridMode: true
};

let store;

function buildInitialState() {
  const state = createInitialGameState();
  beginGame(state);
  return state;
}

function getSelectedCharacter(state) {
  const id = state.activatingCharacterId ?? uiState.selectedCharId;
  return id ? state.characters[id] : null;
}

function selectCharacter(charId) {
  const state = store.getState();
  if (state.activatingCharacterId && state.activatingCharacterId !== charId) {
    showError("Finish the current activation first.");
    return;
  }
  uiState.selectedCharId = charId;
  cancelCurrentInteraction(uiState);
  rerender();
}

function autoSelectNextCharacter() {
  const state = store.getState();
  if (state.activePlayer !== "playerA") return;
  if (state.activatingCharacterId) {
    uiState.selectedCharId = state.activatingCharacterId;
    return;
  }
  for (const ch of Object.values(state.characters)) {
    if (ch.owner === "playerA" && !ch.activatedThisRound && ch.health > 0) {
      uiState.selectedCharId = ch.id;
      return;
    }
  }
}

function getActivationChecklist() {
  const state = store.getState();
  if (state.activePlayer !== "playerA") return { total: 0, done: 0, remaining: [] };
  const chars = Object.values(state.characters).filter(c => c.owner === "playerA" && c.health > 0);
  let done = 0;
  const remaining = [];
  for (const ch of chars) {
    if (ch.activatedThisRound) done += 1;
    else remaining.push(ch.name);
  }
  return { total: chars.length, done, remaining };
}

function getModeText() {
  if (uiState.lastError) return uiState.lastError;
  const state = store.getState();
  const ch = getSelectedCharacter(state);
  const ck = getActivationChecklist();
  const progress = ck.total > 0 ? ` [${ck.done}/${ck.total}]` : "";

  if (uiState.pendingPass) return "⚠ Press Pass again to surrender remaining activations this round.";
  if (uiState.locked) return "⏳ Player B is taking their turn…";
  if (state.activePlayer !== "playerA") return "Waiting for Player B…";
  if (state.winner) return `Game over! ${state.winner === "playerA" ? "Player A" : "Player B"} wins!`;

  if (state.activatingCharacterId) {
    const c = state.characters[state.activatingCharacterId];
    const movePart = c.movementUsed ? "Move✓" : "Move";
    const actPart = c.actionUsed ? "Act✓" : "Act";
    if (uiState.mode === "move") return `Move ${c.name} — click destination (max ${c.move}").${progress}`;
    if (uiState.mode === "run") return `Run ${c.name} — click destination (max 9", → Spent, no Action).${progress}`;
    if (uiState.mode === "attack") {
      const atk = c.attacks?.[uiState.pendingAttackKey];
      let desc = atk ? `${atk.attackType} · ${atk.damage} dmg` : uiState.pendingAttackKey;
      if (atk?.type === "ranged" || atk?.type === "magic") desc += ` · ${atk.range ?? 8}" range`;
      if (atk?.appliesPinned) desc += " · applies Pinned on hit";
      if (atk?.appliesExposed) desc += " · applies Exposed on hit";
      if (atk?.oneCategoryHarder) desc += " · one step harder to hit";
      if (atk?.bonusDmgIfExposedOrSpent) desc += " · +1 dmg vs Exposed/Spent";
      return `${c.name}: ${atk?.name ?? "Attack"} (${desc}) — click an enemy.${progress}`;
    }
    if (uiState.mode === "class_ability") {
      const descs = {
        rally: "Rally: remove Pinned/Exposed from friendly, Spent→Committed, may grant Guarded.",
        disrupt: "Disrupt: roll 1d6, 4+ → target Exposed + 1 dmg (3+ if already pressured). Mage → Committed."
      };
      return `${c.name}: ${descs[uiState.pendingAbilityId] ?? uiState.pendingAbilityId} — click target.${progress}`;
    }
    return `${c.name} activating. ${movePart} · ${actPart}.${progress}`;
  }

  if (state.phase === "battle") {
    if (ck.remaining.length > 0) return `Pick a character to activate.${progress}`;
    return `All characters activated. Pass to end round.${progress}`;
  }
  return `Round ending…${progress}`;
}

function rerender() {
  const handlers = {
    onCharSelect: selectCharacter,
    onCharClick: handleCharClick,
    onBoardClick: handleBoardClick,
    buildActionButtons,
    getModeText,
    getPhaseChecklist: getActivationChecklist
  };
  renderAll(store.getState(), uiState, handlers);
  renderNotifications();
  renderChecklist();
}

function showError(msg) {
  uiState.lastError = msg;
  pushToast(msg, "error");
  rerender();
  window.clearTimeout(showError.timer);
  showError.timer = window.setTimeout(() => { uiState.lastError = null; rerender(); }, 4200);
}

function pushToast(message, tone = "info", durationMs = 5000) {
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
    t.innerHTML = `<div class="toast-meta">Update</div><div>${n.message}</div>`;
    stack.appendChild(t);
  });
}

function renderChecklist() {
  const ck = getActivationChecklist();
  const ckEl = document.getElementById("phaseChecklist");
  if (!ckEl) return;
  const pct = ck.total > 0 ? Math.round(ck.done / ck.total * 100) : 0;
  ckEl.innerHTML = `<div class="ck-bar"><div class="ck-fill" style="width:${pct}%"></div></div><div class="ck-label">${ck.done}/${ck.total}</div>` +
    (ck.remaining.length ? `<div class="ck-remaining">${ck.remaining.map(n => `<span class="ck-unit">${n}</span>`).join("")}</div>` : "");
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
  if (state.winner) return buttons;

  // Cancel
  buttons.push(actionButton("Cancel", "secondary", () => {
    cancelCurrentInteraction(uiState);
    rerender();
  }, !uiState.mode));

  const activatingId = state.activatingCharacterId;
  const selectedId = uiState.selectedCharId;
  const id = activatingId ?? selectedId;
  if (!id) return buttons;
  const ch = state.characters[id];
  if (!ch || ch.owner !== "playerA" || ch.health <= 0) return buttons;
  if (!activatingId && ch.activatedThisRound) return buttons;

  const inActivation = !!activatingId;
  const movementUsed = !!ch.movementUsed;
  const actionUsed = !!ch.actionUsed;

  // HOLD — before any activation
  if (!inActivation) {
    buttons.push(actionButton("Hold", "secondary", () => {
      const result = store.dispatch({ type: "HOLD", payload: { playerId: "playerA", charId: ch.id } });
      if (!result.ok) showError(result.message);
      else { autoSelectNextCharacter(); rerender(); }
    }));
  }

  // MOVE
  if (!movementUsed) {
    buttons.unshift(actionButton("Move", "primary", () => {
      beginMoveInteraction(state, uiState, ch.id);
      rerender();
    }));
  }

  // RUN — both slots free, not Pinned
  if (!movementUsed && !actionUsed && !hasCondition(ch, "pinned")) {
    buttons.unshift(actionButton("Run", "secondary", () => {
      beginRunInteraction(state, uiState, ch.id);
      rerender();
    }));
  }

  // ACTIONS
  if (!actionUsed) {
    // RECOVER
    buttons.push(actionButton("Recover", "secondary", () => {
      const result = store.dispatch({ type: "RECOVER", payload: { playerId: "playerA", charId: ch.id } });
      if (!result.ok) showError(result.message);
      else { autoSelectNextCharacter(); rerender(); }
    }));

    // SECURE OBJECTIVE
    if (!hasCondition(ch, "pinned")) {
      buttons.push(actionButton("Secure Obj", "secondary", () => {
        const result = store.dispatch({ type: "SECURE_OBJECTIVE", payload: { playerId: "playerA", charId: ch.id } });
        if (!result.ok) showError(result.message);
        else { autoSelectNextCharacter(); rerender(); }
      }));
    }

    // ATTACKS
    if (ch.attacks) {
      for (const [key, atk] of Object.entries(ch.attacks)) {
        const parts = [`${atk.attackType} · ${atk.damage} dmg`];
        if (atk.type === "ranged" || atk.type === "magic") parts.push(`range ${atk.range ?? 8}"`);
        if (atk.appliesPinned) parts.push("→ Pinned on hit");
        if (atk.appliesExposed) parts.push("→ Exposed on hit");
        if (atk.oneCategoryHarder) parts.push("one step harder");
        if (atk.bonusDmgIfExposedOrSpent) parts.push("+1 dmg vs Exposed/Spent");
        const tip = `${atk.name}: ${parts.join(" · ")}`;
        buttons.unshift(actionButton(atk.name, "warn", () => {
          beginAttackInteraction(uiState, ch.id, key);
          rerender();
        }, false, tip));
      }
    }

    // CLASS ABILITIES
    if (ch.classId === "cleric") {
      buttons.push(actionButton("Rally", "primary", () => {
        beginClassAbilityInteraction(uiState, ch.id, "rally");
        rerender();
      }, false, "Rally (6\"): remove Pinned/Exposed from friendly; Spent→Committed; if changed, target becomes Guarded."));
    }
    if (ch.classId === "mage") {
      buttons.push(actionButton("Disrupt", "warn", () => {
        beginClassAbilityInteraction(uiState, ch.id, "disrupt");
        rerender();
      }, false, "Disrupt (8\"): roll 1d6, 4+ (or 3+ if target pressured): Exposed + 1 dmg; already Exposed → also Pinned. Mage → Committed."));
    }
  }

  // END ACTIVATION
  if (inActivation) {
    buttons.push(actionButton("End Activation", "secondary", () => {
      const result = store.dispatch({ type: "END_ACTIVATION", payload: { playerId: "playerA", charId: ch.id } });
      if (!result.ok) showError(result.message);
      else { autoSelectNextCharacter(); rerender(); }
    }));
  }

  return buttons;
}

function maybeSnapPoint(state, point) {
  if (!uiState.gridMode) return point;
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
  const ch = getSelectedCharacter(state);
  if (!ch || state.activePlayer !== "playerA") return;

  if (uiState.mode === "move") {
    const result = store.dispatch({
      type: "MOVE",
      payload: { playerId: "playerA", charId: ch.id, destination: snapped }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    rerender();
    return;
  }

  if (uiState.mode === "run") {
    const result = store.dispatch({
      type: "RUN",
      payload: { playerId: "playerA", charId: ch.id, destination: snapped }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    autoSelectNextCharacter();
    rerender();
    return;
  }
}

function handleCharClick(charId) {
  if (uiState.pendingPass) {
    uiState.pendingPass = false;
    rerender();
  }
  const state = store.getState();
  const sel = getSelectedCharacter(state);
  const clicked = state.characters[charId];
  if (!clicked) return;

  if (uiState.mode === "attack" && sel && clicked.owner !== "playerA") {
    const result = store.dispatch({
      type: "ATTACK",
      payload: { playerId: "playerA", charId: sel.id, targetId: clicked.id, attackKey: uiState.pendingAttackKey }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    autoSelectNextCharacter();
    rerender();
    return;
  }

  if (uiState.mode === "class_ability" && sel) {
    const result = store.dispatch({
      type: "CLASS_ABILITY",
      payload: { playerId: "playerA", charId: sel.id, abilityId: uiState.pendingAbilityId, targetId: clicked.id }
    });
    if (!result.ok) return showError(result.message);
    cancelCurrentInteraction(uiState);
    autoSelectNextCharacter();
    rerender();
    return;
  }

  selectCharacter(charId);
}

async function maybeRunBot() {
  if (uiState.locked) return;
  const state = store.getState();
  if (state.activePlayer !== "playerB") return;
  if (state.phase !== "battle") return;
  if (state.winner) return;
  uiState.locked = true;
  rerender();
  await new Promise(r => setTimeout(r, 400));
  const result = await performBotTurn(store, "playerB");
  if (!result.ok) showError(result.message ?? "Bot error");
  uiState.locked = false;
  if (store.getState().activePlayer === "playerA") autoSelectNextCharacter();
  rerender();
  if (store.getState().activePlayer === "playerB" && store.getState().phase === "battle" && !store.getState().winner) {
    await new Promise(r => setTimeout(r, 300));
    maybeRunBot();
  }
}

function resetGame() {
  uiState.selectedCharId = null;
  uiState.pendingPass = false;
  cancelCurrentInteraction(uiState);
  const next = buildInitialState();
  uiState.lastSeenLogCount = next.log.length;
  store.replaceState(next);
}

function exportSaveFile() {
  const state = store.getState();
  const payload = { version: 3, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `skirmish-v012-save.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  pushToast("Save exported.", "success");
}

function isValid(s) {
  return Boolean(s && typeof s === "object" && s.board && s.players && s.characters);
}

function importSaveFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = parsed?.state ?? parsed;
      if (!isValid(imported)) { showError("Invalid save file."); return; }
      uiState.selectedCharId = null;
      uiState.pendingPass = false;
      cancelCurrentInteraction(uiState);
      uiState.lastSeenLogCount = imported.log?.length ?? 0;
      store.replaceState(imported);
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
      uiState.gridMode = !uiState.gridMode;
      const btn = document.getElementById("gridModeBtn");
      if (btn) btn.textContent = `Grid: ${uiState.gridMode ? "On" : "Off"}`;
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
      if (s.activatingCharacterId) { showError("Finish the current activation first."); return; }
      if (!uiState.pendingPass) {
        uiState.pendingPass = true;
        rerender();
        window.clearTimeout(controller._timer);
        controller._timer = window.setTimeout(() => { uiState.pendingPass = false; rerender(); }, 3000);
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
  const ch = getSelectedCharacter(state);
  if (!ch) return;
  if (uiState.mode === "move" || uiState.mode === "run") {
    uiState.previewPath = { path: [{ x: ch.x, y: ch.y }, snapped] };
    uiState.previewUnit = { charId: ch.id, dest: snapped };
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
}

function wireKeyboardShortcuts() {
  document.addEventListener("keydown", evt => {
    if (evt.target.tagName === "INPUT" || evt.target.tagName === "TEXTAREA") return;
    const state = store.getState();
    const ch = getSelectedCharacter(state);

    if (evt.key === "Escape") {
      if (uiState.pendingPass) { uiState.pendingPass = false; rerender(); return; }
      if (uiState.mode) { cancelCurrentInteraction(uiState); rerender(); return; }
      if (!state.activatingCharacterId) { uiState.selectedCharId = null; rerender(); }
      return;
    }
    if (evt.key === "Tab") {
      evt.preventDefault();
      if (state.activatingCharacterId) return;
      const chars = Object.values(state.characters).filter(c => c.owner === "playerA" && c.health > 0);
      const cur = chars.findIndex(c => c.id === uiState.selectedCharId);
      for (let i = 1; i <= chars.length; i++) {
        const next = chars[(cur + i) % chars.length];
        if (!next.activatedThisRound) { selectCharacter(next.id); return; }
      }
      if (chars.length) selectCharacter(chars[(cur + 1) % chars.length].id);
      return;
    }
    if (state.activePlayer !== "playerA" || !ch || ch.owner !== "playerA") return;
    if (evt.key === "m" && !ch.movementUsed) { beginMoveInteraction(state, uiState, ch.id); rerender(); }
    if (evt.key === "r" && !ch.movementUsed && !ch.actionUsed) { beginRunInteraction(state, uiState, ch.id); rerender(); }
    if (evt.key === "h" && !state.activatingCharacterId) {
      const result = store.dispatch({ type: "HOLD", payload: { playerId: "playerA", charId: ch.id } });
      if (!result.ok) showError(result.message);
      else { autoSelectNextCharacter(); rerender(); }
    }
  });
}

function init() {
  store = createStore(buildInitialState());
  bindInputHandlers(store, controller());
  const gridBtn = document.getElementById("gridModeBtn");
  if (gridBtn) gridBtn.textContent = "Grid: On";
  uiState.lastSeenLogCount = store.getState().log.length;
  store.subscribe((state) => {
    publishLogNotifications(state);
    rerender();
    maybeRunBot();
  });
  autoSelectNextCharacter();
  rerender();
  wirePreviewEvents();
  wireKeyboardShortcuts();
}

init();
