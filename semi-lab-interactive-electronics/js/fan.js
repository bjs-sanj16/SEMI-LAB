/* ========================================================
   Semi Lab – PWM Fan Regulator Interactive Engine (js/fan.js)
   ======================================================== */

(function () {
  'use strict';

  // --- State Variables ---
  var state = {
    duty: 65,            // percentage 1 - 99
    voltage: 12,         // 5, 9, 12 V
    powerOn: true,
    showAnimation: true,
    isPlaying: true,
    simSpeed: 1.0,
    currentRPM: 0,
    targetRPM: 1863,
    fanAngle: 0,
    simPhase: 0,         // 0 to 1 (oscillator cycle phase)
    vCap: 6.4,           // Timing capacitor voltage
    knobAngle: 40.5      // -135 to +135 deg
  };

  // --- DOM Elements ---
  var el = {
    // Readouts
    readoutDuty: document.getElementById('readoutDuty'),
    readoutFreq: document.getElementById('readoutFreq'),
    readoutVavg: document.getElementById('readoutVavg'),
    readoutCurrent: document.getElementById('readoutCurrent'),
    readoutRpm: document.getElementById('readoutRpm'),
    stallBadge: document.getElementById('stallBadge'),
    airflowReadout: document.getElementById('airflowReadout'),
    noiseReadout: document.getElementById('noiseReadout'),
    torqueReadout: document.getElementById('torqueReadout'),

    // Knob & Controls
    knob: document.getElementById('dutyKnob'),
    knobIndicator: document.getElementById('knobIndicator'),
    knobValueText: document.getElementById('knobValueText'),
    dutySlider: document.getElementById('dutySlider'),
    dutySliderVal: document.getElementById('dutySliderVal'),
    togglePower: document.getElementById('togglePower'),
    labelMasterPower: document.getElementById('labelMasterPower'),
    toggleAnimation: document.getElementById('toggleAnimation'),
    voltageDisplay: document.getElementById('voltageDisplay'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    btnStep: document.getElementById('btnStep'),
    speedSlider: document.getElementById('speedSlider'),
    speedText: document.getElementById('speedText'),
    btnResetAll: document.getElementById('btnResetAll'),
    fanSpinnerSvg: document.getElementById('fanSpinnerSvg'),

    // SVG elements
    svgVccText: document.getElementById('svgVccText'),
    svgSwitchBlade: document.getElementById('svgSwitchBlade'),
    circuitStateBadge: document.getElementById('circuitStateBadge'),
    mosfetInversionChannel: document.getElementById('mosfetInversionChannel'),
    mosfetGatePlate: document.getElementById('mosfetGatePlate'),
    diodeD1Poly: document.getElementById('diodeD1Poly'),
    diodeD2Poly: document.getElementById('diodeD2Poly'),
    flybackPoly: document.getElementById('flybackPoly'),
    wirePin3: document.getElementById('wirePin3'),
    labelChargeState: document.getElementById('labelChargeState'),
    labelFlybackState: document.getElementById('labelFlybackState'),

    // Dots
    dotCharge1: document.getElementById('dotCharge1'),
    dotCharge2: document.getElementById('dotCharge2'),
    dotDischarge1: document.getElementById('dotDischarge1'),
    dotGate1: document.getElementById('dotGate1'),
    dotFan1: document.getElementById('dotFan1'),
    dotFan2: document.getElementById('dotFan2'),
    dotFlyback1: document.getElementById('dotFlyback1'),

    // 555 Internals
    internalVcapText: document.getElementById('internalVcapText'),
    vcapProgressBar: document.getElementById('vcapProgressBar'),
    badgeCompUpper: document.getElementById('badgeCompUpper'),
    badgeCompLower: document.getElementById('badgeCompLower'),
    badgeDischargeTransistor: document.getElementById('badgeDischargeTransistor'),
    latchStatusText: document.getElementById('latchStatusText'),
    label13Vcc: document.getElementById('label13Vcc'),
    label23Vcc: document.getElementById('label23Vcc'),
    labelVcc: document.getElementById('labelVcc')
  };

  // --- Charts ---
  var pwmChart = null;
  var rpmChart = null;

  // --- Helper: Map Range ---
  function mapRange(val, inMin, inMax, outMin, outMax) {
    return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  // --- Calculate Physics & Electrical Quantities ---
  function updatePhysics() {
    var d = state.powerOn ? state.duty : 0;
    var vcc = state.voltage;
    var vAvg = (d / 100) * vcc;

    // Fan stall calculation
    // Max RPM is 2400 at 12V. If duty < 18%, stall torque threshold is not met.
    var maxRpmAtVcc = 2400 * (vcc / 12.0);
    if (!state.powerOn || state.duty < 18) {
      state.targetRPM = 0;
    } else {
      var effectiveRatio = (state.duty - 18) / (100 - 18);
      state.targetRPM = Math.round(maxRpmAtVcc * effectiveRatio);
    }

    // Current estimate: 250mA max load * duty fraction
    var maxCurrent = 250 * (vcc / 12.0);
    var estCurrent = state.powerOn ? Math.round(maxCurrent * (state.duty / 100)) : 0;

    // Frequency = 1.44 / (R_pot * C1) -> with R_pot = 100k, C1 = 10nF -> 1.44 kHz
    var freqKhz = 1.44;

    // Update UI Readouts
    if (el.readoutDuty) el.readoutDuty.innerHTML = state.duty.toFixed(1) + '<span class="readout-unit">%</span>';
    if (el.readoutFreq) el.readoutFreq.innerHTML = freqKhz.toFixed(2) + '<span class="readout-unit">kHz</span>';
    if (el.readoutVavg) el.readoutVavg.innerHTML = vAvg.toFixed(2) + '<span class="readout-unit">V</span>';
    if (el.readoutCurrent) el.readoutCurrent.innerHTML = estCurrent + '<span class="readout-unit">mA</span>';

    // Stall / Running Badge
    if (el.stallBadge) {
      if (!state.powerOn) {
        el.stallBadge.textContent = 'Power Off';
        el.stallBadge.style.background = 'rgba(239,68,68,0.12)';
        el.stallBadge.style.color = 'var(--danger)';
      } else if (state.duty < 18) {
        el.stallBadge.textContent = 'Motor Stalled (<18%)';
        el.stallBadge.style.background = 'rgba(245,158,11,0.12)';
        el.stallBadge.style.color = 'var(--warning)';
      } else {
        el.stallBadge.textContent = 'Running (' + Math.round(state.currentRPM) + ' RPM)';
        el.stallBadge.style.background = 'rgba(22,163,74,0.12)';
        el.stallBadge.style.color = 'var(--success)';
      }
    }

    // Airflow & Acoustics
    var rpmFraction = state.currentRPM / 2400;
    var cfm = (rpmFraction * 44.5).toFixed(1);
    var dba = state.currentRPM > 100 ? (18 + rpmFraction * 22.5).toFixed(1) : '<15';
    if (el.airflowReadout) el.airflowReadout.textContent = cfm + ' CFM';
    if (el.noiseReadout) el.noiseReadout.textContent = dba + ' dBA';
    if (el.torqueReadout) {
      el.torqueReadout.textContent = state.currentRPM === 0 ? (state.powerOn ? 'Holding Torque' : 'No Bias') : 'Aerodynamic';
    }

    // 555 Threshold Labels
    if (el.label13Vcc) el.label13Vcc.textContent = '1/3 VCC (' + (vcc / 3).toFixed(1) + 'V)';
    if (el.label23Vcc) el.label23Vcc.textContent = '2/3 VCC (' + (2 * vcc / 3).toFixed(1) + 'V)';
    if (el.labelVcc) el.labelVcc.textContent = 'VCC (' + vcc.toFixed(1) + 'V)';
    if (el.svgVccText) el.svgVccText.textContent = '+' + vcc + 'V (VCC)';

    // Update charts
    updatePwmChart();
    updateRpmChart();
  }

  // --- Knob Interaction ---
  function setDutyFromKnobAngle(angle) {
    // angle ranges from -135 to +135
    angle = Math.max(-135, Math.min(135, angle));
    state.knobAngle = angle;
    var duty = Math.round(mapRange(angle, -135, 135, 1, 99));
    setDuty(duty, false);
  }

  function setDuty(duty, updateKnobAngle) {
    state.duty = Math.max(1, Math.min(99, duty));
    if (updateKnobAngle !== false) {
      state.knobAngle = mapRange(state.duty, 1, 99, -135, 135);
    }

    // Update knob visual
    if (el.knob) {
      el.knob.style.setProperty('--knob-angle', (state.knobAngle + 135).toString());
      el.knob.setAttribute('aria-valuenow', state.duty.toString());
    }
    if (el.knobIndicator) {
      el.knobIndicator.style.transform = 'rotate(' + state.knobAngle + 'deg)';
    }
    if (el.knobValueText) el.knobValueText.textContent = state.duty + '%';
    if (el.dutySlider) el.dutySlider.value = state.duty;
    if (el.dutySliderVal) el.dutySliderVal.textContent = state.duty + '%';

    updatePhysics();
  }

  function setupKnob() {
    if (!el.knob) return;

    var isDragging = false;

    function handleDrag(e) {
      if (!isDragging) return;
      var rect = el.knob.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;

      var clientX = e.clientX;
      var clientY = e.clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }

      var dx = clientX - centerX;
      var dy = clientY - centerY;
      var rad = Math.atan2(dy, dx);
      var deg = rad * (180 / Math.PI) + 90; // Top is 0
      if (deg > 180) deg -= 360;

      // Restrict between -135 and +135
      if (deg >= -150 && deg <= 150) {
        setDutyFromKnobAngle(deg);
      }
    }

    el.knob.addEventListener('mousedown', function (e) {
      isDragging = true;
      handleDrag(e);
      e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
      if (isDragging) {
        handleDrag(e);
        e.preventDefault();
      }
    });

    window.addEventListener('mouseup', function () {
      isDragging = false;
    });

    // Touch support
    el.knob.addEventListener('touchstart', function (e) {
      isDragging = true;
      handleDrag(e);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', function (e) {
      if (isDragging) {
        handleDrag(e);
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('touchend', function () {
      isDragging = false;
    });

    // Mouse wheel on knob
    el.knob.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = e.deltaY < 0 ? 2 : -2;
      setDuty(state.duty + delta);
    });

    // Keyboard navigation
    el.knob.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        setDuty(state.duty + (e.shiftKey ? 10 : 2));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        setDuty(state.duty - (e.shiftKey ? 10 : 2));
      }
    });
  }

  // --- Event Listeners for UI Controls ---
  function setupControls() {
    // Slider
    if (el.dutySlider) {
      el.dutySlider.addEventListener('input', function () {
        setDuty(parseInt(this.value, 10));
      });
    }

    // Power toggle
    if (el.togglePower) {
      el.togglePower.addEventListener('change', function () {
        state.powerOn = this.checked;
        if (el.labelMasterPower) {
          el.labelMasterPower.textContent = 'VCC POWER: ' + (state.powerOn ? 'ON' : 'OFF');
        }
        if (el.svgSwitchBlade) {
          el.svgSwitchBlade.setAttribute('y2', state.powerOn ? '40' : '28');
        }
        if (el.circuitStateBadge) {
          el.circuitStateBadge.textContent = state.powerOn ? 'Active' : 'Standby (0V)';
          el.circuitStateBadge.style.color = state.powerOn ? 'var(--accent)' : 'var(--danger)';
        }
        updatePhysics();
      });
    }

    // Animation toggle
    if (el.toggleAnimation) {
      el.toggleAnimation.addEventListener('change', function () {
        state.showAnimation = this.checked;
        var dotGroup = document.getElementById('animatedCurrentDots');
        if (dotGroup) dotGroup.style.display = state.showAnimation ? 'block' : 'none';
      });
    }

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var duty = parseInt(this.dataset.duty, 10);
        if (!isNaN(duty)) setDuty(duty);
      });
    });

    // Supply voltage buttons
    document.querySelectorAll('.voltage-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.voltage-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        state.voltage = parseFloat(this.dataset.volt) || 12;
        if (el.voltageDisplay) el.voltageDisplay.textContent = state.voltage.toFixed(1) + ' V';
        updatePhysics();
      });
    });

    // Play / Pause
    if (el.btnPlayPause) {
      el.btnPlayPause.addEventListener('click', function () {
        state.isPlaying = !state.isPlaying;
        this.textContent = state.isPlaying ? '⏸ Pause' : '▶ Play';
      });
    }

    // Step
    if (el.btnStep) {
      el.btnStep.addEventListener('click', function () {
        state.isPlaying = false;
        if (el.btnPlayPause) el.btnPlayPause.textContent = '▶ Play';
        state.simPhase = (state.simPhase + 0.1) % 1.0;
        stepSimulation(0.1);
      });
    }

    // Speed slider
    if (el.speedSlider) {
      el.speedSlider.addEventListener('input', function () {
        state.simSpeed = parseFloat(this.value);
        if (el.speedText) el.speedText.textContent = state.simSpeed.toFixed(1) + 'x';
      });
    }

    // Reset All button
    if (el.btnResetAll) {
      el.btnResetAll.addEventListener('click', function () {
        state.voltage = 12;
        document.querySelectorAll('.voltage-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.volt === '12');
        });
        if (el.voltageDisplay) el.voltageDisplay.textContent = '12.0 V';
        if (el.togglePower) {
          el.togglePower.checked = true;
          state.powerOn = true;
          if (el.labelMasterPower) el.labelMasterPower.textContent = 'VCC POWER: ON';
        }
        state.isPlaying = true;
        if (el.btnPlayPause) el.btnPlayPause.textContent = '⏸ Pause';
        setDuty(50);
      });
    }
  }

  // --- Simulation Stepping & Internal 555 Telemetry ---
  function stepSimulation(deltaSec) {
    if (!state.powerOn) {
      state.vCap = 0;
      update555Internals(false, false, false, 0);
      return;
    }

    var dutyFraction = state.duty / 100;
    var isHigh = state.simPhase < dutyFraction;
    var vcc = state.voltage;
    var vThresh = (2 / 3) * vcc;
    var vTrig = (1 / 3) * vcc;

    // Capacitor voltage ramp
    if (isHigh) {
      // Charging from 1/3 Vcc up to 2/3 Vcc
      var chargeRatio = state.simPhase / Math.max(0.01, dutyFraction);
      state.vCap = vTrig + (vThresh - vTrig) * chargeRatio;
    } else {
      // Discharging from 2/3 Vcc down to 1/3 Vcc
      var dischargeRatio = (state.simPhase - dutyFraction) / Math.max(0.01, 1 - dutyFraction);
      state.vCap = vThresh - (vThresh - vTrig) * dischargeRatio;
    }

    var upperActive = state.vCap >= (vThresh - 0.1);
    var lowerActive = state.vCap <= (vTrig + 0.1);
    var dischargeNpnOn = !isHigh;

    update555Internals(upperActive, lowerActive, dischargeNpnOn, isHigh);
    animateCurrentDots(isHigh);
  }

  function update555Internals(upperActive, lowerActive, dischOn, outHigh) {
    if (el.internalVcapText) {
      el.internalVcapText.textContent = 'VC = ' + state.vCap.toFixed(2) + ' V';
    }

    if (el.vcapProgressBar) {
      var pct = Math.max(0, Math.min(100, (state.vCap / state.voltage) * 100));
      el.vcapProgressBar.style.width = pct + '%';
    }

    // Upper Comparator
    if (el.badgeCompUpper) {
      if (upperActive) {
        el.badgeCompUpper.textContent = 'RESET ACTIVE';
        el.badgeCompUpper.style.background = 'var(--danger)';
        el.badgeCompUpper.style.color = '#fff';
      } else {
        el.badgeCompUpper.textContent = 'RESET: OFF';
        el.badgeCompUpper.style.background = 'var(--bg-secondary)';
        el.badgeCompUpper.style.color = 'var(--text-muted)';
      }
    }

    // Lower Comparator
    if (el.badgeCompLower) {
      if (lowerActive) {
        el.badgeCompLower.textContent = 'SET ACTIVE';
        el.badgeCompLower.style.background = 'var(--success)';
        el.badgeCompLower.style.color = '#fff';
      } else {
        el.badgeCompLower.textContent = 'SET: OFF';
        el.badgeCompLower.style.background = 'var(--bg-secondary)';
        el.badgeCompLower.style.color = 'var(--text-muted)';
      }
    }

    // Flip Flop & Discharge NPN
    if (el.latchStatusText) {
      el.latchStatusText.textContent = outHigh ? 'Q = 1 • Out = HIGH (12V)' : 'Q = 0 • Out = LOW (0V)';
      el.latchStatusText.style.color = outHigh ? 'var(--accent)' : 'var(--text-muted)';
    }

    if (el.badgeDischargeTransistor) {
      if (dischOn) {
        el.badgeDischargeTransistor.textContent = 'Disch NPN: SATURATED';
        el.badgeDischargeTransistor.style.background = 'var(--warning)';
        el.badgeDischargeTransistor.style.color = '#fff';
      } else {
        el.badgeDischargeTransistor.textContent = 'Disch NPN: CUTOFF';
        el.badgeDischargeTransistor.style.background = 'var(--bg-secondary)';
        el.badgeDischargeTransistor.style.color = 'var(--text-muted)';
      }
    }

    // SVG elements highlight
    if (el.wirePin3) {
      el.wirePin3.setAttribute('stroke', outHigh ? 'var(--accent)' : 'var(--wire)');
    }
    if (el.mosfetGatePlate) {
      el.mosfetGatePlate.setAttribute('stroke', outHigh ? 'var(--accent)' : 'var(--wire)');
    }
    if (el.mosfetInversionChannel) {
      el.mosfetInversionChannel.setAttribute('opacity', outHigh ? '0.85' : '0.1');
    }
    if (el.diodeD1Poly) {
      el.diodeD1Poly.setAttribute('fill', outHigh ? 'var(--accent)' : 'var(--comp-fill)');
    }
    if (el.diodeD2Poly) {
      el.diodeD2Poly.setAttribute('fill', !outHigh ? 'var(--warning)' : 'var(--comp-fill)');
    }
    if (el.flybackPoly) {
      // Flyback conducts briefly during turn-off kickback
      var flybackActive = !outHigh && state.currentRPM > 100;
      el.flybackPoly.setAttribute('fill', flybackActive ? 'var(--warning)' : 'var(--comp-fill)');
      if (el.dotFlyback1) el.dotFlyback1.setAttribute('opacity', flybackActive ? '1' : '0');
    }

    if (el.labelChargeState) {
      if (outHigh) {
        el.labelChargeState.textContent = 'Charge Phase (Ton): Current through Ra & D1 into C1. Gate HIGH.';
      } else {
        el.labelChargeState.textContent = 'Discharge Phase (Toff): Current from C1 through D2 & Rb into Pin 7. Gate LOW.';
      }
    }
  }

  // --- Dynamic Current Dots along SVG Wires ---
  function animateCurrentDots(isHigh) {
    if (!state.showAnimation || !state.powerOn) {
      if (el.dotCharge1) el.dotCharge1.setAttribute('opacity', '0');
      if (el.dotCharge2) el.dotCharge2.setAttribute('opacity', '0');
      if (el.dotDischarge1) el.dotDischarge1.setAttribute('opacity', '0');
      if (el.dotGate1) el.dotGate1.setAttribute('opacity', '0');
      if (el.dotFan1) el.dotFan1.setAttribute('opacity', '0');
      if (el.dotFan2) el.dotFan2.setAttribute('opacity', '0');
      if (el.dotFlyback1) el.dotFlyback1.setAttribute('opacity', '0');
      return;
    }

    var t = state.simPhase;

    if (isHigh) {
      // Charging cycle
      if (el.dotCharge1) {
        el.dotCharge1.setAttribute('opacity', '1');
        el.dotCharge1.setAttribute('cx', '120');
        el.dotCharge1.setAttribute('cy', (80 + (t * 70) % 70).toString());
      }
      if (el.dotCharge2) {
        el.dotCharge2.setAttribute('opacity', '1');
        el.dotCharge2.setAttribute('cx', '120');
        el.dotCharge2.setAttribute('cy', (170 + (t * 110) % 110).toString());
      }
      if (el.dotDischarge1) el.dotDischarge1.setAttribute('opacity', '0');

      // Gate pulse
      if (el.dotGate1) {
        el.dotGate1.setAttribute('opacity', '1');
        el.dotGate1.setAttribute('cx', (430 + (t * 80) % 80).toString());
        el.dotGate1.setAttribute('cy', '240');
      }

      // Fan load conduction (Vcc -> Fan -> MOSFET -> GND)
      if (el.dotFan1) {
        el.dotFan1.setAttribute('opacity', '1');
        el.dotFan1.setAttribute('cx', '565');
        el.dotFan1.setAttribute('cy', (45 + (t * 60) % 60).toString());
      }
      if (el.dotFan2) {
        el.dotFan2.setAttribute('opacity', '1');
        el.dotFan2.setAttribute('cx', '565');
        el.dotFan2.setAttribute('cy', (140 + (t * 80) % 80).toString());
      }
      if (el.dotFlyback1) el.dotFlyback1.setAttribute('opacity', '0');

    } else {
      // Discharging cycle
      if (el.dotCharge1) el.dotCharge1.setAttribute('opacity', '0');
      if (el.dotCharge2) el.dotCharge2.setAttribute('opacity', '0');
      if (el.dotGate1) el.dotGate1.setAttribute('opacity', '0');
      if (el.dotFan1) el.dotFan1.setAttribute('opacity', '0.2');
      if (el.dotFan2) el.dotFan2.setAttribute('opacity', '0.2');

      if (el.dotDischarge1) {
        el.dotDischarge1.setAttribute('opacity', '1');
        el.dotDischarge1.setAttribute('cx', '160');
        // moves upwards through D2 towards Pin 7
        el.dotDischarge1.setAttribute('cy', (290 - (t * 80) % 80).toString());
      }

      // Flyback recirculating loop
      if (el.dotFlyback1 && state.currentRPM > 100) {
        el.dotFlyback1.setAttribute('opacity', '1');
        el.dotFlyback1.setAttribute('cx', '640');
        el.dotFlyback1.setAttribute('cy', (70 - (t * 60) % 60).toString());
      }
    }
  }

  // --- Animation Loop: Fan Spin & Physics Lag ---
  var lastTimestamp = 0;

  function mainAnimationLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    var dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    // Smooth first-order lag filter for fan RPM
    // RPM cannot change instantaneously due to mechanical rotor inertia
    var alpha = Math.min(1.0, 4.0 * dt); // ~250ms time constant
    state.currentRPM += (state.targetRPM - state.currentRPM) * alpha;

    // Update readout with current smoothed RPM
    if (el.readoutRpm) {
      el.readoutRpm.innerHTML = Math.round(state.currentRPM).toLocaleString() + '<span class="readout-unit">RPM</span>';
    }

    // Spin fan icon
    if (state.currentRPM > 5 && el.fanSpinnerSvg) {
      var revsPerSec = state.currentRPM / 60;
      state.fanAngle = (state.fanAngle + revsPerSec * 360 * dt) % 360;
      el.fanSpinnerSvg.style.transform = 'rotate(' + state.fanAngle.toFixed(1) + 'deg)';
    }

    // Advance 555 oscillator phase if playing
    if (state.isPlaying) {
      // Natural 555 oscillates at 1.44 kHz, but for visual clarity we animate at a visible rate
      var visualCycleFreq = 2.0 * state.simSpeed; // 2 visual sweeps per second
      state.simPhase = (state.simPhase + visualCycleFreq * dt) % 1.0;
      stepSimulation(dt);
    }

    requestAnimationFrame(mainAnimationLoop);
  }

  // --- Chart 1: PWM Oscilloscope Waveform ---
  function initPwmChart() {
    var ctx = document.getElementById('pwmWaveformChart');
    if (!ctx) return;

    var chartText = cssVar('--chart-text') || '#64748b';
    var chartGrid = cssVar('--chart-grid') || 'rgba(0,0,0,0.06)';

    // Generate 2 full cycles of square wave points
    var ptsGate = [];
    var ptsAvg = [];
    var ptsCurrent = [];
    var totalPoints = 120;
    var dutyFrac = state.duty / 100;

    for (var i = 0; i <= totalPoints; i++) {
      var phase = (i % 60) / 60;
      var isHigh = phase < dutyFrac && state.powerOn;
      ptsGate.push({ x: i, y: isHigh ? state.voltage : 0 });
      ptsAvg.push({ x: i, y: state.powerOn ? dutyFrac * state.voltage : 0 });

      // Inductive current ramp
      var iCurrent = 0;
      if (state.powerOn) {
        if (isHigh) {
          iCurrent = 250 * (1 - Math.exp(-phase / 0.15)) * (state.voltage / 12);
        } else {
          iCurrent = 250 * Math.exp(-(phase - dutyFrac) / 0.12) * (state.voltage / 12);
        }
      }
      ptsCurrent.push({ x: i, y: iCurrent / 25 }); // scale for visibility on same chart
    }

    pwmChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Gate Signal Vgs (V)',
            data: ptsGate,
            borderColor: '#2563eb',
            borderWidth: 2.5,
            fill: false,
            tension: 0,
            pointRadius: 0
          },
          {
            label: 'Avg DC Voltage (V)',
            data: ptsAvg,
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0
          },
          {
            label: 'Motor Current Id (scaled)',
            data: ptsCurrent,
            borderColor: '#10b981',
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            type: 'linear',
            display: false,
            min: 0,
            max: totalPoints
          },
          y: {
            min: -1,
            max: 15,
            grid: { color: chartGrid },
            ticks: {
              color: chartText,
              callback: function (val) { return val + ' V'; }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  function updatePwmChart() {
    if (!pwmChart) return;
    var totalPoints = 120;
    var dutyFrac = state.duty / 100;
    var ptsGate = [];
    var ptsAvg = [];
    var ptsCurrent = [];

    for (var i = 0; i <= totalPoints; i++) {
      var phase = (i % 60) / 60;
      var isHigh = phase < dutyFrac && state.powerOn;
      ptsGate.push({ x: i, y: isHigh ? state.voltage : 0 });
      ptsAvg.push({ x: i, y: state.powerOn ? dutyFrac * state.voltage : 0 });

      var iCurrent = 0;
      if (state.powerOn) {
        if (isHigh) {
          iCurrent = 250 * (1 - Math.exp(-phase / 0.15)) * (state.voltage / 12);
        } else {
          iCurrent = 250 * Math.exp(-(phase - dutyFrac) / 0.12) * (state.voltage / 12);
        }
      }
      ptsCurrent.push({ x: i, y: iCurrent / 25 });
    }

    pwmChart.data.datasets[0].data = ptsGate;
    pwmChart.data.datasets[1].data = ptsAvg;
    pwmChart.data.datasets[2].data = ptsCurrent;
    pwmChart.update('none');
  }

  // --- Chart 2: RPM vs Duty Transfer Curve ---
  function initRpmChart() {
    var ctx = document.getElementById('rpmCurveChart');
    if (!ctx) return;

    var chartText = cssVar('--chart-text') || '#64748b';
    var chartGrid = cssVar('--chart-grid') || 'rgba(0,0,0,0.06)';

    // Generate curve points
    var curvePts = [];
    for (var d = 0; d <= 100; d += 2) {
      var rpm = 0;
      if (d >= 18) {
        rpm = Math.round(2400 * ((d - 18) / 82) * (state.voltage / 12));
      }
      curvePts.push({ x: d, y: rpm });
    }

    var activePt = [{
      x: state.duty,
      y: state.targetRPM
    }];

    rpmChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Operating Point',
            data: activePt,
            backgroundColor: '#ef4444',
            borderColor: '#ffffff',
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
            type: 'scatter'
          },
          {
            label: 'Speed Characteristic',
            data: curvePts,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,0.08)',
            fill: true,
            borderWidth: 2.5,
            tension: 0.1,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: 100,
            title: { display: true, text: 'Duty Cycle (%)', color: chartText },
            grid: { color: chartGrid },
            ticks: { color: chartText }
          },
          y: {
            min: 0,
            max: 2600,
            title: { display: true, text: 'Speed (RPM)', color: chartText },
            grid: { color: chartGrid },
            ticks: { color: chartText }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  function updateRpmChart() {
    if (!rpmChart) return;
    var curvePts = [];
    for (var d = 0; d <= 100; d += 2) {
      var rpm = 0;
      if (d >= 18) {
        rpm = Math.round(2400 * ((d - 18) / 82) * (state.voltage / 12));
      }
      curvePts.push({ x: d, y: rpm });
    }

    rpmChart.data.datasets[1].data = curvePts;
    rpmChart.data.datasets[0].data = [{
      x: state.powerOn ? state.duty : 0,
      y: state.targetRPM
    }];
    rpmChart.update('none');
  }

  // --- Theme Change Handler ---
  window.addEventListener('theme-changed', function () {
    var chartText = cssVar('--chart-text') || '#64748b';
    var chartGrid = cssVar('--chart-grid') || 'rgba(0,0,0,0.06)';

    if (pwmChart) {
      pwmChart.options.scales.y.grid.color = chartGrid;
      pwmChart.options.scales.y.ticks.color = chartText;
      pwmChart.update('none');
    }
    if (rpmChart) {
      rpmChart.options.scales.x.grid.color = chartGrid;
      rpmChart.options.scales.x.ticks.color = chartText;
      rpmChart.options.scales.y.grid.color = chartGrid;
      rpmChart.options.scales.y.ticks.color = chartText;
      rpmChart.update('none');
    }
  });

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', function () {
    setupKnob();
    setupControls();
    initPwmChart();
    initRpmChart();
    setDuty(65);
    updatePhysics();
    requestAnimationFrame(mainAnimationLoop);
  });

})();
