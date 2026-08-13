// tests/testHelpers.js
// Node-compatible scenario/dialogue loading for the test suite.
//
// core/ScenarioLoader.js is intentionally browser-only: it calls
// `fetch(`./scenarios/${scenarioId}.json`)`, which is how the live app
// (vr/Scene.js) loads scenarios relative to the page it's served from.
// That same relative fetch cannot resolve from a bare Node process (no
// server, no page origin), so the test suite can't use ScenarioLoader
// directly. These helpers read the same JSON files from disk instead,
// and return exactly what ScenarioLoader.load() returns in the browser
// (the raw parsed scenario object) so test code exercises the real
// PatientStateModel / ActionClassifier / DebriefingSystem contracts
// unchanged.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

export function loadScenarioSync(scenarioId) {
  const filePath = path.join(ROOT, "scenarios", `${scenarioId}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadDialogueSync(scenarioId) {
  const filePath = path.join(ROOT, "dialogue", `${scenarioId}-dialogue.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[testHelpers] Could not load dialogue for ${scenarioId}:`, error.message);
    return {};
  }
}
