// core/DebriefingSystem.js
// Analyzes scenario performance against scenario-specific gold standards.
// Now supports all 4 scenarios: cardiac-arrest, fractured-femur, sepsis, anaphylaxis.

export class DebriefingSystem {
  constructor(scenarioConfig = {}) {
    this.scenarioConfig = scenarioConfig;
    
    // Gold standards per scenario. Each scenario has its own targets and metrics.
    this.goldStandardsByScenario = {
      "cardiac-arrest-adult": {
        timeToFirstCheckSeconds: 10,
        timeToCallForHelpSeconds: 30,
        timeToFirstCPRSeconds: 60,
        timeToAEDDeploymentSeconds: 120,
        compressionRateMin: 100,
        compressionRateMax: 120,
        compressionDepthMin: 5,
        compressionDepthMax: 6,
        minCompressionQuality: 0.7,
        targetOutcome: "rosc_achieved"
      },

      "fractured-femur-adult": {
        timeToCallSeniorSeconds: 120,
        timeToNeurovascularCheckSeconds: 180,
        timeToImmobilisationSeconds: 300,
        bleedingControlQuality: 0.8,
        painScoreReductionTarget: 0.5,
        minCompressionQuality: 0.0, // Not relevant for trauma
        targetOutcome: "stable_and_safe_transfer"
      },

      "sepsis-adult": {
        timeToBloodCulturesSeconds: 300,
        timeToAntibioticsSeconds: 600,
        timeToFluidResuscitationSeconds: 900,
        lactateReductionTarget: 0.3,
        urineOutputTarget: 0.5,
        targetBloodPressureRestored: true,
        targetOutcome: "perfusion_improved"
      },

      "anaphylaxis-paediatric": {
        timeToAdrenalineSeconds: 300,
        repeatAdrenalineIfNeededSeconds: 600,
        timeToOxygenSeconds: 180,
        ageWeightAdjustment: 0.3,
        targetOutcome: "airway_patent_circulation_maintained"
      }
    };
  }

  // Scenario-specific scoring weights and critical action penalties
  // Each scenario prioritizes different clinical elements
  getScoringConfig(scenarioId) {
    const configs = {
      "cardiac-arrest-adult": {
        weights: {
          outcome: 0.40,   // ROSC is everything
          timing: 0.30,    // Every second counts
          sequence: 0.20,  // Chain of survival
          technique: 0.10  // Compression quality matters less than doing it
        },
        criticalActionPenalties: {
          // Missing critical actions reduces score to this ceiling
          callCrashTeam: 20,     // Can't score above 20% without crash call
          cprCompressions: 25,   // Can't score above 25% without CPR
          applyAEDPads: 30       // Can't score above 30% without AED
        }
      },

      "fractured-femur-adult": {
        weights: {
          outcome: 0.30,   // Patient stable for transfer
          sequence: 0.35,  // Neuro checks, then immobilization (order matters)
          timing: 0.20,    // Less time-critical than arrest
          technique: 0.15  // Immobilization quality
        },
        criticalActionPenalties: {
          callSeniorTraumaHelp: 25,      // Can't score above 25% without senior call
          supportLimbInPositionFound: 30, // Can't score above 30% without support (first step of immobilization)
          checkDistalPulse: 35           // Can't score above 35% without neuro check
        }
      },

      "sepsis-adult": {
        weights: {
          outcome: 0.35,   // Vital signs restored
          timing: 0.35,    // Antibiotics within 1 hour is critical
          sequence: 0.20,  // Systematic approach
          technique: 0.10  // Less about technique, more about recognition
        },
        criticalActionPenalties: {
          // Sepsis recognition is implied by calling for senior help + performing the bundle
          // Don't penalize explicit recognition alone; instead penalize missing intervention bundle
          callSeniorSepsisHelp: 20,      // Can't score above 20% without escalation
          administerAntibioticsAsPrescribed: 25,  // Can't score above 25% without antibiotics
          establishIVAccess: 30          // Can't score above 30% without IV access
        }
      },

      "anaphylaxis-paediatric": {
        weights: {
          timing: 0.40,    // Adrenaline NOW — every minute counts
          outcome: 0.25,   // Airway patent, circulation maintained
          sequence: 0.20,  // Adrenaline before oxygen
          technique: 0.15  // Correct IM route and dose
        },
        criticalActionPenalties: {
          recogniseAnaphylaxis: 20,     // Can't score above 20% without recognition
          giveIMAdrenaline: 25,         // Can't score above 25% without adrenaline
          giveHighFlowOxygen: 35,       // Can't score above 35% without oxygen
          callPaediatricSeniorHelp: 40  // Can't score above 40% without senior call
        }
      }
    };

    return configs[scenarioId] || {
      weights: { outcome: 0.25, timing: 0.25, sequence: 0.25, technique: 0.25 },
      criticalActionPenalties: {}
    };
  }

  // Main entry point: consume scenario results and generate debrief
  generateDebrief(psmLog, actionLog, finalState, scenarioId) {
    const debrief = {
      scenarioId,
      timestamp: new Date().toISOString(),
      summary: { finalState },
      actionLog,
      scores: {},
      learningPoints: [],
      competencyLevel: null,
      feedback: []
    };

    // Get the right gold standards and scoring config for this scenario
    const goldStandard = this.goldStandardsByScenario[scenarioId] || {};
    const scoringConfig = this.getScoringConfig(scenarioId);

    // Extract metrics from PSM log
    const metrics = this._extractMetrics(psmLog);

    // Score each pillar of performance
    debrief.scores.timing = this._scoreTiming(actionLog, metrics, scenarioId, goldStandard);
    debrief.scores.sequence = this._scoreSequence(actionLog, scenarioId);
    debrief.scores.technique = this._scoreTechnique(metrics, scenarioId, goldStandard);
    debrief.scores.outcome = this._scoreOutcome(finalState, scenarioId, goldStandard);

    // Overall assessment using scenario-specific weights
    let overallScore = this._calculateOverallScore(debrief.scores, scoringConfig.weights);
    
    // Apply critical action penalties — missing critical actions floors the score
    overallScore = this._applyCriticalActionPenalties(actionLog, overallScore, scoringConfig.criticalActionPenalties);
    
    debrief.summary.overallScore = overallScore;

    // Generate targeted learning points (this identifies critical failures)
    debrief.learningPoints = this._generateLearningPoints(
      actionLog,
      metrics,
      debrief.scores,
      scenarioId,
      goldStandard
    );

    // Extract critical failures from learning points
    const criticalFailures = debrief.learningPoints.filter(p => p.category === "critical");

    // Assess competency with critical failure override
    debrief.competencyLevel = this._assessCompetency(overallScore, debrief.scores, scenarioId, criticalFailures);

    // Create human-readable feedback
    debrief.feedback = this._generateFeedback(debrief, scenarioId);

    return debrief;
  }

