// core/PatientStateModel.js
// Scenario-driven Patient State Model for AR/VR First Aid Training Simulator
// Designed for Pillar 3 now, and later WebXR/Three.js adapters.

export class PatientStateModel {

    constructor(scenarioConfig = {}) {
        this.scenarioConfig = scenarioConfig ?? {}

        this.startTime = Date.now()
        this.isRunning = false
        this.history = []
        this.intervalId = null

        this.rhythmState = this.scenarioConfig?.rhythmState ?? 'unknown'
        this.arrestRhythm = this.scenarioConfig?.arrestRhythm ?? null

        this.simulationState = {
            ...(this.scenarioConfig?.simulationState ?? {})
        }

        this.metrics = {
            timeToFirstCPRSeconds: null,
            timeToFirstShockSeconds: null,
            recentCPRQuality: 0,
            averageCPRQuality: 0,
            cprAttemptCount: 0,
            shockCount: 0,
            unsafeActions: 0,
            missedActions: 0,
            ...(this.scenarioConfig?.metrics ?? {})
        }

        this._couplingsSuppressedUntil = 0
        this._completedActions = new Set()
        this._actionCounts = {}
        this._lastActionResult = null
        this._scenarioEnded = false
        this._scenarioOutcome = null

        this.parameters = this._buildParameters(this.scenarioConfig)
        this._applyInitialDerivedValues()
    }

    // ─────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────

    start() {
        if (this.isRunning) {
            return { ok: false, outcome: 'already_running' }
        }

        this.isRunning = true
        this.startTime = Date.now()
        this._scenarioEnded = false
        this._scenarioOutcome = null

        this.intervalId = setInterval(() => {
            this._tick()
        }, 1000)

        console.log('PatientStateModel: simulation started')
        return { ok: true, outcome: 'started' }
    }

    stop(reason = 'manual_stop') {
        if (!this.isRunning) {
            return { ok: false, outcome: 'not_running' }
        }

        this.isRunning = false
        clearInterval(this.intervalId)
        this.intervalId = null

        console.log(`PatientStateModel: simulation stopped (${reason})`)
        return { ok: true, outcome: 'stopped', reason }
    }

    reset() {
        const fresh = new PatientStateModel(this.scenarioConfig)
        Object.assign(this, fresh)
        console.log('PatientStateModel: simulation reset')
        return { ok: true, outcome: 'reset' }
    }

    // ─────────────────────────────────────────────────────────────
    // Parameter building
    // ─────────────────────────────────────────────────────────────

    _buildParameters(config) {
        const vitals = config?.vitals ?? {}

        const neutral = {
            pulseRate:             { initial: 72,   drift: 0, criticalBelow: 40,  criticalAbove: 150,  min: 0,  max: 220, unit: 'bpm' },
            oxygenSaturation:      { initial: 99,   drift: 0, criticalBelow: 85,  criticalAbove: null, min: 0,  max: 100, unit: '%' },
            consciousness:         { initial: 1.0,  drift: 0, criticalBelow: 0.3, criticalAbove: null, min: 0,  max: 1,   unit: 'GCS proxy' },
            respiratoryRate:       { initial: 14,   drift: 0, criticalBelow: 8,   criticalAbove: 40,   min: 0,  max: 60,  unit: 'breaths/min' },
            painScore:             { initial: 0,    drift: 0, criticalBelow: null,criticalAbove: null, min: 0,  max: 10,  unit: '/10' },
            bloodPressureSystolic: { initial: 120,  drift: 0, criticalBelow: 70,  criticalAbove: 180,  min: 0,  max: 220, unit: 'mmHg' },
            temperature:           { initial: 37.0, drift: 0, criticalBelow: 35,  criticalAbove: 39.5, min: 32, max: 42,  unit: '°C' }
        }

        const built = {}
        const allKeys = new Set([...Object.keys(neutral), ...Object.keys(vitals)])

        for (const key of allKeys) {
            const defaults = neutral[key] ?? {}
            const override = vitals[key] ?? {}

            built[key] = {
                value:          override.initial       ?? defaults.initial       ?? 0,
                min:            override.min           ?? defaults.min           ?? -Infinity,
                max:            override.max           ?? defaults.max           ?? Infinity,
                driftPerSecond: override.drift         ?? defaults.drift         ?? 0,
                criticalBelow:  override.criticalBelow ?? defaults.criticalBelow ?? null,
                criticalAbove:  override.criticalAbove ?? defaults.criticalAbove ?? null,
                unit:           override.unit          ?? defaults.unit          ?? this._unitFor(key),
                label:          override.label         ?? this._labelFor(key),
                learnerVisible: override.learnerVisible ?? true,
                displayOnly:    override.displayOnly   ?? false,
                decimals:       override.decimals      ?? this._defaultDecimalsFor(key),
                derived:        false
            }
        }

        built.skinColour = {
            value: { state: 'normal', assessmentSite: null, visuallyObvious: true },
            displayOnly: true,
            derived: true,
            unit: 'descriptor',
            label: 'Skin colour',
            learnerVisible: true,
            decimals: null
        }

        // Scenario-authored derived/display values, e.g. displayedOxygenSaturation or pulseOxSignalQuality.
        for (const [key, configValue] of Object.entries(this.scenarioConfig?.derivedParameters ?? {})) {
            if (built[key]) continue
            built[key] = {
                value: configValue.initial ?? null,
                min: configValue.min ?? -Infinity,
                max: configValue.max ?? Infinity,
                driftPerSecond: 0,
                criticalBelow: configValue.criticalBelow ?? null,
                criticalAbove: configValue.criticalAbove ?? null,
                unit: configValue.unit ?? '',
                label: configValue.label ?? this._labelFor(key),
                learnerVisible: configValue.learnerVisible ?? true,
                displayOnly: true,
                derived: true,
                decimals: configValue.decimals ?? this._defaultDecimalsFor(key)
            }
        }

        return built
    }

