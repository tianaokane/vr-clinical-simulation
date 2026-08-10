// test-debrief.js
// Runs a cardiac arrest scenario and generates a full debrief report.
// Shows how DebriefingSystem analyzes performance and provides learning feedback.

import { ScenarioLoader } from "./core/ScenarioLoader.js";
import { ActionClassifier } from "./core/ActionClassifier.js";
import { DialogueEngine } from "./core/DialogueEngine.js";
import { DebriefingSystem } from "./core/DebriefingSystem.js";

async function runDebriefTest() {
  console.log("=== Cardiac Arrest Scenario + Debriefing ===\n");

  // Load scenario
  console.log("Loading scenario...");
  const loader = new ScenarioLoader("./scenarios", "./dialogue");
  const { scenario, dialogue, psm } = await loader.load("cardiac-arrest-adult");

  console.log(`Scenario: ${scenario.scenarioName}\n`);

  // Initialize systems
  const dialogueEngine = new DialogueEngine(dialogue);
  const actionClassifier = new ActionClassifier(scenario.actions);
  const debriefingSystem = new DebriefingSystem(scenario);

  // Track action log for debrief
  const actionLog = {};
  const actionTimestamps = {};
  let startTime = Date.now();

  // Start simulation
  psm.start();

  // Simulate trainee actions
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

  console.log("Scenario in progress...\n");

  for (const input of traineeInputs) {
    const elapsed = Date.now() - startTime;

    const stateForClassifier = {
      rhythmState: psm.rhythmState,
      simulationState: psm.simulationState,
      consciousness: psm.parameters?.consciousness?.value,
      respiratoryRate: psm.parameters?.respiratoryRate?.value,
      pulseRate: psm.parameters?.pulseRate?.value
    };

    const classification = actionClassifier.classifyInput(input, stateForClassifier);

    if (classification.allowed && classification.actionId) {
      const qualityScore = 0.85;
      const actionResult = psm.applyAction(classification.actionId, qualityScore);

      if (actionResult.ok) {
        // Record action in log for debrief
        actionLog[classification.actionId] = {
          label: actionResult.label,
          timestamp: elapsed,
          quality: qualityScore,
          effects: actionResult.effects
        };
        actionTimestamps[classification.actionId] = elapsed;
      }
    }

    // Check if scenario ended
    if (psm.rhythmState === "rosc") {
      console.log(`  ⭐ ROSC achieved at ${elapsed}ms\n`);
      break;
    }
  }

  // Get final state
  const finalState = {
    rhythmState: psm.rhythmState,
    consciousness: psm.parameters?.consciousness?.value || 0,
    oxygenSaturation: psm.parameters?.oxygenSaturation?.value || 0,
    bloodPressureSystolic: psm.parameters?.bloodPressureSystolic?.value || 0
  };

  psm.stop();

  // Generate debrief
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("DEBRIEF REPORT");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const debrief = debriefingSystem.generateDebrief({}, actionLog, finalState, "cardiac-arrest-adult");

  // Display debrief
  console.log(`Overall Score: ${debrief.summary.overallScore}%`);
  console.log(`Competency: ${debrief.competencyLevel.label}`);
  console.log(`\n${debrief.competencyLevel.description}\n`);

  // Score breakdown
  console.log("Performance by Area:");
  console.log(`  Timing:    ${debrief.scores.timing}%`);
  console.log(`  Sequence:  ${debrief.scores.sequence}%`);
  console.log(`  Technique: ${debrief.scores.technique}%`);
  console.log(`  Outcome:   ${debrief.scores.outcome}%\n`);

  // Learning points
  if (debrief.learningPoints.length > 0) {
    const strengths = debrief.learningPoints.filter(p => p.category === "strength");
    const concerns = debrief.learningPoints.filter(p => p.category !== "strength");

    if (strengths.length > 0) {
      console.log("✓ What You Did Well:");
      for (const point of strengths) {
        console.log(`  • ${point.point}`);
        console.log(`    ${point.guidance}\n`);
      }
    }

    if (concerns.length > 0) {
      console.log("⚠ Areas for Improvement:");
      for (const point of concerns) {
        const severity = point.severity === "high" ? "🔴" : "🟡";
        console.log(`  ${severity} ${point.point} (${point.severity} priority)`);
        console.log(`     Guidance: ${point.guidance}`);
        if (point.target) {
          console.log(`     Target: ${point.target}`);
        }
        console.log();
      }
    }
  }

  // Next steps
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Next Steps:");
  const nextSteps = debriefingSystem._getNextStepsGuidance(debrief.competencyLevel.level);
  console.log(`  ${nextSteps}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Final vitals
  console.log("Final Patient State:");
  console.log(`  Rhythm: ${finalState.rhythmState}`);
  console.log(`  Consciousness: ${finalState.consciousness.toFixed(2)}`);
  console.log(`  SpO₂: ${finalState.oxygenSaturation.toFixed(1)}%`);
  console.log(`  BP Systolic: ${finalState.bloodPressureSystolic.toFixed(0)} mmHg\n`);

  console.log("✓ Debrief complete.\n");
}

runDebriefTest().catch(err => {
  console.error("Test failed:", err.message);
  process.exit(1);
});