  // Extract key metrics from PSM action log
  _extractMetrics(psmLog) {
    const metrics = {
      timeToFirstAction: null,
      timeToCheckResponse: null,
      timeToCallForHelp: null,
      timeToFirstCPR: null,
      timeToAEDPads: null,
      timeToShock: null,
      timeToROSC: null,
      timeToBloodCultures: null,
      timeToAntibiotics: null,
      timeToFluidResuscitation: null,
      timeToAdrenaline: null,
      timeToOxygen: null,
      totalCompressions: 0,
      averageCPRQuality: 0,
      shockCount: 0,
      pausesInCPR: 0,
      maxPauseDuration: 0,
      painScoreChange: 0,
      lactateReduction: 0,
      urineOutputMonitored: false,
      bloodPressureRestored: false
    };

    return metrics;
  }

  // Score timing against scenario-specific gold standards (0-100)
  _scoreTiming(actionLog, metrics, scenarioId, goldStandard) {
    let timingScore = 100;

    if (scenarioId === "cardiac-arrest-adult") {
      // Cardiac arrest timing
      if (actionLog.checkResponse?.timestamp > (goldStandard.timeToFirstCheckSeconds * 1000)) {
        timingScore -= 5;
      }
      if (actionLog.callCrashTeam?.timestamp > (goldStandard.timeToCallForHelpSeconds * 1000)) {
        timingScore -= 15;
      }
      if (actionLog.cprCompressions?.timestamp > (goldStandard.timeToFirstCPRSeconds * 1000)) {
        timingScore -= 20;
      }
      if (actionLog.applyAEDPads?.timestamp > (goldStandard.timeToAEDDeploymentSeconds * 1000)) {
        timingScore -= 10;
      }
    } 
    else if (scenarioId === "fractured-femur-adult") {
      // Trauma/fracture timing
      if (actionLog.callSeniorTraumaHelp?.timestamp > (goldStandard.timeToCallSeniorSeconds * 1000)) {
        timingScore -= 15;
      }
      if (actionLog.checkDistalPulse?.timestamp > (goldStandard.timeToNeurovascularCheckSeconds * 1000)) {
        timingScore -= 10;
      }
      if (actionLog.immobiliseAndPad?.timestamp > (goldStandard.timeToImmobilisationSeconds * 1000)) {
        timingScore -= 20;
      }
    }
    else if (scenarioId === "sepsis-adult") {
      // Sepsis timing (early recognition is critical)
      if (actionLog.takeBloodCultures?.timestamp > (goldStandard.timeToBloodCulturesSeconds * 1000)) {
        timingScore -= 10;
      }
      if (actionLog.administerAntibioticsAsPrescribed?.timestamp > (goldStandard.timeToAntibioticsSeconds * 1000)) {
        timingScore -= 25; // Antibiotic timing is critical in sepsis
      }
      if (actionLog.giveIVFluidsAsPrescribed?.timestamp > (goldStandard.timeToFluidResuscitationSeconds * 1000)) {
        timingScore -= 15;
      }
    }
    else if (scenarioId === "anaphylaxis-paediatric") {
      // Anaphylaxis timing (adrenaline is first-line)
      if (actionLog.giveIMAdrenaline?.timestamp > (goldStandard.timeToAdrenalineSeconds * 1000)) {
        timingScore -= 25; // Delayed adrenaline is critical failure
      }
      if (actionLog.giveHighFlowOxygen?.timestamp > (goldStandard.timeToOxygenSeconds * 1000)) {
        timingScore -= 15;
      }
    }

    return Math.max(0, timingScore);
  }

  // Score action sequence adherence (0-100)
  _scoreSequence(actionLog, scenarioId) {
    let sequenceScore = 100;

    // Define expected sequence for each scenario
    const goldSequences = {
      "cardiac-arrest-adult": [
        "checkResponse",
        "callCrashTeam",
        "openAirway",
        "checkBreathing",
        "cprCompressions",
        "applyAEDPads",
        "shockIfAdvised",
        "continueCPRAfterShock"
      ],
      "fractured-femur-adult": [
        "callSeniorTraumaHelp",
        "checkDistalPulse",
        "assessCirculationBleeding",
        "immobiliseAndPad",
        "applyOxygenIfHypoxic",
        "attachMonitoring",
        "prepareClinicalHandover"
      ],
      "sepsis-adult": [
        "recogniseSepsis",
        "callSeniorSepsisHelp",
        "attachMonitoring",
        "takeBloodCultures",
        "applyOxygenIfHypoxic",
        "establishIVAccess",
        "administerAntibioticsAsPrescribed",
        "giveIVFluidsAsPrescribed",
        "monitorUrineOutput"
      ],
      "anaphylaxis-paediatric": [
        "recogniseAnaphylaxis",
        "callPaediatricSeniorHelp",
        "giveIMAdrenaline",
        "giveHighFlowOxygen",
        "attachMonitoring",
        "positionSafely",
        "establishIVAccess",
        "planObservationAndAftercare"
      ]
    };

    const goldSequence = goldSequences[scenarioId] || [];
    const performedActions = Object.keys(actionLog).filter(key => actionLog[key]);

    // Check sequence order
    let lastIndex = -1;
    for (const action of performedActions) {
      const currentIndex = goldSequence.indexOf(action);
      if (currentIndex > -1) {
        if (currentIndex < lastIndex) {
          sequenceScore -= 5; // Out of order
        }
        lastIndex = currentIndex;
      }
    }

    // Deduct for missing critical actions (varies by scenario)
    const criticalActions = {
      "cardiac-arrest-adult": ["callCrashTeam", "cprCompressions", "applyAEDPads"],
      "fractured-femur-adult": ["callSeniorTraumaHelp", "immobiliseAndPad", "assessCirculationBleeding"],
      "sepsis-adult": ["callSeniorSepsisHelp", "takeBloodCultures", "administerAntibioticsAsPrescribed"],
      "anaphylaxis-paediatric": ["recogniseAnaphylaxis", "giveIMAdrenaline"]
    };

    const criticals = criticalActions[scenarioId] || [];
    for (const action of criticals) {
      if (!performedActions.includes(action)) {
        sequenceScore -= 25;
      }
    }

    return Math.max(0, sequenceScore);
  }

