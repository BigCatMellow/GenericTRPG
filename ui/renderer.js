// v0.12 Renderer
import { renderBoard } from "./board.js";
import { getObjectiveControlSnapshot } from "../engine/objectives.js";
import { hasCondition, isOverwhelmed } from "../engine/conditions.js";

function pn(id) { return id === "playerA" ? "Player A" : "Player B"; }
function tc(s) { return String(s).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

// ─── Readiness chip ────────────────────────────────────────────────────────
function rdChipHtml(readiness) {
  const labels = { ready: "Ready", committed: "Committed", spent: "Spent" };
  return `<span class="rd-chip ${readiness}">${labels[readiness] ?? tc(readiness)}</span>`;
}

// ─── Condition pills ────────────────────────────────────────────────────────
function condPillsHtml(ch, short = false) {
  const pills = [];
  if (hasCondition(ch, "guarded"))  pills.push(`<span class="cnd-pill guarded">${short ? "G" : "Guarded"}</span>`);
  if (hasCondition(ch, "pinned"))   pills.push(`<span class="cnd-pill pinned">${short ? "P" : "Pinned"}</span>`);
  if (hasCondition(ch, "exposed"))  pills.push(`<span class="cnd-pill exposed">${short ? "E" : "Exposed"}</span>`);
  if (isOverwhelmed(ch))            pills.push(`<span class="cnd-pill overwhelmed">${short ? "OVR" : "Overwhelmed"}</span>`);
  return pills.join("");
}

// ─── Class ability descriptions ─────────────────────────────────────────────
function getClassAbilityHtml(ch) {
  switch (ch.classId) {
    case "warrior": return `
      <div class="ability-section-label">Class Abilities</div>
      <div class="ability-card passive">
        <div class="ac-name">Battle-Ready</div>
        <div class="ac-type">Passive</div>
        <div class="ac-desc">When Guarded, Brace tests are one step easier (3+ instead of 4+). Guarded Brace reduces dmg by 2 (crit: 3) instead of 1.</div>
      </div>
      <div class="ability-card attack-mode">
        <div class="ac-name">Heavy Blow — 3 dmg</div>
        <div class="ac-type">Heavy Attack · Melee · → Spent</div>
        <div class="ac-desc">Dodge against it is one step easier (3+). After resolving, attacker → Spent. If target is Spent, Pinned, Exposed, or Overwhelmed and the attack <em>hits</em>, attacker → Committed instead.</div>
        <div class="ac-crit">Choose: +1 dmg, push target 1 inch, or become Guarded.</div>
      </div>`;

    case "ranger": return `
      <div class="ability-section-label">Attack Modes</div>
      <div class="ability-card attack-mode">
        <div class="ac-name">Standard Shot — 2 dmg</div>
        <div class="ac-type">Standard · Ranged · No condition</div>
        <div class="ac-desc">Normal ranged attack. No condition applied.</div>
        <div class="ac-crit">+1 damage.</div>
      </div>
      <div class="ability-card attack-mode">
        <div class="ac-name">Suppressing Shot — 1 dmg</div>
        <div class="ac-type">Standard · Ranged · Applies Pinned</div>
        <div class="ac-desc">Deals 1 less damage (min 0). On hit, target becomes <strong>Pinned</strong>.</div>
        <div class="ac-crit">Target becomes Pinned and cannot remove Pinned until after their next activation.</div>
      </div>
      <div class="ability-card attack-mode">
        <div class="ac-name">Called Shot — 1 dmg</div>
        <div class="ac-type">Standard · Ranged · One step harder · Applies Exposed</div>
        <div class="ac-desc">Attack roll is one step harder. 1 less damage (min 0). On hit, target becomes <strong>Exposed</strong>.</div>
        <div class="ac-crit">Target becomes Exposed AND attack deals normal (2) damage instead of reduced.</div>
      </div>`;

    case "rogue": return `
      <div class="ability-section-label">Class Abilities</div>
      <div class="ability-card passive">
        <div class="ac-name">Exploit Opening</div>
        <div class="ac-type">Passive</div>
        <div class="ac-desc">This character's attacks are one step easier against <strong>Exposed</strong> or <strong>Spent</strong> targets.</div>
      </div>
      <div class="ability-card passive">
        <div class="ac-name">Slip Through</div>
        <div class="ac-type">Passive · After Quick melee</div>
        <div class="ac-desc">Once per activation, after a Quick melee attack, may move up to 3". May use <em>before</em> the attack only if the target is Exposed or Spent. Blocked while Pinned.</div>
      </div>
      <div class="ability-card active">
        <div class="ac-name">Backstab</div>
        <div class="ac-type">Action · Quick melee attack</div>
        <div class="ac-desc">Make a Quick melee attack. If the target is Exposed or Spent, deal +1 damage.</div>
        <div class="ac-crit">vs Exposed/Spent: +1 damage. Otherwise: may use Slip Through again this activation.</div>
      </div>`;

    case "cleric": return `
      <div class="ability-section-label">Class Abilities</div>
      <div class="ability-card passive">
        <div class="ac-name">Support Role</div>
        <div class="ac-type">Passive · Exception</div>
        <div class="ac-desc">Basic attacks deal <strong>1 damage</strong> instead of the normal 2. The Cleric's power is in Rally, not raw damage.</div>
        <div class="ac-crit">After damage, one friendly character within 3" may remove Exposed.</div>
      </div>
      <div class="ability-card active">
        <div class="ac-name">Rally</div>
        <div class="ac-type">Action · 6" range</div>
        <div class="ac-desc">Choose a friendly character within 6". Remove Pinned or Exposed from that character. If they are Spent → Committed. If any condition was removed or readiness improved, that character becomes <strong>Guarded</strong>.</div>
        <div class="ac-crit">Target removes a condition, improves readiness by one step, and becomes Guarded — all three.</div>
      </div>`;

    case "mage": return `
      <div class="ability-section-label">Class Abilities</div>
      <div class="ability-card active">
        <div class="ac-name">Disrupt</div>
        <div class="ac-type">Action · 8" range · Mage → Committed</div>
        <div class="ac-desc">Choose an enemy within 8". Roll 1d6. On 4+, target becomes <strong>Exposed</strong> and suffers 1 dmg. If target is already Pinned/Exposed, succeeds on 3+ instead. If target was already Exposed, it also becomes <strong>Pinned</strong> (creating Overwhelmed). After resolving, this Mage becomes Committed.</div>
        <div class="ac-crit">Target becomes Exposed + Pinned. If already Exposed or Pinned: also +1 damage.</div>
      </div>
      <div class="ability-card attack-mode">
        <div class="ac-name">Arcane Bolt — 2 dmg</div>
        <div class="ac-type">Standard · Magic · 8" range</div>
        <div class="ac-desc">Standard magic ranged attack.</div>
        <div class="ac-crit">Choose: +1 damage, or target becomes Exposed.</div>
      </div>`;

    default: return "";
  }
}

// ─── Attack type badge HTML ──────────────────────────────────────────────────
function atkBadgesHtml(atk) {
  const parts = [];
  if (atk.appliesPinned)           parts.push(`<span class="badge" style="color:var(--warn)">→ Pinned</span>`);
  if (atk.appliesExposed)          parts.push(`<span class="badge" style="color:#ff7070">→ Exposed</span>`);
  if (atk.bonusDmgIfExposedOrSpent) parts.push(`<span class="badge" style="color:var(--green)">+1 vs Exp/Spent</span>`);
  if (atk.oneCategoryHarder)       parts.push(`<span class="badge" style="color:var(--muted)">Harder</span>`);
  return parts.join(" ");
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
    const slotsHtml = state.activatingCharacterId === ch.id
      ? `<span style="color:var(--muted);font-size:10px"> · ${ch.movementUsed ? "Mv✓" : "Mv"} ${ch.actionUsed ? "Act✓" : "Act"}</span>`
      : "";
    const pills = condPillsHtml(ch, true);
    abUnit.innerHTML = `
      <div class="ab-unit-inner"><strong>${ch.name}</strong>
        <span style="color:var(--muted);font-size:10px">[${tc(ch.classId)}]</span>${slotsHtml}
      </div>
      <div class="cond-row" style="margin-top:3px">
        ${rdChipHtml(ch.readiness)}
        ${pills || ""}
      </div>`;
  } else {
    abUnit.innerHTML = `<span style="color:var(--muted)">No character selected</span>`;
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
    const scoringActive = state.round >= 2;
    for (const obj of state.board.objectives) {
      const r = snap[obj.id];
      let ctrlText, ctrlColor;
      if (r?.controller === "playerA")       { ctrlText = `Player A (${r.playerACount} vs ${r.playerBCount})`; ctrlColor = "var(--blue)"; }
      else if (r?.controller === "playerB")  { ctrlText = `Player B (${r.playerBCount} vs ${r.playerACount})`; ctrlColor = "var(--red)"; }
      else if (r?.contested)                 { ctrlText = `Contested (A:${r.playerACount} B:${r.playerBCount})`; ctrlColor = "var(--warn)"; }
      else                                   { ctrlText = "Uncontrolled"; ctrlColor = "var(--muted)"; }
      const d = document.createElement("div");
      d.className = "obj-line";
      d.innerHTML = `
        <span style="font-weight:700">${obj.id.toUpperCase()}</span>
        <span style="color:${ctrlColor}">${ctrlText}</span>
        <span style="color:var(--muted);font-size:9px">${scoringActive ? "scoring" : "no score R1"}</span>`;
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
    const need = own && !act && state.activePlayer === "playerA" && ch.health > 0;
    const defeated = ch.health <= 0;
    const isSelected = uiState.selectedCharId === ch.id;
    const hpPct = ch.maxHealth > 0 ? Math.round(ch.health / ch.maxHealth * 100) : 0;
    const hpColor = hpPct > 60 ? "var(--green)" : hpPct > 30 ? "var(--warn)" : "var(--red)";
    const conds = condPillsHtml(ch, true);
    const securingBadge = ch.securingObjectiveId
      ? `<span style="color:var(--gold);font-size:9px;font-weight:800">⊕ Securing</span>`
      : "";

    const card = document.createElement("div");
    card.className = `d-ucard ${isSelected ? "selected" : ""} ${need ? "needs-action" : ""} ${(act || defeated) ? "done" : ""}`;
    card.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="d-ucard-name">${ch.name}${defeated ? " ✗" : ""}</div>
        <div class="d-ucard-row">
          ${rdChipHtml(ch.readiness)}
          ${conds}
          ${securingBadge}
          <span class="d-ucard-hp">HP ${ch.health}/${ch.maxHealth}</span>
        </div>
        <div class="d-ucard-hpbar"><div class="d-ucard-hpfill" style="width:${hpPct}%;background:${hpColor}"></div></div>
      </div>`;
    if (onSelect && !defeated) card.addEventListener("click", () => onSelect(ch.id));
    el.appendChild(card);
  }
}

function renderSelectedCharacter(state, uiState) {
  const panel = document.getElementById("selectedUnitPanel");
  if (!panel) return;
  const ch = uiState.selectedCharId ? state.characters[uiState.selectedCharId] : null;
  if (!ch) { panel.innerHTML = '<div class="d-empty">Select a character to see details.</div>'; return; }

  const hpPct = ch.maxHealth > 0 ? Math.round(ch.health / ch.maxHealth * 100) : 0;
  const hpColor = hpPct > 60 ? "var(--green)" : hpPct > 30 ? "var(--warn)" : "var(--red)";
  const pills = condPillsHtml(ch) || `<span style="color:var(--muted);font-size:10px">No conditions</span>`;

  const attackRows = ch.attacks ? Object.entries(ch.attacks).map(([, atk]) => `
    <div class="su-weapon">
      <div class="su-weapon-name">
        ${atk.name}
        <span class="badge">${atk.attackType}</span>
        <span class="badge">${atk.type}</span>
        ${atkBadgesHtml(atk)}
      </div>
      <div class="su-weapon-stats">
        <div class="su-ws"><span class="su-ws-label">Dmg</span><span class="su-ws-val">${atk.damage}</span></div>
        ${atk.range ? `<div class="su-ws"><span class="su-ws-label">Range</span><span class="su-ws-val">${atk.range}"</span></div>` : ""}
        ${atk.oneCategoryHarder ? `<div class="su-ws"><span class="su-ws-label">To Hit</span><span class="su-ws-val" style="color:var(--warn)">Harder</span></div>` : ""}
      </div>
    </div>`).join("") : "";

  const securingLine = ch.securingObjectiveId
    ? `<div class="su-stat-sm"><div class="k">Securing</div><div class="v" style="color:var(--gold)">${ch.securingObjectiveId.toUpperCase()}</div></div>`
    : "";

  panel.innerHTML = `
    <div class="su-title">${ch.name} <span class="badge">${tc(ch.classId)}</span></div>
    <div class="su-hpbar-wrap">
      <div class="su-hpbar"><div class="su-hpbar-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
      <div class="su-hpbar-label">${ch.health} / ${ch.maxHealth} HP</div>
    </div>
    <div class="su-chips">
      ${rdChipHtml(ch.readiness)}
      ${pills}
    </div>
    <div class="su-stats-mini">
      <div class="su-stat-sm"><div class="k">Move</div><div class="v">${ch.move}"</div></div>
      <div class="su-stat-sm"><div class="k">Activated</div><div class="v">${ch.activatedThisRound ? "Yes" : "No"}</div></div>
      <div class="su-stat-sm"><div class="k">Reaction</div><div class="v">${ch.reactionUsedThisRound ? "Used" : "Free"}</div></div>
      ${securingLine}
    </div>
    <div class="su-atk-label">Attacks</div>
    ${attackRows}
    ${getClassAbilityHtml(ch)}`;
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
