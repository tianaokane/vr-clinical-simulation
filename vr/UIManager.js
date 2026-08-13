export class UIManager {
  constructor(scene, inputHandler) {
    this.scene = scene;
    this.inputHandler = inputHandler;

    // UI Elements
    this.menuOverlay = null;
    this.scenarioPickerOverlay = null;
    this.loadingScreen = null;
    this.vitalsHUD = null;
    this.debriefOverlay = null;

    // Initialize UI elements
    this.initializeUIElements();
    this.setupEventListeners();

    // Register UI overlays with scene
    this.scene.registerUIOverlay('menu', this.menuOverlay);
    this.scene.registerUIOverlay('scenarioPicker', this.scenarioPickerOverlay);
    this.scene.registerUIOverlay('loadingScreen', this.loadingScreen);
    this.scene.registerUIOverlay('vitalsHUD', this.vitalsHUD);
    this.scene.registerUIOverlay('debriefUI', this.debriefOverlay);

    // Listen for scene state changes
    this.scene.onStateChanged = (state) => this.onSceneStateChanged(state);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  initializeUIElements() {
    this.menuOverlay = document.getElementById('menu-overlay');
    this.scenarioPickerOverlay = document.getElementById('scenario-picker-overlay');
    this.loadingScreen = document.getElementById('loading-screen');
    this.vitalsHUD = document.getElementById('vitals-hud');
    this.debriefOverlay = document.getElementById('debrief-overlay');

    if (!this.menuOverlay || !this.scenarioPickerOverlay || !this.loadingScreen || 
        !this.vitalsHUD || !this.debriefOverlay) {
      console.error('UI elements not found in DOM');
    }
  }

  setupEventListeners() {
    // Menu buttons
    const startButton = document.getElementById('start-training-btn');
    if (startButton) {
      startButton.addEventListener('click', () => this.scene.onMenuStartClicked());
    }

    // Scenario picker buttons
    const cardiacBtn = document.getElementById('scenario-cardiac-arrest');
    const femurBtn = document.getElementById('scenario-femur');
    const sepsisBtn = document.getElementById('scenario-sepsis');
    const anaphylaxisBtn = document.getElementById('scenario-anaphylaxis');

    if (cardiacBtn) cardiacBtn.addEventListener('click', () => this.scene.onScenarioSelected('cardiac-arrest-adult'));
    if (femurBtn) femurBtn.addEventListener('click', () => this.scene.onScenarioSelected('fractured-femur-adult'));
    if (sepsisBtn) sepsisBtn.addEventListener('click', () => this.scene.onScenarioSelected('sepsis-adult'));
    if (anaphylaxisBtn) anaphylaxisBtn.addEventListener('click', () => this.scene.onScenarioSelected('anaphylaxis-paediatric'));

    // Scenario picker back button
    const backButton = document.getElementById('scenario-picker-back');
    if (backButton) {
      backButton.addEventListener('click', () => this.scene.onScenarioPickerBack());
    }

    // Debrief buttons
    const retryButton = document.getElementById('debrief-retry-btn');
    const returnButton = document.getElementById('debrief-return-btn');

    if (retryButton) {
      retryButton.addEventListener('click', () => this.scene.onDebriefRetry());
    }
    if (returnButton) {
      returnButton.addEventListener('click', () => this.scene.onDebriefReturnToBoard());
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  onSceneStateChanged(state) {
    // Hide all overlays first
    this.hideAll();

    // Show relevant overlay based on state
    switch (state) {
      case this.scene.STATES.MENU:
        this.showMenu();
        break;
      case this.scene.STATES.HALLWAY_DOWN:
      case this.scene.STATES.HALLWAY_UP:
        // No overlay during hallway walk
        break;
      case this.scene.STATES.BOARD:
        this.showScenarioPicker();
        break;
      case this.scene.STATES.LOADING_SCENARIO:
        this.showLoadingScreen();
        break;
      case this.scene.STATES.PATIENT_ROOM:
        this.showVitalsHUD();
        break;
      case this.scene.STATES.DEBRIEF:
        this.showDebrief();
        break;
    }
  }

  hideAll() {
    this.menuOverlay.style.display = 'none';
    this.scenarioPickerOverlay.style.display = 'none';
    this.loadingScreen.style.display = 'none';
    this.vitalsHUD.style.display = 'none';
    this.debriefOverlay.style.display = 'none';
  }

  showMenu() {
    this.menuOverlay.style.display = 'flex';
  }

  showScenarioPicker() {
    this.scenarioPickerOverlay.style.display = 'flex';
  }

  showLoadingScreen() {
    this.loadingScreen.style.display = 'flex';
  }

  showVitalsHUD() {
    this.vitalsHUD.style.display = 'block';
  }

  showDebrief() {
    this.debriefOverlay.style.display = 'flex';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VITALS HUD UPDATES
  // ═══════════════════════════════════════════════════════════════════════════

  updateVitalsHUD(parameters) {
    // Update real-time vitals display from PSM parameters
    const hrElement = document.getElementById('vitals-hr');
    const bpElement = document.getElementById('vitals-bp');
    const spo2Element = document.getElementById('vitals-spo2');
    const consciousnessElement = document.getElementById('vitals-consciousness');

    if (hrElement && parameters?.pulseRate) {
      const hr = Math.round(parameters.pulseRate.value || 0);
      hrElement.textContent = `HR: ${hr} bpm`;
      // Color-code: green < 100, yellow 100-120, red > 120
      if (hr < 100) {
        hrElement.className = 'vitals-normal';
      } else if (hr < 120) {
        hrElement.className = 'vitals-warning';
      } else {
        hrElement.className = 'vitals-critical';
      }
    }

    if (bpElement && parameters?.bloodPressureSystolic) {
      const systolic = Math.round(parameters.bloodPressureSystolic.value || 120);
      bpElement.textContent = `BP: ${systolic}/80 mmHg`;
      // Color-code: green 90-140, yellow 70-89 or 140-160, red < 70 or > 160
      if (systolic >= 90 && systolic <= 140) {
        bpElement.className = 'vitals-normal';
      } else if ((systolic >= 70 && systolic < 90) || (systolic > 140 && systolic <= 160)) {
        bpElement.className = 'vitals-warning';
      } else {
        bpElement.className = 'vitals-critical';
      }
    }

    if (spo2Element && parameters?.oxygenSaturation) {
      const spo2 = Math.round(parameters.oxygenSaturation.value || 95);
      spo2Element.textContent = `SpO₂: ${spo2}%`;
      // Color-code: green >= 94, yellow 90-93, red < 90
      if (spo2 >= 94) {
        spo2Element.className = 'vitals-normal';
      } else if (spo2 >= 90) {
        spo2Element.className = 'vitals-warning';
      } else {
        spo2Element.className = 'vitals-critical';
      }
    }

    if (consciousnessElement && parameters?.consciousness) {
      const consciousnessPercent = Math.round((parameters.consciousness.value || 1.0) * 100);
      consciousnessElement.textContent = `Consciousness: ${consciousnessPercent}%`;
      if (consciousnessPercent >= 80) {
        consciousnessElement.className = 'vitals-normal';
      } else if (consciousnessPercent >= 40) {
        consciousnessElement.className = 'vitals-warning';
      } else {
        consciousnessElement.className = 'vitals-critical';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBRIEF DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════

  displayDebrief(debriefData) {
    // Display enhanced debrief content from DebriefingSystem
    const debriefContent = document.getElementById('debrief-content');
    if (!debriefContent) return;

    let html = '';

    // Header
    html += `
      <div class="debrief-header">
        <h1>${debriefData.scenarioId.replace('-', ' ').toUpperCase()}</h1>
        <div class="debrief-score">
          <span class="score-number">${debriefData.summary.overallScore}%</span>
          <span class="score-level ${debriefData.competencyLevel.level}">${debriefData.competencyLevel.label}</span>
        </div>
      </div>
    `;

    // Feedback sections
    if (debriefData.feedback && Array.isArray(debriefData.feedback)) {
      debriefData.feedback.forEach((section) => {
        if (section.type === 'section') {
          html += `
            <div class="debrief-section">
              <h2>${section.title}</h2>
              ${section.content ? `<p>${section.content.replace(/\n/g, '<br>')}</p>` : ''}
              ${section.items ? this.renderFeedbackItems(section.items) : ''}
            </div>
          `;
        } else if (section.type === 'next_steps') {
          html += `
            <div class="debrief-section">
              <h2>📋 Next Steps</h2>
              <p>${section.text.replace(/\n/g, '<br>')}</p>
            </div>
          `;
        }
      });
    }

    debriefContent.innerHTML = html;
  }

  renderFeedbackItems(items) {
    if (!items || items.length === 0) return '';

    let html = '<ul class="feedback-items">';
    items.forEach((item) => {
      let className = '';
      if (item.severity) {
        className = `feedback-${item.severity}`;
      }

      html += `
        <li class="${className}">
          <strong>${item.title}</strong>
          ${item.guidance ? `<p>${item.guidance}</p>` : ''}
          ${item.target ? `<p class="target">Target: ${item.target}</p>` : ''}
        </li>
      `;
    });
    html += '</ul>';
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO DESCRIPTION DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════

  getScenarioDescription(scenarioId) {
    const descriptions = {
      'cardiac-arrest-adult': {
        name: 'Cardiac Arrest',
        description: 'An adult patient has suffered sudden cardiac arrest. You must initiate the Chain of Survival.',
        difficulty: 'Intermediate',
        timeLimit: '10 minutes'
      },
      'fractured-femur-adult': {
        name: 'Fractured Femur',
        description: 'A trauma patient with a suspected femoral shaft fracture. Manage pain, assess neurovascular status, and prepare for transfer.',
        difficulty: 'Intermediate',
        timeLimit: '15 minutes'
      },
      'sepsis-adult': {
        name: 'Sepsis',
        description: 'A patient presenting with sepsis. Recognize the condition rapidly and initiate the sepsis bundle.',
        difficulty: 'Advanced',
        timeLimit: '15 minutes'
      },
      'anaphylaxis-paediatric': {
        name: 'Anaphylaxis (Paediatric)',
        description: 'A child experiencing anaphylaxis. Provide immediate IM adrenaline and airway management.',
        difficulty: 'Intermediate',
        timeLimit: '10 minutes'
      }
    };

    return descriptions[scenarioId] || {};
  }
}