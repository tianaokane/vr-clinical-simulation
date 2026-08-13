import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { VirtualPatient } from './VirtualPatient.js';
import { PatientStateModel } from '../core/PatientStateModel.js';
import { DialogueEngine } from '../core/DialogueEngine.js';
import { DebriefingSystem } from '../core/DebriefingSystem.js';
import { ScenarioLoader } from '../core/ScenarioLoader.js';

export class Scene {
  constructor(containerElement) {
    this.container = containerElement;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // State machine
    this.STATES = {
      MENU: 'menu',
      HALLWAY_DOWN: 'hallway_down',
      BOARD: 'board',
      LOADING_SCENARIO: 'loading',
      PATIENT_ROOM: 'room',
      DEBRIEF: 'debrief',
      HALLWAY_UP: 'hallway_up'
    };
    this.state = this.STATES.MENU;

    // Three.js setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff); // White background
    this.scene.fog = new THREE.Fog(0xffffff, 50, 100); // Soft fade for depth

    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, 1.6, 0); // Eye level (~5'5")

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Hallway navigation state
    this.hallwayProgress = 0; // 0 = menu end, 1 = board end
    this.hallwayDirection = null; // 'down' or 'up'
    this.hallwaySpeed = 0.02; // Units per frame

    // Camera state during debrief
    this.debriefTurnProgress = 0; // 0 to 1, interpolation for 90° turn
    this.debriefOriginalDirection = null;

    // Scene objects
    this.hallwayGroup = null;
    this.board = null;
    this.patientRoom = null;

    // UI overlays (managed externally, shown/hidden here)
    this.uiOverlays = {
      menu: null,
      scenarioPicker: null,
      loadingScreen: null,
      vitalsHUD: null,
      debriefUI: null
    };

    // Scenario state
    this.currentScenarioId = null;
    this.psmInstance = null; // PatientStateModel
    this.patientAvatar = null; // VirtualPatient
    this.debriefData = null;

    // Blur effect for debrief
    this.blurCanvas = null;

    // Build scene
    this.buildHallway();
    this.setupLighting();
    this.setupWindowResize();

    // Start animation loop
    this.animate();

    // Callback hooks (filled in by external UI manager)
    this.onStateChanged = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  setState(newState) {
    this.state = newState;
    if (this.onStateChanged) {
      this.onStateChanged(newState);
    }
  }

  onMenuStartClicked() {
    // User clicked "Start Training" button
    // Hide menu overlay, start walking down hallway
    if (this.uiOverlays.menu) this.uiOverlays.menu.style.display = 'none';
    this.setState(this.STATES.HALLWAY_DOWN);
    this.hallwayDirection = 'down';
    this.hallwayProgress = 0;
  }

  onReachBoard() {
    // Camera reached end of hallway, at board position
    this.camera.position.z = -25; // Lock at board
    this.setState(this.STATES.BOARD);
    if (this.uiOverlays.scenarioPicker) this.uiOverlays.scenarioPicker.style.display = 'block';
  }

  onScenarioSelected(scenarioId) {
    // User clicked scenario button on board
    this.currentScenarioId = scenarioId;
    if (this.uiOverlays.scenarioPicker) this.uiOverlays.scenarioPicker.style.display = 'none';
    this.setState(this.STATES.LOADING_SCENARIO);
    this.fadeOutAndLoadScenario(scenarioId);
  }

  async fadeOutAndLoadScenario(scenarioId) {
    // 1. Show loading screen (black fade)
    if (this.uiOverlays.loadingScreen) this.uiOverlays.loadingScreen.style.display = 'block';

    // 2. Wait for load delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 3. Load scenario (PSM, dialogue, patient room)
    const success = await this.loadScenario(scenarioId);

    // 4. Fade in from black
    if (this.uiOverlays.loadingScreen) this.uiOverlays.loadingScreen.style.display = 'none';
    this.setState(this.STATES.PATIENT_ROOM);
    if (this.uiOverlays.vitalsHUD) this.uiOverlays.vitalsHUD.style.display = 'block';

    if (!success) {
      console.error('[Scene] Failed to load scenario');
    }
  }

