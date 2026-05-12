// Battle screen: cinematic playback of an attack resolution.
//
// The module owns one DOM root (#battleScreen) and exposes a single function:
//   playBattle(snapshot) -> Promise<void>
// The promise resolves when the user dismisses (or the playback finishes).
// Callers (main.js, the bot loop) await it before continuing the game flow.
//
// `snapshot` shape (built by main.js from the engine's combatResult):
//   {
//     attacker: { id, name, classId, factionLabel, hpBefore, hpMax, readiness, conditions, attackName, isLeft },
//     target:   { id, name, classId, factionLabel, hpBefore, hpAfter, hpMax, readiness, conditions, conditionsBefore },
//     result:   { hit, attackRoll, difficulty, crit, baseDamage, totalDamage, actualDamage,
//                 dodgeResult, braceResult, targetDefeated, statusApplied, critEffects, log }
//   }

import { hasCondition, isOverwhelmed } from "../engine/conditions.js";

const ATTACK_VERB_BY_TYPE = {
  melee: { intro: "closes in", verb: "strikes" },
  ranged: { intro: "takes aim", verb: "shoots at" },
  magic: { intro: "weaves arcane power", verb: "blasts" }
};

const POSE = {
  preWarrior: "raises shield",
  preRogue: "ducks low",
  preRanger: "draws a careful bead",
  preCleric: "centers their focus",
  preMage: "weaves a sigil",
  postHit: "recoils from the hit",
  postMiss: "twists clear",
  postDefeat: "is cut down",
  postExposed: "is left exposed",
  postPinned: "is pinned in place"
};

function poseFor(classId, role) {
  if (role === "pre") {
    return ({
      warrior: POSE.preWarrior, rogue: POSE.preRogue,
      ranger: POSE.preRanger, cleric: POSE.preCleric, mage: POSE.preMage
    })[classId] ?? "steadies";
  }
  return "stands ready";
}

