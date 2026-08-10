// core/ActionClassifier.js
// Takes trainee input (text or direct action ID) and maps it to an action.
// Also checks preconditions — an action is only "allowed" if rhythmState, PSM flags, etc. permit it.

export class ActionClassifier {
  constructor(scenarioActions = {}) {
    // scenarioActions is the "actions" object from the scenario JSON.
    // Each action has label, instruction, preconditions, setsState, effects, etc.
    this.scenarioActions = scenarioActions;
    this.keywordMap = this._buildKeywordMap(scenarioActions);
  }

  // Main entry: classify trainee text input to an action.
  // Returns { actionId, label, confidence, allowed, reason, params }
  classifyInput(traineeText, currentPSMState) {
    const cleaned = (traineeText || "").toLowerCase().trim();

    // Empty input → no action
    if (!cleaned) {
      return {
        actionId: null,
        label: null,
        confidence: 0,
        allowed: false,
        reason: "No input provided"
      };
    }

    // Try to match against known keywords.
    const match = this._findMatch(cleaned);

    if (!match) {
      return {
        actionId: null,
        label: null,
        confidence: 0,
        allowed: false,
        reason: "Action not recognised"
      };
    }

    // Found a candidate action. Now check preconditions.
    const action = this.scenarioActions[match.actionId];
    const preconditionCheck = this._checkPreconditions(action, currentPSMState);

    return {
      actionId: match.actionId,
      label: action.label || match.actionId,
      confidence: match.confidence,
      allowed: preconditionCheck.passed,
      reason: preconditionCheck.reason,
      params: match.params || {}
    };
  }

  // Also support direct action ID input for testing/debugging.
  classifyActionId(actionId, currentPSMState) {
    const action = this.scenarioActions[actionId];
    if (!action) {
      return {
        actionId,
        label: null,
        confidence: 1.0,
        allowed: false,
        reason: `Action ID not found in scenario: ${actionId}`
      };
    }

    const preconditionCheck = this._checkPreconditions(action, currentPSMState);

    return {
      actionId,
      label: action.label || actionId,
      confidence: 1.0,
      allowed: preconditionCheck.passed,
      reason: preconditionCheck.reason
    };
  }

  // Build a map of keywords → actionId.
  // For now, extract keywords from action labels + common synonyms.
  // Later this could be read from scenario JSON if we add explicit keyword lists.
  _buildKeywordMap(actions) {
    const map = {};

    Object.entries(actions).forEach(([actionId, action]) => {
      const label = (action.label || "").toLowerCase();
      const instruction = (action.instruction || "").toLowerCase();

      // Try to extract key nouns from label and instruction.
      const keywords = this._extractKeywords(label, instruction, actionId);
      keywords.forEach(kw => {
        if (!map[kw]) map[kw] = [];
        map[kw].push({ actionId, weight: 1.0 });
      });
    });

    return map;
  }

  // Extract meaningful keywords from text.
  // This is deliberately simple — just common words that appear in action labels.
  _extractKeywords(label, instruction, actionId) {
    const keywords = [];

    // Direct label as keyword
    if (label.length > 0) {
      keywords.push(label);
      // Also add individual words from label (at least 4 chars to avoid noise)
      label.split(/\s+/).forEach(word => {
        if (word.length >= 4 && !this._isStopword(word)) {
          keywords.push(word);
        }
      });
    }

    // Add common synonyms based on action ID pattern
    // (This is a shortcut. Ideally scenario JSON would define these explicitly.)
    const synonyms = {
      checkResponse: ["check", "responsiveness", "alert", "tap", "shoulder"],
      callCrashTeam: ["call", "help", "crash", "code", "2222"],
      openAirway: ["airway", "head-tilt", "tilt", "jaw", "thrust"],
      checkBreathing: ["breathing", "breath", "respiration"],
      cprCompressions: ["cpr", "compressions", "chest", "compress", "pump"],
      rescueBreaths: ["rescue", "breath", "ventilation", "breaths", "mouth"],
      applyAEDPads: ["aed", "pads", "defibrillator", "electrodes"],
      shockIfAdvised: ["shock", "deliver", "advise"],
      oxygenTherapy: ["oxygen", "o2", "mask", "apply"],
      attachBPCuff: ["blood", "pressure", "cuff", "bp"],
      attachPulseOx: ["pulse", "oximeter", "spo2", "sat"],
      continueCPRAfterShock: ["continue", "cpr", "compressions", "after", "shock", "keep", "going"]
    };

    if (synonyms[actionId]) {
      keywords.push(...synonyms[actionId]);
    }

    return [...new Set(keywords)]; // Deduplicate
  }