  // Score technical quality (0-100)
  _scoreTechnique(metrics, scenarioId, goldStandard) {
    let techniqueScore = 100;

    if (scenarioId === "cardiac-arrest-adult") {
      // CPR quality assessment
      if (metrics.averageCPRQuality && metrics.averageCPRQuality < goldStandard.minCompressionQuality) {
        const qualityGap = goldStandard.minCompressionQuality - metrics.averageCPRQuality;
        techniqueScore -= qualityGap * 100;
      }

      // Pauses in CPR
      if (metrics.pausesInCPR > 0) {
        techniqueScore -= metrics.pausesInCPR * 5;
        if (metrics.maxPauseDuration > 10) {
          techniqueScore -= 20;
        }
      }
    }
    else if (scenarioId === "fractured-femur-adult") {
      // Bleeding control quality
      if (metrics.bleedingControlQuality && metrics.bleedingControlQuality < goldStandard.bleedingControlQuality) {
        techniqueScore -= 20;
      }
      // Pain management (was pain reduced?)
      if (metrics.painScoreChange < goldStandard.painScoreReductionTarget) {
        techniqueScore -= 15;
      }
    }
    else if (scenarioId === "sepsis-adult") {
      // Sepsis is more about systematic approach than individual technique
      // Score based on completion of all monitoring/interventions
      techniqueScore = 85; // Baseline for sepsis
    }
    else if (scenarioId === "anaphylaxis-paediatric") {
      // Anaphylaxis: adrenaline administration quality + positioning
      techniqueScore = 85; // Baseline for anaphylaxis
    }

    return Math.max(0, techniqueScore);
  }

  // Score outcome (0-100) — scenario-specific
  _scoreOutcome(finalState, scenarioId, goldStandard) {
    let outcomeScore = 0;

    if (!finalState) {
      return 0;
    }

    if (scenarioId === "cardiac-arrest-adult") {
      const rhythmState = finalState.rhythmState;
      const consciousness = finalState.consciousness || 0;
      const spO2 = finalState.oxygenSaturation || 0;
      const bp = finalState.bloodPressureSystolic || 0;

      // ROSC achieved = 100 points
      if (rhythmState === "rosc") {
        outcomeScore = 100;
        // Deduct if post-ROSC vitals are poor
        if (consciousness < 0.3) outcomeScore -= 10;
        if (spO2 < 85) outcomeScore -= 10;
        if (bp < 90) outcomeScore -= 10;
      }
      else if (rhythmState === "rosc_pending") {
        outcomeScore = 70;
      }
      else if (rhythmState === "arrest") {
        outcomeScore = 20;
      }
      else {
        outcomeScore = 0;
      }
    }
    else if (scenarioId === "fractured-femur-adult") {
      const consciousness = finalState.consciousness || 0;
      const spO2 = finalState.oxygenSaturation || 0;
      const bp = finalState.bloodPressureSystolic || 0;

      // Stable and safe for transfer = 100 points
      if (consciousness > 0.7 && spO2 > 94 && bp > 100) {
        outcomeScore = 100;
      }
      // Deteriorating but managed = 70 points
      else if (consciousness > 0.3 && spO2 > 85 && bp > 80) {
        outcomeScore = 70;
      }
      // Critical/unstable = 20 points
      else if (consciousness > 0 && spO2 > 75 && bp > 60) {
        outcomeScore = 20;
      }
      // Dead = 0
      else {
        outcomeScore = 0;
      }
    }
    else if (scenarioId === "sepsis-adult") {
      const bp = finalState.bloodPressureSystolic || 0;
      const consciousness = finalState.consciousness || 0;
      const lactate = finalState.lactate || 4.0;

      // BP restored + improved perfusion = 100 points
      if (bp >= 90 && consciousness > 0.6) {  // Remove lactate < 2.0
        outcomeScore = 100;
      }
      // Improved but not fully restored = 70 points
      else if (bp >= 80 && consciousness > 0.4) {
        outcomeScore = 70;
      }
      // Shock ongoing = 20 points
      else if (bp >= 70 && consciousness > 0) {
        outcomeScore = 20;
      }
      // Cardiac arrest = 0
      else {
        outcomeScore = 0;
      }
    }
    else if (scenarioId === "anaphylaxis-paediatric") {
      const consciousness = finalState.consciousness || 0;
      const respiratoryRate = finalState.respiratoryRate || 40;
      const pulseRate = finalState.pulseRate || 120;

      // Airway patent + breathing adequate + circulation maintained = 100
      if (consciousness > 0.7 && respiratoryRate > 12 && respiratoryRate < 35 && pulseRate > 50 && pulseRate < 150) {  // Changed < 30 to < 35
        outcomeScore = 100;
      }
      // Improved but still struggling = 70
      else if (consciousness > 0.3 && respiratoryRate > 10 && pulseRate > 40) {
        outcomeScore = 70;
      }
      // Critical/severe distress = 20
      else if (consciousness > 0 && respiratoryRate > 5 && pulseRate > 30) {
        outcomeScore = 20;
      }
      // Severe/cardiac arrest = 0
      else {
        outcomeScore = 0;
      }
    }

    return Math.max(0, outcomeScore);
  }

  // Calculate overall score (0-100)
  _calculateOverallScore(scores, customWeights = null) {
    // Use custom weights if provided, otherwise default equal weighting
    const weights = customWeights || {
      timing: 0.25,
      sequence: 0.25,
      technique: 0.25,
      outcome: 0.25
    };

    const weighted =
      (scores.timing || 0) * weights.timing +
      (scores.sequence || 0) * weights.sequence +
      (scores.technique || 0) * weights.technique +
      (scores.outcome || 0) * weights.outcome;

    return Math.round(weighted);
  }

  // Apply penalties for missing critical actions
  // If a critical action is missing, score cannot exceed the penalty ceiling
  _applyCriticalActionPenalties(actionLog, overallScore, penalties) {
    if (!penalties || Object.keys(penalties).length === 0) {
      return overallScore; // No penalties defined for this scenario
    }

    // Check each critical action and apply penalties
    let penalizedScore = overallScore;
    
    for (const [actionId, penaltyCeiling] of Object.entries(penalties)) {
      if (!actionLog[actionId]) {
        // Critical action is missing — floor the score
        penalizedScore = Math.min(penalizedScore, penaltyCeiling);
      }
    }

    return penalizedScore;
  }

  _assessCompetency(overallScore, scores, scenarioId, criticalFailures = []) {
  // CRITICAL: If any critical failures exist, fail immediately
  if (criticalFailures && criticalFailures.length > 0) {
    return {
      level: "fail",
      label: "Fail",
      description: `CRITICAL FAILURES DETECTED: ${criticalFailures.length} essential action(s) missed. ` +
                   this._getCompetencyDescription(scenarioId, "fail")
    };
  }

  // Gold Standard: 85-100
  if (overallScore >= 85 && scores.outcome >= 90) {
    return {
      level: "gold_standard",
      label: "Gold Standard",
      description: this._getCompetencyDescription(scenarioId, "gold_standard")
    };
  }

  // Pass: 70-84
  if (overallScore >= 70 && scores.outcome >= 70) {
    return {
      level: "pass",
      label: "Pass",
      description: this._getCompetencyDescription(scenarioId, "pass")
    };
  }

  // Borderline: 55-69
  if (overallScore >= 55) {
    return {
      level: "borderline",
      label: "Borderline",
      description: this._getCompetencyDescription(scenarioId, "borderline")
    };
  }

  // Fail: <55
  return {
    level: "fail",
    label: "Fail",
    description: this._getCompetencyDescription(scenarioId, "fail")
  };
}

