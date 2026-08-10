// tests/test-scenarios-pass.js
// PASS TESTING: All 4 scenarios with gold-standard performance
// Consolidates all 4 working test scenarios and runs them sequentially

import { ScenarioLoader } from "../core/ScenarioLoader.js";
import { ActionClassifier } from "../core/ActionClassifier.js";
import { DebriefingSystem } from "../core/DebriefingSystem.js";

const results = [];

console.log("\n" + "═".repeat(70));
console.log("PASS TESTING: GOLD STANDARD SCENARIOS");
console.log("All scenarios executed with correct clinical sequences");
console.log("═".repeat(70) + "\n");

// ============================================================================
// CARDIAC ARREST TEST
// ============================================================================
await (async () => {
  console.log("=== Cardiac Arrest Scenario: End-to-End Test ===\n");
  
  try {
    const loader = new ScenarioLoader("./scenarios", "./dialogue");
    const { psm, scenario } = await loader.load("cardiac-arrest-adult");
    console.log(`1. Loading scenario...\n   Loaded: ${scenario.scenarioName}\n   Initial rhythmState: ${psm.rhythmState}\n`);

    const classifier = new ActionClassifier(scenario.actions, "cardiac-arrest-adult");
    const debriefSystem = new DebriefingSystem();

    console.log("2. Starting simulation...");
    psm.start();

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

    console.log("3. Trainee interaction sequence:\n");

    const actionLog = {};
    let startTime = Date.now();

    for (const input of traineeInputs) {
      const elapsed = Date.now() - startTime;
      console.log(`  Trainee: "${input}"`);

      const stateForClassifier = {
        rhythmState: psm.rhythmState,
        simulationState: psm.simulationState,
        consciousness: psm.parameters?.consciousness?.value,
        oxygenSaturation: psm.parameters?.oxygenSaturation?.value,
        pulseRate: psm.parameters?.pulseRate?.value,
        perfusionPressure: psm.parameters?.perfusionPressure?.value
      };

      const classification = classifier.classifyInput(input, stateForClassifier);
      console.log(`  → Classified as: ${classification.actionId} (confidence: ${Math.round(classification.confidence)}%)`);

      if (classification.actionId) {
        const action = scenario.actions[classification.actionId];
        if (action) {
          psm.applyAction(classification.actionId);
          actionLog[classification.actionId] = { timestamp: elapsed, quality: classification.confidence / 100 };
          console.log(`  [action] ${action.label}`);
          console.log(`  Action applied: ✓`);
        }
      }

      const dialogue = scenario.dialogue?.responses?.[classification.actionId];
      if (dialogue) console.log(`  Patient: "${dialogue}"`);
      console.log();

      if (psm.rhythmState === "rosc") {
        console.log("  ⭐ ROSC achieved! Scenario ending.\n");
        break;
      }
    }

    psm.stop("manual_stop");

    console.log("4. Simulation state at end:");
    console.log(`   Rhythm: ${psm.rhythmState}`);
    console.log(`   Consciousness: ${psm.parameters?.consciousness?.value || 0}\n`);

    const finalState = {
      rhythmState: psm.rhythmState,
      consciousness: psm.parameters?.consciousness?.value,
      oxygenSaturation: psm.parameters?.oxygenSaturation?.value,
      bloodPressureSystolic: psm.parameters?.bloodPressureSystolic?.value
    };

    const debrief = debriefSystem.generateDebrief(psm.simulationState, actionLog, finalState, "cardiac-arrest-adult");

    console.log("DEBRIEF REPORT");
    console.log("═".repeat(70));
    console.log(`Overall Score: ${debrief.summary.overallScore}%\n`);

    results.push({ scenario: "Cardiac Arrest", score: debrief.summary.overallScore });

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    results.push({ scenario: "Cardiac Arrest", score: 0 });
  }
})();

