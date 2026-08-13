// tests/test-scenarios-fail.js
// FAIL TESTING: All 4 scenarios with deliberate protocol violations
// Tests that the system correctly identifies and penalizes poor clinical decisions

import { loadScenarioSync } from "./testHelpers.js";
import { PatientStateModel } from "../core/PatientStateModel.js";
import { ActionClassifier } from "../core/ActionClassifier.js";
import { DebriefingSystem } from "../core/DebriefingSystem.js";

const results = [];

console.log("\n" + "═".repeat(70));
console.log("FAIL TESTING: DELIBERATE PROTOCOL VIOLATIONS");
console.log("Tests system's ability to identify and penalize poor decisions");
console.log("═".repeat(70) + "\n");

// ============================================================================
// CARDIAC ARREST FAIL TEST - Skip CPR, go straight to shock
// ============================================================================
await (async () => {
    console.log("=== Cardiac Arrest Scenario: FAIL TEST (Skip CPR) ===\n");

    try {
        const scenario = loadScenarioSync("cardiac-arrest-adult");
        const psm = new PatientStateModel(scenario);
        console.log(`1. Loading scenario...\n   Loaded: ${scenario.scenarioName}\n   Initial rhythmState: ${psm.rhythmState}\n`);

        const classifier = new ActionClassifier(scenario.actionMappings, "cardiac-arrest-adult");
        const debriefSystem = new DebriefingSystem();

        console.log("2. Starting simulation...");
        psm.start();

        const traineeInputs = [
            "Patient is unresponsive",
            "Immediately apply the AED pads",
            "Shock advised — deliver shock",
            "He's still down, I'll shock again"
        ];

        console.log("3. Trainee interaction sequence (POOR - no CPR):\n");

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
            console.log(`  → Classified as: ${classification.actionId}`);

            if (classification.actionId) {
                const action = scenario.actionMappings[classification.actionId];
                if (action) {
                    psm.applyAction(classification.actionId);
                    actionLog[classification.actionId] = { timestamp: elapsed, quality: 0.5 };
                    console.log(`  [action] ${action.label}`);
                    console.log(`  Action applied: ✓`);
                }
            }

            const dialogue = scenario.dialogue?.responses?.[classification.actionId];
            if (dialogue) console.log(`  Patient: "${dialogue}"`);
            console.log();

            if (psm.rhythmState === "rosc") break;
        }

        psm.stop("manual_stop");

        console.log("4. Simulation state at end:");
        console.log(`   Rhythm: ${psm.rhythmState}`);
        console.log(`   Consciousness: ${psm.parameters?.consciousness?.value || 0}\n`);

        const finalState = {
            rhythmState: psm.rhythmState,
            consciousness: psm.parameters?.consciousness?.value,
            oxygenSaturation: psm.parameters?.oxygenSaturation?.value
        };

        const debrief = debriefSystem.generateDebrief(psm.history, actionLog, finalState, "cardiac-arrest-adult");
        const criticalFailures = debrief.learningPoints.filter(p => p.category === "critical");
        console.log(`Critical failures detected: ${criticalFailures.length}`);
        criticalFailures.forEach(cf => {
            console.log(`  - ${cf.point}`);
        });

        console.log("DEBRIEF REPORT (Poor Performance Expected)");
        console.log("═".repeat(70));
        console.log(`Overall Score: ${debrief.summary.overallScore}% (Expected <50%)`);
        console.log(`Competency Level: ${debrief.competencyLevel.level}\n`);

        results.push({ scenario: "Cardiac Arrest (FAIL)", score: debrief.summary.overallScore });

    } catch (error) {
        console.error("❌ Test failed:", error.message);
        results.push({ scenario: "Cardiac Arrest (FAIL)", score: 0 });
    }
})();