  async loadScenario(scenarioId) {
    try {
      console.log(`[Scene] Loading scenario: ${scenarioId}`);

      // 1. Load scenario JSON using ScenarioLoader
      const scenarioLoader = new ScenarioLoader();
      const scenarioData = await scenarioLoader.load(scenarioId);
      console.log(`[Scene] Scenario loaded:`, scenarioData);

      // 2. Create PatientStateModel (simulates patient physiology)
      this.psmInstance = new PatientStateModel(scenarioData);
      console.log(`[Scene] PSM initialized`);

      // 3. Create DialogueEngine (manages patient conversations)
      const dialogueData = await this.loadDialogue(scenarioId);
      this.dialogueEngine = new DialogueEngine(dialogueData, this.psmInstance);
      console.log(`[Scene] DialogueEngine initialized`);

      // 4. Create VirtualPatient (3D avatar)
      this.patientAvatar = new VirtualPatient(this, scenarioId);
      console.log(`[Scene] VirtualPatient instantiated`);

      // 5. Wire PSM state changes to patient avatar visuals
      this.psmInstance.onStateChange = (psmState) => {
        if (this.patientAvatar) {
          this.patientAvatar.updateFromPSM(psmState);
        }

        // Also update vitals HUD if available
        if (window.uiManager) {
          window.uiManager.updateVitalsHUD(this.psmInstance.parameters);
        }

        // Check for scenario end conditions
        if (this._checkScenarioEndConditions(psmState, scenarioData)) {
          this.handleScenarioEnd(psmState);
        }
      };
      console.log(`[Scene] PSM state change handler wired`);

      // 6. Set up camera in patient room
      this.camera.position.set(0, 1.6, 5);
      this.camera.lookAt(0, 1.2, 0);

      // 7. Initialize vitals display
      if (window.uiManager) {
        window.uiManager.updateVitalsHUD(this.psmInstance.parameters);
      }

      // 8. Record scenario start time
      this.scenarioStartTime = Date.now();

      console.log(`[Scene] Scenario ready`);
      return true;

    } catch (error) {
      console.error(`[Scene] Error loading scenario:`, error);
      return false;
    }
  }