  // Scenario-specific competency descriptions
  _getCompetencyDescription(scenarioId, level) {
    const descriptions = {
      "cardiac-arrest-adult": {
        gold_standard: "Excellent performance. Rapid recognition, correct sequence, high-quality CPR, ROSC achieved with good post-ROSC vitals.",
        pass: "Competent performance. All critical actions performed, good sequence adherence, ROSC achieved or strong effort.",
        borderline: "Concerning performance. Some actions missed or poor technique. Requires focused practice on Chain of Survival.",
        fail: "Unsafe performance. Critical actions missed or incorrect sequencing. Do not practice on real patients until retrained."
      },
      "fractured-femur-adult": {
        gold_standard: "Excellent performance. Early help called, neurovascular checked, bleeding controlled, limb immobilised promptly, patient stable for transfer.",
        pass: "Competent performance. All critical trauma actions performed, patient managed safely for transfer.",
        borderline: "Concerning performance. Some trauma actions missed or delayed. Requires practice on primary survey and haemorrhage control.",
        fail: "Unsafe performance. Critical actions missed or patient deteriorated significantly. Requires retraining."
      },
      "sepsis-adult": {
        gold_standard: "Excellent performance. Early recognition, senior help called, bloods taken, antibiotics given promptly, fluid resuscitation started, perfusion restored.",
        pass: "Competent performance. Recognition timely, investigations done, interventions initiated, patient improved.",
        borderline: "Concerning performance. Late recognition or delayed antibiotics/fluids. Requires practice on early sepsis recognition.",
        fail: "Unsafe performance. Critical actions missed. Sepsis is time-critical; retraining required."
      },
      "anaphylaxis-paediatric": {
        gold_standard: "Excellent performance. Anaphylaxis recognised, adrenaline given immediately, airway/breathing/circulation maintained, recovery observed.",
        pass: "Competent performance. Anaphylaxis recognised, adrenaline given, patient stabilised and observed.",
        borderline: "Concerning performance. Adrenaline delayed or other supportive care missed. Requires practice on anaphylaxis recognition and IM adrenaline.",
        fail: "Unsafe performance. Adrenaline not given or critical airway/breathing management missed. Requires immediate retraining."
      }
    };

    return (descriptions[scenarioId] && descriptions[scenarioId][level]) || 
           "Review scenario-specific guidelines with your supervisor.";
  }

  // Generate specific learning points based on performance
  _generateLearningPoints(actionLog, metrics, scores, scenarioId, goldStandard) {
    const points = [];

    // Scenario-specific learning points
    if (scenarioId === "cardiac-arrest-adult") {
      this._generateCardiacArrestLearningPoints(points, actionLog, scores, goldStandard);
    }
    else if (scenarioId === "fractured-femur-adult") {
      this._generateTraumaLearningPoints(points, actionLog, scores, goldStandard);
    }
    else if (scenarioId === "sepsis-adult") {
      this._generateSepsisLearningPoints(points, actionLog, scores, goldStandard);
    }
    else if (scenarioId === "anaphylaxis-paediatric") {
      this._generateAnaphylaxisLearningPoints(points, actionLog, scores, goldStandard);
    }

    return points;
  }

  // Cardiac arrest specific learning points
  _generateCardiacArrestLearningPoints(points, actionLog, scores, goldStandard) {
    // ALWAYS check for critical failures first — these override everything
    this._checkCardiacArrestCriticalFailures(actionLog, points);
    
    // If critical failures were found, stop here. Safety comes first.
    if (points.some(p => p.category === "critical")) {
      return;
    }

    // Now provide constructive feedback on timing, technique, sequence
    if (scores.timing < 80) {
      if (actionLog.callCrashTeam?.timestamp > (goldStandard.timeToCallForHelpSeconds * 1000)) {
        points.push({
          category: "timing",
          severity: "high",
          point: "Delayed call for help",
          guidance: "Call 999/crash team within 30 seconds of recognizing arrest. Early help is critical for outcome.",
          target: "< 30 seconds"
        });
      }

      if (actionLog.cprCompressions?.timestamp > (goldStandard.timeToFirstCPRSeconds * 1000)) {
        points.push({
          category: "timing",
          severity: "high",
          point: "Delayed start of CPR",
          guidance: "Start CPR within 60 seconds of recognizing arrest. Every second of delay reduces survival chances.",
          target: "< 60 seconds"
        });
      }
    }

    if (scores.technique < 80) {
      if (metrics.averageCPRQuality < goldStandard.minCompressionQuality) {
        points.push({
          category: "technique",
          severity: "high",
          point: "Poor compression quality",
          guidance: "Aim for 100-120 compressions/min, 5-6cm depth. Use full recoil between compressions.",
          target: `Quality score > ${goldStandard.minCompressionQuality}`
        });
      }
    }

    // Positive reinforcement
    if (scores.timing >= 80) {
      points.push({
        category: "strength",
        severity: "positive",
        point: "Excellent response timing",
        guidance: "You recognized arrest and acted quickly. Early intervention is crucial.",
        target: null
      });
    }

    if (scores.sequence >= 80) {
      points.push({
        category: "strength",
        severity: "positive",
        point: "Good adherence to Chain of Survival",
        guidance: "You followed the correct sequence of actions. This systematic approach saves lives.",
        target: null
      });
    }
  }

  // Trauma-specific learning points
  _generateTraumaLearningPoints(points, actionLog, scores, goldStandard) {
    // ALWAYS check for critical failures first — these override everything
    this._checkTraumaCriticalFailures(actionLog, points);
    
    // If critical failures were found, stop here. Safety comes first.
    if (points.some(p => p.category === "critical")) {
      return;
    }

    // Now provide constructive feedback on timing, technique, sequence
    if (scores.timing < 80) {
      if (actionLog.callSeniorTraumaHelp?.timestamp > (goldStandard.timeToCallSeniorSeconds * 1000)) {
        points.push({
          category: "timing",
          severity: "high",
          point: "Delayed call for senior help",
          guidance: "Alert senior staff within 2 minutes of recognizing major femoral fracture. Early specialist input improves outcome.",
          target: "< 120 seconds"
        });
      }

      if (actionLog.immobiliseAndPad?.timestamp > (goldStandard.timeToImmobilisationSeconds * 1000)) {
        points.push({
          category: "timing",
          severity: "high",
          point: "Delayed limb immobilisation",
          guidance: "Immobilise the fracture within 5 minutes to reduce blood loss and pain.",
          target: "< 300 seconds"
        });
      }
    }

    if (scores.sequence < 80) {
      if (!actionLog.checkDistalPulse) {
        points.push({
          category: "sequence",
          severity: "high",
          point: "Neurovascular assessment not performed",
          guidance: "Always check distal pulses, capillary refill, sensation, and movement before and after immobilisation.",
          target: "Perform neurovascular check"
        });
      }

      if (!actionLog.assessCirculationBleeding) {
        points.push({
          category: "sequence",
          severity: "high",
          point: "Bleeding control not documented",
          guidance: "Femoral fractures can lose significant blood into the thigh compartment. Apply direct pressure if bleeding visible.",
          target: "Control external bleeding"
        });
      }
    }

    // Positive reinforcement
    if (scores.outcome >= 70) {
      points.push({
        category: "strength",
        severity: "positive",
        point: "Patient stabilised for safe transfer",
        guidance: "You managed the trauma systematically and left the patient stable for handover.",
        target: null
      });
    }
  }

