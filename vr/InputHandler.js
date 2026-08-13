import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class InputHandler {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = scene.camera;

    // Keyboard state
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      arrowUp: false,
      arrowDown: false,
      arrowLeft: false,
      arrowRight: false
    };

    // Mouse state
    this.mouse = {
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY: 0,
      isLocked: false
    };

    this.mouseSensitivity = 0.003; // Radians per pixel
    this.hallwayWalkSpeed = 0.02; // Base units per frame
    this.hallwayAcceleration = 0.001;
    this.hallwayCurrentSpeed = 0;

    // Camera rotation state (Euler angles)
    this.pitch = 0; // Up/down rotation
    this.yaw = 0;   // Left/right rotation

    // Pitch limits (prevents over-rotating)
    this.pitchMin = -Math.PI / 3; // -60°
    this.pitchMax = Math.PI / 3;  // +60°

    // UI interaction state
    this.raycaster = new THREE.Raycaster();
    this.clickableObjects = []; // Buttons, interactive objects

    // Setup listeners
    this.setupKeyboardListeners();
    this.setupMouseListeners();
    this.setupClickListeners();

    // Animation loop
    this.animate();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYBOARD INPUT
  // ═══════════════════════════════════════════════════════════════════════════

  setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  onKeyDown(event) {
    const key = event.key.toLowerCase();

    if (key === 'w') this.keys.w = true;
    if (key === 'a') this.keys.a = true;
    if (key === 's') this.keys.s = true;
    if (key === 'd') this.keys.d = true;
    if (key === 'arrowup') this.keys.arrowUp = true;
    if (key === 'arrowdown') this.keys.arrowDown = true;
    if (key === 'arrowleft') this.keys.arrowLeft = true;
    if (key === 'arrowright') this.keys.arrowRight = true;
  }

  onKeyUp(event) {
    const key = event.key.toLowerCase();

    if (key === 'w') this.keys.w = false;
    if (key === 'a') this.keys.a = false;
    if (key === 's') this.keys.s = false;
    if (key === 'd') this.keys.d = false;
    if (key === 'arrowup') this.keys.arrowUp = false;
    if (key === 'arrowdown') this.keys.arrowDown = false;
    if (key === 'arrowleft') this.keys.arrowLeft = false;
    if (key === 'arrowright') this.keys.arrowRight = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOUSE INPUT
  // ═══════════════════════════════════════════════════════════════════════════

  setupMouseListeners() {
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Pointer lock for immersive experience
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    document.addEventListener('pointerlockerror', () => this.onPointerLockError());
  }

  onMouseMove(event) {
    this.mouse.deltaX = event.movementX;
    this.mouse.deltaY = event.movementY;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  onMouseDown(event) {
    // Pointer lock (FPS-style mouselook) is intentionally NOT auto-engaged
    // here anymore. It used to request on the first click in PATIENT_ROOM,
    // but that's exactly where the interaction system now lives
    // (PatientInteractionController: category -> action -> site, see
    // core/InteractionSystem.js) -- its whole model is point-and-click with
    // a normal, visible cursor. Locking the pointer on the first click
    // would hide the cursor and break every menu/anchor click after it.
    // The room's camera is a fixed vantage point set at scenario load
    // (Scene.loadScenario), so nothing currently depends on mouselook
    // here. Re-add it behind its own explicit toggle if free look becomes
    // a real requirement later, rather than any click in the room.
  }

  onMouseUp(event) {
    // Mouse up handled separately if needed
  }

  onPointerLockChange() {
    this.mouse.isLocked = document.pointerLockElement === this.renderer.domElement;
  }

  onPointerLockError() {
    console.warn('Pointer lock error');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLICK DETECTION (UI INTERACTIONS)
  // ═══════════════════════════════════════════════════════════════════════════

  setupClickListeners() {
    // Listen for clicks on UI buttons
    // Buttons register themselves via registerClickable()

    document.addEventListener('click', (event) => this.onDocumentClick(event));
  }

  registerClickable(element, callback) {
    // Register HTML element as clickable
    // Example: registerClickable(startButton, () => scene.onMenuStartClicked())
    element.addEventListener('click', callback);
  }

  onDocumentClick(event) {
    // Handle 3D scene clicks (currently used for scenario picker board)
    // This would raytrace from camera through clicked point to find 3D objects

    // For now, UI clicks are handled by HTML buttons
    // If needed, we can implement raycasting for 3D clickable objects later

    // const vector = new THREE.Vector2(this.mouse.x, this.mouse.y);
    // this.raycaster.setFromCamera(vector, this.camera);
    // const intersects = this.raycaster.intersectObjects(this.clickableObjects);
    // if (intersects.length > 0) { ... }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMERA CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  updateCameraRotation() {
    // Update camera rotation based on mouse movement
    if (!this.mouse.isLocked) {
      return; // Only rotate when pointer is locked
    }

    // Update yaw (left/right) and pitch (up/down)
    this.yaw -= this.mouse.deltaX * this.mouseSensitivity;
    this.pitch -= this.mouse.deltaY * this.mouseSensitivity;

    // Clamp pitch to prevent flipping
    this.pitch = Math.max(this.pitchMin, Math.min(this.pitchMax, this.pitch));

    // Apply rotation to camera using Euler angles
    // Order: YXZ (yaw, then pitch, then roll=0)
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  updateHallwayMovement() {
    // Update hallway speed based on WASD input
    const isMovingForward = this.keys.w || this.keys.arrowUp;
    const isMovingBackward = this.keys.s || this.keys.arrowDown;

    if (isMovingForward && !isMovingBackward) {
      // Accelerate forward
      this.hallwayCurrentSpeed = Math.min(
        this.hallwayCurrentSpeed + this.hallwayAcceleration,
        this.hallwayWalkSpeed
      );
    } else if (isMovingBackward && !isMovingForward) {
      // Accelerate backward
      this.hallwayCurrentSpeed = Math.max(
        this.hallwayCurrentSpeed - this.hallwayAcceleration,
        -this.hallwayWalkSpeed
      );
    } else {
      // Decelerate (no input)
      if (this.hallwayCurrentSpeed > 0) {
        this.hallwayCurrentSpeed = Math.max(
          this.hallwayCurrentSpeed - this.hallwayAcceleration,
          0
        );
      } else if (this.hallwayCurrentSpeed < 0) {
        this.hallwayCurrentSpeed = Math.min(
          this.hallwayCurrentSpeed + this.hallwayAcceleration,
          0
        );
      }
    }

    // Apply movement to scene's hallway progress
    if (this.scene.state === this.scene.STATES.HALLWAY_DOWN ||
        this.scene.state === this.scene.STATES.HALLWAY_UP) {
      
      this.scene.hallwaySpeed = Math.abs(this.hallwayCurrentSpeed);
      
      // Update direction based on input
      if (isMovingForward) {
        this.scene.hallwayDirection = 'down';
      } else if (isMovingBackward) {
        this.scene.hallwayDirection = 'up';
      }
    }
  }

  updateDebriefCameraControl() {
    // During debrief, limit camera movement (player can look around but not move)
    // Still allow mouse look, but restrict movement
    if (this.scene.state === this.scene.STATES.DEBRIEF) {
      this.hallwayCurrentSpeed = 0; // Prevent movement during debrief
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATION LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  animate = () => {
    requestAnimationFrame(this.animate);

    // Update based on scene state
    this.updateCameraRotation();
    this.updateHallwayMovement();
    this.updateDebriefCameraControl();

    // Reset mouse delta each frame (for next frame's calculation)
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  setMouseSensitivity(sensitivity) {
    this.mouseSensitivity = sensitivity;
  }

  setHallwaySpeed(speed) {
    this.hallwayWalkSpeed = speed;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  dispose() {
    window.removeEventListener('keydown', (e) => this.onKeyDown(e));
    window.removeEventListener('keyup', (e) => this.onKeyUp(e));
    document.removeEventListener('mousemove', (e) => this.onMouseMove(e));
    document.removeEventListener('mousedown', (e) => this.onMouseDown(e));
    document.removeEventListener('mouseup', (e) => this.onMouseUp(e));
  }
}