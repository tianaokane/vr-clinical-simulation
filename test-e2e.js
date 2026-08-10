// test-e2e.js
// Walk through a cardiac arrest scenario end-to-end.
// Load scenario → init PSM + dialogue → trainee acts → state updates → patient responds.

import { ScenarioLoader } from "./core/ScenarioLoader.js";
import { ActionClassifier } from "./core/ActionClassifier.js";
import { DialogueEngine } from "./core/DialogueEngine.js";

async function runScenarioTest() {
  console.log("=== Cardiac Arrest Scenario: End-to-End Test ===\n");

  // Step 1: Load scenario + dialogue
  console.log("1. Loading scenario...");
  const loader = new ScenarioLoader("./scenarios", "./dialogue");
  const { scenario, dialogue, psm } = await loader.load("cardiac-arrest-adult");

  console.log(`   Loaded: ${scenario.scenarioName}`);
  console.log(`   Scope: ${scenario.clinicalScope}`);
  console.log(`   Initial rhythmState: ${psm.rhythmState}\n`);

  // Step 2: Init dialogue engine + action classifier
  const dialogueEngine = new DialogueEngine(dialogue);
  const actionClassifier = new ActionClassifier(scenario.actions);

  // Step 3: Start the simulation
  console.log("2. Starting simulation...");
  psm.start();

  // Step 4: Simulate a trainee interaction sequence
  console.log("3. Trainee interaction sequence:\n");

  // These are realistic trainee inputs. ActionClassifier will map them to actions.
  const traineeInputs = [
    "Check if he's responsive",
    "Call for help",
    "I'll open the airway",
    "He's not breathing normally",
    "Start CPR",
    "Keep going with compressions",
    "Apply the AED pads",
    "Shock advised — deliver shock",
    "Continue CPR after shock"
  ];

  for (const input of traineeInputs) {
    console.log(`\n  Trainee: "${input}"`);

    // Classify the input to an action
    const stateForClassifier = {
  rhythmState: psm.rhythmState,
  simulationState: psm.simulationState,
  consciousness: psm.parameters?.consciousness?.value,
  respiratoryRate: psm.parameters?.respiratoryRate?.value,
  pulseRate: psm.parameters?.pulseRate?.value
};
const classification = actionClassifier.classifyInput(input, stateForClassifier);

    console.log(`  → Classified as: ${classification.actionId} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`);

    if (!classification.allowed) {
  console.log(`     ⚠ Precondition not met: ${classification.reason}`);
  continue;
}

// Apply the action to PSM if allowed
if (classification.actionId) {
  const qualityScore = 0.85;
  const actionResult = psm.applyAction(classification.actionId, qualityScore);
      console.log(`     Action applied: ${actionResult.ok ? "✓" : "✗"}`);
      if (actionResult.effects) {
        console.log(`     State changes: ${JSON.stringify(actionResult.effects)}`);
      }
    }

    // Get patient's dialogue response
    const patientResponse = dialogueEngine.respondToTrainee(input, stateForClassifier);
    if (patientResponse) {
      console.log(`  Patient: "${patientResponse}"`);
    } else {
      console.log(`  Patient: [No response — unresponsive]`);
    }

    // Check if scenario ended (ROSC achieved)
    if (psm.rhythmState === "rosc") {
      console.log("\n  ⭐ ROSC achieved! Scenario ending.");
      break;
    }
  }

  // Step 5: Final state
  console.log("\n4. Simulation state at end:");
  console.log(`   Rhythm: ${psm.rhythmState}`);
  console.log(`   Consciousness: ${psm.parameters?.consciousness?.value?.toFixed(2) || "N/A"}`);
  console.log(`   SpO₂: ${psm.parameters?.oxygenSaturation?.value?.toFixed(1) || "N/A"}%`);
  console.log(`   BP Systolic: ${psm.parameters?.bloodPressureSystolic?.value?.toFixed(0) || "N/A"} mmHg`);

  // Stop the simulation
  psm.stop();
  console.log("\n✓ Test complete.");
}

// Run it
runScenarioTest().catch(err => {
  console.error("Test failed:", err.message);
  process.exit(1);
});