// ============================================================================
// FRACTURED FEMUR TEST
// ============================================================================
await (async () => {
  console.log("=== Fractured Femur Scenario: End-to-End Test ===\n");
  
  try {
    const loader = new ScenarioLoader("./scenarios", "./dialogue");
    const { psm, scenario } = await loader.load("fractured-femur-adult");
    console.log(`1. Loading scenario...\n   Loaded: ${scenario.scenarioName}\n`);

    const classifier = new ActionClassifier(scenario.actions, "fractured-femur-adult");
    const debriefSystem = new DebriefingSystem();

    console.log("2. Starting simulation...");
    psm.start();

    const traineeInputs = [
      "Patient has severe right thigh pain from a fall",
      "I'm calling for senior trauma help",
      "Let me check the distal pulse first",
      "I can feel the pulse at the ankle",
      "Now I'll check for bleeding and circulation",
      "The limb is pale but perfusing",
      "I'm immobilising and padding the limb",
      "Attach monitoring to check vitals",
      "Apply high-flow oxygen to maintain SpO2",
      "Establish IV access for fluids and blood",
      "I'll prepare for handover to senior team"
    ];

    console.log("3. Trainee interaction sequence:\n");

    const actionLog = {};
    let startTime = Date.now();

    for (const input of traineeInputs) {
      const elapsed = Date.now() - startTime;
      console.log(`  Trainee: "${input}"`);

      const stateForClassifier = {
        rhythmState: psm.rhythmState,
        simulationState: psm.simulationState,
        consciousness: psm.parameters?.consciousness?.value,
        oxygenSaturation: psm.parameters?.oxygenSaturation?.value,
        bloodPressureSystolic: psm.parameters?.bloodPressureSystolic?.value
      };

      const classification = classifier.classifyInput(input, stateForClassifier);
      console.log(`  → Classified as: ${classification.actionId} (confidence: ${Math.round(classification.confidence)}%)`);

      if (classification.actionId) {
        const action = scenario.actions[classification.actionId];
        if (action) {
          psm.applyAction(classification.actionId);
          actionLog[classification.actionId] = { timestamp: elapsed, quality: 0.85 };
          console.log(`  [action] ${action.label}`);
          console.log(`  Action applied: ✓`);
        }
      }

      const dialogue = scenario.dialogue?.responses?.[classification.actionId];
      if (dialogue) console.log(`  Patient: "${dialogue}"`);
      console.log();
    }

    psm.stop("manual_stop");

    console.log("4. Simulation state at end:");
    console.log(`   Consciousness: ${psm.parameters?.consciousness?.value || 0}\n`);

    const finalState = {
      consciousness: psm.parameters?.consciousness?.value,
      oxygenSaturation: psm.parameters?.oxygenSaturation?.value,
      bloodPressureSystolic: psm.parameters?.bloodPressureSystolic?.value
    };

    const debrief = debriefSystem.generateDebrief(psm.simulationState, actionLog, finalState, "fractured-femur-adult");

    console.log("DEBRIEF REPORT");
    console.log("═".repeat(70));
    console.log(`Overall Score: ${debrief.summary.overallScore}%\n`);

    results.push({ scenario: "Fractured Femur", score: debrief.summary.overallScore });

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    results.push({ scenario: "Fractured Femur", score: 0 });
  }
})();

// ============================================================================
// SEPSIS TEST
// ============================================================================
await (async () => {
  console.log("=== Sepsis Scenario: End-to-End Test ===\n");
  
  try {
    const loader = new ScenarioLoader("./scenarios", "./dialogue");
    const { psm, scenario } = await loader.load("sepsis-adult");
    console.log(`1. Loading scenario...\n   Loaded: ${scenario.scenarioName}\n`);

    const classifier = new ActionClassifier(scenario.actions, "sepsis-adult");
    const debriefSystem = new DebriefingSystem();

    console.log("2. Starting simulation...");
    psm.start();

    const traineeInputs = [
      "This patient looks very unwell. I'm calling for senior help",
      "I'll attach the monitoring equipment to check vitals",
      "Let me take blood cultures before antibiotics",
      "Apply high-flow oxygen to maintain SpO2",
      "I need to establish IV access",
      "Administer broad-spectrum antibiotics immediately",
      "Give IV fluid resuscitation",
      "Monitor urine output closely",
      "Escalate to critical care"
    ];

    console.log("3. Trainee interaction sequence:\n");

    const actionLog = {};
    let startTime = Date.now();

    for (const input of traineeInputs) {
      const elapsed = Date.now() - startTime;
      console.log(`  Trainee: "${input}"`);

      const stateForClassifier = {
        rhythmState: psm.rhythmState,
        simulationState: psm.simulationState,
        consciousness: psm.parameters?.consciousness?.value,
        oxygenSaturation: psm.parameters?.oxygenSaturation?.value,
        bloodPressureSystolic: psm.parameters?.bloodPressureSystolic?.value
      };

      const classification = classifier.classifyInput(input, stateForClassifier);
      console.log(`  → Classified as: ${classification.actionId} (confidence: ${Math.round(classification.confidence)}%)`);

      if (classification.actionId) {
        const action = scenario.actions[classification.actionId];
        if (action) {
          psm.applyAction(classification.actionId);
          actionLog[classification.actionId] = { timestamp: elapsed, quality: 0.85 };
          console.log(`  [action] ${action.label}`);
          console.log(`  Action applied: ✓`);
        }
      }

      const dialogue = scenario.dialogue?.responses?.[classification.actionId];
      if (dialogue) console.log(`  Patient: "${dialogue}"`);
      console.log();
    }

    psm.stop("manual_stop");

    console.log("4. Simulation state at end:");
    console.log(`   Consciousness: ${psm.parameters?.consciousness?.value || 0}\n`);

    const finalState = {
      consciousness: psm.parameters?.consciousness?.value,
      oxygenSaturation: psm.parameters?.oxygenSaturation?.value,
      bloodPressureSystolic: psm.parameters?.bloodPressureSystolic?.value
    };

    const debrief = debriefSystem.generateDebrief(psm.simulationState, actionLog, finalState, "sepsis-adult");

    console.log("DEBRIEF REPORT");
    console.log("═".repeat(70));
    console.log(`Overall Score: ${debrief.summary.overallScore}%\n`);

    results.push({ scenario: "Sepsis", score: debrief.summary.overallScore });

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    results.push({ scenario: "Sepsis", score: 0 });
  }
})();

