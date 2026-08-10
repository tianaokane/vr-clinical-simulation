// core/ScenarioLoader.js
// Loads scenario + dialogue files and wires up PSM ready to run.
// Nothing fancy — just handles file fetching, error handling, and returns structured data.

import { PatientStateModel } from "./PatientStateModel.js";
import fs from 'fs/promises';

export class ScenarioLoader {
  constructor(basePathScenarios = "./scenarios", basePathDialogue = "./dialogue") {
    this.basePathScenarios = basePathScenarios;
    this.basePathDialogue = basePathDialogue;
  }

  // Main entry point. Pass scenario ID (e.g. "cardiac-arrest-adult") and get back a ready-to-use object.
  async load(scenarioId) {
    try {
      const scenario = await this._fetchJSON(`${this.basePathScenarios}/${scenarioId}.json`);
      const dialogue = await this._fetchJSON(`${this.basePathDialogue}/${scenarioId}-dialogue.json`);

      // Validate before we go further. If required fields are missing, catch it now.
      this._validate(scenario, dialogue);

      // Build PSM config from scenario. PSM constructor expects specific top-level keys.
      const psmConfig = this._extractPSMConfig(scenario);

      // Return the raw data + a fresh PSM instance. Caller can use either.
      return {
        scenarioId,
        scenario,
        dialogue,
        psm: new PatientStateModel(psmConfig),
        // Metadata for convenience
        scenarioName: scenario.scenarioName || scenarioId,
        clinicalScope: scenario.clinicalScope || "unknown"
      };
    } catch (error) {
      console.error(`ScenarioLoader: Failed to load scenario "${scenarioId}"`, error);
      throw error;
    }
  }

  // Internal: read and parse JSON file. Throw if file not found or parse fails.
  async _fetchJSON(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to read ${filePath}: ${error.message}`);
    }
  }

  // Light validation. Catch obvious structural problems early.
  _validate(scenario, dialogue) {
    if (!scenario.scenarioId) {
      throw new Error("Scenario missing scenarioId");
    }
    if (!dialogue.scenarioId) {
      throw new Error("Dialogue missing scenarioId");
    }
    // IDs should match — dialogue is paired to one scenario
    if (scenario.scenarioId !== dialogue.scenarioId) {
      throw new Error(
        `Scenario ID mismatch: scenario="${scenario.scenarioId}" vs dialogue="${dialogue.scenarioId}"`
      );
    }
  }

  // Extract only the fields PSM constructor expects.
  // PSM doesn't care about description, guidelineAnchors, etc. — those are for debriefing/docs.
  // Note: scenario JSON can have either "actions" (new format) or "actionMappings" (old format).
  _extractPSMConfig(scenario) {
    // Handle both "actions" (cardiac-arrest style) and "actionMappings" (fractured-femur, sepsis, anaphylaxis style)
    const actionMappings = scenario.actions || scenario.actionMappings || {};
    
    return {
      rhythmState: scenario.rhythmState || "unknown",
      arrestRhythm: scenario.arrestRhythm || null,
      simulationState: scenario.simulationState || {},
      vitals: scenario.vitals || {},
      parameterConstraints: scenario.parameterConstraints || [],
      derivedParameters: scenario.derivedParameters || {},
      couplingRules: scenario.couplingRules || [],
      actionMappings: actionMappings,
      metrics: scenario.metrics || {}
    };
  }
}