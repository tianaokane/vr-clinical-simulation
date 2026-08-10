export class ScenarioLoader {
  async load(scenarioId) {
    try {
      const response = await fetch(`./scenarios/${scenarioId}.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Could not load scenario ${scenarioId}`);
      }
      const scenarioData = await response.json();
      return scenarioData;
    } catch (error) {
      console.error(`[ScenarioLoader] Error loading ${scenarioId}:`, error);
      throw error;
    }
  }
}
