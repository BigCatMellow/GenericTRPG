// v0.12 Readiness management
// States: "ready" | "committed" | "spent"

import { breakGuarded } from "./conditions.js";

export function activationReadinessCost(character, holdMode = false) {
  // Hold: readiness unchanged
  if (holdMode) return character.readiness;
  // Activating normally: Ready -> Committed; otherwise stays same
  if (character.readiness === "ready") return "committed";
  return character.readiness;
}

export function applyActivationReadiness(character, holdMode = false) {
  if (holdMode) return; // Hold: unchanged
  if (character.readiness === "ready") character.readiness = "committed";
  // committed and spent stay the same when activating normally
}

export function applyRunReadiness(character) {
  character.readiness = "spent";
  breakGuarded(character);
}

/** Heavy attack readiness: -> Spent unless target was Spent/Pinned/Exposed/Overwhelmed AND hit -> Committed */
export function applyHeavyAttackReadiness(character, pressuredTargetWasHit = false) {
  if (pressuredTargetWasHit) {
    character.readiness = "committed";
  } else {
    character.readiness = "spent";
  }
  breakGuarded(character);
}

export function spendReactionReadiness(character) {
  if (character.readiness === "ready") character.readiness = "committed";
  else if (character.readiness === "committed") character.readiness = "spent";
  character.reactionUsedThisRound = true;
}

/** Recover action: Spent->Committed or Committed->Ready */
export function applyRecoverReadiness(character) {
  if (character.readiness === "spent") character.readiness = "committed";
  else if (character.readiness === "committed") character.readiness = "ready";
}

/** End of round cleanup */
export function endRoundReadinessCleanup(character) {
  if (character.readiness === "committed") character.readiness = "ready";
  else if (character.readiness === "spent") character.readiness = "committed";
  // ready stays ready
  character.reactionUsedThisRound = false;
  character.activatedThisRound = false;
  character.movementUsed = false;
  character.actionUsed = false;
  character.ranThisActivation = false;
}

export function improveReadiness(character) {
  if (character.readiness === "spent") character.readiness = "committed";
  else if (character.readiness === "committed") character.readiness = "ready";
}

export function setReadiness(character, readiness) {
  character.readiness = readiness;
}