function ensureDom() {
  let el = document.getElementById("battleScreen");
  if (el) return el;
  el = document.createElement("div");
  el.id = "battleScreen";
  el.className = "battle-screen";
  el.innerHTML = `
    <div class="bs-shell">
      <div class="bs-topbar">
        <div class="bs-side-label" id="bsLeftFaction">Crown Levy</div>
        <div class="bs-vs-title">
          <span class="blue" id="bsLeftName">Attacker</span><span class="vs">vs</span><span class="red" id="bsRightName">Target</span>
        </div>
        <div class="bs-side-label right" id="bsRightFaction">Border Reavers</div>
      </div>
      <div class="bs-stage" id="bsStage">
        <aside class="bs-panel left">
          <div class="bs-card" id="bsAttackerCard">
            <div class="bs-faction" id="bsAttackerFaction"></div>
            <div class="bs-name" id="bsAttackerName"></div>
            <div class="bs-pose" id="bsAttackerPose"></div>
            <div class="bs-stat-row"><span>HP</span><div class="bs-bar"><div class="bs-bar-fill" id="bsAttackerHpFill" style="width:100%"></div></div><strong id="bsAttackerHpText">5 / 5</strong></div>
            <div class="bs-chips" id="bsAttackerChips"></div>
          </div>
        </aside>
        <section class="bs-center">
          <div class="bs-banner" id="bsBanner"><strong>Attacker</strong> uses Attack</div>
          <div class="bs-impact">
            <div class="bs-arrow" id="bsArrow"></div>
            <div class="bs-hit" id="bsHitWord">HIT!</div>
            <div class="bs-damage" id="bsDamageWord">-1 HP</div>
            <div class="bs-status" id="bsStatusWord">Exposed</div>
          </div>
          <div class="bs-dice">
            <div class="bs-dice-title">Attack Breakdown</div>
            <div class="bs-dice-row">
              <span class="bs-die blue" id="bsRollDie">?</span>
              <span>vs</span>
              <span class="bs-die red" id="bsDifficulty">4+</span>
              <span>→</span>
              <span id="bsResult" class="bs-result-hit">waiting</span>
            </div>
          </div>
        </section>
        <aside class="bs-panel right">
          <div class="bs-card" id="bsTargetCard">
            <div class="bs-faction" id="bsTargetFaction"></div>
            <div class="bs-name" id="bsTargetName"></div>
            <div class="bs-pose" id="bsTargetPose"></div>
            <div class="bs-stat-row"><span>HP</span><div class="bs-bar"><div class="bs-bar-fill" id="bsTargetHpFill" style="width:100%"></div></div><strong id="bsTargetHpText">4 / 5</strong></div>
            <div class="bs-chips" id="bsTargetChips"></div>
          </div>
        </aside>
      </div>
      <div class="bs-feed">
        <div class="bs-feed-panel">
          <div class="bs-feed-heading">Combat Feed</div>
          <div class="bs-feed-list" id="bsFeedList"></div>
        </div>
        <div class="bs-controls-panel">
          <div class="bs-feed-heading">Resolution Controls</div>
          <div class="bs-phase-card" id="bsPhaseCard">
            <strong>Waiting to resolve.</strong>
            <span>Press Play to watch the attack play out, Step through it one beat at a time, or Skip to continue immediately.</span>
          </div>
          <select class="bs-speed" id="bsSpeed">
            <option value="800">Readable speed</option>
            <option value="450">Fast speed</option>
            <option value="1200">Slow tutorial speed</option>
          </select>
          <div class="bs-button-row">
            <button id="bsPlayBtn" class="primary">Play</button>
            <button id="bsStepBtn">Step</button>
            <button id="bsSkipBtn">Skip</button>
            <button id="bsContinueBtn" disabled>Continue</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
function clearAnims(el) {
  el.classList.remove("bs-shake-stage", "bs-shake-target", "bs-pulse-attacker",
    "bs-fire-arrow", "bs-pop-hit", "bs-pop-damage", "bs-pop-status");
  void el.offsetWidth;
}

function chipsForCharacter(snap) {
  const parts = [];
  if (snap.readiness) parts.push(`<span class="bs-chip ${snap.readiness}">${snap.readiness}</span>`);
  for (const c of snap.conditions ?? []) {
    parts.push(`<span class="bs-chip ${c}">${c}</span>`);
  }
  if (!parts.length) parts.push(`<span class="bs-chip">No status</span>`);
  return parts.join("");
}

function attackKindFromType(type) {
  return ATTACK_VERB_BY_TYPE[type] ?? { intro: "moves to engage", verb: "attacks" };
}

function buildFeed(snap) {
  const { attacker, target, result } = snap;
  const ah = attackKindFromType(snap.attackType);
  const lines = [];

  // Step 1: declaration
  lines.push({
    text: `<span class="bs-text-blue">${attacker.name}</span> ${ah.verb} <span class="bs-text-red">${target.name}</span> with <span class="bs-text-gold">${attacker.attackName}</span>.`,
    do: ctx => {
      const card = document.getElementById("bsAttackerCard");
      card.classList.add("bs-pulse-attacker");
      setText("bsAttackerPose", "looses an attack");
      setHtml("bsPhaseCard", `<strong>Step 1 · Declaration.</strong><span>${attacker.name} commits the action and chooses ${target.name} as the target.</span>`);
    }
  });

  // Step 2: dodge (only if a real dodge was rolled — i.e. dodgeResult is non-null and ok)
  if (result.dodgeResult && result.dodgeResult.ok) {
    const d = result.dodgeResult;
    if (d.miss) {
      lines.push({
        text: `<span class="bs-text-red">${target.name}</span> rolls <span class="bs-text-blue">${d.roll}</span> vs <span class="bs-text-red">${d.difficulty}+</span> — <span class="bs-text-green">DODGE${d.crit ? " (crit)" : ""}</span>.`,
        do: () => {
          setText("bsRollDie", String(d.roll));
          setText("bsDifficulty", `${d.difficulty}+`);
          const r = document.getElementById("bsResult");
          r.textContent = "DODGE";
          r.className = "bs-result-hit";
          setText("bsTargetPose", POSE.postMiss);
          setHtml("bsPhaseCard", `<strong>Step 2 · Dodge.</strong><span>Target rolled ${d.roll} ≥ ${d.difficulty}+. Attack misses.${d.crit ? " Critical dodge — target may reposition." : ""}</span>`);
        }
      });
    } else {
      lines.push({
        text: `<span class="bs-text-red">${target.name}</span> attempts to dodge — <span class="bs-text-bad">fails</span> (${d.roll} vs ${d.difficulty}+).`,
        do: () => {
          setHtml("bsPhaseCard", `<strong>Step 2 · Dodge fails.</strong><span>Target rolled ${d.roll} < ${d.difficulty}+. The attack continues.</span>`);
        }
      });
    }
  }

  // If the attack didn't reach attackRoll (defender dodged out), stop here.
  if (!result.attackRoll) return lines;

  // Step 3: attack roll
  lines.push({
    text: `Roll <span class="bs-text-blue">${result.attackRoll.roll}</span> vs <span class="bs-text-red">${result.attackRoll.difficulty}+</span> — <span class="${result.hit ? "bs-text-green" : "bs-text-bad"}">${result.hit ? (result.attackRoll.crit ? "HIT (CRIT)" : "HIT") : "MISS"}</span>.`,
    do: () => {
      const arrow = document.getElementById("bsArrow");
      arrow.classList.add("bs-fire-arrow");
      setText("bsRollDie", String(result.attackRoll.roll));
      setText("bsDifficulty", `${result.attackRoll.difficulty}+`);
      const r = document.getElementById("bsResult");
      r.textContent = result.hit ? (result.attackRoll.crit ? "CRIT" : "HIT") : "MISS";
      r.className = result.hit ? "bs-result-hit" : "bs-result-miss";
      const hit = document.getElementById("bsHitWord");
      hit.textContent = result.hit ? (result.attackRoll.crit ? "CRITICAL!" : "HIT!") : "MISS";
      hit.classList.add("bs-pop-hit");
      hit.classList.toggle("miss", !result.hit);
      if (result.hit) {
        document.getElementById("bsStage").classList.add("bs-shake-stage");
        setHtml("bsPhaseCard", `<strong>Step 2 · Attack roll.</strong><span>Rolled ${result.attackRoll.roll} ≥ ${result.attackRoll.difficulty}+${result.attackRoll.crit ? " — critical!" : ""}. The attack connects.</span>`);
      } else {
        setText("bsTargetPose", POSE.postMiss);
        setHtml("bsPhaseCard", `<strong>Step 2 · Attack roll.</strong><span>Rolled ${result.attackRoll.roll} < ${result.attackRoll.difficulty}+. The attack misses.</span>`);
      }
    }
  });

  if (!result.hit) return lines;

  // Step 4: brace (only if rolled)
  if (result.braceResult && result.braceResult.ok) {
    const b = result.braceResult;
    if (b.success) {
      lines.push({
        text: `<span class="bs-text-red">${target.name}</span> braces — reduces damage by <span class="bs-text-green">${b.damageReduced}</span> (${b.roll} vs ${b.difficulty}+${b.crit ? " crit" : ""}).`,
        do: () => {
          setHtml("bsPhaseCard", `<strong>Step 3 · Brace.</strong><span>Target reduced incoming damage by ${b.damageReduced}.</span>`);
        }
      });
    } else {
      lines.push({
        text: `<span class="bs-text-red">${target.name}</span> fails to brace (${b.roll} vs ${b.difficulty}+).`,
        do: () => {
          setHtml("bsPhaseCard", `<strong>Step 3 · Brace fails.</strong><span>Target took the full hit.</span>`);
        }
      });
    }
  }

  // Step 5: damage
  if (result.actualDamage > 0) {
    lines.push({
      text: `<span class="bs-text-red">${target.name}</span> suffers <span class="bs-text-bad">${result.actualDamage} damage</span>. HP ${target.hpBefore} → ${target.hpAfter}.`,
      do: () => {
        const card = document.getElementById("bsTargetCard");
        card.classList.add("bs-shake-target");
        const dmg = document.getElementById("bsDamageWord");
        dmg.textContent = `-${result.actualDamage} HP`;
        dmg.classList.add("bs-pop-damage");
        const hpPct = target.hpMax > 0 ? Math.max(0, Math.round((target.hpAfter / target.hpMax) * 100)) : 0;
        document.getElementById("bsTargetHpFill").style.width = `${hpPct}%`;
        setText("bsTargetHpText", `${target.hpAfter} / ${target.hpMax}`);
        setText("bsTargetPose", result.targetDefeated ? POSE.postDefeat : POSE.postHit);
        setHtml("bsPhaseCard", `<strong>Step 3 · Damage.</strong><span>${target.name} takes ${result.actualDamage} damage. HP ${target.hpBefore}/${target.hpMax} → ${target.hpAfter}/${target.hpMax}.${result.targetDefeated ? " DEFEATED!" : ""}</span>`);
      }
    });
  } else if (result.hit) {
    lines.push({
      text: `<span class="bs-text-red">${target.name}</span> takes <span class="bs-text-bad">no damage</span> (blocked).`,
      do: () => {
        setHtml("bsPhaseCard", `<strong>Step 3 · Damage absorbed.</strong><span>All damage was blocked.</span>`);
      }
    });
  }

  // Step 6: status applied
  if (snap.statusApplied?.length) {
    lines.push({
      text: `<span class="bs-text-red">${target.name}</span> becomes <span class="bs-text-bad">${snap.statusApplied.join(" + ")}</span>.`,
      do: () => {
        const word = document.getElementById("bsStatusWord");
        word.textContent = snap.statusApplied.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" / ");
        word.classList.add("bs-pop-status");
        // Update target chips to reflect after-state
        setHtml("bsTargetChips", chipsForCharacter({
          readiness: target.readiness,
          conditions: target.conditionsAfter ?? target.conditions
        }));
        const poses = {
          exposed: POSE.postExposed,
          pinned: POSE.postPinned
        };
        const newPose = snap.statusApplied.map(s => poses[s]).filter(Boolean)[0];
        if (newPose) setText("bsTargetPose", newPose);
        setHtml("bsPhaseCard", `<strong>Step 4 · Status applied.</strong><span>${target.name} is now ${snap.statusApplied.join(", ")}.</span>`);
      }
    });
  }

  // Crit-effect mentions
  for (const eff of result.critEffects ?? []) {
    if (eff === "warrior_crit_plus1dmg") continue;       // already in damage text
    if (eff === "ranger_crit_plus1dmg") continue;
    if (eff === "rogue_crit_plus1dmg") continue;
    if (eff === "mage_crit_plus1dmg") continue;
    if (eff === "warrior_crit_guarded") {
      lines.push({
        text: `<span class="bs-text-blue">${attacker.name}</span> becomes <span class="bs-text-gold">Guarded</span> (warrior crit).`,
        do: () => setHtml("bsPhaseCard", `<strong>Crit effect.</strong><span>${attacker.name} braces and becomes Guarded.</span>`)
      });
    }
    if (eff === "rogue_crit_slip_through") {
      lines.push({
        text: `<span class="bs-text-blue">${attacker.name}</span> gains an extra Slip Through (rogue crit).`,
        do: () => setHtml("bsPhaseCard", `<strong>Crit effect.</strong><span>${attacker.name} keeps Slip Through available.</span>`)
      });
    }
    if (eff === "cleric_crit_friendly_remove_exposed") {
      lines.push({
        text: `Nearby friendly may remove <span class="bs-text-bad">Exposed</span> (cleric crit).`,
        do: () => setHtml("bsPhaseCard", `<strong>Crit effect.</strong><span>An allied character within 3" may clear Exposed.</span>`)
      });
    }
  }

  return lines;
}

