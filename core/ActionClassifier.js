// core/ActionClassifier.js
// Takes trainee input (text or direct action ID) and maps it to an action.
// Also checks requiresState — an action is only "allowed" if rhythmState, PSM flags, etc. permit it.
// Now supports all 4 scenarios with scenario-specific phrase lists.

export class ActionClassifier {
  constructor(scenarioActions = {}, scenarioId = "cardiac-arrest-adult") {
    // scenarioActions is the "actionMappings" object from the scenario JSON.
    // Each action has label, instruction, preconditions, setsState, effects, etc.
    this.scenarioActions = scenarioActions;
    this.scenarioId = scenarioId;
    this.phraseMap = this._buildPhraseMap(scenarioId);
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

    // Try phrase matching first (more specific)
    let match = this._findPhraseMatch(cleaned);

    // Fall back to keyword matching if no phrase matched
    if (!match) {
      match = this._findKeywordMatch(cleaned);
    }

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
    if (!action) {
      return {
        actionId: null,
        label: null,
        confidence: 0,
        allowed: false,
        reason: `Action not found in scenario: ${match.actionId}`
      };
    }

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

  // Build scenario-specific phrase map. Multi-word phrases are more specific and score higher.
  _buildPhraseMap(scenarioId) {
    const phrasesByScenario = {
      "cardiac-arrest-adult": [
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
        { phrase: ["attach", "pads"], actionId: "applyAEDPads", weight: 2.0 },
        { phrase: ["oxygen"], actionId: "oxygenTherapy", weight: 1.8 },
        { phrase: ["check", "breathing"], actionId: "checkBreathing", weight: 2.0 }
      ],

      "fractured-femur-adult": [
        { phrase: ["call", "senior"], actionId: "callSeniorTraumaHelp", weight: 2.0 },
        { phrase: ["check", "pulse"], actionId: "checkDistalPulse", weight: 2.0 },
        { phrase: ["immobilise", "leg"], actionId: "immobiliseAndPad", weight: 2.0 },
        { phrase: ["immobilise"], actionId: "immobiliseAndPad", weight: 2.0 },
        { phrase: ["control", "bleeding"], actionId: "assessCirculationBleeding", weight: 2.0 },
        { phrase: ["bleeding"], actionId: "assessCirculationBleeding", weight: 1.8 },
        { phrase: ["check", "circulation"], actionId: "assessCirculationBleeding", weight: 2.0 },
        { phrase: ["check", "capillary"], actionId: "checkCapillaryRefill", weight: 2.0 },
        { phrase: ["check", "sensation"], actionId: "checkSensation", weight: 2.0 },
        { phrase: ["check", "movement"], actionId: "checkToeMovement", weight: 2.0 },
        { phrase: ["support", "limb"], actionId: "supportLimbInPositionFound", weight: 2.0 },
        { phrase: ["apply", "oxygen"], actionId: "applyOxygenIfHypoxic", weight: 1.8 },
        { phrase: ["high", "flow", "oxygen"], actionId: "applyOxygenIfHypoxic", weight: 1.8 },
        { phrase: ["oxygen"], actionId: "applyOxygenIfHypoxic", weight: 1.8 },
        { phrase: ["attach", "monitor"], actionId: "attachMonitoring", weight: 1.8 },
        { phrase: ["establish", "iv"], actionId: "establishIVAccess", weight: 1.8 },
        { phrase: ["iv", "access"], actionId: "establishIVAccess", weight: 1.8 },
        { phrase: ["pain"], actionId: "assessDisabilityPain", weight: 1.8 },
        { phrase: ["analgesia"], actionId: "administerAnalgesiaAsPrescribed", weight: 1.8 },
        { phrase: ["xray"], actionId: "requestXrayAndOrthoReferral", weight: 1.8 },
        { phrase: ["ortho"], actionId: "requestXrayAndOrthoReferral", weight: 1.8 },
        { phrase: ["handover"], actionId: "prepareClinicalHandover", weight: 1.8 },
        { phrase: ["start", "abcde"], actionId: "startABCDE", weight: 2.0 },
        { phrase: ["assess", "airway"], actionId: "assessAirwayCSpine", weight: 1.8 },
        { phrase: ["assess", "breathing"], actionId: "assessBreathing", weight: 1.8 }
      ],

      "sepsis-adult": [
        { phrase: ["take", "blood", "culture"], actionId: "takeBloodCultures", weight: 2.0 },
        { phrase: ["blood", "culture"], actionId: "takeBloodCultures", weight: 2.0 },
        { phrase: ["give", "antibiotics"], actionId: "administerAntibioticsAsPrescribed", weight: 2.0 },
        { phrase: ["antibiotics"], actionId: "administerAntibioticsAsPrescribed", weight: 2.0 },
        { phrase: ["fluid", "resuscitation"], actionId: "giveIVFluidsAsPrescribed", weight: 2.0 },
        { phrase: ["fluid", "bolus"], actionId: "giveIVFluidsAsPrescribed", weight: 2.0 },
        { phrase: ["check", "lactate"], actionId: "sendBloodsAndLactate", weight: 1.8 },
        { phrase: ["lactate"], actionId: "sendBloodsAndLactate", weight: 1.8 },
        { phrase: ["measure", "urine"], actionId: "monitorUrineOutput", weight: 1.8 },
        { phrase: ["urine", "output"], actionId: "monitorUrineOutput", weight: 1.8 },
        { phrase: ["call", "senior"], actionId: "callSeniorSepsisHelp", weight: 2.0 },
        { phrase: ["escalate"], actionId: "callSeniorSepsisHelp", weight: 2.0 },
        { phrase: ["recognise", "sepsis"], actionId: "recogniseSepsis", weight: 2.0 },
        { phrase: ["sepsis"], actionId: "recogniseSepsis", weight: 1.8 },
        { phrase: ["iv", "access"], actionId: "establishIVAccess", weight: 1.9 },
        { phrase: ["oxygen"], actionId: "applyOxygenIfHypoxic", weight: 1.8 },
        { phrase: ["high", "flow", "oxygen"], actionId: "applyOxygenIfHypoxic", weight: 1.8 },
        { phrase: ["attach", "monitor"], actionId: "attachMonitoring", weight: 1.8 },
        { phrase: ["critical", "care"], actionId: "considerCriticalCareIfPoorResponse", weight: 1.8 },
        { phrase: ["handover"], actionId: "prepareClinicalHandover", weight: 1.8 },
        { phrase: ["start", "abcde"], actionId: "startABCDE", weight: 2.0 },
        { phrase: ["assess", "breathing"], actionId: "assessBreathing", weight: 1.8 }
      ],

      "anaphylaxis-paediatric": [
        { phrase: ["give", "adrenaline"], actionId: "giveIMAdrenaline", weight: 2.0 },
        { phrase: ["adrenaline"], actionId: "giveIMAdrenaline", weight: 2.0 },
        { phrase: ["epinephrine"], actionId: "giveIMAdrenaline", weight: 2.0 },
        { phrase: ["remove", "trigger"], actionId: "exposeAssessRashTrigger", weight: 2.0 },
        { phrase: ["high", "flow", "oxygen"], actionId: "giveHighFlowOxygen", weight: 2.0 },
        { phrase: ["apply", "oxygen"], actionId: "giveHighFlowOxygen", weight: 2.0 },
        { phrase: ["oxygen"], actionId: "giveHighFlowOxygen", weight: 1.8 },
        { phrase: ["lay", "flat"], actionId: "positionSafely", weight: 2.0 },
        { phrase: ["position"], actionId: "positionSafely", weight: 1.8 },
        { phrase: ["call", "senior"], actionId: "callPaediatricSeniorHelp", weight: 2.0 },
        { phrase: ["recognise", "anaphylaxis"], actionId: "recogniseAnaphylaxis", weight: 2.0 },
        { phrase: ["anaphylaxis"], actionId: "recogniseAnaphylaxis", weight: 2.0 },
        { phrase: ["attach", "monitor"], actionId: "attachMonitoring", weight: 1.8 },
        { phrase: ["iv", "access"], actionId: "establishIVAccess", weight: 1.8 },
        { phrase: ["establish", "iv"], actionId: "establishIVAccess", weight: 1.8 },
        { phrase: ["fluid", "bolus"], actionId: "giveFluidBolus", weight: 1.8 },
        { phrase: ["observe"], actionId: "planObservationAndAftercare", weight: 1.8 },
        { phrase: ["handover"], actionId: "prepareClinicalHandover", weight: 1.8 },
        { phrase: ["second", "adrenaline"], actionId: "giveSecondIMAdrenalineIfNeeded", weight: 1.8 }
      ]
    };

    return phrasesByScenario[scenarioId] || [];
  }

  // Try to match trainee text against phrase map (more specific).
  _findPhraseMatch(cleaned) {
    let bestMatch = null;
    let bestScore = 0;

    for (const { phrase, actionId, weight } of this.phraseMap) {
      const allWordsPresent = phrase.every(word => cleaned.includes(word));
      if (allWordsPresent) {
        const score = weight * phrase.length * 10; // Longer phrases score higher
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { actionId, confidence: Math.min(score / 50, 1.0) };
        }
      }
    }

    return bestMatch;
  }