  async loadDialogue(scenarioId) {
    // Load dialogue JSON for scenario
    try {
      const response = await fetch(`./dialogue/${scenarioId}-dialogue.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`[Scene] Could not load dialogue for ${scenarioId}:`, error);
      return {}; // Return empty dialogue object as fallback
    }
  }

  _checkScenarioEndConditions(psmState, scenarioData) {
    // Check if scenario end condition has been met
    if (!scenarioData.endCondition) {
      return false;
    }

    const condition = scenarioData.endCondition;

    // Example: Cardiac arrest ends on ROSC (return of spontaneous circulation)
    if (condition.type === 'rhythmState' && condition.value === 'rosc') {
      return psmState.rhythmState === 'rosc';
    }

    // Example: Sepsis ends when vitals stabilized
    if (condition.type === 'vitalsStabilized') {
      const bp = psmState.bloodPressureSystolic || 0;
      const consciousness = psmState.consciousness || 0;
      return bp >= 90 && consciousness > 0.6;
    }

    // Example: Time limit exceeded
    if (condition.type === 'timeLimit') {
      const elapsedSeconds = (Date.now() - this.scenarioStartTime) / 1000;
      return elapsedSeconds >= condition.value;
    }

    return false;
  }

  async handleScenarioEnd(finalState) {
    // Generate debrief using DebriefingSystem
    try {
      const debriefSystem = new DebriefingSystem();
      const actionLog = this.psmInstance.getActionLog?.() || {};
      const debriefData = debriefSystem.generateDebrief(
        actionLog,
        finalState,
        this.psmInstance.simulationState,
        this.currentScenarioId
      );

      console.log(`[Scene] Debrief generated:`, debriefData);

      // Trigger debrief view
      this.onScenarioEnded(debriefData);

      // Display debrief in UI
      if (window.uiManager) {
        window.uiManager.displayDebrief(debriefData);
      }

    } catch (error) {
      console.error(`[Scene] Error generating debrief:`, error);
    }
  }

  onScenarioEnded(debriefData) {
    // Scenario complete
    this.debriefData = debriefData;
    this.setState(this.STATES.DEBRIEF);
    this.transitionToDebriefView();
  }

  transitionToDebriefView() {
    // Hide vitals HUD, show debrief UI with blur effect
    if (this.uiOverlays.vitalsHUD) this.uiOverlays.vitalsHUD.style.display = 'none';

    // Turn camera 90° to the side
    this.debriefTurnProgress = 0;
    this.debriefOriginalDirection = new THREE.Vector3(0, 0, -1); // Looking at patient

    // Apply blur effect
    this.applyBlurEffect();

    // Show debrief UI after turn completes
    setTimeout(() => {
      if (this.uiOverlays.debriefUI) this.uiOverlays.debriefUI.style.display = 'block';
    }, 1000);
  }

  applyBlurEffect() {
    // Simple CSS blur on entire canvas
    this.renderer.domElement.style.filter = 'blur(8px)';
  }

  removeBlurEffect() {
    this.renderer.domElement.style.filter = 'blur(0px)';
  }

  onDebriefRetry() {
    // Try same scenario again
    this.removeBlurEffect();
    if (this.uiOverlays.debriefUI) this.uiOverlays.debriefUI.style.display = 'none';
    this.fadeOutAndLoadScenario(this.currentScenarioId);
  }

  onDebriefReturnToBoard() {
    // Return to scenario picker
    this.removeBlurEffect();
    if (this.uiOverlays.debriefUI) this.uiOverlays.debriefUI.style.display = 'none';

    // Clear patient room
    // TODO: Dispose VirtualPatient, PSM, scene objects

    // Move camera back to board
    this.camera.position.set(0, 1.6, -25);
    this.setState(this.STATES.BOARD);
    if (this.uiOverlays.scenarioPicker) this.uiOverlays.scenarioPicker.style.display = 'block';
  }

  onScenarioPickerBack() {
    // Return up hallway to menu
    if (this.uiOverlays.scenarioPicker) this.uiOverlays.scenarioPicker.style.display = 'none';
    this.setState(this.STATES.HALLWAY_UP);
    this.hallwayDirection = 'up';
    this.hallwayProgress = 1; // Start from board position
  }

  onReturnToMenu() {
    // Back at menu position
    this.camera.position.z = 0;
    this.setState(this.STATES.MENU);
    if (this.uiOverlays.menu) this.uiOverlays.menu.style.display = 'block';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENE BUILDING
  // ═══════════════════════════════════════════════════════════════════════════

  buildHallway() {
    // Create hallway group
    const hallwayGroup = new THREE.Group();
    
    // Define clinical color palettes
    const wallMat = new THREE.MeshStandardMaterial({ 
      color: 0xF0F4F8, // Off-white/light blue clinical wall
      roughness: 0.4,
      metalness: 0.0
    });
    const floorMat = new THREE.MeshStandardMaterial({ 
      color: 0xDCE2E6, // Glossy linoleum hospital floor
      roughness: 0.1,
      metalness: 0.0
    });
    const ceilingMat = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFFF, // Pure white ceiling
      roughness: 0.9,
      metalness: 0.0
    });
    
    // Hallway dimensions
    const length = 30;
    const width = 4;
    const height = 3;
    
    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, length), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    hallwayGroup.add(floor);
    
    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(length, height), wallMat);
    leftWall.position.set(-width/2, height/2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    hallwayGroup.add(leftWall);
    
    // Right wall (clone left)
    const rightWall = leftWall.clone();
    rightWall.position.x = width/2;
    rightWall.rotation.y = -Math.PI / 2;
    hallwayGroup.add(rightWall);
    
    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, length), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    ceiling.receiveShadow = true;
    hallwayGroup.add(ceiling);
    
    // Procedural ceiling lights
    for (let z = -length/2 + 3; z < length/2; z += 6) {
      const lightFixture = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.1, 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      lightFixture.position.set(0, height - 0.05, z);
      lightFixture.castShadow = true;
      hallwayGroup.add(lightFixture);
    }
    
    this.hallwayGroup = hallwayGroup;
    this.scene.add(hallwayGroup);
    
    // Board at far end
    this.buildBoard();
  }

  buildBoard() {
    // 3D board (whiteboard style)
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, // White
      roughness: 0.3,
      metalness: 0.1
    });

    this.board = new THREE.Mesh(
      new THREE.BoxGeometry(4, 3, 0.1),
      boardMaterial
    );
    this.board.position.set(0, 1.5, -29.5);
    this.board.castShadow = true;
    this.board.receiveShadow = true;
    this.hallwayGroup.add(this.board);

    // Board frame (dark grey metal)
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.4,
      metalness: 0.8
    });

    const frameThickness = 0.05;
    const frameDepth = 0.15;

    // Top frame
    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(4 + frameThickness * 2, frameThickness, frameDepth),
      frameMaterial
    );
    topFrame.position.set(0, 1.5 + 1.5, -29.4);
    this.hallwayGroup.add(topFrame);

    // Bottom frame
    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(4 + frameThickness * 2, frameThickness, frameDepth),
      frameMaterial
    );
    bottomFrame.position.set(0, 1.5 - 1.5, -29.4);
    this.hallwayGroup.add(bottomFrame);
  }

  setupLighting() {
    // Bright, shadowless cartoon lighting

    // Ambient light (base illumination)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    // Directional light (sun-like, from above)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMERA & NAVIGATION
  // ═══════════════════════════════════════════════════════════════════════════

  updateCameraAlongHallway() {
    // Smooth linear movement along hallway
    if (this.hallwayDirection === 'down') {
      // Move from z=0 (menu) to z=-25 (board)
      this.hallwayProgress += this.hallwaySpeed;

      if (this.hallwayProgress >= 1.0) {
        this.hallwayProgress = 1.0;
        this.onReachBoard();
        return;
      }
    } else if (this.hallwayDirection === 'up') {
      // Move from z=-25 (board) to z=0 (menu)
      this.hallwayProgress -= this.hallwaySpeed;

      if (this.hallwayProgress <= 0.0) {
        this.hallwayProgress = 0.0;
        this.onReturnToMenu();
        return;
      }
    }

    // Interpolate camera position
    const targetZ = -25 * this.hallwayProgress;
    this.camera.position.z = targetZ;
  }

  updateDebriefTurn() {
    // Smoothly turn camera 90° during debrief
    this.debriefTurnProgress += 0.02; // Ease over ~50 frames

    if (this.debriefTurnProgress >= 1.0) {
      this.debriefTurnProgress = 1.0;
      return; // Turn complete
    }

    // Interpolate rotation (looking at patient → looking to side)
    // Patient room setup: patient at (0, 1.2, 0)
    // Camera at (0, 1.6, 5)
    // Look 90° left: face direction (-1, 0, 0)

    const easeProgress = this.easeInOutQuad(this.debriefTurnProgress);
    const angle = (Math.PI / 2) * easeProgress; // 0 to 90°

    const lookDirection = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle));
    const targetLook = new THREE.Vector3(this.camera.position.x + lookDirection.x, 1.2, this.camera.position.z + lookDirection.z);
    this.camera.lookAt(targetLook);
  }

  easeInOutQuad(t) {
    // Smooth easing function
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  registerUIOverlay(overlayName, htmlElement) {
    if (this.uiOverlays.hasOwnProperty(overlayName)) {
      this.uiOverlays[overlayName] = htmlElement;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  animate = () => {
    requestAnimationFrame(this.animate);

    // Update based on state
    if (this.state === this.STATES.HALLWAY_DOWN || this.state === this.STATES.HALLWAY_UP) {
      this.updateCameraAlongHallway();
    }

    if (this.state === this.STATES.DEBRIEF) {
      this.updateDebriefTurn();
    }

    // Update patient avatar if in room
    if (this.state === this.STATES.PATIENT_ROOM && this.patientAvatar) {
      this.patientAvatar.update();
    }

    this.renderer.render(this.scene, this.camera);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // WINDOW MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  setupWindowResize() {
    window.addEventListener('resize', () => this.onWindowResize());
  }

  onWindowResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  dispose() {
    this.renderer.dispose();
    this.scene.clear();
  }
}