function setStateCards(snap) {
  setText("bsLeftFaction", snap.attacker.factionLabel ?? "Player A");
  setText("bsRightFaction", snap.target.factionLabel ?? "Player B");
  setText("bsLeftName", snap.attacker.name);
  setText("bsRightName", snap.target.name);
  setText("bsAttackerFaction", snap.attacker.factionLabel ?? "");
  setText("bsAttackerName", snap.attacker.name);
  setText("bsAttackerPose", poseFor(snap.attacker.classId, "pre"));
  setText("bsTargetFaction", snap.target.factionLabel ?? "");
  setText("bsTargetName", snap.target.name);
  setText("bsTargetPose", poseFor(snap.target.classId, "pre"));

  const aPct = snap.attacker.hpMax > 0 ? Math.round((snap.attacker.hpBefore / snap.attacker.hpMax) * 100) : 0;
  document.getElementById("bsAttackerHpFill").style.width = `${aPct}%`;
  setText("bsAttackerHpText", `${snap.attacker.hpBefore} / ${snap.attacker.hpMax}`);

  const tPct = snap.target.hpMax > 0 ? Math.round((snap.target.hpBefore / snap.target.hpMax) * 100) : 0;
  document.getElementById("bsTargetHpFill").style.width = `${tPct}%`;
  setText("bsTargetHpText", `${snap.target.hpBefore} / ${snap.target.hpMax}`);

  setHtml("bsAttackerChips", chipsForCharacter({
    readiness: snap.attacker.readiness,
    conditions: snap.attacker.conditions
  }));
  setHtml("bsTargetChips", chipsForCharacter({
    readiness: snap.target.readiness,
    conditions: snap.target.conditions
  }));

  setHtml("bsBanner", `<strong>${snap.attacker.name}</strong> uses ${snap.attacker.attackName}`);
  setText("bsRollDie", "?");
  setText("bsDifficulty", `${snap.result.attackRoll?.difficulty ?? "?"}+`);
  const result = document.getElementById("bsResult");
  result.textContent = "waiting";
  result.className = "bs-result-hit";
  document.getElementById("bsHitWord").style.opacity = "";
  document.getElementById("bsHitWord").textContent = "HIT!";
  document.getElementById("bsDamageWord").style.opacity = "";
  document.getElementById("bsStatusWord").style.opacity = "";
  setHtml("bsPhaseCard", `<strong>Waiting to resolve.</strong><span>Press Play to watch the attack play out, Step through it one beat at a time, or Skip to continue immediately.</span>`);
}

