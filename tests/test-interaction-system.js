// tests/test-interaction-system.js
// Verifies InteractionSystem: category grouping/ordering, precondition-aware
// action filtering, site validation, capture-type detection, and that
// select() resolves through PatientStateModel#applyAction exactly like a
// direct call would — including the new site param and canApplyAction().

import { loadScenarioSync } from "./testHelpers.js";
import { PatientStateModel } from "../core/PatientStateModel.js";
import { InteractionSystem, CATEGORY_ORDER } from "../core/InteractionSystem.js";

let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ ${message}`);
    failures++;
  }
}

console.log("\n" + "═".repeat(70));
console.log("InteractionSystem test suite");
console.log("═".repeat(70) + "\n");

// ============================================================================
// Categories: presence, ordering, and canonical vocabulary
// ============================================================================
console.log("=== Category listing ===\n");
{
  const cardiac = new InteractionSystem(new PatientStateModel(loadScenarioSync("cardiac-arrest-adult")));
  const femur = new InteractionSystem(new PatientStateModel(loadScenarioSync("fractured-femur-adult")));

  const cardiacCategories = cardiac.getCategories();
  assert(cardiacCategories.includes("Circulation"), "cardiac arrest scenario includes Circulation category");
  assert(!cardiacCategories.includes("Unsafe"), "cardiac arrest scenario (no dangerousTestAction entries) has no Unsafe category");
  assert(
    cardiacCategories.every((c, i) => i === 0 || CATEGORY_ORDER.indexOf(c) > CATEGORY_ORDER.indexOf(cardiacCategories[i - 1])),
    "categories are returned in canonical CATEGORY_ORDER, not JSON insertion order"
  );

  const femurCategories = femur.getCategories();
  assert(femurCategories.includes("Unsafe"), "femur scenario (has dangerousTestAction entries) includes Unsafe category");
  assert(femurCategories.includes("Stabilisation"), "femur scenario includes Stabilisation category");
}

// ============================================================================
// Action filtering: allowed/blocked with reason, before and after start()
// ============================================================================
console.log("\n=== Precondition-aware action filtering ===\n");
{
  const scenario = loadScenarioSync("cardiac-arrest-adult");
  const psm = new PatientStateModel(scenario);
  const interaction = new InteractionSystem(psm);

  const beforeStart = interaction.getActionsForCategory("Circulation").find(a => a.id === "cprCompressions");
  assert(beforeStart.allowed === false, "cprCompressions is blocked before the scenario has started");
  assert(typeof beforeStart.reason === "string" && beforeStart.reason.length > 0, "blocked action carries a human-readable reason");

  psm.start();

  const cpr = interaction.getActionsForCategory("Circulation").find(a => a.id === "cprCompressions");
  assert(cpr.allowed === true, "cprCompressions is allowed once running and rhythmState is 'arrest'");

  const shock = interaction.getActionsForCategory("Circulation").find(a => a.id === "shockIfAdvised");
  assert(shock.allowed === false, "shockIfAdvised is blocked before AED pads are applied");

  interaction.select("applyAEDPads");
  const shockAfterPads = interaction.getActionsForCategory("Circulation").find(a => a.id === "shockIfAdvised");
  assert(shockAfterPads.allowed === true, "shockIfAdvised becomes allowed once AED pads are applied");

  psm.stop();
}

// ============================================================================
// Capture-type actions (CPR) — no site, quality passed straight through
// ============================================================================
console.log("\n=== Capture-type actions ===\n");
{
  const scenario = loadScenarioSync("cardiac-arrest-adult");
  const psm = new PatientStateModel(scenario);
  const interaction = new InteractionSystem(psm);
  psm.start();

  assert(interaction.isCaptureAction("cprCompressions") === true, "cprCompressions is flagged as a capture-type action");
  assert(interaction.isCaptureAction("checkResponse") === false, "checkResponse is not a capture-type action");
  assert(interaction.getSitesForAction("cprCompressions") === null, "cprCompressions has no validSites (not a site-specific action)");

  const result = interaction.select("cprCompressions", { quality: 0.82 });
  assert(result.ok === true, "cprCompressions selection succeeds");
  assert(Math.abs(result.quality - 0.82) < 1e-9, "captured quality (e.g. from CPRQualityAnalyzer) is passed straight through to applyAction");

  psm.stop();
}

// ============================================================================
// Site-specific actions — validation, rejection, and history logging
// ============================================================================
console.log("\n=== Site-specific actions ===\n");
{
  const scenario = loadScenarioSync("anaphylaxis-paediatric");
  const psm = new PatientStateModel(scenario);
  const interaction = new InteractionSystem(psm);
  psm.start();

  const sites = interaction.getSitesForAction("giveIMAdrenaline");
  assert(Array.isArray(sites) && sites.includes("leftThigh") && sites.includes("rightThigh"), "giveIMAdrenaline exposes leftThigh/rightThigh as valid sites");

  const invalidSite = interaction.select("giveIMAdrenaline", { site: "leftArm" });
  assert(invalidSite.ok === false && invalidSite.outcome === "invalid_site", "selecting an invalid site is rejected with outcome 'invalid_site'");

  const blockedByState = interaction.select("giveIMAdrenaline", { site: "leftThigh" });
  assert(blockedByState.ok === false && blockedByState.outcome === "required_state_failed", "valid site still blocked by requiresState (anaphylaxisRecognised) until recognised");

  interaction.select("recogniseAnaphylaxis");
  const applied = interaction.select("giveIMAdrenaline", { site: "leftThigh" });
  assert(applied.ok === true, "giveIMAdrenaline succeeds once recognised and given a valid site");
  assert(applied.site === "leftThigh", "result carries the site it was applied to");

  const logged = psm.history.find(entry => entry.type === "action" && entry.action === "giveIMAdrenaline" && entry.outcome === "applied");
  assert(!!logged, "history contains the successful giveIMAdrenaline entry");
  assert(logged?.site === "leftThigh", "history entry records the site the action was applied to");

  psm.stop();
}

// ============================================================================
// Unknown action handling
// ============================================================================
console.log("\n=== Unknown actions ===\n");
{
  const scenario = loadScenarioSync("cardiac-arrest-adult");
  const psm = new PatientStateModel(scenario);
  const interaction = new InteractionSystem(psm);

  assert(interaction.getAction("notARealAction") === null, "getAction returns null for an action id not in the scenario");

  psm.start();
  const result = interaction.select("notARealAction");
  assert(result.ok === false && result.outcome === "unknown_action", "select() on an unknown action returns outcome 'unknown_action'");
  psm.stop();
}

// ============================================================================
console.log("\n" + "═".repeat(70));
if (failures > 0) {
  console.error(`${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log("All InteractionSystem assertions passed.");
}
console.log("═".repeat(70) + "\n");
