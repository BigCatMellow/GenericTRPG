import { getObjectiveControlSnapshot } from "../engine/objectives.js";
import { gridDistance } from "../engine/geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";
function el(name, attrs = {}) {
  const e = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}
function ownerClass(pid) { return pid === "playerA" ? "playerA" : "playerB"; }
function aliveCount(unit) { return unit.modelIds.filter(id => unit.models[id].alive).length; }
function sqTopLeft(cx, cy) { return { sx: Math.floor(cx), sy: Math.floor(cy) }; }

/* ═══ Board layers ═══ */

function addGrid(svg, w, h) {
  for (let x = 0; x <= w; x++) svg.appendChild(el("line", { x1: x, y1: 0, x2: x, y2: h, class: x === w / 2 ? "board-centerline" : "board-grid-line" }));
  for (let y = 0; y <= h; y++) svg.appendChild(el("line", { x1: 0, y1: y, x2: w, y2: y, class: y === h / 2 ? "board-centerline" : "board-grid-line" }));
}

function addZones(svg, state) {
  const d = state.deployment.zoneOfInfluenceDepth;
  svg.append(
    el("rect", { x: 0, y: 0, width: d, height: state.board.heightInches, class: "edge-zone playerA" }),
    el("rect", { x: state.board.widthInches - d, y: 0, width: d, height: state.board.heightInches, class: "edge-zone playerB" })
  );
}

function addTerrain(svg, terrain) {
  for (const p of terrain) {
    svg.appendChild(el("rect", {
      x: p.rect.minX, y: p.rect.minY,
      width: p.rect.maxX - p.rect.minX, height: p.rect.maxY - p.rect.minY,
      class: p.impassable ? "terrain-block" : "terrain-cover"
    }));
  }
}

function addObjectives(svg, objectives, snapshot) {
  for (const obj of objectives) {
    const r = snapshot[obj.id];
    let cls = "obj-square neutral";
    if (r?.contested) cls = "obj-square contested";
    if (r?.controller === "playerA") cls = "obj-square ctrl-a";
    if (r?.controller === "playerB") cls = "obj-square ctrl-b";
    const ox = Math.floor(obj.x), oy = Math.floor(obj.y);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= 2) {
          svg.appendChild(el("rect", { x: ox + dx, y: oy + dy, width: 1, height: 1, class: "obj-zone" }));
        }
      }
    }
    svg.appendChild(el("rect", { x: ox, y: oy, width: 1, height: 1, class: cls }));
    const label = el("text", { x: ox + 0.5, y: oy + 0.55, class: "obj-label" });
    label.textContent = obj.id.replace("obj", "").toUpperCase();
    svg.appendChild(label);
  }
}

function addPathPreview(svg, preview) {
  if (!preview?.path || preview.path.length < 2) return;
  const s = preview.path[0], e = preview.path[preview.path.length - 1];
  const cost = gridDistance(s, e);
  if (cost <= 0) return;
  svg.appendChild(el("line", { x1: s.x, y1: s.y, x2: e.x, y2: e.y, class: "path-preview" }));
  const label = el("text", { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 - 0.4, class: "path-preview-label" });
  label.textContent = `${Math.round(cost)} sq`;
  svg.appendChild(label);
}

function addPreviewUnit(svg, state, uiState) {
  if (!uiState.previewUnit) return;
  const { leader } = uiState.previewUnit;
  const { sx, sy } = sqTopLeft(leader.x, leader.y);
  svg.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: "deploy-preview" }));
}

/* ═══ Range squares (Chebyshev grid) ═══ */
function addRangeSquares(svg, state, uiState) {
  if (!uiState.selectedUnitId) return;
  const unit = state.units[uiState.selectedUnitId];
  if (!unit || unit.owner !== "playerA" || unit.status.location !== "battlefield") return;
  const leader = unit.models[unit.leadingModelId];
  if (!leader || leader.x == null) return;

  const ux = leader.x, uy = leader.y;
  const bw = state.board.widthInches, bh = state.board.heightInches;

  let range = 0, cssClass = "";
  if (uiState.mode === "move" || uiState.mode === "disengage" || uiState.mode === "deploy") {
    range = unit.speed; cssClass = "range-sq move";
  } else if (uiState.mode === "run") {
    range = unit.speed + 2; cssClass = "range-sq move";
  } else if (uiState.mode === "declare_ranged" && unit.rangedWeapons?.length) {
    range = Math.max(...unit.rangedWeapons.map(w => w.rangeInches ?? 0)); cssClass = "range-sq attack";
  } else if (uiState.mode === "declare_charge") {
    range = 8; cssClass = "range-sq charge";
  }
  if (range <= 0 || !cssClass) return;

  const g = el("g", { class: "range-overlay" });
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > range) continue;
      const px = ux + dx, py = uy + dy;
      if (px < 0.5 || py < 0.5 || px >= bw || py >= bh) continue;
      if (dx === 0 && dy === 0 && cssClass.includes("move")) continue;
      const { sx, sy } = sqTopLeft(px, py);
      g.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: cssClass }));
    }
  }
  svg.appendChild(g);
}

function addTargetHighlights(svg, state, uiState) {
  if (!uiState.selectedUnitId) return;
  if (uiState.mode !== "declare_ranged" && uiState.mode !== "declare_charge") return;
  const unit = state.units[uiState.selectedUnitId];
  if (!unit || unit.owner !== "playerA" || unit.status.location !== "battlefield") return;
  const leader = unit.models[unit.leadingModelId];
  if (!leader || leader.x == null) return;

  for (const t of Object.values(state.units)) {
    if (t.owner !== "playerB" || t.status.location !== "battlefield") continue;
    const tl = t.models[t.leadingModelId];
    if (!tl || tl.x == null) continue;
    const dist = gridDistance(leader, tl);
    let inRange = false;
    if (uiState.mode === "declare_ranged" && unit.rangedWeapons?.length)
      inRange = dist <= Math.max(...unit.rangedWeapons.map(w => w.rangeInches ?? 0));
    if (uiState.mode === "declare_charge") inRange = dist <= 8;
    if (inRange) {
      const { sx, sy } = sqTopLeft(tl.x, tl.y);
      svg.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: "target-sq" }));
    }
  }
}