  // Build a map of keywords → actionId from scenario action labels.
  // For now, extract keywords from action labels + common synonyms.
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
      callForSeniorHelp: ["call", "help", "senior"],
      callSeniorHelp: ["call", "help", "senior"],
      openAirway: ["airway", "head-tilt", "tilt", "jaw", "thrust"],
      checkBreathing: ["breathing", "breath", "respiration"],
      cprCompressions: ["cpr", "compressions", "chest", "compress", "pump"],
      rescueBreaths: ["rescue", "breath", "ventilation", "breaths", "mouth"],
      applyAEDPads: ["aed", "pads", "defibrillator", "electrodes"],
      shockIfAdvised: ["shock", "deliver", "advise"],
      oxygenTherapy: ["oxygen", "o2", "mask", "apply"],
      administreOxygen: ["oxygen", "o2", "mask", "apply"],
      attachBPCuff: ["blood", "pressure", "cuff", "bp"],
      attachPulseOx: ["pulse", "oximeter", "spo2", "sat"],
      attachMonitoring: ["monitor", "attach", "attach"],
      continueCPRAfterShock: ["continue", "cpr", "compressions", "after", "shock", "keep", "going"],
      assessNeurovascular: ["check", "pulse", "circulation", "neurovascular"],
      controlBleeding: ["bleeding", "control", "pressure", "blood"],
      immobiliseLimb: ["immobilise", "splint", "stabilise", "leg"],
      administreEpinephrine: ["adrenaline", "epinephrine", "epi", "pen"],
      administreAntibiotics: ["antibiotics", "antibiotic", "infection"],
      takeBloods: ["blood", "culture", "samples"],
      giveFluidResuscitation: ["fluid", "fluids", "iv"],
      monitorUrineOutput: ["urine", "output", "catheter"]
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

