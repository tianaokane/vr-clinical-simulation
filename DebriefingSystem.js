// core/DebriefingSystem.js
// Analyzes scenario performance against RCUK gold standard and generates learning feedback.
// Based on Chain of Survival: early recognition → immediate CPR → rapid defibrillation → post-ROSC care

export class DebriefingSystem {
  constructor(scenarioConfig = {}) {
    // RCUK gold standards for cardiac arrest (first-aider scope)
    this.goldStandard = {
      timeToFirstCheckSeconds: 10,
      timeToCallForHelpSeconds: 30,
      timeToFirstCPRSeconds: 60,
      timeToAEDDeploymentSeconds: 120,
      compressionRateMin: 100,
      compressionRateMax: 120,
      compressionDepthMin: 5,
      compressionDepthMax: 6,
      minCompressionQuality: 0.7,
      targetROSCachieved: true
    };

    this.scenarioConfig = scenarioConfig;
  }

  // Main entry point: consume scenario results and generate debrief
  generateDebrief(psmLog, actionLog, finalState, scenarioId) {
    const debrief = {
      scenarioId,
      timestamp: new Date().toISOString(),
      summary: {},
      scores: {},
      learningPoints: [],
      competencyLevel: null,
      feedback: []
    };

    // Extract metrics from PSM log
    const metrics = this._extractMetrics(psmLog);

    // Score each pillar of performance
    debrief.scores.timing = this._scoreTiming(actionLog, metrics);
    debrief.scores.sequence = this._scoreSequence(actionLog);
    debrief.scores.technique = this._scoreTechnique(metrics);
    debrief.scores.outcome = this._scoreOutcome(finalState);

    // Overall assessment
    const overallScore = this._calculateOverallScore(debrief.scores);
    debrief.summary.overallScore = overallScore;
    debrief.competencyLevel = this._assessCompetency(overallScore, debrief.scores);

    // Generate targeted learning points
    debrief.learningPoints = this._generateLearningPoints(
      actionLog,
      metrics,
      debrief.scores,
      scenarioId
    );

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
      totalCompressions: 0,
      averageCPRQuality: 0,
      shockCount: 0,
      pausesInCPR: 0,
      maxPauseDuration: 0
    };

    // Parse PSM logs to extract timestamps
    // (In real scenario, PSM would emit structured events)
    // For now, this is a placeholder for the structure

