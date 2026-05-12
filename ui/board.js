// v0.12 Board renderer
import { getObjectiveControlSnapshot } from "../engine/objectives.js";
import { gridDistance } from "../engine/geometry.js";
import { hasCondition, isOverwhelmed } from "../engine/conditions.js";

const SVG_NS = "http://www.w3.org/2000/svg";
function el(name, attrs = {}) {
  const e = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}
function ownerClass(pid) { return pid === "playerA" ? "playerA" : "playerB"; }
function sqTopLeft(cx, cy) { return { sx: Math.floor(cx), sy: Math.floor(cy) }; }

function addGrid(svg, w, h) {
  for (let x = 0; x <= w; x++)
    svg.appendChild(el("line", { x1: x, y1: 0, x2: x, y2: h, class: x === w / 2 ? "board-centerline" : "board-grid-line" }));
  for (let y = 0; y <= h; y++)
    svg.appendChild(el("line", { x1: 0, y1: y, x2: w, y2: y, class: y === h / 2 ? "board-centerline" : "board-grid-line" }));
}

function addTerrain(svg, terrain) {
  for (const t of terrain) {
    if (!t.rect) continue;
    let cls = "terrain-cover";
    if (t.impassable || (t.traits ?? []).includes("blocking")) cls = "terrain-block";
    else if ((t.traits ?? []).includes("difficult")) cls = "terrain-difficult";
    svg.appendChild(el("rect", {
      x: t.rect.minX, y: t.rect.minY,
      width: t.rect.maxX - t.rect.minX,
      height: t.rect.maxY - t.rect.minY,
      class: cls
    }));
    // Terrain label
    const tx = (t.rect.minX + t.rect.maxX) / 2;
    const ty = (t.rect.minY + t.rect.maxY) / 2;
    const tl = el("text", { x: tx, y: ty, class: "terrain-label" });
    tl.textContent = (t.traits?.[0] ?? t.kind ?? "")[0]?.toUpperCase() ?? "";
    svg.appendChild(tl);
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
    // Objective zone (3" radius)
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= 3) {
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
  label.textContent = `${Math.round(cost)}"`;
  svg.appendChild(label);
}

function addPreviewUnit(svg, state, uiState) {
  if (!uiState.previewUnit) return;
  const { dest } = uiState.previewUnit;
  if (!dest) return;
  const { sx, sy } = sqTopLeft(dest.x, dest.y);
  svg.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: "deploy-preview" }));
}

function addRangeSquares(svg, state, uiState) {
  const selId = uiState.selectedCharId;
  if (!selId) return;
  const ch = state.characters[selId];
  if (!ch || ch.owner !== "playerA" || ch.x == null) return;
  const ux = ch.x, uy = ch.y;
  const bw = state.board.widthInches, bh = state.board.heightInches;
  let range = 0, cssClass = "";

  if (uiState.mode === "move") {
    range = ch.move; cssClass = "range-sq move";
  } else if (uiState.mode === "run") {
    range = 9; cssClass = "range-sq move";
  } else if (uiState.mode === "attack") {
    const atk = ch.attacks?.[uiState.pendingAttackKey];
    range = atk?.type === "melee" ? 1.5 : (atk?.range ?? 8);
    cssClass = "range-sq attack";
  } else if (uiState.mode === "class_ability") {
    if (ch.classId === "cleric") { range = 6; cssClass = "range-sq friendly"; }
    if (ch.classId === "mage") { range = 8; cssClass = "range-sq attack"; }
  }
  if (range <= 0 || !cssClass) return;

  const g = el("g", { class: "range-overlay" });
  for (let dx = -Math.ceil(range); dx <= Math.ceil(range); dx++) {
    for (let dy = -Math.ceil(range); dy <= Math.ceil(range); dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > range) continue;
      const px = ux + dx, py = uy + dy;
      if (px < 0.5 || py < 0.5 || px >= bw || py >= bh) continue;
      if (dx === 0 && dy === 0) continue;
      const { sx, sy } = sqTopLeft(px, py);
      g.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: cssClass }));
    }
  }
  svg.appendChild(g);
}