  // Sepsis-specific learning points
  _generateSepsisLearningPoints(points, actionLog, scores, goldStandard) {
    // ALWAYS check for critical failures first — these override everything
    this._checkSepsisCriticalFailures(actionLog, points);
    
    // If critical failures were found, stop here. Safety comes first.
    if (points.some(p => p.category === "critical")) {
      return;
    }

    // Now provide constructive feedback on timing, technique, sequence
    if (scores.timing < 80) {
      if (actionLog.administerAntibioticsAsPrescribed?.timestamp > (goldStandard.timeToAntibioticsSeconds * 1000)) {
        points.push({
          category: "timing",
          severity: "high",
          point: "Delayed antibiotic administration",
          guidance: "Antibiotics must be given within 1 hour of sepsis recognition. Each hour delay increases mortality.",
          target: "< 60 minutes from recognition"
        });
      }

      if (actionLog.takeBloodCultures?.timestamp > (goldStandard.timeToBloodCulturesSeconds * 1000)) {
        points.push({
          category: "timing",
          severity: "medium",
          point: "Delayed blood cultures",
          guidance: "Take blood cultures before antibiotics if possible, but do not delay antibiotics.",
          target: "Within 5 minutes of recognition"
        });
      }
    }

    if (scores.sequence < 80) {
      if (!actionLog.callSeniorSepsisHelp) {
        points.push({
          category: "sequence",
          severity: "high",
          point: "Did not escalate to senior staff",
          guidance: "Sepsis requires immediate senior review. Escalate promptly.",
          target: "Call for senior help immediately"
        });
      }
    }

    // Positive reinforcement
    if (scores.timing >= 80) {
      points.push({
        category: "strength",
        severity: "positive",
        point: "Rapid recognition and antibiotic administration",
        guidance: "Early antibiotics significantly improve sepsis outcomes. Excellent time-critical decision-making.",
        target: null
      });
    }
  }

  // Anaphylaxis-specific learning points
  _generateAnaphylaxisLearningPoints(points, actionLog, scores, goldStandard) {
    // ALWAYS check for critical failures first — these override everything
    this._checkAnaphylaxisCriticalFailures(actionLog, points);
    
    // If critical failures were found, stop here. Safety comes first.
    if (points.some(p => p.category === "critical")) {
      return;
    }

    // Now provide constructive feedback on timing, technique, sequence
    if (scores.timing < 80) {
      if (actionLog.giveIMAdrenaline?.timestamp > (goldStandard.timeToAdrenalineSeconds * 1000)) {
        points.push({
          category: "timing",
          severity: "high",
          point: "Delayed adrenaline administration",
          guidance: "IM adrenaline into the anterolateral thigh is FIRST-LINE treatment. Give immediately on recognizing anaphylaxis. Do not delay for other interventions.",
          target: "< 5 minutes from recognition"
        });
      }
    }

    if (scores.sequence < 80) {
      if (!actionLog.recogniseAnaphylaxis) {
        points.push({
          category: "sequence",
          severity: "high",
          point: "Anaphylaxis not recognised",
          guidance: "Look for combination of: rapid onset, skin rash, throat tightness, breathing difficulty, hypotension. Recognize early.",
          target: "Recognize anaphylaxis immediately"
        });
      }

      if (!actionLog.giveIMAdrenaline) {
        points.push({
          category: "sequence",
          severity: "high",
          point: "Adrenaline not administered",
          guidance: "Adrenaline is the only life-saving treatment in anaphylaxis. All other interventions are supportive.",
          target: "Administer IM adrenaline immediately"
        });
      }
    }

    // Positive reinforcement
    if (scores.outcome >= 70) {
      points.push({
        category: "strength",
        severity: "positive",
        point: "Airway and breathing maintained",
        guidance: "You kept the patient's airway patent and breathing adequate. This is critical in anaphylaxis.",
        target: null
      });
    }
  }

  // Generate human-readable debrief feedback with enhanced pedagogical content
  _generateFeedback(debrief, scenarioId) {
    const feedback = [];

    const scenarioNames = {
      "cardiac-arrest-adult": "Cardiac Arrest",
      "fractured-femur-adult": "Fractured Femur",
      "sepsis-adult": "Sepsis",
      "anaphylaxis-paediatric": "Anaphylaxis (Paediatric)"
    };

    // Header
    feedback.push({
      type: "header",
      title: `${scenarioNames[scenarioId]} Debriefing`,
      score: `${debrief.summary.overallScore}%`,
      level: debrief.competencyLevel.label
    });

    // 1. PATIENT OUTCOME NARRATIVE
    feedback.push({
      type: "section",
      title: "🏥 PATIENT OUTCOME",
      content: this._getOutcomeNarrative(debrief, scenarioId)
    });

    // 2. SCORE BREAKDOWN WITH VISUALIZATION
    feedback.push({
      type: "section",
      title: "📊 YOUR PERFORMANCE",
      content: this._formatScoreVisualization(debrief)
    });

    // 3. CLINICAL IMPACT
    feedback.push({
      type: "section",
      title: "⚕️ CLINICAL IMPACT",
      content: this._calculateClinicalImpact(debrief, scenarioId)
    });

    // 4. WHAT WENT WELL & WHAT NEEDS WORK
    if (debrief.learningPoints.length > 0) {
      const strengths = debrief.learningPoints.filter(p => p.category === "strength");
      const concerns = debrief.learningPoints.filter(p => p.category !== "strength");

      if (strengths.length > 0) {
        feedback.push({
          type: "section",
          title: "⭐ WHAT YOU DID WELL",
          items: strengths.map(p => ({
            title: p.point,
            guidance: p.guidance
          }))
        });
      }

      if (concerns.length > 0) {
        feedback.push({
          type: "section",
          title: "❌ AREAS FOR IMPROVEMENT",
          items: concerns.map(p => ({
            severity: p.severity,
            title: p.point,
            guidance: p.guidance,
            target: p.target
          }))
        });
      }
    }

    // 5. DRILL RECOMMENDATIONS
    feedback.push({
      type: "section",
      title: "🎯 PRACTICE DRILLS",
      content: this._generateDrillRecommendations(debrief, scenarioId)
    });

    // 6. NEXT STEPS
    feedback.push({
      type: "next_steps",
      text: this._getNextStepsGuidance(debrief.competencyLevel.level)
    });

    return feedback;
  }

