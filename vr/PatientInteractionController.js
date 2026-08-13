import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CPRQualityAnalyzer } from '../core/CPRQualityAnalyzer.js';
import { InteractionWheel } from './InteractionWheel.js';

// Wires core/InteractionSystem.js into the actual 3D scene, through two
// parallel front-ends that both terminate in the same
// InteractionSystem.select() call:
//
//  - a flat HTML HUD (category tabs / action rows) for desktop/mouse --
//    this was the whole of this file originally, and is still the
//    default when no immersive WebXR session is active.
//  - a 3D radial "wheel" (InteractionWheel.js) for WebXR/VR, where a
//    flat DOM overlay isn't reliably available inside an immersive
//    session. The wheel is deliberately primitive right now -- no
//    animation, simplified preset-quality buttons instead of numeric
//    inputs for capture-type actions -- per an explicit product decision
//    to get a working (if rough) WebXR interaction loop in place rather
//    than polish the desktop path further. See
//    claude/next-steps-roadmap.md ("interaction system design").
//
// Site selection (raycasting against VirtualPatient's named anchor
// points) is shared by both front-ends: whichever one is active, the
// same beginSiteSelection()/attemptSelectAt() pair resolves it, so a
// controller ray and a mouse click behave identically once a site
// selection is pending.
export class PatientInteractionController {
  constructor(scene, container) {
    this.scene = scene;
    this.container = container; // HTML element the flat HUD renders into

    this.interaction = null; // InteractionSystem, set via attach()
    this.virtualPatient = null;
    this.activeCategory = null;
    this.pendingSiteAction = null; // action object currently awaiting an anchor click
    this._actionsById = {}; // populated whenever the action wheel/list is built, for wheel item -> full action lookup

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.wheel = new InteractionWheel(scene);

    this.els = {};
    this.buildDOM();
    this.setupCanvasClickListener();
    this.setupKeyboardToggle();
    this.setupXRControllers();
  }

