// core/InteractionSystem.js
//
// Scenario-agnostic, framework-agnostic interaction logic. This is the
// single layer every front-end resolves through — a desktop click-menu, a
// WebXR controller ray-select, or the existing ActionClassifier text/voice
// pathway — so they all end up calling the same PatientStateModel methods
// with the same shape, instead of three parallel implementations drifting
// apart. See claude/next-steps-roadmap.md ("interaction system design")
// for the reasoning.
//
// This module has no DOM/Three.js/WebXR dependency on purpose — it only
// knows about a PatientStateModel instance and the scenario's
// actionMappings. A visual layer (interaction-demo.html today, Scene.js /
// a WebXR controller handler later) is responsible for rendering whatever
// this returns and calling select() when the trainee picks something.

// Fixed display order so the menu has the same shape scenario to
// scenario even though which categories are actually present varies.
// (See migrate_schema.py / next-steps-roadmap.md for why these categories
// exist and how each action was assigned one.)
export const CATEGORY_ORDER = [
  'Assessment',
  'Recognition',
  'Airway',
  'Breathing',
  'Circulation',
  'Disability',
  'Exposure',
  'Escalation',
  'Medications',
  'Stabilisation',
  'Monitoring',
  'Reassessment',
  'Definitive care',
  'Handover',
  'Aftercare',
  'Unsafe'
]

export class InteractionSystem {
  constructor(psm) {
    if (!psm) {
      throw new Error('InteractionSystem requires a PatientStateModel instance')
    }
    this.psm = psm
  }

  get _actionMappings() {
    return this.psm.scenarioConfig?.actionMappings ?? {}
  }

  // Categories actually present in this scenario, in canonical order.
  getCategories() {
    const present = new Set()
    for (const action of Object.values(this._actionMappings)) {
      if (action.category) present.add(action.category)
    }
    return CATEGORY_ORDER.filter(category => present.has(category))
  }

  // Actions within a category, annotated with whether they're currently
  // selectable (and why not, for disabled-state tooltips), sorted the
  // same way the scenario authors ordered them (`sequence`).
  getActionsForCategory(category) {
    return Object.entries(this._actionMappings)
      .filter(([, action]) => action.category === category)
      .map(([id, action]) => {
        const check = this.psm.canApplyAction(id)
        return {
          id,
          label: action.label ?? id,
          instruction: action.instruction ?? '',
          allowed: check.allowed,
          reason: check.reason,
          captureType: action.captureType ?? null,
          validSites: action.validSites ?? null,
          toolId: action.toolId ?? null,
          dangerous: action.dangerousTestAction === true,
          sequence: action.sequence ?? 999
        }
      })
      .sort((a, b) => a.sequence - b.sequence)
  }

  getAction(actionId) {
    const action = this._actionMappings[actionId]
    if (!action) return null

    const check = this.psm.canApplyAction(actionId)
    return {
      id: actionId,
      label: action.label ?? actionId,
      instruction: action.instruction ?? '',
      allowed: check.allowed,
      reason: check.reason,
      captureType: action.captureType ?? null,
      validSites: action.validSites ?? null,
      toolId: action.toolId ?? null,
      dangerous: action.dangerousTestAction === true
    }
  }

  getSitesForAction(actionId) {
    return this._actionMappings[actionId]?.validSites ?? null
  }

  isCaptureAction(actionId) {
    return !!this._actionMappings[actionId]?.captureType
  }

  // Resolve a trainee's selection. `quality` is only meaningful for
  // capture-type actions (e.g. CPRQualityAnalyzer.scoreCompression's
  // output) — discrete/procedural actions default to full credit, same
  // as the rest of the app: a wrong choice is scored via the scenario's
  // own authored effects/penalties (see the "Unsafe" category and
  // invalid-site rejection), not by silently discounting quality.
  select(actionId, { site = null, quality = 1.0 } = {}) {
    return this.psm.applyAction(actionId, quality, { site })
  }
}