  // Generate patient outcome narrative (clinical storytelling)
  _getOutcomeNarrative(debrief, scenarioId) {
    const finalState = debrief.summary.finalState || {};
    
    if (scenarioId === "cardiac-arrest-adult") {
      const rhythmState = finalState.rhythmState;
      if (rhythmState === "rosc") {
        return `✅ ROSC achieved at ${this._estimateROSCTime(debrief)} minutes.\n\n` +
               `Your rapid recognition and systematic Chain of Survival approach resulted in return of spontaneous circulation. ` +
               `The patient has a realistic chance of neurologically intact survival.\n\n` +
               `Survival probability: ~60% (with your actions) vs ~5% (without CPR).\n\n` +
               `Post-ROSC: Patient requires ongoing monitoring, advanced life support, and investigation of cause.`;
      } else if (rhythmState === "rosc_pending") {
        return `⚠️ Cardiac arrest ongoing. CPR in progress.\n\n` +
               `You initiated appropriate resuscitation, but ROSC has not yet been achieved. ` +
               `Continue CPR, maintain high-quality compressions, and escalate to ICU if available.`;
      } else {
        return `❌ Cardiac arrest was not reversed.\n\n` +
               `Without CPR, chest compressions, and defibrillation, the patient's chance of survival was very low. ` +
               `Critical actions missing: ${this._listMissingCriticalActions(debrief)}`;
      }
    }
    
    if (scenarioId === "fractured-femur-adult") {
      const consciousness = finalState.consciousness || 0;
      const bp = finalState.bloodPressureSystolic || 0;
      if (consciousness > 0.7 && bp > 100) {
        return `✅ Patient stable and ready for safe transfer.\n\n` +
               `Your rapid neurovascular assessment, immobilization, and bleeding control prevented further deterioration. ` +
               `Limb perfusion is maintained. The patient can now be safely transferred to orthopedic surgery.\n\n` +
               `Survival probability: ~95% (with your care) vs ~70% (with delayed immobilization).`;
      } else if (consciousness > 0.3) {
        return `⚠️ Patient conscious but showing signs of shock.\n\n` +
               `Immobilization and monitoring are in place, but the patient is deteriorating. ` +
               `Escalation to senior trauma is urgent. Blood loss is ongoing.`;
      } else {
        return `❌ Patient is critically unstable.\n\n` +
               `Without early immobilization and senior escalation, internal hemorrhage has progressed. ` +
               `Critical actions missing: ${this._listMissingCriticalActions(debrief)}`;
      }
    }

    if (scenarioId === "sepsis-adult") {
      const bp = finalState.bloodPressureSystolic || 0;
      const consciousness = finalState.consciousness || 0;
      if (bp >= 90 && consciousness > 0.6) {
        return `✅ Septic shock reversed. Perfusion restored.\n\n` +
               `Your rapid recognition, senior escalation, early antibiotics, and fluid resuscitation have improved the patient's perfusion. ` +
               `Lactate is clearing. Organ function is improving.\n\n` +
               `30-day mortality probability: ~15% (with your care) vs ~40% (with delayed antibiotics).`;
      } else if (bp >= 80) {
        return `⚠️ Patient improving but remains at risk.\n\n` +
               `Blood pressure has responded to fluids, but the patient remains at high risk of deterioration. ` +
               `Continued ICU monitoring and escalation are essential.`;
      } else {
        return `❌ Septic shock not reversed.\n\n` +
               `Without early antibiotics and fluid resuscitation, the patient remains in shock. ` +
               `Critical actions missing: ${this._listMissingCriticalActions(debrief)}`;
      }
    }

    if (scenarioId === "anaphylaxis-paediatric") {
      const breathing = finalState.respiratoryRate || 30;
      const consciousness = finalState.consciousness || 0;
      if (consciousness > 0.7 && breathing > 12 && breathing < 35) {
        return `✅ Anaphylaxis controlled. Airway patent, breathing adequate.\n\n` +
               `Your immediate IM adrenaline and airway management prevented catastrophic deterioration. ` +
               `The child is now stable and can be monitored for biphasic reaction.\n\n` +
               `Survival probability: ~99% (with your care) vs ~50% (without IM adrenaline).`;
      } else if (consciousness > 0.3) {
        return `⚠️ Child improving but airway remains at risk.\n\n` +
               `IM adrenaline has helped, but the child still shows signs of airway compromise. ` +
               `Prepare for potential intubation. Senior pediatric help is essential.`;
      } else {
        return `❌ Anaphylaxis not controlled. Airway at critical risk.\n\n` +
               `Without immediate IM adrenaline, the child's airway has compromised. ` +
               `Critical actions missing: ${this._listMissingCriticalActions(debrief)}`;
      }
    }

    return "Assessment pending...";
  }

  // Format score as ASCII visualization
  _formatScoreVisualization(debrief) {
    const s = debrief.scores;
    const o = debrief.summary.overallScore;

    const bar = (pct) => {
      const filled = Math.round(pct / 5);
      const empty = 20 - filled;
      return "█".repeat(filled) + "░".repeat(empty);
    };

    return (
      `Outcome     : ${s.outcome}%  ${bar(s.outcome)}  (Patient result)\n` +
      `Timing      : ${s.timing}%   ${bar(s.timing)}  (Speed of actions)\n` +
      `Sequence    : ${s.sequence}%  ${bar(s.sequence)}  (Correct order)\n` +
      `Technique   : ${s.technique}%  ${bar(s.technique)}  (Quality of actions)\n` +
      `${"─".repeat(60)}\n` +
      `OVERALL     : ${o}%  ${bar(o)}  ${this._competencyLabel(o)}`
    );
  }

