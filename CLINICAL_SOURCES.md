# Clinical Sources and Guideline Anchors

## Cardiac Arrest — Adult (`cardiac-arrest-adult.json`)

### Primary Source
- **Title**: Resuscitation Council UK Adult Advanced Life Support Guidelines
- **Year**: 2021
- **URL**: https://www.resus.org.uk/library/2021-resuscitation-council-guidelines
- **Retrieved**: [date you checked]

### Guideline Anchors Mapped

| JSON Field | Guidance | Source Section |
|-----------|----------|-----------------|
| `cprQuality.compressionRatePerMinute` (100–120/min) | Section 2.2: "Compression rate should be 100–120 compressions per minute" | RCUK ALS 2021, p. 14 |
| `cprQuality.compressionDepthCm` (5–6cm) | Section 2.2: "Depth should be 5–6 cm" | RCUK ALS 2021, p. 14 |
| `cprQuality.ventilationRatio` (30:2) | Section 2.2: "30 compressions to 2 breaths when trained" | RCUK ALS 2021, p. 15 |
| `defibrillation.shockAsEarlyAsAppropriate` | Section 2.4: "Apply pads during CPR; shock as soon as ready" | RCUK ALS 2021, p. 18 |
| `postROSC.targetSpO2WhenReliable` (94–98%) | Section 3.1: "Avoid hypoxia (<94%) and hyperoxia (>98%)" | RCUK ALS 2021, p. 22 |
| `postROSC.targetSystolicBP` (≥100 mmHg) | Section 3.1: "Target systolic BP ≥100 mmHg" | RCUK ALS 2021, p. 22 |

---

## Fractured Femur — Adult (`fractured-femur-adult.json`)

### Primary Sources
- **NICE NG176**: "Major trauma: assessment and initial management" (2016, updated 2023)
  - URL: https://www.nice.org.uk/guidance/ng176
- **NAEMSP**: "Prehospital Trauma Compendium: Management of Suspected Femoral Shaft Fractures" (2025)
  - URL: https://www.naemsp.org/position-statements/femoral-fractures

### Guideline Anchors Mapped

| JSON Field | Guidance | Source |
|-----------|----------|--------|
| `guidelineAnchors.ABCDE.*` | ABCDE systematic approach | NICE NG176, Section 2.1 |
| `clinicalManagement.avoidMovement` | "Do not straighten or pull; minimise movement" | NAEMSP Femoral Position Statement, Section 3.2 |
| `neurovascularAssessment` | Check distal pulse, CRT, sensation, movement before/after immobilisation | NICE NG176, Section 2.3 |
| Blood loss risk (650 mL initial) | Femoral shaft fractures can lose 500–1500 mL into thigh compartment | NICE NG176, Section 1.2 |

---

## Anaphylaxis — Paediatric (`anaphylaxis-paediatric.json`)

### Primary Source
- **Title**: Resuscitation Council UK Emergency Treatment of Anaphylaxis Guidelines
- **Year**: May 2021 (updated annually)
- **URL**: https://www.resus.org.uk/library/anaphylaxis-guidelines
- **Retrieved**: [date]

### Guideline Anchors Mapped

| JSON Field | Guidance | Source Section |
|-----------|----------|-----------------|
| `firstLineTreatment.earlyIMAdrenaline` | "IM adrenaline into anterolateral thigh is first-line treatment" | RCUK Anaphylaxis 2021, Section 4.3, Algorithm Fig 6 |
| Paediatric IM adrenaline dose (0.01 mg/kg) | "Paediatric: 0.01 mg/kg IM (max 500 mcg)" | RCUK Anaphylaxis 2021, Section 5.1.1 |
| `repeatIMAdrenaline` (5 minutes) | "Repeat IM adrenaline after 5 minutes if ABC problems persist" | RCUK Anaphylaxis 2021, Section 4.3 |
| IV adrenaline caution | "IV adrenaline only by experienced specialists in appropriate settings" | RCUK Anaphylaxis 2021, Section 5.1.2 |
| Antihistamines/steroids NOT first-line | "Must not delay adrenaline; not recommended for initial emergency treatment" | RCUK Anaphylaxis 2021, Section 5.4–5.5 |

---

## Sepsis — Adult (`sepsis-adult.json`)

### Primary Sources
- **NICE NG51**: "Sepsis: recognition, assessment and early management" (2016, updated 2023)
  - URL: https://www.nice.org.uk/guidance/ng51
- **Surviving Sepsis Campaign**: International Guidelines for Management of Sepsis (2021)
  - URL: https://www.survivingsepsiscampaign.org/guidelines/

### Guideline Anchors Mapped

| JSON Field | Guidance | Source |
|-----------|----------|--------|
| Recognition: tachycardia, tachypnoea, hypoxia, confusion | Sepsis triad + abnormal physiology | NICE NG51, Section 1.1 |
| Early escalation | Escalate to senior/critical care promptly | NICE NG51, Section 1.3 |
| Blood cultures before antibiotics (if no delay) | "Take within 3 hours without delaying antibiotics" | Surviving Sepsis Campaign 2021, Section 2.2 |
| Antibiotic timing (1-hour bundle) | "Initiate broad-spectrum IV antibiotics within 1 hour of suspicion" | Surviving Sepsis Campaign 2021, Section 2.3 |
| IV fluid bolus (if hypotensive/shock) | "30 mL/kg crystalloid if hypotensive or lactate ≥4 mmol/L" | Surviving Sepsis Campaign 2021, Section 2.4 |

---

## How to Use This Document

1. **When auditing scenarios**: Cross-reference JSON fields against this table.
2. **When updating scenarios**: Note which source grounds each change.
3. **For CSC3002 dissertation**: Cite this document as your clinical grounding evidence.
4. **For future maintainers**: Easy to see which guideline supports which parameter.

---

## Maintenance Notes

- **Last reviewed**: [date]
- **Next review due**: [date + 6 months]
- **Guidelines reviewed**: RCUK (2021), NICE NG176/NG51 (2023), Surviving Sepsis Campaign (2021), NAEMSP (2025)