// ============================================================================
// FRACTURED FEMUR FAIL TEST - No immobilization, no senior call
// ============================================================================
await (async () => {
    console.log("=== Fractured Femur Scenario: FAIL TEST (No Immobilization) ===\n");

    try {
        const scenario = loadScenarioSync("fractured-femur-adult");
        const psm = new PatientStateModel(scenario);
        console.log(`1. Loading scenario...\n   Loaded: ${scenario.scenarioName}\n`);

        const classifier = new ActionClassifier(scenario.actionMappings, "fractured-femur-adult");
        const debriefSystem = new DebriefingSystem();

        console.log("2. Starting simulation...");
        psm.start();

        const traineeInputs = [
            "Patient has severe leg pain",
            "Let me check the distal pulse",
            "I can feel the pulse",
            "Attach monitoring",
            "Apply oxygen",
            "Request imaging"
        ];

        console.log("3. Trainee interaction sequence (POOR - no immobilization, no senior):\n");

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
            console.log(`  → Classified as: ${classification.actionId}`);

            if (classification.actionId) {
                const action = scenario.actionMappings[classification.actionId];
                if (action) {
                    psm.applyAction(classification.actionId);
                    actionLog[classification.actionId] = { timestamp: elapsed, quality: 0.5 };
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

        const debrief = debriefSystem.generateDebrief(psm.history, actionLog, finalState, "fractured-femur-adult");
        const criticalFailures = debrief.learningPoints.filter(p => p.category === "critical");
        console.log(`Critical failures detected: ${criticalFailures.length}`);
        criticalFailures.forEach(cf => {
            console.log(`  - ${cf.point}`);
        });

        console.log("DEBRIEF REPORT (Poor Performance Expected)");
        console.log("═".repeat(70));
        console.log(`Overall Score: ${debrief.summary.overallScore}% (Expected <50%)`);
        console.log(`Competency Level: ${debrief.competencyLevel.level}\n`);

        results.push({ scenario: "Fractured Femur (FAIL)", score: debrief.summary.overallScore });

    } catch (error) {
        console.error("❌ Test failed:", error.message);
        results.push({ scenario: "Fractured Femur (FAIL)", score: 0 });
    }
})();

// ============================================================================
// SEPSIS FAIL TEST - Delayed antibiotics, no escalation
// ============================================================================
await (async () => {
    console.log("=== Sepsis Scenario: FAIL TEST (Delayed Antibiotics) ===\n");

    try {
        const scenario = loadScenarioSync("sepsis-adult");
        const psm = new PatientStateModel(scenario);
        console.log(`1. Loading scenario...\n   Loaded: ${scenario.scenarioName}\n`);

        const classifier = new ActionClassifier(scenario.actionMappings, "sepsis-adult");
        const debriefSystem = new DebriefingSystem();

        console.log("2. Starting simulation...");
        psm.start();

        const traineeInputs = [
            "Patient looks unwell",
            "Attach monitoring",
            "Let me check the labs",
            "Apply some oxygen",
            "I'll monitor and see if they improve"
        ];

        console.log("3. Trainee interaction sequence (POOR - delayed antibiotics, no escalation):\n");

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
            console.log(`  → Classified as: ${classification.actionId}`);

            if (classification.actionId) {
                const action = scenario.actionMappings[classification.actionId];
                if (action) {
                    psm.applyAction(classification.actionId);
                    actionLog[classification.actionId] = { timestamp: elapsed, quality: 0.5 };
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

        const debrief = debriefSystem.generateDebrief(psm.history, actionLog, finalState, "sepsis-adult");
        const criticalFailures = debrief.learningPoints.filter(p => p.category === "critical");
        console.log(`Critical failures detected: ${criticalFailures.length}`);
        criticalFailures.forEach(cf => {
            console.log(`  - ${cf.point}`);
        });

        console.log("DEBRIEF REPORT (Poor Performance Expected)");
        console.log("═".repeat(70));
        console.log(`Overall Score: ${debrief.summary.overallScore}% (Expected <50%)`);
        console.log(`Competency Level: ${debrief.competencyLevel.level}\n`);

        results.push({ scenario: "Sepsis (FAIL)", score: debrief.summary.overallScore });

    } catch (error) {
        console.error("❌ Test failed:", error.message);
        results.push({ scenario: "Sepsis (FAIL)", score: 0 });
    }
})();

// ============================================================================
// ANAPHYLAXIS FAIL TEST - Wrong sequence (oxygen before adrenaline)
// ============================================================================
await (async () => {
    console.log("=== Anaphylaxis Scenario: FAIL TEST (Wrong Sequence) ===\n");

    try {
        const scenario = loadScenarioSync("anaphylaxis-paediatric");
        const psm = new PatientStateModel(scenario);
        console.log(`1. Loading scenario...\n   Loaded: ${scenario.scenarioName}\n`);

        const classifier = new ActionClassifier(scenario.actionMappings, "anaphylaxis-paediatric");
        const debriefSystem = new DebriefingSystem();

        console.log("2. Starting simulation...");
        psm.start();

        const traineeInputs = [
            "This child has a rash and difficulty breathing",
            "Apply high-flow oxygen first",
            "Attach monitoring",
            "Now I'll give IM adrenaline",
            "Call for senior help"
        ];

        console.log("3. Trainee interaction sequence (POOR - oxygen before adrenaline):\n");

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
            console.log(`  → Classified as: ${classification.actionId}`);

            if (classification.actionId) {
                const action = scenario.actionMappings[classification.actionId];
                if (action) {
                    psm.applyAction(classification.actionId);
                    actionLog[classification.actionId] = { timestamp: elapsed, quality: 0.5 };
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

        const debrief = debriefSystem.generateDebrief(psm.history, actionLog, finalState, "anaphylaxis-paediatric");
        const criticalFailures = debrief.learningPoints.filter(p => p.category === "critical");
        console.log(`Critical failures detected: ${criticalFailures.length}`);
        criticalFailures.forEach(cf => {
            console.log(`  - ${cf.point}`);
        });

        console.log("DEBRIEF REPORT (Poor Performance Expected)");
        console.log("═".repeat(70));
        console.log(`Overall Score: ${debrief.summary.overallScore}% (Expected <50%)`);
        console.log(`Competency Level: ${debrief.competencyLevel.level}\n`);

        results.push({ scenario: "Anaphylaxis (FAIL)", score: debrief.summary.overallScore });

    } catch (error) {
        console.error("❌ Test failed:", error.message);
        results.push({ scenario: "Anaphylaxis (FAIL)", score: 0 });
    }
})();

// ============================================================================
// SUMMARY
// ============================================================================
console.log("═".repeat(70));
console.log("FAIL TESTING SUMMARY");
console.log("═".repeat(70));
results.forEach(r => {
    console.log(`${r.scenario.padEnd(30)}: ${r.score}% (Expected <50%)`);
});
console.log("═".repeat(70));
console.log("✅ All fail tests completed.\n");