  // Calculate and explain clinical impact
  _calculateClinicalImpact(debrief, scenarioId) {
    const actionLog = debrief.actionLog || {};
    const scores = debrief.scores;

    if (scenarioId === "cardiac-arrest-adult") {
      const criticalFailures = debrief.learningPoints.filter(p => p.category === "critical");
      if (criticalFailures.length > 0) {
        return `❌ MORTALITY IMPACT\n\n` +
               `Missing actions: ${criticalFailures.map(f => f.point).join(", ")}\n\n` +
               `Without CPR alone: Survival drops from 60% to <5%.\n` +
               `Each minute of delay in CPR: -10% survival probability.`;
      } else {
        return `✅ SURVIVAL IMPACT\n\n` +
               `Your Chain of Survival approach:\n` +
               `- Recognition (${actionLog.checkResponse?.timestamp || 0}ms): On time\n` +
               `- CPR (${actionLog.cprCompressions?.timestamp || 0}ms): On time\n` +
               `- Defibrillation (${actionLog.applyAEDPads?.timestamp || 0}ms): On time\n\n` +
               `Result: Survival probability +55% vs untreated arrest.`;
      }
    }

    if (scenarioId === "fractured-femur-adult") {
      const criticalFailures = debrief.learningPoints.filter(p => p.category === "critical");
      if (criticalFailures.length > 0) {
        return `❌ HEMORRHAGE RISK\n\n` +
               `A femoral fracture can bleed 1-1.5L into the thigh compartment within minutes.\n` +
               `Missing: ${criticalFailures.map(f => f.point).join(", ")}\n\n` +
               `Result: Uncontrolled hemorrhage → hypovolemic shock → organ failure.`;
      } else {
        return `✅ HEMORRHAGE CONTROLLED\n\n` +
               `Early immobilization reduces ongoing bleed rate by 80%.\n` +
               `Early senior escalation allows rapid orthopedic intervention.\n\n` +
               `Result: Limb saved, life saved.`;
      }
    }

    if (scenarioId === "sepsis-adult") {
      const delay = actionLog.administerAntibioticsAsPrescribed?.timestamp || null;
      if (delay && delay > 3600000) {
        const delayMinutes = Math.round(delay / 60000);
        const mortalityIncrease = Math.round((delayMinutes - 60) / 60 * 8); // 8% per hour delay
        return `❌ MORTALITY IMPACT OF DELAY\n\n` +
               `Antibiotic given at: ${delayMinutes} minutes (target <60 min)\n` +
               `Delay: +${delayMinutes - 60} minutes\n\n` +
               `Each hour delay = +8% mortality increase.\n` +
               `Your delay cost: +${mortalityIncrease}% increased mortality risk.`;
      } else {
        return `✅ SEPSIS BUNDLE COMPLETED ON TIME\n\n` +
               `Antibiotics <60 min: 30-day mortality ~15%\n` +
               `Antibiotics >1 hour: 30-day mortality ~40%\n\n` +
               `Your rapid action likely saved this patient's life.`;
      }
    }

    if (scenarioId === "anaphylaxis-paediatric") {
      const delay = actionLog.giveIMAdrenaline?.timestamp || null;
      if (!delay) {
        return `❌ CATASTROPHIC OUTCOME PREVENTED\n\n` +
               `IM adrenaline is ONLY first-line treatment for anaphylaxis.\n` +
               `Without it: airway edema → airway obstruction → cardiac arrest → death.\n\n` +
               `Survival without adrenaline: ~10%\n` +
               `Survival with immediate adrenaline: ~99%`;
      } else {
        return `✅ AIRWAY PROTECTED\n\n` +
               `Immediate IM adrenaline (${Math.round(delay / 1000)}s) prevented airway closure.\n` +
               `Biphasic reaction risk remains (<2%) but manageable.\n\n` +
               `Likely outcome: Full recovery with observation.`;
      }
    }

    return "Impact calculation pending...";
  }

  // Generate specific drill recommendations
  _generateDrillRecommendations(debrief, scenarioId) {
    const level = debrief.competencyLevel.level;
    const scores = debrief.scores;
    const criticalFailures = debrief.learningPoints.filter(p => p.category === "critical");

    if (criticalFailures.length > 0) {
      // Fail: Intensive drills on missing critical actions
      return this._getDrillsForFailedScenario(scenarioId, criticalFailures);
    }

    if (level === "gold_standard") {
      return `🏆 MASTERY MAINTENANCE\n\n` +
             `You've achieved gold standard performance. Focus on:\n\n` +
             `1. Scenario repetition (2x per month)\n` +
             `   Duration: 10 min full scenario\n` +
             `   Goal: Maintain speed and consistency\n\n` +
             `2. Stress inoculation\n` +
             `   Duration: Timed 5-min drills with distractions\n` +
             `   Goal: Performance under pressure\n\n` +
             `3. Teach others\n` +
             `   Mentor junior trainees on this scenario\n` +
             `   Teaching reinforces your own learning`;
    }

    if (level === "pass") {
      // Pass: Target weakest pillar
      const weakest = Object.keys(scores).reduce((a, b) =>
        scores[a] < scores[b] ? a : b
      );
      return this._getDrillsForPassedScenario(scenarioId, weakest);
    }

    return "Drill recommendations pending...";
  }

  _getDrillsForFailedScenario(scenarioId, criticalFailures) {
    const failurePoints = criticalFailures.map(f => f.point).join(", ");
    
    return `🚨 URGENT: CRITICAL GAPS DETECTED\n\n` +
           `Missing: ${failurePoints}\n\n` +
           `IMMEDIATE ACTION REQUIRED:\n\n` +
           `Week 1: Daily 5-minute focused drills\n` +
           `- Focus: Recognition + initial action only\n` +
           `- Goal: Automatic response to scenario trigger\n` +
           `- Success: 3 consecutive perfect runs\n\n` +
           `Week 2: Full scenario with supervisor observation\n` +
           `- Focus: End-to-end sequence\n` +
           `- Goal: Unsupervised competence\n` +
           `- Success: Score >70%\n\n` +
           `Week 3: Scenario reassessment\n` +
           `- Goal: Demonstrate >80% proficiency\n\n` +
           `⚠️ Do NOT practice on real patients until reassessment passed.`;
  }

  _getDrillsForPassedScenario(scenarioId, weakestPillar) {
    const drillMap = {
      "outcome": `Patient result management (highest priority if outcome weak)`,
      "timing": `Timed recognition + first action (<2 min drill)`,
      "sequence": `Sequence recall (no time pressure initially)`,
      "technique": `Technical quality (CPR manikin, airway models, etc.)`
    };

    return `🎯 TARGETED SKILL DEVELOPMENT\n\n` +
           `Your weakest area: ${weakestPillar} (${drillMap[weakestPillar]})\n\n` +
           `THIS WEEK (30 min):\n` +
           `- 5x 5-minute drills on ${weakestPillar}\n` +
           `- Record yourself; review for errors\n` +
           `- Target: +10% improvement\n\n` +
           `NEXT WEEK (30 min):\n` +
           `- Full scenario attempt\n` +
           `- Verify ${weakestPillar} improvement held\n` +
           `- Target: Score >75%\n\n` +
           `BEFORE NEXT ASSESSMENT:\n` +
           `- Scenario repetition x2\n` +
           `- Target: Consistent >85%`;
  }

