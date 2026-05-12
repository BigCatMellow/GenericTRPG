// v0.12 Input handlers

export function bindInputHandlers(store, controller) {
  document.getElementById("gridModeBtn")?.addEventListener("click", controller.onToggleGridMode);
  document.getElementById("exportBtn")?.addEventListener("click", controller.onExportSave);
  document.getElementById("importBtn")?.addEventListener("click", controller.onImportSave);
  document.getElementById("importFileInput")?.addEventListener("change", controller.onImportFileSelected);
  document.getElementById("newGameBtn")?.addEventListener("click", controller.onNewGame);
  document.getElementById("passBtn")?.addEventListener("click", controller.onPass);
}

export function beginMoveInteraction(state, uiState, charId) {
  const ch = state.characters[charId];
  if (!ch || ch.x == null) return;
  uiState.mode = "move";
  uiState.previewPath = { path: [{ x: ch.x, y: ch.y }, { x: ch.x, y: ch.y }] };
  uiState.previewUnit = { charId, dest: { x: ch.x, y: ch.y } };
}

export function beginRunInteraction(state, uiState, charId) {
  const ch = state.characters[charId];
  if (!ch || ch.x == null) return;
  uiState.mode = "run";
  uiState.previewPath = { path: [{ x: ch.x, y: ch.y }, { x: ch.x, y: ch.y }] };
  uiState.previewUnit = { charId, dest: { x: ch.x, y: ch.y } };
}

export function beginAttackInteraction(uiState, charId, attackKey) {
  uiState.mode = "attack";
  uiState.pendingAttackKey = attackKey;
  uiState.previewPath = null;
  uiState.previewUnit = null;
}

export function beginClassAbilityInteraction(uiState, charId, abilityId) {
  uiState.mode = "class_ability";
  uiState.pendingAbilityId = abilityId;
  uiState.previewPath = null;
  uiState.previewUnit = null;
}

export function cancelCurrentInteraction(uiState) {
  uiState.mode = null;
  uiState.previewPath = null;
  uiState.previewUnit = null;
  uiState.pendingAttackKey = null;
  uiState.pendingAbilityId = null;
}