  // Stop words that don't carry meaning
  _isStopword(word) {
    const stops = ["the", "and", "or", "a", "an", "in", "on", "at", "to"];
    return stops.includes(word);
  }

  // Try to match trainee text against keyword map.
  // Returns { actionId, confidence, params } or null
  // Try to match trainee text against keyword map.
// Returns { actionId, confidence, params } or null
_findMatch(cleaned) {
  let bestMatch = null;
  let bestScore = 0;

  // Try multi-word phrase matching first (more specific)
  const phrases = [
    { phrase: ["continue", "cpr", "after"], actionId: "continueCPRAfterShock", weight: 2.0 },
    { phrase: ["keep", "going", "compression"], actionId: "cprCompressions", weight: 1.9 },
    { phrase: ["continue", "compression"], actionId: "cprCompressions", weight: 1.9 },
    { phrase: ["start", "cpr"], actionId: "cprCompressions", weight: 2.0 },
    { phrase: ["deliver", "shock"], actionId: "shockIfAdvised", weight: 2.0 },
    { phrase: ["shock", "advised"], actionId: "shockIfAdvised", weight: 2.0 },
    { phrase: ["open", "airway"], actionId: "openAirway", weight: 2.0 },
    { phrase: ["check", "responsive"], actionId: "checkResponse", weight: 2.0 },
    { phrase: ["call", "help"], actionId: "callCrashTeam", weight: 2.0 },
    { phrase: ["apply", "aed"], actionId: "applyAEDPads", weight: 2.0 },
    { phrase: ["attach", "pads"], actionId: "applyAEDPads", weight: 2.0 }
  ];

  for (const { phrase, actionId, weight } of phrases) {
    const allWordsPresent = phrase.every(word => cleaned.includes(word));
    if (allWordsPresent) {
      const score = weight * phrase.length * 10; // Longer phrases score higher
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { actionId, confidence: Math.min(score / 50, 1.0) };
      }
    }
  }

  // Fall back to single-word keyword matching if no phrase matched
  if (!bestMatch) {
    Object.entries(this.keywordMap).forEach(([keyword, candidates]) => {
      candidates.forEach(({ actionId, weight }) => {
        let score = 0;
        if (cleaned.includes(keyword)) {
          score = weight * keyword.length;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = { actionId, confidence: Math.min(score / 20, 1.0) };
        }
      });
    });
  }

  return bestMatch;
}

  // Check if action's preconditions are met.
  // Returns { passed: bool, reason: string }
  _checkPreconditions(action, psmState) {
    if (!action.preconditions) {
      return { passed: true, reason: "" };
    }

    const prec = action.preconditions;

    // rhythmState check (most common)
    if (prec.rhythmState) {
      if (prec.rhythmState.equals && psmState.rhythmState !== prec.rhythmState.equals) {
        return {
          passed: false,
          reason: `Action requires rhythmState=${prec.rhythmState.equals}, but current is ${psmState.rhythmState}`
        };
      }
    }

    // simulationState checks (flags like cprInProgress, aedPadsApplied, etc.)
    if (prec.simulationState) {
      for (const [key, expectedValue] of Object.entries(prec.simulationState)) {
        if (psmState.simulationState?.[key] !== expectedValue) {
          return {
            passed: false,
            reason: `Action requires simulationState.${key}=${expectedValue}`
          };
        }
      }
    }

    // Vital parameter checks (consciousness > 0.5, etc.)
    if (prec.consciousness) {
      if (prec.consciousness.above && psmState.consciousness < prec.consciousness.above) {
        return {
          passed: false,
          reason: `Consciousness too low (${psmState.consciousness} < ${prec.consciousness.above})`
        };
      }
    }

    if (prec.respiratoryRate) {
      if (prec.respiratoryRate.above && psmState.respiratoryRate < prec.respiratoryRate.above) {
        return {
          passed: false,
          reason: `Respiratory rate too low`
        };
      }
    }

    return { passed: true, reason: "" };
  }
}