    _applyInitialDerivedValues() {
        this.parameters.skinColour.value = this._computeSkinColour()
        this._updateMonitorOutputs()
    }

    _unitFor(key) {
        const units = {
            pulseRate: 'bpm',
            oxygenSaturation: '%',
            displayedOxygenSaturation: '%',
            pulseOxSignalQuality: '',
            consciousness: 'GCS proxy',
            respiratoryRate: 'breaths/min',
            painScore: '/10',
            bloodPressureSystolic: 'mmHg',
            temperature: '°C'
        }
        return units[key] ?? ''
    }

    _labelFor(key) {
        const labels = {
            pulseRate: 'Heart rate',
            oxygenSaturation: 'Internal SpO₂',
            displayedOxygenSaturation: 'Displayed SpO₂',
            pulseOxSignalQuality: 'Pulse ox signal',
            consciousness: 'Consciousness',
            respiratoryRate: 'Resp rate',
            painScore: 'Pain score',
            bloodPressureSystolic: 'BP systolic',
            temperature: 'Temperature',
            skinColour: 'Skin colour'
        }

        return labels[key] ?? key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, c => c.toUpperCase())
    }

    _defaultDecimalsFor(key) {
        if (['consciousness', 'pulseOxSignalQuality'].includes(key)) return 2
        if (['temperature', 'oxygenSaturation', 'displayedOxygenSaturation', 'pulseRate', 'respiratoryRate', 'painScore'].includes(key)) return 1
        return 0
    }

    // ─────────────────────────────────────────────────────────────
    // Tick loop
    // ─────────────────────────────────────────────────────────────

    _tick() {
        if (this._scenarioEnded) return

        this._applyPersistentEffects()
        const coupledDrift = this._computeCoupledDrift()

        for (const [key, param] of Object.entries(this.parameters)) {
            if (param.derived || param.displayOnly) continue
            if (typeof param.value !== 'number') continue

            const totalDrift = param.driftPerSecond + (coupledDrift[key] ?? 0)
            param.value += totalDrift
            param.value = this._clampValue(key, param.value)
        }

        this._applyParameterConstraints()
        this.parameters.skinColour.value = this._computeSkinColour()
        this._updateMonitorOutputs()
        this._logSnapshot()
        this._checkScenarioEndConditions()

        console.log(`[t=${this._elapsedSeconds()}s]`, this._summaryLine())

        if (this.onStateChange) {
            this.onStateChange(this._buildFlatState())
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Flat state (for consumers like Scene.js/VirtualPatient.js that
    // expect plain numeric fields rather than {value, min, max, ...}
    // parameter objects — same shape DialogueEngine.getCurrentState()
    // falls back to).
    // ─────────────────────────────────────────────────────────────

    _buildFlatState() {
        const state = {
            rhythmState: this.rhythmState,
            arrestRhythm: this.arrestRhythm
        }

        for (const [key, param] of Object.entries(this.parameters)) {
            state[key] = param.value
        }

        Object.assign(state, this.simulationState)

        return state
    }

    _summaryLine() {
        const bits = []

        for (const key of [
            'pulseRate',
            'oxygenSaturation',
            'displayedOxygenSaturation',
            'bloodPressureSystolic',
            'respiratoryRate',
            'consciousness'
        ]) {
            const param = this.parameters[key]
            if (!param) continue

            const value = typeof param.value === 'number'
                ? param.value.toFixed(param.decimals ?? 1)
                : String(param.value)

            bits.push(`${key}=${value}`)
        }

        bits.push(`rhythm=${this.rhythmState}`)
        bits.push(`skin=${this.parameters.skinColour.value.state}`)

        return bits.join(' ')
    }

    _computeCoupledDrift() {
        const couplings = this.scenarioConfig?.couplings ?? []
        const coupled = {}

        for (const key of Object.keys(this.parameters)) {
            coupled[key] = 0
        }

        if (Date.now() < this._couplingsSuppressedUntil) {
            return coupled
        }

        for (const rule of couplings) {
            if (!this._ruleContextMatches(rule.onlyWhen)) continue
            if (rule._fired) continue

            const conditionMet = this._conditionObjectMatchesRule(rule)
            if (!conditionMet) continue

            if (rule.once) {
                for (const [target, delta] of Object.entries(rule.effects ?? {})) {
                    if (this.parameters[target] && typeof this.parameters[target].driftPerSecond === 'number') {
                        this.parameters[target].driftPerSecond += delta
                    }
                }

                this._applyStateEffects(rule.hiddenStateEffects ?? {})
                rule._fired = true
                console.log(`[coupling fired permanently] ${rule.reason ?? rule.id ?? 'unnamed coupling'}`)
            } else {
                for (const [target, delta] of Object.entries(rule.effects ?? {})) {
                    if (coupled[target] !== undefined) {
                        coupled[target] += delta
                    }
                }

                this._applyStateEffects(rule.hiddenStateEffects ?? {})
            }
        }

        return coupled
    }

    _applyPersistentEffects() {
        const actions = this.scenarioConfig?.actionMappings ?? {}

        for (const action of Object.values(actions)) {
            const persistent = action.persistentEffect
            if (!persistent) continue
            if (!this._conditionsMatch(persistent.while ?? {})) continue

            const trend = persistent.trend ?? {}

            for (const [target, spec] of Object.entries(trend)) {
                if (this.parameters[target]) {
                    this._trendParameter(target, spec.towards, spec.ratePerSecond ?? 0)
                } else {
                    this._trendSimulationState(target, spec.towards, spec.ratePerSecond ?? 0)
                }
            }
        }
    }

    _trendParameter(key, target, rate) {
        const param = this.parameters[key]
        if (!param || typeof param.value !== 'number' || typeof target !== 'number') return

        const diff = target - param.value
        const step = Math.sign(diff) * Math.min(Math.abs(diff), Math.abs(rate))

        param.value = this._clampValue(key, param.value + step)
    }

    _trendSimulationState(key, target, rate) {
        const current = this.simulationState[key]
        if (typeof current !== 'number' || typeof target !== 'number') return

        const diff = target - current
        const step = Math.sign(diff) * Math.min(Math.abs(diff), Math.abs(rate))

        this.simulationState[key] = current + step
    }

    // ─────────────────────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────────────────────

    // Read-only version of applyAction's guard clauses — lets a menu/UI
    // layer (InteractionSystem, Scene.js, a future voice pathway) ask
    // "could this be selected right now, and if not why" without mutating
    // state or writing a log entry. Mirrors applyAction's checks in the
    // same order so "allowed here" and "succeeds if applied" never drift
    // apart from each other.
    canApplyAction(actionId) {
        if (!this.isRunning) {
            return { allowed: false, reason: 'Scenario is not running' }
        }

        if (this._scenarioEnded) {
            return { allowed: false, reason: 'Scenario has ended' }
        }

        const mappings = this.scenarioConfig?.actionMappings ?? {}
        const action = mappings[actionId]

        if (!action) {
            return { allowed: false, reason: `Unknown action: ${actionId}` }
        }

        if (action.oneShot && action._fired) {
            return { allowed: false, reason: `${action.label ?? actionId} already completed` }
        }

        const preconditionFailure = this._firstConditionFailure(action.preconditions ?? {})
        if (preconditionFailure) {
            return { allowed: false, reason: action.preconditionMessage ?? preconditionFailure }
        }

        const requiredStateFailure = this._firstRequiredStateFailure(action.requiresState ?? {})
        if (requiredStateFailure) {
            return { allowed: false, reason: action.requiredStateMessage ?? requiredStateFailure }
        }

        return { allowed: true, reason: null }
    }

    applyAction(actionId, qualityScore = 1.0, { site = null } = {}) {
        if (!this.isRunning) {
            return { ok: false, outcome: 'not_running', actionId }
        }

        if (this._scenarioEnded) {
            return { ok: false, outcome: 'scenario_ended', actionId }
        }

        const mappings = this.scenarioConfig?.actionMappings ?? {}
        const action = mappings[actionId]

        if (!action) {
            const result = {
                ok: false,
                outcome: 'unknown_action',
                actionId,
                message: `Unknown action: ${actionId}`
            }

            console.warn(`applyAction: unknown action '${actionId}'`)
            return result
        }

        const quality = Math.max(0, Math.min(1, Number(qualityScore) || 0))

        // Site validation lives here (not just in InteractionSystem) so any
        // caller of applyAction — the interaction system, a future voice/LLM
        // pathway, or a direct test call — gets the same guarantee: a site
        // outside the action's authored validSites is rejected rather than
        // silently accepted. Actions without validSites don't care about site.
        if (Array.isArray(action.validSites) && site && !action.validSites.includes(site)) {
            const result = {
                ok: false,
                outcome: 'invalid_site',
                actionId,
                message: `${site} is not a valid site for ${action.label ?? actionId}`
            }

            this._logAction(actionId, quality, {}, result.outcome, site)
            console.warn(`[action blocked] ${action.label ?? actionId}: invalid site '${site}'`)
            return result
        }

        if (action.oneShot && action._fired) {
            const result = {
                ok: false,
                outcome: 'already_fired',
                actionId,
                message: `${action.label ?? actionId} already completed`
            }

            this._logAction(actionId, quality, {}, result.outcome, site)
            console.warn(`[action blocked] ${action.label ?? actionId} — already fired this scenario`)
            return result
        }

        const preconditionFailure = this._firstConditionFailure(action.preconditions ?? {})
        if (preconditionFailure) {
            const message = action.preconditionMessage ?? preconditionFailure

            const result = {
                ok: false,
                outcome: 'precondition_failed',
                actionId,
                message
            }

            this._logAction(actionId, quality, {}, result.outcome, site)
            console.warn(`[action blocked] ${action.label ?? actionId}: ${message}`)
            return result
        }

        const requiredStateFailure = this._firstRequiredStateFailure(action.requiresState ?? {})
        if (requiredStateFailure) {
            const message = action.requiredStateMessage ?? requiredStateFailure

            const result = {
                ok: false,
                outcome: 'required_state_failed',
                actionId,
                message
            }

            this._logAction(actionId, quality, {}, result.outcome, site)
            console.warn(`[action blocked] ${action.label ?? actionId}: ${message}`)
            return result
        }

       if (action.oneShot) {
            action._fired = true
        }

        this._applyMetricUpdates(actionId, action, quality)

        const appliedEffects = {}

        this._applyStateEffects(action.setsState ?? {})

        for (const [param, delta] of Object.entries(action.effects ?? {})) {
            if (!this.parameters[param]) continue
            if (typeof this.parameters[param].value !== 'number') continue

            const scaledDelta = delta * quality
            this.parameters[param].value = this._clampValue(
                param,
                this.parameters[param].value + scaledDelta
            )

            appliedEffects[param] = scaledDelta
        }

        this._applyMonitorEffect(action.monitorEffect ?? {})

        if (action.suppressCouplings) {
            const duration = (action.suppressDuration ?? 3) * 1000
            this._couplingsSuppressedUntil = Date.now() + duration
        }

        if (action.restoresRhythm) {
            this._setRhythm('rosc')
        }

        const conditionalResult = this._applyConditionalOutcome(action.conditionalOutcome)

        this._applyParameterConstraints()
        this.parameters.skinColour.value = this._computeSkinColour()
        this._updateMonitorOutputs()

        this._completedActions.add(actionId)
        this._actionCounts[actionId] = (this._actionCounts[actionId] ?? 0) + 1

        const outcome = conditionalResult?.outcome ?? (action.completionOnly ? 'completed' : 'applied')

        this._logAction(actionId, quality, appliedEffects, outcome, site)

        const result = {
            ok: true,
            outcome,
            actionId,
            label: action.label ?? actionId,
            quality,
            site,
            effects: appliedEffects,
            message: conditionalResult?.message ?? action.learnerFeedback ?? null
        }

        this._lastActionResult = result

        console.log(
            `[action] ${action.label ?? actionId} (quality=${quality.toFixed(2)})`,
            Object.entries(appliedEffects)
                .map(([k, v]) => `${k}:${v > 0 ? '+' : ''}${v.toFixed(3)}`)
                .join(' '),
            result.message ? `— ${result.message}` : ''
        )

        if (this.onStateChange) {
            this.onStateChange(this._buildFlatState())
        }

        return result
    }

    _applyConditionalOutcome(conditionalOutcome) {
        if (!conditionalOutcome) return null

        const success = this._conditionsMatch(conditionalOutcome.successCondition ?? {})
        const branch = success ? conditionalOutcome.onSuccess : conditionalOutcome.onFailure

        if (!branch) {
            return {
                outcome: success ? 'conditional_success' : 'conditional_failure'
            }
        }

        if (branch.rhythmState) {
            this._setRhythm(branch.rhythmState)
        }

        this._applyStateEffects(branch.setsState ?? {})
        this._applyMonitorEffect(branch.monitorEffect ?? {})

        for (const [param, valueOrDelta] of Object.entries(branch.effects ?? {})) {
            if (!this.parameters[param]) continue
            if (typeof this.parameters[param].value !== 'number') continue

            // Branch effects are treated as set-to values by default for clinical state transitions.
            this.parameters[param].value = this._clampValue(param, valueOrDelta)
        }

        return {
            outcome: success ? 'conditional_success' : 'conditional_failure',
            message: branch.message ?? null
        }
    }

    _setRhythm(newRhythm) {
        if (!newRhythm || this.rhythmState === newRhythm) return

        this.rhythmState = newRhythm

        if (newRhythm === 'rosc') {
            this.simulationState.roscAchieved = true
            this.simulationState.palpablePulsePresent = true
            this.simulationState.cprInProgress = false
            this.simulationState.timeSinceROSC = 0
            console.log('[rhythm] ROSC achieved — spontaneous circulation restored')
        } else {
            console.log(`[rhythm] Rhythm changed to ${newRhythm}`)
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Conditions
    // ─────────────────────────────────────────────────────────────

    _firstConditionFailure(preconditions) {
        for (const [key, condition] of Object.entries(preconditions ?? {})) {
            if (!this._singleConditionMatches(key, condition)) {
                return `Condition not met: ${key}`
            }
        }

        return null
    }

    _firstRequiredStateFailure(requiredState) {
        for (const [key, expected] of Object.entries(requiredState ?? {})) {
            if (!this._valueMatches(this._readValue(key), expected)) {
                return `Required state not met: ${key}`
            }
        }

        return null
    }

    _conditionsMatch(conditions) {
        for (const [key, condition] of Object.entries(conditions ?? {})) {
            if (!this._singleConditionMatches(key, condition)) return false
        }

        return true
    }

    _singleConditionMatches(key, condition) {
        const actual = this._readValue(key)
        return this._valueMatches(actual, condition)
    }

    _valueMatches(actual, condition) {
        if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
            if (condition.equals !== undefined && actual !== condition.equals) return false
            if (condition.equalsAny !== undefined && !condition.equalsAny.includes(actual)) return false
            if (condition.notEquals !== undefined && actual === condition.notEquals) return false
            if (condition.above !== undefined && !(Number(actual) > condition.above)) return false
            if (condition.below !== undefined && !(Number(actual) < condition.below)) return false
            if (condition.min !== undefined && !(Number(actual) >= condition.min)) return false
            if (condition.max !== undefined && !(Number(actual) <= condition.max)) return false

            if (condition.between !== undefined) {
                const [min, max] = condition.between

                if (!(Number(actual) >= min && Number(actual) <= max)) {
                    return false
                }
            }

            return true
        }

        return actual === condition
    }

    _readValue(key) {
        if (key === 'rhythmState') return this.rhythmState
        if (key === 'arrestRhythm') return this.arrestRhythm

        if (this.parameters[key]) {
            return this.parameters[key].value
        }

        if (Object.prototype.hasOwnProperty.call(this.simulationState, key)) {
            return this.simulationState[key]
        }

        if (Object.prototype.hasOwnProperty.call(this.metrics, key)) {
            return this.metrics[key]
        }

        if (key === 'elapsedSeconds') return this._elapsedSeconds()
        if (key === 'requiredActionsCompleted') return this.areRequiredActionsCompleted()

        return undefined
    }

    _ruleContextMatches(onlyWhen) {
        if (!onlyWhen) return true
        return this._conditionsMatch(onlyWhen)
    }

    _conditionObjectMatchesRule(rule) {
        const key = rule.if
        const actual = this._readValue(key)

        if (actual === undefined) return false

        if (rule.below !== undefined && !(Number(actual) < rule.below)) return false
        if (rule.above !== undefined && !(Number(actual) > rule.above)) return false
        if (rule.equals !== undefined && actual !== rule.equals) return false
        if (rule.equalsAny !== undefined && !rule.equalsAny.includes(actual)) return false

        return true
    }

    _applyMetricUpdates(actionId, action, quality) {
        const metricConfig = action.metrics ?? {}

        if (metricConfig.recordFirstTimeAs) {
            const key = metricConfig.recordFirstTimeAs

            if (this.metrics[key] === null || this.metrics[key] === undefined) {
                this.metrics[key] = this._elapsedSeconds()
            }
        }

        if (metricConfig.increment) {
            const key = metricConfig.increment
            this.metrics[key] = (this.metrics[key] ?? 0) + 1
        }

        if (metricConfig.set) {
            for (const [key, value] of Object.entries(metricConfig.set)) {
                this.metrics[key] = value
            }
        }

        if (metricConfig.add) {
            for (const [key, value] of Object.entries(metricConfig.add)) {
                this.metrics[key] = (this.metrics[key] ?? 0) + value
            }
        }

        if (metricConfig.updateRecentQualityAs) {
            const key = metricConfig.updateRecentQualityAs
            this.metrics[key] = quality
        }

        if (metricConfig.updateAverageQualityAs) {
            const key = metricConfig.updateAverageQualityAs
            const countKey = metricConfig.averageCountAs ?? `${key}Count`

            const oldAverage = this.metrics[key] ?? 0
            const oldCount = this.metrics[countKey] ?? 0
            const newCount = oldCount + 1

            this.metrics[key] = ((oldAverage * oldCount) + quality) / newCount
            this.metrics[countKey] = newCount
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Monitor/display outputs
    // ─────────────────────────────────────────────────────────────

    _updateMonitorOutputs() {
        // Built-in sensible cardiac-arrest compatible behaviour.
        if (this.parameters.displayedOxygenSaturation) {
            const probeAttached = this.simulationState.pulseOxProbeAttached ?? true
            const signal = this.parameters.pulseOxSignalQuality?.value ?? this.simulationState.pulseOxSignalQuality ?? 1

            if (!probeAttached) {
                this.parameters.displayedOxygenSaturation.value = null
            } else if (this.rhythmState === 'arrest' && signal < 0.5) {
                this.parameters.displayedOxygenSaturation.value = 'LOW SIGNAL'
            } else if (signal < 0.35) {
                this.parameters.displayedOxygenSaturation.value = 'LOW SIGNAL'
            } else {
                const internal = this.parameters.oxygenSaturation?.value

                this.parameters.displayedOxygenSaturation.value = typeof internal === 'number'
                    ? Number(internal.toFixed(1))
                    : null
            }
        }

        // Scenario-authored monitor rules can override display parameters.
        const monitorOutputs = this.scenarioConfig?.monitorOutputs ?? {}

        for (const output of Object.values(monitorOutputs)) {
            const rules = output.rules ?? []

            for (const rule of rules) {
                if (!this._conditionsMatch(rule.when ?? {})) continue
                if (!rule.targetParameter) continue
                if (!this.parameters[rule.targetParameter]) continue

                this.parameters[rule.targetParameter].value = this._resolveDisplayValue(rule.display)
                break
            }
        }
    }

    _resolveDisplayValue(display) {
        if (typeof display !== 'string') return display

        if (display.startsWith('numeric_')) {
            const key = display.replace('numeric_', '')
            return this.parameters[key]?.value ?? this.simulationState[key] ?? null
        }

        return display
    }

    _applyMonitorEffect(effect) {
        for (const [key, value] of Object.entries(effect ?? {})) {
            if (this.parameters[key]) {
                this.parameters[key].value = value
            } else {
                this.simulationState[key] = value
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Skin colour
    // ─────────────────────────────────────────────────────────────

    _computeSkinColour() {
        const spO2 = Number(this.parameters.oxygenSaturation?.value ?? 99)
        const bp = Number(this.parameters.bloodPressureSystolic?.value ?? 120)
        const temp = Number(this.parameters.temperature?.value ?? 37)
        const consciousness = Number(this.parameters.consciousness?.value ?? 1)
        const fitzpatrick = this.scenarioConfig?.patient?.skinTone ?? null

        const state = this._deriveSkinState(spO2, bp, temp, consciousness)

        return {
            state,
            assessmentSite: this._assessmentSite(state, fitzpatrick),
            visuallyObvious: this._isVisuallyObvious(state, fitzpatrick)
        }
    }

    _deriveSkinState(spO2, bp, temp, consciousness) {
        if (spO2 < 80) return 'cyanotic'
        if (bp < 60 && consciousness < 0.3) return 'mottled'
        if (bp < 90 || spO2 < 90) return 'pale'
        if (temp > 38.5) return 'flushed'

        return 'normal'
    }

    _assessmentSite(state, fitzpatrick) {
        if (state === 'normal') return null

        const darkTone = ['fitzpatrick_4', 'fitzpatrick_5', 'fitzpatrick_6'].includes(fitzpatrick)
        const unknownTone = fitzpatrick === null

        if (unknownTone) {
            const agnostic = {
                cyanotic: 'Check mucous membranes, conjunctiva, and lips',
                pale: 'Check conjunctiva, palms, and nail beds',
                flushed: 'Check skin temperature by touch and mucous membranes',
                mottled: 'Look for patchy discolouration on limbs and trunk'
            }

            return agnostic[state] ?? null
        }

        if (state === 'cyanotic') {
            return darkTone
                ? 'Check mucous membranes — gums and inner lips'
                : 'Visible at lips and fingertips'
        }

        if (state === 'pale') {
            return darkTone
                ? 'Check conjunctiva and palms'
                : 'Visible on face and nail beds'
        }

        if (state === 'flushed') {
            return darkTone
                ? 'Check skin temperature by touch — redness may not be visible'
                : 'Visible redness on face and neck'
        }

        if (state === 'mottled') {
            return darkTone
                ? 'Look for asymmetric skin temperature and capillary refill'
                : 'Visible patchy purple-pale discolouration on limbs'
        }

        return null
    }

    _isVisuallyObvious(state, fitzpatrick) {
        if (state === 'normal') return true
        if (fitzpatrick === null) return false

        const darkTone = ['fitzpatrick_4', 'fitzpatrick_5', 'fitzpatrick_6'].includes(fitzpatrick)

        if (darkTone && ['cyanotic', 'pale', 'flushed'].includes(state)) {
            return false
        }

        return true
    }

    // ─────────────────────────────────────────────────────────────
    // End conditions / debrief helpers
    // ─────────────────────────────────────────────────────────────

    _checkScenarioEndConditions() {
        // Check for simple endCondition (e.g., ROSC achieved in cardiac arrest)
        const endCondition = this.scenarioConfig?.endCondition
        if (endCondition?.type === 'rosc_achieved' && this.rhythmState === 'rosc') {
            this._scenarioEnded = true
            this._scenarioOutcome = {
                id: 'rosc_achieved',
                type: 'success',
                title: this.scenarioConfig.success?.title ?? 'ROSC Achieved',
                message: this.scenarioConfig.success?.message ?? 'Return of spontaneous circulation achieved.',
                nextStep: 'Proceed to debrief',
                time: this._elapsedSeconds(),
                metrics: { ...this.metrics },
                completedActions: this.getCompletedActions(),
                requiredActionsCompleted: this.areRequiredActionsCompleted()
            }

            this._logScenarioOutcome(this._scenarioOutcome)
            this.stop('scenario_end:rosc_achieved')
            return
        }

        // Check for complex scenarioEndConditions (legacy support for other scenarios)
        const endConditions = this.scenarioConfig?.scenarioEndConditions ?? {}

        for (const [id, endConfig] of Object.entries(endConditions)) {
            const requires = endConfig.requires
            const requiresAny = endConfig.requiresAny

            const matched = requires
                ? this._conditionsMatch(requires)
                : Array.isArray(requiresAny)
                    ? requiresAny.some(group => this._conditionsMatch(group))
                    : false

            if (!matched) continue

            this._scenarioEnded = true
            this._scenarioOutcome = {
                id,
                type: endConfig.type ?? 'completed',
                title: endConfig.title ?? this._titleFromId(id),
                message: endConfig.message ?? id,
                nextStep: endConfig.nextStep ?? null,
                time: this._elapsedSeconds(),
                metrics: { ...this.metrics },
                completedActions: this.getCompletedActions(),
                requiredActionsCompleted: this.areRequiredActionsCompleted()
            }

            this._logScenarioOutcome(this._scenarioOutcome)
            this.stop(`scenario_end:${id}`)
            break
        }
    }

    areRequiredActionsCompleted() {
        const required = this.scenarioConfig?.requiredActions ?? []
        return required.every(id => this._completedActions.has(id))
    }

    getScenarioOutcome() {
        return this._scenarioOutcome
    }

    getCompletedActions() {
        return [...this._completedActions]
    }

    // Builds the { actionId: { timestamp, quality, outcome } } shape
    // DebriefingSystem.generateDebrief() expects for scoring timing,
    // sequence, and critical-action penalties (e.g.
    // actionLog.callCrashTeam?.timestamp). Uses the first logged
    // occurrence of each action, matching the "time to first X" metrics
    // used throughout scoring. Timestamp is in milliseconds to match
    // the goldStandard.*Seconds * 1000 comparisons in DebriefingSystem.
    getActionLog() {
        const log = {}

        for (const entry of this.history) {
            if (entry.type !== 'action') continue
            if (log[entry.action]) continue

            log[entry.action] = {
                timestamp: entry.time * 1000,
                quality: entry.quality,
                outcome: entry.outcome
            }
        }

        return log
    }

    getActionDefinitions() {
        return this.scenarioConfig?.actionMappings ?? {}
    }

    getRequiredActions() {
        return this.scenarioConfig?.requiredActions ?? []
    }

    getDisplayParameters({ includeHidden = true } = {}) {
        return Object.entries(this.parameters)
            .filter(([, param]) => includeHidden || param.learnerVisible !== false)
            .map(([id, param]) => ({ id, ...param }))
    }

    _logSnapshot() {
        const snapshot = {
            type: 'snapshot',
            time: this._elapsedSeconds(),
            rhythmState: this.rhythmState,
            simulationState: { ...this.simulationState },
            values: {}
        }

        for (const [key, param] of Object.entries(this.parameters)) {
            snapshot.values[key] =
                param.derived || param.displayOnly || typeof param.value !== 'number'
                    ? param.value
                    : parseFloat(param.value.toFixed(2))
        }

        this.history.push(snapshot)
    }

    _logAction(actionId, quality, effects, outcome = 'applied', site = null) {
        this.history.push({
            type: 'action',
            time: this._elapsedSeconds(),
            action: actionId,
            quality,
            effects,
            outcome,
            site
        })
    }

    _logScenarioOutcome(outcome) {
        this.history.push({
            type: 'scenario_outcome',
            ...outcome
        })

        console.log(`[scenario outcome] ${outcome.id}: ${outcome.message}`)
    }

    _elapsedSeconds() {
        return Math.floor((Date.now() - this.startTime) / 1000)
    }

    _titleFromId(id) {
        return String(id)
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, c => c.toUpperCase())
    }

    _clampValue(key, value) {
        const param = this.parameters[key]
        if (!param || typeof value !== 'number') return value

        return Math.max(param.min, Math.min(param.max, value))
    }

    _applyStateEffects(effects) {
        for (const [key, value] of Object.entries(effects ?? {})) {
            if (key === 'rhythmState') {
                this._setRhythm(value)
                continue
            }

            if (
                this.parameters[key] &&
                typeof this.parameters[key].value === 'number' &&
                typeof value === 'number'
            ) {
                this.parameters[key].value = this._clampValue(
                    key,
                    this.parameters[key].value + value
                )
                continue
            }

            if (
                Object.prototype.hasOwnProperty.call(this.simulationState, key) &&
                typeof this.simulationState[key] === 'number' &&
                typeof value === 'number'
            ) {
                this.simulationState[key] += value
                continue
            }

            if (
                Object.prototype.hasOwnProperty.call(this.metrics, key) &&
                typeof this.metrics[key] === 'number' &&
                typeof value === 'number'
            ) {
                this.metrics[key] += value
                continue
            }

            this.simulationState[key] = value
        }
    }

    _applyParameterConstraints() {
        const constraints = this.scenarioConfig?.parameterConstraints ?? []

        for (const constraint of constraints) {
            if (!this._conditionsMatch(constraint.when ?? {})) continue

            const param = this.parameters[constraint.parameter]
            if (!param || typeof param.value !== 'number') continue

            if (constraint.set !== undefined) {
                param.value = this._clampValue(constraint.parameter, constraint.set)
                continue
            }

            if (constraint.min !== undefined && param.value < constraint.min) {
                param.value = constraint.min
            }

            if (constraint.max !== undefined && param.value > constraint.max) {
                param.value = constraint.max
            }
        }
    }

}