let resolveCurrent = null;
let activeLines = [];
let activeStep = 0;
let activeTimer = null;

function renderFeedList(lines) {
  const list = document.getElementById("bsFeedList");
  list.innerHTML = "";
  lines.forEach((ln, i) => {
    const div = document.createElement("div");
    div.className = "bs-feed-line";
    div.id = `bsFeedLine_${i}`;
    div.innerHTML = `<span class="bs-step-num">${i + 1}</span><span>${ln.text}</span>`;
    list.appendChild(div);
  });
}

function runStep() {
  if (activeStep >= activeLines.length) return false;
  const stage = document.getElementById("bsStage");
  const attackerCard = document.getElementById("bsAttackerCard");
  const targetCard = document.getElementById("bsTargetCard");
  const arrow = document.getElementById("bsArrow");
  const hit = document.getElementById("bsHitWord");
  const dmg = document.getElementById("bsDamageWord");
  const status = document.getElementById("bsStatusWord");
  [stage, attackerCard, targetCard, arrow, hit, dmg, status].forEach(clearAnims);

  const line = activeLines[activeStep];
  const lineEl = document.getElementById(`bsFeedLine_${activeStep}`);
  if (lineEl) lineEl.classList.add("active");
  line.do();
  activeStep += 1;
  return true;
}

