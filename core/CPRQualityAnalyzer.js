// core/CPRQualityAnalyzer.js
// Computes a real 0-1 CPR compression quality score from measured
// compression rate and depth, using the scenario-authored target ranges
// (see e.g. scenarios/cardiac-arrest-adult.json ->
// actionMappings.cprCompressions.qualityEffects).
//
// Previously the qualityScore passed into PatientStateModel#applyAction
// for CPR was just whatever the caller supplied — index.html's dev
// harness always passed a hardcoded 1.0 (or 0.4 on the "poor" test
// button), so no actual technique was ever measured. This module doesn't
// assume any particular input source: a VR hand-tracking rig, a CV
// pipeline, or a manual test harness can all supply
// { ratePerMinute, depthCm } and get back the same deterministic score.

export class CPRQualityAnalyzer {
  // Score a single compression cycle (or a rolling-window average rate/
  // depth) against the scenario's target ranges. Returns a value in
  // [0, 1] suitable to pass straight into PatientStateModel#applyAction.
  //
  // Scoring model:
  //   - Inside both the rate and depth target ranges: 1.0 (full credit).
  //   - Outside a range: credit degrades linearly with distance from the
  //     nearest edge, reaching 0 once the miss is as large as the range
  //     itself (e.g. a 100-120/min target reaches 0 credit at 80 or 140).
  //   - The two dimensions are combined by taking the *lower* (worse) of
  //     the two component scores — real CPR quality is bottlenecked by
  //     whichever dimension is failing. A perfect rate doesn't compensate
  //     for compressions too shallow to generate perfusion, and vice versa.
  static scoreCompression({ ratePerMinute, depthCm } = {}, qualityEffects = {}) {
    const rateScore = this._scoreAgainstRange(ratePerMinute, qualityEffects.rateTargetPerMinute)
    const depthScore = this._scoreAgainstRange(depthCm, qualityEffects.depthTargetCm)

    // If a target range wasn't authored for this scenario/action, don't
    // let a missing dimension silently drag the score down — only combine
    // the dimensions that actually have targets.
    const scores = [rateScore, depthScore].filter(s => s !== null)
    if (!scores.length) return 1.0

    return Math.max(0, Math.min(1, Math.min(...scores)))
  }

  // Average a series of per-compression scores, e.g. across a CPR cycle,
  // for debrief/metric reporting.
  static averageQuality(scores = []) {
    const valid = scores.filter(s => typeof s === 'number' && !Number.isNaN(s))
    if (!valid.length) return 0
    return valid.reduce((sum, s) => sum + s, 0) / valid.length
  }

  // Whether a score meets the scenario's minimum-effective-quality bar
  // (e.g. cardiac-arrest-adult's qualityEffects.minimumEffectiveQuality).
  static isEffective(score, qualityEffects = {}) {
    const threshold = qualityEffects.minimumEffectiveQuality ?? 0
    return typeof score === 'number' && score >= threshold
  }

  static _scoreAgainstRange(value, range) {
    if (range == null || typeof value !== 'number' || Number.isNaN(value)) return null

    const { min, max } = range
    if (typeof min !== 'number' || typeof max !== 'number') return null

    if (value >= min && value <= max) return 1.0

    const span = max - min
    if (span <= 0) return value === min ? 1.0 : 0

    const distance = value < min ? (min - value) : (value - max)
    return Math.max(0, 1 - (distance / span))
  }
}