  // 'e' opens/closes the wheel on desktop -- there's no headset in most
  // dev/testing environments (including this one), so this is how the
  // WebXR-facing UI gets previewed and exercised without one. Real VR
  // input uses the squeeze (grip) button instead, wired below.
  setupKeyboardToggle() {
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() !== 'e') return;
      if (this.scene.state !== this.scene.STATES.PATIENT_ROOM) return;
      this.toggleWheel();
    });
  }

  // Standard three.js WebXR controller pattern: a controller Object3D
  // per hand, a visible ray line so the trainee can see where they're
  // pointing, 'selectstart' (trigger) resolved through the same
  // attemptSelectAt() the mouse click uses, and 'squeezestart' (grip) as
  // the menu-summon gesture instead of a keyboard key. Safe to call
  // whether or not this browser/device actually supports WebXR --
  // renderer.xr.getController() just returns an inert Object3D until a
  // session is live.
  setupXRControllers() {
    const renderer = this.scene.renderer;
    this.xrControllers = [0, 1].map((i) => {
      const controller = renderer.xr.getController(i);

      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const ray = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x2563eb }));
      ray.name = 'controller-ray';
      ray.scale.z = 1.5;
      controller.add(ray);

      controller.addEventListener('selectstart', () => this.onControllerSelect(controller));
      controller.addEventListener('squeezestart', () => {
        if (this.scene.state !== this.scene.STATES.PATIENT_ROOM) return;
        this.toggleWheel();
      });

      this.scene.scene.add(controller);
      return controller;
    });
  }

  onControllerSelect(controller) {
    if (this.scene.state !== this.scene.STATES.PATIENT_ROOM) return;
    const raycaster = new THREE.Raycaster();
    const matrix = new THREE.Matrix4().identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matrix);
    this.attemptSelectAt(raycaster);
  }

  // Called by UIManager when Scene enters PATIENT_ROOM and a fresh
  // InteractionSystem/VirtualPatient pair exists for the loaded scenario.
  attach(interactionSystem, virtualPatient) {
    this.interaction = interactionSystem;
    this.virtualPatient = virtualPatient;
    this.activeCategory = interactionSystem.getCategories()[0] ?? null;
    this.pendingSiteAction = null;
    this.virtualPatient.clearSiteSelection();
    this.els.feedback.textContent = 'Select a category to begin.';
    this.wheel.hide();
    this.render();
  }

  // Called by UIManager whenever Scene leaves PATIENT_ROOM (board, debrief,
  // menu) so a stray click can't resolve against a scenario that's no
  // longer active.
  detach() {
    if (this.virtualPatient) {
      this.virtualPatient.clearSiteSelection();
    }
    this.interaction = null;
    this.virtualPatient = null;
    this.pendingSiteAction = null;
    this.wheel.hide();
    this.els.tabs.innerHTML = '';
    this.els.actions.innerHTML = '';
    this.els.subpanel.innerHTML = '';
  }

  // ─────────────────────────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────────────────────────

  buildDOM() {
    this.container.innerHTML = `
      <div class="pic-tabs" id="picTabs"></div>
      <div class="pic-actions" id="picActions"></div>
      <div id="picSubpanel"></div>
      <div class="pic-feedback" id="picFeedback">Select a category to begin.</div>
    `;
    this.els.tabs = this.container.querySelector('#picTabs');
    this.els.actions = this.container.querySelector('#picActions');
    this.els.subpanel = this.container.querySelector('#picSubpanel');
    this.els.feedback = this.container.querySelector('#picFeedback');
  }

  render() {
    if (!this.interaction) return;
    this.renderTabs();
    this.renderActions();
  }

  renderTabs() {
    const categories = this.interaction.getCategories();
    if (!categories.includes(this.activeCategory)) {
      this.activeCategory = categories[0] ?? null;
    }

    this.els.tabs.innerHTML = '';
    for (const category of categories) {
      const tab = document.createElement('button');
      tab.className = 'pic-tab'
        + (category === this.activeCategory ? ' active' : '')
        + (category === 'Unsafe' ? ' unsafe' : '');
      tab.textContent = category;
      tab.addEventListener('click', () => {
        this.activeCategory = category;
        this.clearSubpanel();
        this.render();
      });
      this.els.tabs.appendChild(tab);
    }
  }

  renderActions() {
    this.els.actions.innerHTML = '';
    if (!this.activeCategory) return;

    const actions = this.interaction.getActionsForCategory(this.activeCategory);
    this._actionsById = Object.fromEntries(actions.map((a) => [a.id, a]));
    for (const action of actions) {
      const row = document.createElement('div');
      row.className = 'pic-action'
        + (action.allowed ? '' : ' disabled')
        + (action.dangerous ? ' dangerous' : '');

      const tags = [];
      if (action.captureType) tags.push('technique capture');
      if (action.validSites) tags.push('site on patient');
      if (action.dangerous) tags.push('unsafe');

      row.innerHTML = `
        <div class="pic-action-label">${action.label}</div>
        ${!action.allowed ? `<div class="pic-action-reason">${action.reason ?? 'Not currently available'}</div>` : ''}
        ${tags.length ? `<div class="pic-action-tag">${tags.join(' · ')}</div>` : ''}
      `;

      if (action.allowed) {
        row.addEventListener('click', () => this.beginSelection(action));
      }

      this.els.actions.appendChild(row);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // WebXR wheel: category -> action, in 3D instead of the flat HUD.
  // Both paths funnel into the same beginSelection()/confirm() used by
  // the HTML rows above -- only how the category/action gets picked
  // differs.
  // ─────────────────────────────────────────────────────────────────

  toggleWheel() {
    if (!this.interaction) return;
    if (this.wheel.isVisible) {
      this.wheel.hide();
    } else {
      this.showCategoryWheel();
    }
  }

  // ~0.5m in front of wherever the camera is currently looking, facing
  // back at the camera. Recomputed every time a wheel is (re)shown --
  // there's no follow/tracking animation, per the "primitive is fine
  // for now" scope of this pass.
  _placeWheelInFrontOfCamera() {
    const camera = this.scene.camera;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const position = camera.position.clone().add(forward.multiplyScalar(0.5));
    this.wheel.showAt(position, camera.quaternion);
  }

  showCategoryWheel() {
    const categories = this.interaction.getCategories();
    const items = categories.map((c) => ({ id: c, label: c, dangerous: c === 'Unsafe' }));
    this.wheel.setItems(items, (item) => this.showActionWheel(item.id), { hubLabel: 'Categories' });
    this._placeWheelInFrontOfCamera();
  }

  showActionWheel(category) {
    this.activeCategory = category;
    const actions = this.interaction.getActionsForCategory(category);
    this._actionsById = Object.fromEntries(actions.map((a) => [a.id, a]));
    const items = actions.map((a) => ({ id: a.id, label: a.label, disabled: !a.allowed, dangerous: a.dangerous }));

    this.wheel.setItems(
      items,
      (item) => {
        if (item.id === '__back__') {
          this.showCategoryWheel();
          return;
        }
        const action = this._actionsById[item.id];
        if (!action) return;
        this.wheel.hide();
        this.beginSelection(action, { viaWheel: true });
      },
      { hubLabel: category, backLabel: '← Categories' }
    );
    this._placeWheelInFrontOfCamera();
  }

  // Numeric rate/depth input doesn't translate well to a 3D radial menu,
  // so capture-type actions picked via the wheel get three preset
  // quality buttons instead of the HTML panel's number fields. This is
  // a known, deliberate simplification for this pass -- real technique
  // quality in an actual WebXR session should eventually come from the
  // controller's own live 6DoF pose data (rate/depth derived from
  // controller motion, the same way CPRQualityAnalyzer already scores
  // rate+depth from any source), not a preset picklist.
  showCapturePresetWheel(action) {
    const presets = [
      { id: 'good', label: 'Good technique', quality: 0.95 },
      { id: 'fair', label: 'Fair technique', quality: 0.65 },
      { id: 'poor', label: 'Poor technique', quality: 0.3 }
    ];
    this.wheel.setItems(
      presets,
      (item) => {
        this.wheel.hide();
        this.confirm(action.id, { quality: item.quality });
      },
      { hubLabel: action.label }
    );
    this._placeWheelInFrontOfCamera();
  }

  // ─────────────────────────────────────────────────────────────────
  // Selection flow: site picker (3D click) / capture control / direct confirm
  // ─────────────────────────────────────────────────────────────────

  beginSelection(action, { viaWheel = false } = {}) {
    this.clearSubpanel();

    if (action.captureType === 'compression-rate-depth') {
      if (viaWheel) {
        this.showCapturePresetWheel(action);
      } else {
        this.renderCapturePanel(action);
      }
      return;
    }

    if (action.validSites) {
      this.beginSiteSelection(action);
      return;
    }

    this.confirm(action.id, {});
  }

  beginSiteSelection(action) {
    this.pendingSiteAction = action;
    this.virtualPatient.setSelectableSites(action.validSites);
    this.els.subpanel.innerHTML = `
      <div class="pic-subpanel">
        <div class="pic-subpanel-title">${action.label} — click the highlighted site on the patient</div>
      </div>
    `;
  }

  // Mirrors interaction-demo.html's measured-CPR control: same
  // CPRQualityAnalyzer call, same qualityEffects lookup, just rendered
  // into this HUD instead of the standalone demo page.
  renderCapturePanel(action) {
    const scenarioAction = this.scene.scenarioData?.actionMappings?.[action.id];
    const qualityEffects = scenarioAction?.qualityEffects
      ?? this.scene.scenarioData?.actionMappings?.cprCompressions?.qualityEffects;
    const rateRange = qualityEffects?.rateTargetPerMinute ?? {};
    const depthRange = qualityEffects?.depthTargetCm ?? {};
    const rateMid = ((rateRange.min ?? 100) + (rateRange.max ?? 120)) / 2;
    const depthMid = ((depthRange.min ?? 5) + (depthRange.max ?? 6)) / 2;

    const panel = document.createElement('div');
    panel.className = 'pic-subpanel';
    panel.innerHTML = `
      <div class="pic-subpanel-title">${action.label} — measured technique</div>
      <div class="pic-capture-row">
        <label>rate/min <input type="number" id="picRate" value="${Math.round(rateMid)}"></label>
        <label>depth cm <input type="number" step="0.1" id="picDepth" value="${depthMid}"></label>
        <button id="picApplyCapture">Apply measured</button>
      </div>
    `;
    this.els.subpanel.innerHTML = '';
    this.els.subpanel.appendChild(panel);

    panel.querySelector('#picApplyCapture').addEventListener('click', () => {
      const rateInput = panel.querySelector('#picRate');
      const depthInput = panel.querySelector('#picDepth');
      const quality = CPRQualityAnalyzer.scoreCompression(
        { ratePerMinute: Number(rateInput.value), depthCm: Number(depthInput.value) },
        qualityEffects ?? {}
      );
      this.clearSubpanel();
      this.confirm(action.id, { quality });
    });
  }

  // Listens on the renderer's own canvas rather than InputHandler's
  // document-level click, so this stays independent of camera/pointer
  // -lock handling. Builds a camera-space raycaster from the mouse
  // position and hands it to attemptSelectAt() -- the same method a
  // future XR controller's selectstart handler calls with a
  // controller-space raycaster instead, so mouse clicks and controller
  // trigger pulls resolve identically.
  setupCanvasClickListener() {
    this.scene.renderer.domElement.addEventListener('click', (event) => {
      const rect = this.scene.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.scene.camera);
      this.attemptSelectAt(this.raycaster);
    });
  }

  // Resolves a raycast against whichever the current interaction state
  // cares about: the wheel (if visible) takes priority, otherwise
  // whichever VirtualPatient anchors are currently marked selectable
  // (set by beginSiteSelection via VirtualPatient.setSelectableSites).
  // Returns true if the raycast hit something and was resolved, so a
  // caller (mouse click, XR controller select) can tell whether the ray
  // actually did anything.
  attemptSelectAt(raycaster) {
    if (this.wheel.isVisible) {
      const hits = raycaster.intersectObjects(this.wheel.getSelectableMeshes());
      if (hits.length > 0) {
        return this.wheel.resolveHit(hits[0].object);
      }
      return false;
    }

    if (this.pendingSiteAction && this.virtualPatient) {
      const targets = this.virtualPatient.getSelectableAnchorMeshes();
      const hits = raycaster.intersectObjects(targets);
      if (hits.length === 0) return false;

      const site = hits[0].object.userData.siteId;
      const action = this.pendingSiteAction;
      this.pendingSiteAction = null;
      this.virtualPatient.clearSiteSelection();
      this.clearSubpanel();
      this.confirm(action.id, { site });
      return true;
    }

    return false;
  }

  confirm(actionId, { site, quality } = {}) {
    const result = this.interaction.select(actionId, { site, quality: quality ?? 1.0 });

    if (result.ok) {
      const scenarioAction = this.scene.scenarioData?.actionMappings?.[actionId];
      const feedback = scenarioAction?.patientDialogue
        ?? scenarioAction?.clinicalFinding
        ?? result.message
        ?? 'Action completed.';
      this.els.feedback.textContent = feedback;
    } else {
      this.els.feedback.textContent = result.message ?? `That action could not be completed right now (${result.outcome}).`;
    }

    this.render();
  }

  clearSubpanel() {
    this.pendingSiteAction = null;
    if (this.virtualPatient) this.virtualPatient.clearSiteSelection();
    this.els.subpanel.innerHTML = '';
  }
}