function addTargetHighlights(svg, state, uiState) {
  const selId = uiState.selectedCharId;
  if (!selId) return;
  if (uiState.mode !== "attack" && uiState.mode !== "class_ability") return;
  const ch = state.characters[selId];
  if (!ch || ch.x == null) return;
  const isClassAbility = uiState.mode === "class_ability";
  const abilityId = uiState.pendingAbilityId;

  for (const t of Object.values(state.characters)) {
    if (t.health <= 0 || t.x == null) continue;
    let eligible = false;
    if (isClassAbility) {
      // Rally: friendly within 6"; Disrupt: enemy within 8"
      if (abilityId === "rally" && t.owner === ch.owner && t.id !== ch.id) {
        eligible = gridDistance({ x: ch.x, y: ch.y }, { x: t.x, y: t.y }) <= 6;
      }
      if (abilityId === "disrupt" && t.owner !== ch.owner) {
        eligible = gridDistance({ x: ch.x, y: ch.y }, { x: t.x, y: t.y }) <= 8;
      }
    } else {
      // Attack target
      if (t.owner === ch.owner) continue;
      const atk = ch.attacks?.[uiState.pendingAttackKey];
      const range = atk?.type === "melee" ? 1.5 : (atk?.range ?? 8);
      eligible = gridDistance({ x: ch.x, y: ch.y }, { x: t.x, y: t.y }) <= range;
    }
    if (eligible) {
      const { sx, sy } = sqTopLeft(t.x, t.y);
      svg.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: "target-sq" }));
    }
  }
}

function addActivationIndicators(svg, state) {
  if (state.activePlayer !== "playerA") return;
  for (const ch of Object.values(state.characters)) {
    if (ch.owner !== "playerA" || ch.x == null || ch.health <= 0) continue;
    if (!ch.activatedThisRound) {
      const { sx, sy } = sqTopLeft(ch.x, ch.y);
      svg.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: "needs-activation-sq" }));
    }
  }
}

function addActivatingHighlight(svg, state) {
  if (!state.activatingCharacterId) return;
  const ch = state.characters[state.activatingCharacterId];
  if (!ch || ch.x == null) return;
  const { sx, sy } = sqTopLeft(ch.x, ch.y);
  svg.appendChild(el("rect", { x: sx, y: sy, width: 1, height: 1, class: "activating-sq" }));
}

function abbreviate(name) {
  if (name.length <= 8) return name;
  const w = name.split(/[\s_-]+/);
  return w.length > 1 ? w.map(x => x[0]).join("").toUpperCase() : name.slice(0, 7);
}

function conditionBadge(ch) {
  const badges = [];
  if (hasCondition(ch, "guarded")) badges.push("G");
  if (hasCondition(ch, "pinned")) badges.push("P");
  if (hasCondition(ch, "exposed")) badges.push("E");
  if (isOverwhelmed(ch)) badges.push("OVR");
  return badges.join("");
}

function readinessBadge(ch) {
  if (ch.readiness === "ready") return "R";
  if (ch.readiness === "committed") return "C";
  if (ch.readiness === "spent") return "S";
  return "";
}

