import * as THREE from '../node_modules/three/build/three.module.js';

export class VirtualPatient {
  constructor(scene, scenarioId) {
    this.scene = scene;
    this.scenarioId = scenarioId;

    // Patient group (all body parts)
    this.group = new THREE.Group();
    this.scene.scene.add(this.group);

    // Body parts
    this.head = null;
    this.torso = null;
    this.leftArm = null;
    this.rightArm = null;
    this.leftLeg = null;
    this.rightLeg = null;

    // Eyes and expressions
    this.leftEye = null;
    this.rightEye = null;
    this.leftEyePupil = null;
    this.rightEyePupil = null;
    this.mouth = null;

    // Vitals display
    this.vitalsLabel = null;

    // Animation state
    this.breathingProgress = 0;
    this.breathingSpeed = 0.02; // Breaths per frame
    this.blinkProgress = 0;
    this.eyeOpen = 1.0;
    this.nextBlinkTime = Math.random() * 300 + 200; // Blink every 2-5 seconds

    // Patient state
    this.currentState = {
      consciousness: 1.0,    // 0 = unconscious, 1 = fully alert
      oxygenSaturation: 95,  // 0-100%
      pulseRate: 70,         // bpm
      bloodPressure: 120,    // systolic mmHg
      painScore: 0,          // 0-10
      skinColor: 0xffccaa,   // Normal peachy tone
      breathing: true
    };

    // Build the avatar
    this.buildBody();
    this.buildFace();
    this.buildVitalsDisplay();

    // Position patient in room
    this.group.position.set(0, 0, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BODY CONSTRUCTION
  // ═══════════════════════════════════════════════════════════════════════════

  buildBody() {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: this.currentState.skinColor,
      roughness: 0.8,
      metalness: 0.0
    });

    // Torso (chest + abdomen)
    this.torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.8, 0.25),
      bodyMaterial
    );
    this.torso.position.set(0, 0.6, 0);
    this.torso.castShadow = true;
    this.torso.receiveShadow = true;
    this.group.add(this.torso);

    // Head
    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 32, 32),
      bodyMaterial
    );
    this.head.position.set(0, 1.4, 0);
    this.head.castShadow = true;
    this.head.receiveShadow = true;
    this.group.add(this.head);

    // Left arm
    this.leftArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.6, 0.15),
      bodyMaterial
    );
    this.leftArm.position.set(-0.35, 1.0, 0);
    this.leftArm.castShadow = true;
    this.leftArm.receiveShadow = true;
    this.group.add(this.leftArm);

    // Right arm
    this.rightArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.6, 0.15),
      bodyMaterial
    );
    this.rightArm.position.set(0.35, 1.0, 0);
    this.rightArm.castShadow = true;
    this.rightArm.receiveShadow = true;
    this.group.add(this.rightArm);

    // Left leg
    this.leftLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.7, 0.15),
      bodyMaterial
    );
    this.leftLeg.position.set(-0.15, -0.2, 0);
    this.leftLeg.castShadow = true;
    this.leftLeg.receiveShadow = true;
    this.group.add(this.leftLeg);

    // Right leg
    this.rightLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.7, 0.15),
      bodyMaterial
    );
    this.rightLeg.position.set(0.15, -0.2, 0);
    this.rightLeg.castShadow = true;
    this.rightLeg.receiveShadow = true;
    this.group.add(this.rightLeg);
  }

  buildFace() {
    // Left eye white
    const eyeWhiteMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.1
    });

    const eyeGeometry = new THREE.SphereGeometry(0.08, 16, 16);

    this.leftEye = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
    this.leftEye.position.set(-0.08, 1.5, 0.22);
    this.leftEye.castShadow = true;
    this.group.add(this.leftEye);

    // Right eye white
    this.rightEye = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
    this.rightEye.position.set(0.08, 1.5, 0.22);
    this.rightEye.castShadow = true;
    this.group.add(this.rightEye);

    // Left pupil
    const pupilMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.2
    });

    const pupilGeometry = new THREE.SphereGeometry(0.04, 16, 16);

    this.leftEyePupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    this.leftEyePupil.position.set(-0.08, 1.5, 0.30);
    this.leftEyePupil.castShadow = true;
    this.group.add(this.leftEyePupil);

    // Right pupil
    this.rightEyePupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    this.rightEyePupil.position.set(0.08, 1.5, 0.30);
    this.rightEyePupil.castShadow = true;
    this.group.add(this.rightEyePupil);

    // Mouth (simple line)
    const mouthMaterial = new THREE.LineBasicMaterial({ color: 0x8b4513, linewidth: 2 });
    const mouthGeometry = new THREE.BufferGeometry();
    mouthGeometry.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([
        -0.1, 1.25, 0.25,  // Left corner
        0.1, 1.25, 0.25    // Right corner
      ]),
      3
    ));
    this.mouth = new THREE.Line(mouthGeometry, mouthMaterial);
    this.group.add(this.mouth);
  }

  buildVitalsDisplay() {
    // Create a canvas texture for vitals text
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Draw vitals text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 32px Arial';
    ctx.fillText('HR: 70 bpm', 20, 50);
    ctx.fillText('BP: 120/80 mmHg', 20, 100);
    ctx.fillText('SpO₂: 95%', 20, 150);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometry = new THREE.PlaneGeometry(2, 1);

    this.vitalsLabel = new THREE.Mesh(geometry, material);
    this.vitalsLabel.position.set(0, -0.8, 0.3); // Above patient's head
    this.group.add(this.vitalsLabel);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE UPDATES (from PSM)
  // ═══════════════════════════════════════════════════════════════════════════

  updateFromPSM(psmState) {
    // Update patient appearance based on PSM state
    this.currentState.consciousness = psmState.consciousness || 1.0;
    this.currentState.oxygenSaturation = psmState.oxygenSaturation || 95;
    this.currentState.pulseRate = psmState.pulseRate || 70;
    this.currentState.bloodPressure = psmState.bloodPressureSystolic || 120;
    this.currentState.painScore = psmState.painScore || 0;
    this.currentState.breathing = psmState.consciousness > 0.1; // Stop breathing if unconscious

    // Update visuals based on state
    this.updateSkinColor();
    this.updateBreathingRate();
    this.updateEyeState();
    this.updateMouthExpression();
    this.updateVitalsDisplay();
  }

  updateSkinColor() {
    // Skin color changes based on oxygen saturation and consciousness
    let color = 0xffccaa; // Normal peachy tone

    if (this.currentState.consciousness < 0.3) {
      // Unconscious: pale/grey
      color = 0xd3d3d3;
    } else if (this.currentState.oxygenSaturation < 85) {
      // Hypoxic: blue-tinged (cyanosis)
      color = 0x9999cc;
    } else if (this.currentState.oxygenSaturation < 92) {
      // Mild hypoxia: slightly pale
      color = 0xf0d8c0;
    } else if (this.currentState.pulseRate > 120) {
      // Tachycardic: flushed red
      color = 0xff9999;
    }

    // Apply color to all body parts
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.8,
      metalness: 0.0
    });

    this.torso.material = skinMaterial;
    this.head.material = skinMaterial;
    this.leftArm.material = skinMaterial;
    this.rightArm.material = skinMaterial;
    this.leftLeg.material = skinMaterial;
    this.rightLeg.material = skinMaterial;
  }

  updateBreathingRate() {
    // Adjust breathing speed based on respiratory rate
    // Normal: 12-20 breaths/min
    // Rapid: >20 breaths/min
    // Shallow/absent: <12 or 0

    const respiratoryRate = this.currentState.pulseRate * 0.2; // Rough estimate
    this.breathingSpeed = (respiratoryRate / 60) * 0.02; // Convert to per-frame speed
  }

  updateEyeState() {
    // Eyes reflect consciousness level
    // Unconscious: eyes closed (scale Y = 0)
    // Alert: eyes open (scale Y = 1)

    const eyeOpenScale = Math.max(0, this.currentState.consciousness);
    this.leftEye.scale.y = eyeOpenScale;
    this.rightEye.scale.y = eyeOpenScale;
    this.leftEyePupil.scale.y = eyeOpenScale;
    this.rightEyePupil.scale.y = eyeOpenScale;
  }

  updateMouthExpression() {
    // Mouth expression based on pain score
    // Pain: frown (rotate down)
    // No pain: neutral (no rotation)

    const painFraction = this.currentState.painScore / 10;
    const mouthRotation = -painFraction * 0.3; // Down to -0.3 radians
    this.mouth.rotation.z = mouthRotation;
  }

  updateVitalsDisplay() {
    // Update vitals label (in real VR, this would be a 3D canvas texture)
    // For now, we'll update it every frame if needed
    // TODO: Render vitals to canvas texture and update
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  animateBreathing() {
    // Sinusoidal breathing animation on torso Z-axis
    if (!this.currentState.breathing) {
      this.torso.position.z = 0;
      return;
    }

    this.breathingProgress += this.breathingSpeed;
    this.torso.position.z = Math.sin(this.breathingProgress * Math.PI * 2) * 0.05;
  }

  animateBlinking() {
    // Periodic blinking
    this.blinkProgress++;

    if (this.blinkProgress >= this.nextBlinkTime) {
      // Time to blink
      const blinkDuration = 6; // Frames to close eyes
      const timeInBlink = (this.blinkProgress - this.nextBlinkTime) % blinkDuration;
      const blinkProgress = timeInBlink / blinkDuration;

      // Close eyes (frame 0-3), open eyes (frame 3-6)
      if (blinkProgress < 0.5) {
        this.eyeOpen = 1.0 - (blinkProgress * 2); // Close
      } else {
        this.eyeOpen = (blinkProgress - 0.5) * 2; // Open
      }

      // Schedule next blink
      if (blinkProgress > 1.0) {
        this.nextBlinkTime += Math.random() * 300 + 200;
      }

      // Apply blink to eyes
      this.leftEye.scale.y = Math.max(0, this.eyeOpen * this.currentState.consciousness);
      this.rightEye.scale.y = Math.max(0, this.eyeOpen * this.currentState.consciousness);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  update() {
    // Called every frame by Scene.animate()
    this.animateBreathing();
    this.animateBlinking();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  getState() {
    return this.currentState;
  }

  setState(newState) {
    Object.assign(this.currentState, newState);
    this.updateFromPSM(this.currentState);
  }

  dispose() {
    // Clean up Three.js objects
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.scene.scene.remove(this.group);
  }
}