// ============================================================================
// ANAPHYLAXIS TEST
// ============================================================================
await (async () => {
  console.log("=== Anaphylaxis Scenario: End-to-End Test ===\n");
  
  try {
    const loader = new ScenarioLoader("./scenarios", "./dialogue");
    const { psm, scenario } = await loader.load("anaphylaxis-paediatric");
    console.log(`1. Loading scenario...\n   Loaded: ${scenario.scenarioName}\n`);

    const classifier = new ActionClassifier(scenario.actions, "anaphylaxis-paediatric");
    const debriefSystem = new DebriefingSystem();

    console.log("2. Starting simulation...");
    psm.start();

    const traineeInputs = [
      "This child has anaphylaxis — I recognise the throat tightness and rash",
      "Call for senior help immediately",
      "I'm giving IM adrenaline into the anterolateral thigh",
      "Apply high-flow oxygen through a mask",
      "Attach cardiac monitoring",
      "Position the child lying flat",
      "Establish IV access if trained and time permits",
      "Prepare for observation and repeat adrenaline if needed"
    ];

    console.log("3. Trainee interaction sequence:\n");

    const actionLog = {};
    let startTime = Date.now();

    for (const input of traineeInputs) {
      const elapsed = Date.now() - startTime;
      console.log(`  Trainee: "${input}"`);

      const stateForClassifier = {
        rhythmState: psm.rhythmState,
        simulationState: psm.simulationState,
        consciousness: psm.parameters?.consciousness?.value,
        oxygenSaturation: psm.parameters?.oxygenSaturation?.value,
        pulseRate: psm.parameters?.pulseRate?.value
      };

      const classification = classifier.classifyInput(input, stateForClassifier);
      console.log(`  → Classified as: ${classification.actionId} (confidence: ${Math.round(classification.confidence)}%)`);

      if (classification.actionId) {
        const action = scenario.actions[classification.actionId];
        if (action) {
          psm.applyAction(classification.actionId);
          actionLog[classification.actionId] = { timestamp: elapsed, quality: 0.85 };
          console.log(`  [action] ${action.label}`);
          console.log(`  Action applied: ✓`);
        }
      }

      const dialogue = scenario.dialogue?.responses?.[classification.actionId];
      if (dialogue) console.log(`  Patient: "${dialogue}"`);
      console.log();
    }

    psm.stop("manual_stop");

    console.log("4. Simulation state at end:");
    console.log(`   Consciousness: ${psm.parameters?.consciousness?.value || 0}\n`);

    const finalState = {
      consciousness: psm.parameters?.consciousness?.value,
      oxygenSaturation: psm.parameters?.oxygenSaturation?.value,
      pulseRate: psm.parameters?.pulseRate?.value
    };

    const debrief = debriefSystem.generateDebrief(psm.simulationState, actionLog, finalState, "anaphylaxis-paediatric");

    console.log("DEBRIEF REPORT");
    console.log("═".repeat(70));
    console.log(`Overall Score: ${debrief.summary.overallScore}%\n`);

    results.push({ scenario: "Anaphylaxis", score: debrief.summary.overallScore });

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    results.push({ scenario: "Anaphylaxis", score: 0 });
  }
})();

// ============================================================================
// SUMMARY
// ============================================================================
console.log("═".repeat(70));
console.log("PASS TESTING SUMMARY");
console.log("═".repeat(70));
results.forEach(r => {
  console.log(`${r.scenario.padEnd(20)}: ${r.score}%`);
});
console.log("═".repeat(70));
console.log("✅ All tests completed.\n");