function addActivationIndicators(svg, state) {
  if (state.activePlayer !== "playerA") return;
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== "playerA" || unit.status.location !== "battlefield") continue;
    const m = unit.models[unit.leadingModelId];
    if (!m || m.x == null) continue;
    if (!unit.status.activatedThisRound) {
      const { sx, sy } = sqTopLeft(m.x, m.y);
      svg.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: "needs-activation-sq" }));
    }
  }
}

function addActivatingHighlight(svg, state) {
  if (!state.activatingUnitId) return;
  const unit = state.units[state.activatingUnitId];
  if (!unit) return;
  const m = unit.models[unit.leadingModelId];
  if (!m || m.x == null) return;
  const { sx, sy } = sqTopLeft(m.x, m.y);
  svg.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: "activating-sq" }));
}

/* ═══ Single-block unit rendering ═══ */
function abbreviate(name) {
  if (name.length <= 10) return name;
  const w = name.split(/[\s_-]+/);
  if (w.length === 1) return name.slice(0, 9);
  return w.map(x => x[0]).join("").toUpperCase();
}

function addUnits(svg, state, uiState, onModelClick) {
  for (const unit of Object.values(state.units)) {
    if (unit.status.location !== "battlefield") continue;
    const leader = unit.models[unit.leadingModelId];
    if (!leader?.alive || leader.x == null) continue;
    const cx = leader.x, cy = leader.y;
    const al = aliveCount(unit);
    const owner = ownerClass(unit.owner);
    const isSelected = uiState.selectedUnitId === unit.id;
    const isActivating = state.activatingUnitId === unit.id;
    const activated = unit.status.activatedThisRound;
    const { sx, sy } = sqTopLeft(cx, cy);

    // Single colored block
    const cls = ["unit-block", owner];
    if (activated) cls.push("activated");
    if (isActivating) cls.push("activating");
    else if (isSelected) cls.push("selected");
    const block = el("rect", {
      x: sx + 0.05, y: sy + 0.05, width: 0.9, height: 0.9,
      rx: 0.08, ry: 0.08,
      class: cls.join(" "),
      "data-unit-id": unit.id
    });
    block.addEventListener("click", evt => {
      evt.stopPropagation();
      onModelClick(unit.id, unit.leadingModelId);
    });
    svg.appendChild(block);

    // Tooltip
    const title = el("title");
    const wpn = unit.rangedWeapons?.length
      ? unit.rangedWeapons.map(w => `${w.name} ${w.rangeInches}" ${w.hitTarget}+`).join(", ")
      : unit.meleeWeapons?.length ? unit.meleeWeapons.map(w => `${w.name} ${w.hitTarget}+`).join(", ") : "";
    title.textContent = `${unit.name}\n${al} models, ${unit.currentSupplyValue} cost, Spd ${unit.speed}\n${wpn}`;
    block.appendChild(title);

    // Name above the block
    const nameText = el("text", { x: sx + 0.5, y: sy - 0.08, class: `unit-label ${owner}` });
    nameText.textContent = abbreviate(unit.name);
    svg.appendChild(nameText);

    // Stats inside the block
    const infoText = el("text", { x: sx + 0.5, y: sy + 0.55, class: "unit-info-text" });
    infoText.textContent = `${al} · ${unit.currentSupplyValue}`;
    svg.appendChild(infoText);

    if (unit.status.engaged) {
      const badge = el("text", { x: sx + 0.5, y: sy + 1.18, class: "unit-engaged-badge" });
      badge.textContent = "ENGAGED";
      svg.appendChild(badge);
    }
  }
}

export function screenToBoardPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const t = pt.matrixTransform(svg.getScreenCTM().inverse());
  const w = Number(svg.dataset.boardWidth ?? 36), h = Number(svg.dataset.boardHeight ?? 36);
  return { x: Math.max(0, Math.min(w, t.x)), y: Math.max(0, Math.min(h, t.y)) };
}

export function renderLegalOverlay() {}
export function renderUnitGhost() {}

export function renderBoard(state, uiState, handlers) {
  const svg = document.getElementById("battlefield");
  svg.setAttribute("viewBox", `0 0 ${state.board.widthInches} ${state.board.heightInches}`);
  svg.dataset.boardWidth = String(state.board.widthInches);
  svg.dataset.boardHeight = String(state.board.heightInches);
  svg.innerHTML = "";
  const ctrlSnap = getObjectiveControlSnapshot(state);

  addZones(svg, state);
  addGrid(svg, state.board.widthInches, state.board.heightInches);
  addTerrain(svg, state.board.terrain);
  addObjectives(svg, state.deployment.missionMarkers, ctrlSnap);
  addActivationIndicators(svg, state);
  addActivatingHighlight(svg, state);
  addRangeSquares(svg, state, uiState);
  addTargetHighlights(svg, state, uiState);
  addPathPreview(svg, uiState.previewPath);
  addPreviewUnit(svg, state, uiState);
  addUnits(svg, state, uiState, handlers.onModelClick);

  svg.onclick = event => {
    const point = screenToBoardPoint(svg, event.clientX, event.clientY);
    handlers.onBoardClick(point);
  };
}