  // Try to match trainee text against keyword map (fallback).
  _findKeywordMatch(cleaned) {
    let bestMatch = null;
    let bestScore = 0;

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

    return bestMatch;
  }

  // Check if action's preconditions are met.
  // Returns { passed: bool, reason: string }
  _checkPreconditions(action, psmState) {
    if (!action.preconditions) {
      return { passed: true, reason: "" };
    }

    const prec = action.preconditions;

    // rhythmState check (most common in cardiac arrest)
    if (prec.rhythmState) {
      if (prec.rhythmState.equals && psmState.rhythmState !== prec.rhythmState.equals) {
        return {
          passed: false,
          reason: `Action requires rhythmState=${prec.rhythmState.equals}, but current is ${psmState.rhythmState}`
        };
      }
      // Handle "onlyWhen" variant
      if (prec.rhythmState.onlyWhen && psmState.rhythmState !== prec.rhythmState.onlyWhen) {
        return {
          passed: false,
          reason: `Action only allowed when rhythmState=${prec.rhythmState.onlyWhen}`
        };
      }
    }

    // Nested onlyWhen check (used in coupling rules)
    if (prec.onlyWhen && prec.onlyWhen.rhythmState) {
      if (psmState.rhythmState !== prec.onlyWhen.rhythmState) {
        return {
          passed: false,
          reason: `Action only allowed when rhythmState=${prec.onlyWhen.rhythmState}`
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
      if (prec.consciousness.below && psmState.consciousness > prec.consciousness.below) {
        return {
          passed: false,
          reason: `Consciousness too high (${psmState.consciousness} > ${prec.consciousness.below})`
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

    if (prec.pulseRate) {
      if (prec.pulseRate.above && psmState.pulseRate < prec.pulseRate.above) {
        return {
          passed: false,
          reason: `Pulse rate too low`
        };
      }
      if (prec.pulseRate.equals && psmState.pulseRate !== prec.pulseRate.equals) {
        return {
          passed: false,
          reason: `Pulse rate must be ${prec.pulseRate.equals}`
        };
      }
    }

    return { passed: true, reason: "" };
  }
}