    return metrics;
  }

  // Score timing against gold standard (0-100)
  _scoreTiming(actionLog, metrics) {
    let timingScore = 100;

    // Deduct points for delayed response
    if (actionLog.checkResponse) {
      const checkTime = actionLog.checkResponse.timestamp || 0;
      if (checkTime > this.goldStandard.timeToFirstCheckSeconds * 1000) {
        timingScore -= 5;
      }
    }

    // Deduct for delayed call for help
    if (actionLog.callCrashTeam) {
      const callTime = actionLog.callCrashTeam.timestamp || 0;
      if (callTime > this.goldStandard.timeToCallForHelpSeconds * 1000) {
        timingScore -= 15; // Calling help late is a significant issue
      }
    }

    // Deduct for delayed CPR
    if (actionLog.cprCompressions) {
      const cprTime = actionLog.cprCompressions.timestamp || 0;
      if (cprTime > this.goldStandard.timeToFirstCPRSeconds * 1000) {
        timingScore -= 20; // Delayed CPR = poor outcome
      }
    }

    // Deduct for delayed AED
    if (actionLog.applyAEDPads) {
      const aedTime = actionLog.applyAEDPads.timestamp || 0;
      if (aedTime > this.goldStandard.timeToAEDDeploymentSeconds * 1000) {
        timingScore -= 10;
      }
    }

    return Math.max(0, timingScore);
  }

  // Score action sequence adherence (0-100)
  _scoreSequence(actionLog) {
    let sequenceScore = 100;
    const goldSequence = [
      "checkResponse",
      "callCrashTeam",
      "openAirway",
      "checkBreathing",
      "cprCompressions",
      "applyAEDPads",
      "shockIfAdvised",
      "continueCPRAfterShock"
    ];

    const performedActions = Object.keys(actionLog).filter(key => actionLog[key]);
    const expectedActions = goldSequence.filter(action => performedActions.includes(action));

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

    // Deduct for missing critical actions
    const criticalActions = ["callCrashTeam", "cprCompressions", "applyAEDPads"];
    for (const action of criticalActions) {
      if (!performedActions.includes(action)) {
        sequenceScore -= 25;
      }
    }

    return Math.max(0, sequenceScore);
  }

  // Score technical quality of CPR (0-100)
  _scoreTechnique(metrics) {
    let techniqueScore = 100;

    // Compression quality assessment
    if (metrics.averageCPRQuality) {
      if (metrics.averageCPRQuality < this.goldStandard.minCompressionQuality) {
        // Poor quality = significant deduction
        const qualityGap = this.goldStandard.minCompressionQuality - metrics.averageCPRQuality;
        techniqueScore -= qualityGap * 100; // Scale to percentage
      }
    }

    // Deduct for pauses in CPR
    if (metrics.pausesInCPR > 0) {
      techniqueScore -= metrics.pausesInCPR * 5;
      if (metrics.maxPauseDuration > 10) {
        techniqueScore -= 20; // Long pause = interrupted blood flow
      }
    }

    return Math.max(0, techniqueScore);
  }

  // Score outcome (0-100)
  _scoreOutcome(finalState) {
    let outcomeScore = 0;

    if (!finalState) {
      return 0;
    }

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
    // ROSC pending = 70 points (getting close)
    else if (rhythmState === "rosc_pending") {
      outcomeScore = 70;
    }
    // Still in arrest = 20 points (effort made but unsuccessful)
    else if (rhythmState === "arrest") {
      outcomeScore = 20;
    }
    // Patient dead = 0
    else {
      outcomeScore = 0;
    }

    return Math.max(0, outcomeScore);
  }

  // Calculate overall score (0-100)
  _calculateOverallScore(scores) {
    const weights = {
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

  // Assign competency level based on RCUK standards
  _assessCompetency(overallScore, scores) {
    // Gold Standard: 85-100 (all pillars strong, ROSC achieved with good technique)
    if (overallScore >= 85 && scores.outcome >= 90) {
      return {
        level: "gold_standard",
        label: "Gold Standard",
        description: "Excellent performance. Rapid recognition, correct sequence, high-quality CPR, ROSC achieved."
      };
    }

    // Pass: 70-84 (core actions done, ROSC achieved or strong effort)
    if (overallScore >= 70 && scores.outcome >= 70) {
      return {
        level: "pass",
        label: "Pass",
        description: "Competent performance. All critical actions performed, good sequence adherence, effective outcome."
      };
    }

    // Borderline: 55-69 (missing some actions or poor technique but some progress)
    if (overallScore >= 55) {
      return {
        level: "borderline",
        label: "Borderline",
        description: "Concerning performance. Some actions missed or poor technique. Requires focused practice."
      };
    }

    // Fail: <55 (critical actions missed, poor outcome, significant safety concerns)
    return {
      level: "fail",
      label: "Fail",
      description: "Unsafe performance. Critical actions missed or incorrect sequencing. Do not practice on real patients until retrained."
    };
  }

  // Generate specific learning points based on performance
  _generateLearningPoints(actionLog, metrics, scores, scenarioId) {
    const points = [];

    // Timing feedback
    if (scores.timing < 80) {
      if (actionLog.callCrashTeam && actionLog.callCrashTeam.timestamp > 30000) {
        points.push({
          category: "timing",
          severity: "high",
          point: "Delayed call for help",
          guidance: "Call 999/crash team within 30 seconds of recognizing arrest. Early help is critical for outcome.",
          target: "< 30 seconds"
        });
      }

      if (actionLog.cprCompressions && actionLog.cprCompressions.timestamp > 60000) {
        points.push({
          category: "timing",
          severity: "high",
          point: "Delayed start of CPR",
          guidance: "Start CPR within 60 seconds of recognizing arrest. Every second of delay reduces survival chances.",
          target: "< 60 seconds"
        });
      }
    }

    // Sequence feedback
    if (scores.sequence < 80) {
      const criticalActions = ["callCrashTeam", "cprCompressions", "applyAEDPads"];
      for (const action of criticalActions) {
        if (!actionLog[action]) {
          points.push({
            category: "sequence",
            severity: "high",
            point: `Missing critical action: ${this._humanizeName(action)}`,
            guidance: this._getActionGuidance(action),
            target: "Perform all steps of Chain of Survival"
          });
        }
      }
    }

    // Technique feedback
    if (scores.technique < 80) {
      if (metrics.averageCPRQuality < this.goldStandard.minCompressionQuality) {
        points.push({
          category: "technique",
          severity: "high",
          point: "Poor compression quality",
          guidance: "Aim for 100-120 compressions/min, 5-6cm depth. Use full recoil between compressions.",
          target: `Quality score > ${this.goldStandard.minCompressionQuality}`
        });
      }

      if (metrics.maxPauseDuration > 10) {
        points.push({
          category: "technique",
          severity: "medium",
          point: "Long pauses in CPR",
          guidance: "Minimize interruptions to chest compressions. Every pause reduces perfusion.",
          target: "< 10 second gaps between compressions"
        });
      }
    }

    // Outcome feedback
    if (scores.outcome < 100) {
      if (actionLog.rhythmState === "rosc" && metrics.averageCPRQuality < 0.8) {
        points.push({
          category: "outcome",
          severity: "low",
          point: "ROSC achieved but with lower compression quality",
          guidance: "While ROSC was achieved, higher quality CPR would improve post-resuscitation outcomes.",
          target: "Maintain compression quality throughout"
        });
      }
    }

    // Positive reinforcement (what they did well)
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

    return points;
  }

  // Generate human-readable debrief feedback
  _generateFeedback(debrief, scenarioId) {
    const feedback = [];

    // Header
    feedback.push({
      type: "header",
      title: "Cardiac Arrest Debriefing",
      score: `${debrief.summary.overallScore}%`,
      level: debrief.competencyLevel.label
    });

    // Summary
    feedback.push({
      type: "summary",
      text: debrief.competencyLevel.description
    });

    // Score breakdown
    feedback.push({
      type: "scores",
      data: {
        "Timing": `${debrief.scores.timing}%`,
        "Sequence": `${debrief.scores.sequence}%`,
        "Technique": `${debrief.scores.technique}%`,
        "Outcome": `${debrief.scores.outcome}%`
      }
    });

    // Learning points
    if (debrief.learningPoints.length > 0) {
      const strengths = debrief.learningPoints.filter(p => p.category === "strength");
      const concerns = debrief.learningPoints.filter(p => p.category !== "strength");

      if (strengths.length > 0) {
        feedback.push({
          type: "section",
          title: "What You Did Well",
          items: strengths.map(p => `${p.point}: ${p.guidance}`)
        });
      }

      if (concerns.length > 0) {
        feedback.push({
          type: "section",
          title: "Areas for Improvement",
          items: concerns.map(p => ({
            severity: p.severity,
            title: p.point,
            guidance: p.guidance,
            target: p.target
          }))
        });
      }
    }

    // Next steps
    feedback.push({
      type: "next_steps",
      text: this._getNextStepsGuidance(debrief.competencyLevel.level)
    });

    return feedback;
  }

  // Helper: humanize action name
  _humanizeName(action) {
    const names = {
      checkResponse: "Check Responsiveness",
      callCrashTeam: "Call for Help",
      openAirway: "Open Airway",
      checkBreathing: "Check Breathing",
      cprCompressions: "Start CPR",
      applyAEDPads: "Apply AED Pads",
      shockIfAdvised: "Deliver Shock",
      continueCPRAfterShock: "Continue CPR After Shock"
    };
    return names[action] || action;
  }

  // Helper: get guidance for specific action
  _getActionGuidance(action) {
    const guidance = {
      callCrashTeam:
        "Call emergency services (999 in UK / on 2222 for in-hospital arrest). Give them your location, patient's age/sex, and 'cardiac arrest'.",
      cprCompressions:
        "Start chest compressions immediately. Push hard and fast (100-120/min) on the lower half of sternum, 5-6cm depth, with full recoil.",
      applyAEDPads:
        "Retrieve automated external defibrillator (AED) immediately. Apply pads according to label, and follow voice guidance."
    };
    return guidance[action] || "Follow RCUK guidelines for this action.";
  }

  // Helper: get next steps guidance
  _getNextStepsGuidance(level) {
    const guidance = {
      gold_standard:
        "Excellent work. You are ready for independent practice. Continue to maintain these high standards on real patients.",
      pass: "You are competent for independent practice. Focus on your areas for improvement through deliberate practice.",
      borderline:
        "You need focused retraining on the actions you missed. Practice with a supervisor before seeing real patients.",
      fail: "You are not yet competent. Do not practice on real patients. Undertake formal retraining with RCUK instructor before continuing."
    };
    return guidance[level] || "Review RCUK guidelines and discuss with your supervisor.";
  }
}