function finishBattle() {
  clearTimeout(activeTimer);
  activeTimer = null;
  document.getElementById("bsContinueBtn").disabled = false;
  setHtml("bsPhaseCard", `<strong>Resolution complete.</strong><span>Press Continue to return to the battlefield.</span>`);
}

function autoPlay(delayMs) {
  function tick() {
    if (!runStep()) { finishBattle(); return; }
    activeTimer = setTimeout(tick, delayMs);
  }
  activeTimer = setTimeout(tick, 200);
}

/**
 * Public API: show the battle screen and return a promise that resolves when dismissed.
 */
export function playBattle(snapshot) {
  const root = ensureDom();
  activeStep = 0;
  activeLines = buildFeed(snapshot);
  setStateCards(snapshot);
  renderFeedList(activeLines);
  document.getElementById("bsContinueBtn").disabled = activeLines.length === 0;
  root.classList.add("open");

  return new Promise(resolve => {
    resolveCurrent = () => {
      root.classList.remove("open");
      clearTimeout(activeTimer);
      activeTimer = null;
      resolveCurrent = null;
      resolve();
    };
    const playBtn = document.getElementById("bsPlayBtn");
    const stepBtn = document.getElementById("bsStepBtn");
    const skipBtn = document.getElementById("bsSkipBtn");
    const contBtn = document.getElementById("bsContinueBtn");
    const speedSel = document.getElementById("bsSpeed");
    playBtn.onclick = () => {
      if (activeStep === 0) {
        // start auto-play
        const delay = Number(speedSel.value) || 800;
        autoPlay(delay);
      }
    };
    stepBtn.onclick = () => {
      if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
      if (!runStep()) finishBattle();
    };
    skipBtn.onclick = () => {
      clearTimeout(activeTimer); activeTimer = null;
      while (runStep()) {}
      finishBattle();
    };
    contBtn.onclick = () => { if (resolveCurrent) resolveCurrent(); };

    // Auto-start playback after a moment so players don't have to click Play first
    autoPlay(Number(speedSel.value) || 800);
  });
}