  // Helper: Estimate ROSC time
  _estimateROSCTime(debrief) {
    const actionLog = debrief.actionLog || {};
    const shockTime = actionLog.shockIfAdvised?.timestamp || 0;
    return (shockTime / 1000 / 60).toFixed(1);
  }

  // Helper: List missing critical actions
  _listMissingCriticalActions(debrief) {
    return debrief.learningPoints
      .filter(p => p.category === "critical")
      .map(p => p.point.replace("CRITICAL FAILURE: ", ""))
      .join(", ");
  }

  // Helper: Competency label
  _competencyLabel(score) {
    if (score >= 85) return "🏆 Gold Standard";
    if (score >= 70) return "✅ Pass";
    if (score >= 55) return "⚠️ Borderline";
    return "❌ Fail";
  }

  // Next steps guidance
  _getNextStepsGuidance(level) {
    const guidance = {
      gold_standard:
        "Excellent work. You are ready for independent practice. Continue to maintain these high standards on real patients.",
      pass: "You are competent for independent practice. Focus on your areas for improvement through deliberate practice.",
      borderline:
        "You need focused retraining on the actions you missed. Practice with a supervisor before seeing real patients.",
      fail: "You are not yet competent. Do not practice on real patients. Undertake formal retraining with a qualified instructor before continuing."
    };
    return guidance[level] || "Review guidelines and discuss with your supervisor.";
  }

  // ===== CRITICAL FAILURE DETECTION =====

  _checkCardiacArrestCriticalFailures(actionLog, points) {
    const hasCrashTeamCall = !!actionLog.callCrashTeam;
    const hasCPR = !!actionLog.cprCompressions;
    const hasAED = !!actionLog.applyAEDPads;

    if (!hasCrashTeamCall) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not call for help",
        guidance: "In cardiac arrest, the FIRST action is to call 999/crash team. Without emergency services, survival is extremely unlikely.",
        target: "Call for help IMMEDIATELY on recognizing arrest"
      });
    }

    if (!hasCPR) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not start CPR",
        guidance: "CPR is the lifesaving intervention for cardiac arrest. Without CPR within minutes, irreversible brain damage occurs.",
        target: "Start CPR within 60 seconds of arrest recognition"
      });
    }

    if (!hasAED) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not deploy AED",
        guidance: "The AED (automated external defibrillator) can shock a shockable rhythm back to normal. Every minute without defibrillation reduces survival by 7-10%.",
        target: "Apply AED pads within 2 minutes"
      });
    }
  }

  _checkTraumaCriticalFailures(actionLog, points) {
    const hasSeniorCall = !!actionLog.callSeniorTraumaHelp;
    const hasNeuroCheck = !!actionLog.checkDistalPulse || !!actionLog.checkCapillaryRefill || !!actionLog.checkSensation;
    const hasImmobilization = !!actionLog.immobiliseAndPad;

    if (!hasSeniorCall) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not escalate to senior trauma team",
        guidance: "Femoral fractures can lose 1-1.5L of blood into the thigh compartment within minutes. Senior trauma input is MANDATORY.",
        target: "Call senior trauma help within 2 minutes"
      });
    }

    if (!hasNeuroCheck) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not perform neurovascular assessment",
        guidance: "Distal pulses, capillary refill, sensation, and movement MUST be checked before and after any intervention. Vascular compromise requires emergency action.",
        target: "Check distal CSM (Circulation, Sensation, Movement) before treatment"
      });
    }

    if (!hasImmobilization) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not immobilize the limb",
        guidance: "Movement of a fractured femur causes severe pain, ongoing internal bleeding, and tissue damage. Immobilization MUST occur early.",
        target: "Immobilize and pad the limb within 5 minutes"
      });
    }
  }

  _checkSepsisCriticalFailures(actionLog, points) {
    const hasRecognition = !!actionLog.recogniseSepsis;
    const hasSeniorCall = !!actionLog.callSeniorSepsisHelp;
    const hasAntibiotics = !!actionLog.administerAntibioticsAsPrescribed;
    const hasIVAccess = !!actionLog.establishIVAccess;

    if (!hasRecognition) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not recognize sepsis",
        guidance: "Fever + signs of infection = sepsis until proven otherwise. Missed sepsis diagnosis is a leading cause of preventable deaths in hospital.",
        target: "Recognize SIRS criteria: fever + tachycardia + tachypnea + altered WBC"
      });
    }

    if (!hasSeniorCall) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not escalate to senior staff",
        guidance: "Sepsis is a medical emergency. Senior review is MANDATORY for all suspected sepsis. Early escalation saves lives.",
        target: "Call senior help immediately on suspicion of sepsis"
      });
    }

    if (!hasAntibiotics) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not administer antibiotics",
        guidance: "Antibiotics MUST be given within 1 hour of sepsis recognition. Every hour delay increases mortality by approximately 8%.",
        target: "Administer broad-spectrum antibiotics within 60 minutes"
      });
    }

    if (!hasIVAccess) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not establish IV access",
        guidance: "IV access is essential for antibiotics, blood cultures, and fluid resuscitation in sepsis. Without it, you cannot treat.",
        target: "Establish IV access before or concurrently with other interventions"
      });
    }
  }

  _checkAnaphylaxisCriticalFailures(actionLog, points) {
    const hasRecognition = !!actionLog.recogniseAnaphylaxis;
    const hasAdrenaline = !!actionLog.giveIMAdrenaline;
    const hasOxygen = !!actionLog.giveHighFlowOxygen;
    const hasSeniorCall = !!actionLog.callPaediatricSeniorHelp;

    if (!hasRecognition) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not recognize anaphylaxis",
        guidance: "Acute onset of airway swelling + rash + hypotension = anaphylaxis. If you suspect it, treat it immediately.",
        target: "Recognize: stridor/wheeze + urticaria + hypotension + altered consciousness = anaphylaxis"
      });
    }

    if (!hasAdrenaline) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not give IM adrenaline",
        guidance: "IM adrenaline is the ONLY first-line treatment for anaphylaxis. It's not optional — it's lifesaving. Delay or omission is fatal.",
        target: "Give IM adrenaline 0.3-0.5mg into anterolateral thigh within 5 minutes"
      });
    }

    if (!hasOxygen) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not give high-flow oxygen",
        guidance: "Anaphylaxis causes airway swelling and hypoxia. High-flow oxygen is essential alongside adrenaline.",
        target: "Give high-flow oxygen (10-15L/min) immediately"
      });
    }

    if (!hasSeniorCall) {
      points.push({
        category: "critical",
        severity: "critical",
        point: "CRITICAL FAILURE: Did not call for senior help",
        guidance: "Anaphylaxis can deteriorate rapidly. Senior paediatric help is needed to manage ongoing airway risk and potential intubation.",
        target: "Call senior/resus help immediately"
      });
    }
  }
}