function addUnits(svg, state, uiState, onCharClick) {
  for (const ch of Object.values(state.characters)) {
    if (ch.x == null || ch.health <= 0) continue;
    const owner = ownerClass(ch.owner);
    const isSelected = uiState.selectedCharId === ch.id;
    const isActivating = state.activatingCharacterId === ch.id;
    const activated = ch.activatedThisRound;
    const { sx, sy } = sqTopLeft(ch.x, ch.y);

    const cls = ["unit-block", owner];
    if (activated) cls.push("activated");
    if (isActivating) cls.push("activating");
    else if (isSelected) cls.push("selected");
    if (ch.readiness === "spent") cls.push("spent");
    if (hasCondition(ch, "pinned")) cls.push("pinned");
    if (hasCondition(ch, "exposed")) cls.push("exposed");

    const block = el("rect", {
      x: sx + 0.05, y: sy + 0.05, width: 0.9, height: 0.9,
      rx: 0.08, ry: 0.08,
      class: cls.join(" "),
      "data-char-id": ch.id
    });
    block.addEventListener("click", evt => {
      evt.stopPropagation();
      onCharClick(ch.id);
    });
    svg.appendChild(block);

    // Health bar
    const hpPct = ch.health / ch.maxHealth;
    const barW = 0.8 * hpPct;
    const barColor = hpPct > 0.6 ? "var(--green)" : hpPct > 0.3 ? "var(--warn)" : "var(--red)";
    svg.appendChild(el("rect", { x: sx + 0.1, y: sy + 0.82, width: 0.8, height: 0.08, fill: "rgba(0,0,0,0.3)" }));
    svg.appendChild(el("rect", { x: sx + 0.1, y: sy + 0.82, width: barW, height: 0.08, fill: barColor, style: "pointer-events:none" }));

    // Tooltip
    const title = el("title");
    const conds = ch.conditions.join("/") || "none";
    title.textContent = `${ch.name} [${ch.classId}]\nHP:${ch.health}/${ch.maxHealth} ${ch.readiness}\nConditions: ${conds}`;
    block.appendChild(title);

    // Class abbreviation and name above block
    const nameText = el("text", { x: sx + 0.5, y: sy - 0.08, class: `unit-label ${owner}` });
    nameText.textContent = abbreviate(ch.name);
    svg.appendChild(nameText);

    // Stats inside block
    const hpText = el("text", { x: sx + 0.5, y: sy + 0.48, class: "unit-info-text" });
    hpText.textContent = `${ch.health}/${ch.maxHealth}`;
    svg.appendChild(hpText);

    // Readiness/condition badge
    const badge = readinessBadge(ch) + conditionBadge(ch);
    if (badge) {
      const badgeText = el("text", { x: sx + 0.5, y: sy + 0.73, class: `unit-badge ${owner}` });
      badgeText.textContent = badge;
      svg.appendChild(badgeText);
    }

    // Securing indicator
    if (ch.securingObjectiveId) {
      const secText = el("text", { x: sx + 0.5, y: sy + 1.15, class: "unit-securing-badge" });
      secText.textContent = "SECURING";
      svg.appendChild(secText);
    }
  }
}

export function screenToBoardPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const t = pt.matrixTransform(svg.getScreenCTM().inverse());
  const w = Number(svg.dataset.boardWidth ?? 24), h = Number(svg.dataset.boardHeight ?? 24);
  return { x: Math.max(0, Math.min(w, t.x)), y: Math.max(0, Math.min(h, t.y)) };
}

export function renderBoard(state, uiState, handlers) {
  const svg = document.getElementById("battlefield");
  svg.setAttribute("viewBox", `0 0 ${state.board.widthInches} ${state.board.heightInches}`);
  svg.dataset.boardWidth = String(state.board.widthInches);
  svg.dataset.boardHeight = String(state.board.heightInches);
  svg.innerHTML = "";

  const ctrlSnap = getObjectiveControlSnapshot(state);

  addGrid(svg, state.board.widthInches, state.board.heightInches);
  addTerrain(svg, state.board.terrain);
  addObjectives(svg, state.board.objectives, ctrlSnap);
  addActivationIndicators(svg, state);
  addActivatingHighlight(svg, state);
  addRangeSquares(svg, state, uiState);
  addTargetHighlights(svg, state, uiState);
  addPathPreview(svg, uiState.previewPath);
  addPreviewUnit(svg, state, uiState);
  addUnits(svg, state, uiState, handlers.onCharClick);

  svg.onclick = event => {
    const point = screenToBoardPoint(svg, event.clientX, event.clientY);
    handlers.onBoardClick(point);
  };
}