/**
 * Build a snapshot from the engine's combatResult + state. Called by main.js.
 */
export function buildSnapshotFromCombatResult({
  combatResult,
  attackerBefore,
  targetBefore,
  targetAfter,
  attackDef,
  attackName,
  factionLabels
}) {
  const conditionsApplied = [];
  for (const c of (targetAfter.conditions ?? [])) {
    if (!(targetBefore.conditions ?? []).includes(c)) conditionsApplied.push(c);
  }
  return {
    attackType: attackDef.type,                   // melee | ranged | magic
    attacker: {
      id: attackerBefore.id,
      name: attackerBefore.name,
      classId: attackerBefore.classId,
      factionLabel: factionLabels[attackerBefore.owner],
      hpBefore: attackerBefore.health,
      hpMax: attackerBefore.maxHealth,
      readiness: attackerBefore.readiness,
      conditions: [...(attackerBefore.conditions ?? [])],
      attackName,
      isLeft: true
    },
    target: {
      id: targetBefore.id,
      name: targetBefore.name,
      classId: targetBefore.classId,
      factionLabel: factionLabels[targetBefore.owner],
      hpBefore: targetBefore.health,
      hpAfter: targetAfter.health,
      hpMax: targetBefore.maxHealth,
      readiness: targetAfter.readiness,
      conditions: [...(targetBefore.conditions ?? [])],
      conditionsAfter: [...(targetAfter.conditions ?? [])]
    },
    statusApplied: conditionsApplied,
    result: {
      hit: combatResult.hit,
      attackRoll: combatResult.attackRoll,
      dodgeResult: combatResult.dodgeResult,
      braceResult: combatResult.braceResult,
      baseDamage: combatResult.baseDamage,
      totalDamage: combatResult.totalDamage,
      actualDamage: combatResult.actualDamage,
      targetDefeated: combatResult.targetDefeated,
      critEffects: combatResult.critEffects ?? [],
      log: combatResult.log ?? []
    }
  };
}
