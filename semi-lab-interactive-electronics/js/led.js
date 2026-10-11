/* ========================================================
   Semi Lab – PWM LED Dimmer Interactive Engine (js/led.js)
   ======================================================== */

(function () {
  'use strict';

  // --- State Variables ---
  var state = {
    duty: 75,
    voltage: 12,
    freqMode: 'high',    // 'high' (1.44 kHz) or 'low' (25 Hz)
    frequency: 1440,     // Hz
    powerOn: true,
    showAnimation: true,
    isPlaying: true,
    simSpeed: 1.0,
    simPhase: 0,
    vCap: 6.8,
    knobAngle: 67.5,
    iPeak: 295,          // mA
    iAvg: 221.25,        // mA
    lux: 1875,
    perceivedPct: 89.4
  };

  // --- DOM Elements ---
  var el = {
    readoutDuty: document.getElementById('readoutDuty'),
    readoutFreq: document.getElementById('readoutFreq'),
    readoutCurrent: document.getElementById('readoutCurrent'),
    readoutPerceived: document.getElementById('readoutPerceived'),
    readoutLux: document.getElementById('readoutLux'),
    illuminanceReadout: document.getElementById('illuminanceReadout'),
    resistorPowerReadout: document.getElementById('resistorPowerReadout'),
    eyePerceptionReadout: document.getElementById('eyePerceptionReadout'),
    flickerWarning: document.getElementById('flickerWarning'),

    // Controls
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
    btnFreqHigh: document.getElementById('btnFreqHigh'),
    btnFreqLow: document.getElementById('btnFreqLow'),
    freqModeText: document.getElementById('freqModeText'),

    // Optical chamber
    ledChamberBox: document.getElementById('ledChamberBox'),
    opticalStateBadge: document.getElementById('opticalStateBadge'),

    // SVG elements
    svgVccText: document.getElementById('svgVccText'),
    svgSwitchBlade: document.getElementById('svgSwitchBlade'),
    circuitStateBadge: document.getElementById('circuitStateBadge'),
    mosfetInversionChannel: document.getElementById('mosfetInversionChannel'),
    mosfetGatePlate: document.getElementById('mosfetGatePlate'),
    diodeD1Poly: document.getElementById('diodeD1Poly'),
    diodeD2Poly: document.getElementById('diodeD2Poly'),
    svgLedPoly: document.getElementById('svgLedPoly'),
    wirePin3: document.getElementById('wirePin3'),

    // Dots
    dotCharge1: document.getElementById('dotCharge1'),
    dotCharge2: document.getElementById('dotCharge2'),
    dotDischarge1: document.getElementById('dotDischarge1'),
    dotGate1: document.getElementById('dotGate1'),
    dotLed1: document.getElementById('dotLed1'),
    dotLed2: document.getElementById('dotLed2'),

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
  var ledPwmChart = null;
  var brightnessChart = null;

  function mapRange(val, inMin, inMax, outMin, outMax) {
    return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  // --- Physics & Photometric Calculations ---
  function updatePhysics() {
    var d = state.powerOn ? state.duty : 0;
    var dutyFrac = d / 100;
    var vcc = state.voltage;

    // Optical parameters
    var vf = 9.0; // 3x LEDs series drop
    var rBallast = 10.0; // 10 Ohm
    var rdsOn = 0.0175; // 17.5 mOhm

    var vDrop = Math.max(0, vcc - vf);
    var iPeak = state.powerOn ? (vDrop / (rBallast + rdsOn)) * 1000 : 0; // in mA
    var iAvg = (dutyFrac * iPeak);

    state.iPeak = iPeak;
    state.iAvg = iAvg;

    // Stevens' Power law for human perceived brightness:
    // B = 100 * (D / 100)^0.4
    var perceived = state.powerOn && d > 0 ? Math.pow(dutyFrac, 0.4) * 100 : 0;
    state.perceivedPct = perceived;

    // Measured lumens (approx 2500 max at full power 12V)
    var maxLux = 2500 * (vcc / 12.0);
    var measuredLux = Math.round(dutyFrac * maxLux);
    state.lux = measuredLux;

    // Resistor power: P = I_peak^2 * R * duty
    var iPeakAmps = iPeak / 1000;
    var pResistor = Math.pow(iPeakAmps, 2) * rBallast * dutyFrac;

    // Update UI Readouts
    if (el.readoutDuty) el.readoutDuty.innerHTML = state.duty.toFixed(1) + '<span class="readout-unit">%</span>';
    if (el.readoutFreq) {
      if (state.freqMode === 'high') {
        el.readoutFreq.innerHTML = '1.44<span class="readout-unit">kHz</span>';
      } else {
        el.readoutFreq.innerHTML = '25<span class="readout-unit">Hz</span>';
      }
    }
    if (el.readoutCurrent) el.readoutCurrent.innerHTML = iAvg.toFixed(1) + '<span class="readout-unit">mA</span>';
    if (el.readoutPerceived) el.readoutPerceived.innerHTML = perceived.toFixed(1) + '<span class="readout-unit">%</span>';
    if (el.readoutLux) el.readoutLux.innerHTML = measuredLux.toLocaleString() + '<span class="readout-unit">lm</span>';

    if (el.illuminanceReadout) el.illuminanceReadout.textContent = (measuredLux * 1.67).toFixed(0) + ' lux';
    if (el.resistorPowerReadout) el.resistorPowerReadout.textContent = pResistor.toFixed(2) + ' W';
    if (el.eyePerceptionReadout) el.eyePerceptionReadout.textContent = 'B ≈ D^0.4 (' + perceived.toFixed(0) + '%)';

    // Flicker warning visibility
    if (el.flickerWarning) {
      el.flickerWarning.classList.toggle('show', state.freqMode === 'low' && state.powerOn);
    }

    // 555 voltage references
    if (el.label13Vcc) el.label13Vcc.textContent = '1/3 VCC (' + (vcc / 3).toFixed(1) + 'V)';
    if (el.label23Vcc) el.label23Vcc.textContent = '2/3 VCC (' + (2 * vcc / 3).toFixed(1) + 'V)';
    if (el.labelVcc) el.labelVcc.textContent = 'VCC (' + vcc.toFixed(1) + 'V)';
    if (el.svgVccText) el.svgVccText.textContent = '+' + vcc + 'V (VCC)';

    updateCharts();
  }

  // --- Knob & Slider Setters ---
  function setDuty(duty, updateKnobAngle) {
    state.duty = Math.max(1, Math.min(99, duty));
    if (updateKnobAngle !== false) {
      state.knobAngle = mapRange(state.duty, 1, 99, -135, 135);
    }

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

  function setDutyFromKnobAngle(angle) {
    angle = Math.max(-135, Math.min(135, angle));
    state.knobAngle = angle;
    var duty = Math.round(mapRange(angle, -135, 135, 1, 99));
    setDuty(duty, false);
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
      var deg = rad * (180 / Math.PI) + 90;
      if (deg > 180) deg -= 360;

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

    window.addEventListener('mouseup', function () { isDragging = false; });

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

    window.addEventListener('touchend', function () { isDragging = false; });

    el.knob.addEventListener('wheel', function (e) {
      e.preventDefault();
      setDuty(state.duty + (e.deltaY < 0 ? 2 : -2));
    });

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

  function setupControls() {
    if (el.dutySlider) {
      el.dutySlider.addEventListener('input', function () {
        setDuty(parseInt(this.value, 10));
      });
    }

    if (el.togglePower) {
      el.togglePower.addEventListener('change', function () {
        state.powerOn = this.checked;
        if (el.labelMasterPower) el.labelMasterPower.textContent = 'LED POWER: ' + (state.powerOn ? 'ON' : 'OFF');
        if (el.svgSwitchBlade) el.svgSwitchBlade.setAttribute('y2', state.powerOn ? '40' : '28');
        if (el.circuitStateBadge) {
          el.circuitStateBadge.textContent = state.powerOn ? 'Active' : 'Standby (0V)';
          el.circuitStateBadge.style.color = state.powerOn ? 'var(--accent)' : 'var(--danger)';
        }
        updatePhysics();
      });
    }

    if (el.toggleAnimation) {
      el.toggleAnimation.addEventListener('change', function () {
        state.showAnimation = this.checked;
        var dotGroup = document.getElementById('animatedCurrentDots');
        if (dotGroup) dotGroup.style.display = state.showAnimation ? 'block' : 'none';
      });
    }

    document.querySelectorAll('.preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var duty = parseInt(this.dataset.duty, 10);
        if (!isNaN(duty)) setDuty(duty);
      });
    });

    document.querySelectorAll('.voltage-btn[data-volt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.voltage-btn[data-volt]').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        state.voltage = parseFloat(this.dataset.volt) || 12;
        if (el.voltageDisplay) el.voltageDisplay.textContent = state.voltage.toFixed(1) + ' V';
        updatePhysics();
      });
    });

    // Frequency mode toggles
    if (el.btnFreqHigh && el.btnFreqLow) {
      el.btnFreqHigh.addEventListener('click', function () {
        el.btnFreqHigh.classList.add('active');
        el.btnFreqLow.classList.remove('active');
        state.freqMode = 'high';
        state.frequency = 1440;
        if (el.freqModeText) el.freqModeText.textContent = '1.44 kHz (Smooth Vision)';
        updatePhysics();
      });

      el.btnFreqLow.addEventListener('click', function () {
        el.btnFreqLow.classList.add('active');
        el.btnFreqHigh.classList.remove('active');
        state.freqMode = 'low';
        state.frequency = 25;
        if (el.freqModeText) el.freqModeText.textContent = '25 Hz (Visible Flicker Demo)';
        updatePhysics();
      });
    }

    if (el.btnPlayPause) {
      el.btnPlayPause.addEventListener('click', function () {
        state.isPlaying = !state.isPlaying;
        this.textContent = state.isPlaying ? '⏸ Pause' : '▶ Play';
      });
    }

    if (el.btnStep) {
      el.btnStep.addEventListener('click', function () {
        state.isPlaying = false;
        if (el.btnPlayPause) el.btnPlayPause.textContent = '▶ Play';
        state.simPhase = (state.simPhase + 0.1) % 1.0;
        stepSimulation(0.1);
      });
    }

    if (el.speedSlider) {
      el.speedSlider.addEventListener('input', function () {
        state.simSpeed = parseFloat(this.value);
        if (el.speedText) el.speedText.textContent = state.simSpeed.toFixed(1) + 'x';
      });
    }

    if (el.btnResetAll) {
      el.btnResetAll.addEventListener('click', function () {
        state.voltage = 12;
        state.freqMode = 'high';
        if (el.btnFreqHigh) el.btnFreqHigh.click();
        document.querySelectorAll('.voltage-btn[data-volt]').forEach(function (b) {
          b.classList.toggle('active', b.dataset.volt === '12');
        });
        if (el.voltageDisplay) el.voltageDisplay.textContent = '12.0 V';
        if (el.togglePower) {
          el.togglePower.checked = true;
          state.powerOn = true;
          if (el.labelMasterPower) el.labelMasterPower.textContent = 'LED POWER: ON';
        }
        state.isPlaying = true;
        if (el.btnPlayPause) el.btnPlayPause.textContent = '⏸ Pause';
        setDuty(75);
      });
    }
  }

  // --- Step Simulation & 555 Status ---
  function stepSimulation(deltaSec) {
    if (!state.powerOn) {
      state.vCap = 0;
      update555(false, false, false, 0);
      return;
    }

    var dutyFraction = state.duty / 100;
    var isHigh = state.simPhase < dutyFraction;
    var vcc = state.voltage;
    var vThresh = (2 / 3) * vcc;
    var vTrig = (1 / 3) * vcc;

    if (isHigh) {
      var chargeRatio = state.simPhase / Math.max(0.01, dutyFraction);
      state.vCap = vTrig + (vThresh - vTrig) * chargeRatio;
    } else {
      var dischargeRatio = (state.simPhase - dutyFraction) / Math.max(0.01, 1 - dutyFraction);
      state.vCap = vThresh - (vThresh - vTrig) * dischargeRatio;
    }

    var upperActive = state.vCap >= (vThresh - 0.1);
    var lowerActive = state.vCap <= (vTrig + 0.1);
    var dischargeNpnOn = !isHigh;

    update555(upperActive, lowerActive, dischargeNpnOn, isHigh);
    animateCurrentDots(isHigh);
  }

  function update555(upperActive, lowerActive, dischOn, outHigh) {
    if (el.internalVcapText) el.internalVcapText.textContent = 'VC = ' + state.vCap.toFixed(2) + ' V';
    if (el.vcapProgressBar) {
      var pct = Math.max(0, Math.min(100, (state.vCap / state.voltage) * 100));
      el.vcapProgressBar.style.width = pct + '%';
    }

    if (el.badgeCompUpper) {
      el.badgeCompUpper.textContent = upperActive ? 'RESET ACTIVE' : 'RESET: OFF';
      el.badgeCompUpper.style.background = upperActive ? 'var(--danger)' : 'var(--bg-secondary)';
      el.badgeCompUpper.style.color = upperActive ? '#fff' : 'var(--text-muted)';
    }

    if (el.badgeCompLower) {
      el.badgeCompLower.textContent = lowerActive ? 'SET ACTIVE' : 'SET: OFF';
      el.badgeCompLower.style.background = lowerActive ? 'var(--success)' : 'var(--bg-secondary)';
      el.badgeCompLower.style.color = lowerActive ? '#fff' : 'var(--text-muted)';
    }

    if (el.latchStatusText) {
      el.latchStatusText.textContent = outHigh ? 'Q = 1 • HIGH' : 'Q = 0 • LOW';
      el.latchStatusText.style.color = outHigh ? 'var(--accent)' : 'var(--text-muted)';
    }

    if (el.badgeDischargeTransistor) {
      el.badgeDischargeTransistor.textContent = dischOn ? 'Disch: ON' : 'Disch: OFF';
    }

    if (el.wirePin3) el.wirePin3.setAttribute('stroke', outHigh ? 'var(--accent)' : 'var(--wire)');
    if (el.mosfetGatePlate) el.mosfetGatePlate.setAttribute('stroke', outHigh ? 'var(--accent)' : 'var(--wire)');
    if (el.mosfetInversionChannel) el.mosfetInversionChannel.setAttribute('opacity', outHigh ? '0.85' : '0.1');
    if (el.diodeD1Poly) el.diodeD1Poly.setAttribute('fill', outHigh ? 'var(--accent)' : 'var(--comp-fill)');
    if (el.diodeD2Poly) el.diodeD2Poly.setAttribute('fill', !outHigh ? 'var(--warning)' : 'var(--comp-fill)');
    if (el.svgLedPoly) el.svgLedPoly.setAttribute('fill', outHigh ? '#f59e0b' : 'var(--comp-fill)');
  }

  function animateCurrentDots(isHigh) {
    if (!state.showAnimation || !state.powerOn) {
      if (el.dotCharge1) el.dotCharge1.setAttribute('opacity', '0');
      if (el.dotCharge2) el.dotCharge2.setAttribute('opacity', '0');
      if (el.dotDischarge1) el.dotDischarge1.setAttribute('opacity', '0');
      if (el.dotGate1) el.dotGate1.setAttribute('opacity', '0');
      if (el.dotLed1) el.dotLed1.setAttribute('opacity', '0');
      if (el.dotLed2) el.dotLed2.setAttribute('opacity', '0');
      return;
    }

    var t = state.simPhase;

    if (isHigh) {
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

      if (el.dotGate1) {
        el.dotGate1.setAttribute('opacity', '1');
        el.dotGate1.setAttribute('cx', (430 + (t * 80) % 80).toString());
        el.dotGate1.setAttribute('cy', '240');
      }

      if (el.dotLed1) {
        el.dotLed1.setAttribute('opacity', '1');
        el.dotLed1.setAttribute('cx', '565');
        el.dotLed1.setAttribute('cy', (45 + (t * 60) % 60).toString());
      }
      if (el.dotLed2) {
        el.dotLed2.setAttribute('opacity', '1');
        el.dotLed2.setAttribute('cx', '565');
        el.dotLed2.setAttribute('cy', (140 + (t * 80) % 80).toString());
      }
    } else {
      if (el.dotCharge1) el.dotCharge1.setAttribute('opacity', '0');
      if (el.dotCharge2) el.dotCharge2.setAttribute('opacity', '0');
      if (el.dotGate1) el.dotGate1.setAttribute('opacity', '0');
      if (el.dotLed1) el.dotLed1.setAttribute('opacity', '0');
      if (el.dotLed2) el.dotLed2.setAttribute('opacity', '0');

      if (el.dotDischarge1) {
        el.dotDischarge1.setAttribute('opacity', '1');
        el.dotDischarge1.setAttribute('cx', '160');
        el.dotDischarge1.setAttribute('cy', (290 - (t * 80) % 80).toString());
      }
    }
  }

  // --- LED Glowing Chamber Visual ---
  function updateLedGlow() {
    if (!el.ledChamberBox) return;

    var glowFrac;

    if (!state.powerOn) {
      glowFrac = 0;
    } else if (state.freqMode === 'low') {
      // In 25 Hz low frequency mode, simulate instantaneous pulsing (strobe flicker)
      var isHigh = state.simPhase < (state.duty / 100);
      glowFrac = isHigh ? 1.0 : 0.05;
    } else {
      // In high-frequency 1.44 kHz mode, retinal persistence smoothly perceives Stevens' power law brightness
      glowFrac = state.perceivedPct / 100;
    }

    var blurRadius = Math.round(glowFrac * 60);
    var spread = Math.round(glowFrac * 25);
    var alpha = (glowFrac * 0.85).toFixed(2);

    el.ledChamberBox.style.boxShadow = '0 0 ' + blurRadius + 'px ' + spread + 'px rgba(251, 191, 36, ' + alpha + ')';

    // Update LED die chips
    var dieColor = state.powerOn && glowFrac > 0.05
      ? 'rgba(251, 191, 36, ' + Math.max(0.2, glowFrac).toFixed(2) + ')'
      : '#475569';

    document.querySelectorAll('.led-die').forEach(function (die) {
      die.style.background = dieColor;
      die.style.boxShadow = glowFrac > 0.2 ? '0 0 10px rgba(251, 191, 36, 0.8)' : 'none';
    });

    if (el.opticalStateBadge) {
      if (!state.powerOn) {
        el.opticalStateBadge.textContent = 'Power Off (0 lm)';
        el.opticalStateBadge.style.color = 'var(--danger)';
      } else if (state.freqMode === 'low') {
        el.opticalStateBadge.textContent = 'Stroboscopic Flicker Active';
        el.opticalStateBadge.style.color = 'var(--warning)';
      } else {
        el.opticalStateBadge.textContent = 'Continuous Dimming (' + state.perceivedPct.toFixed(0) + '%)';
        el.opticalStateBadge.style.color = 'var(--success)';
      }
    }
  }

  // --- Animation Loop ---
  var lastTimestamp = 0;

  function animationLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    var dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    if (state.isPlaying) {
      var visualCycleFreq = (state.freqMode === 'low' ? 6.0 : 2.0) * state.simSpeed;
      state.simPhase = (state.simPhase + visualCycleFreq * dt) % 1.0;
      stepSimulation(dt);
    }

    updateLedGlow();
    requestAnimationFrame(animationLoop);
  }

  // --- Charts ---
  function initCharts() {
    var ctxPwm = document.getElementById('ledPwmChart');
    var ctxCurve = document.getElementById('brightnessCurveChart');
    if (!ctxPwm || !ctxCurve) return;

    var chartText = cssVar('--chart-text') || '#64748b';
    var chartGrid = cssVar('--chart-grid') || 'rgba(0,0,0,0.06)';

    // PWM chart
    var ptsGate = [];
    var ptsAvg = [];
    var totalPoints = 120;
    var dutyFrac = state.duty / 100;

    for (var i = 0; i <= totalPoints; i++) {
      var phase = (i % 60) / 60;
      var isHigh = phase < dutyFrac && state.powerOn;
      ptsGate.push({ x: i, y: isHigh ? state.voltage : 0 });
      ptsAvg.push({ x: i, y: state.powerOn ? dutyFrac * state.voltage : 0 });
    }

    ledPwmChart = new Chart(ctxPwm, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'LED Forward Pulse (V)',
            data: ptsGate,
            borderColor: '#f59e0b',
            borderWidth: 2.5,
            fill: false,
            tension: 0,
            pointRadius: 0
          },
          {
            label: 'Average DC Level',
            data: ptsAvg,
            borderColor: '#2563eb',
            borderWidth: 2,
            borderDash: [5, 5],
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
          x: { type: 'linear', display: false, min: 0, max: totalPoints },
          y: {
            min: -1,
            max: 16,
            grid: { color: chartGrid },
            ticks: { color: chartText, callback: function (v) { return v + ' V'; } }
          }
        },
        plugins: { legend: { display: false } }
      }
    });

    // Stevens' Law Brightness vs Duty Curve
    var ptsPerceived = [];
    var ptsLinear = [];
    for (var d = 0; d <= 100; d += 2) {
      ptsLinear.push({ x: d, y: d });
      ptsPerceived.push({ x: d, y: d === 0 ? 0 : Math.pow(d / 100, 0.4) * 100 });
    }

    brightnessChart = new Chart(ctxCurve, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Current Operating Point',
            data: [{ x: state.duty, y: state.perceivedPct }],
            backgroundColor: '#ef4444',
            borderColor: '#ffffff',
            borderWidth: 2,
            pointRadius: 6,
            type: 'scatter'
          },
          {
            label: 'Perceived Brightness (Eye B ≈ D^0.4)',
            data: ptsPerceived,
            borderColor: '#f59e0b',
            borderWidth: 2.5,
            tension: 0.1,
            pointRadius: 0
          },
          {
            label: 'Measured Flux (Linear L ∝ D)',
            data: ptsLinear,
            borderColor: '#2563eb',
            borderWidth: 1.5,
            borderDash: [4, 4],
            tension: 0,
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
            title: { display: true, text: 'PWM Duty Cycle (%)', color: chartText },
            grid: { color: chartGrid },
            ticks: { color: chartText }
          },
          y: {
            min: 0,
            max: 105,
            title: { display: true, text: 'Relative Intensity (%)', color: chartText },
            grid: { color: chartGrid },
            ticks: { color: chartText }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function updateCharts() {
    if (ledPwmChart) {
      var totalPoints = 120;
      var dutyFrac = state.duty / 100;
      var ptsGate = [];
      var ptsAvg = [];

      for (var i = 0; i <= totalPoints; i++) {
        var phase = (i % 60) / 60;
        var isHigh = phase < dutyFrac && state.powerOn;
        ptsGate.push({ x: i, y: isHigh ? state.voltage : 0 });
        ptsAvg.push({ x: i, y: state.powerOn ? dutyFrac * state.voltage : 0 });
      }

      ledPwmChart.data.datasets[0].data = ptsGate;
      ledPwmChart.data.datasets[1].data = ptsAvg;
      ledPwmChart.update('none');
    }

    if (brightnessChart) {
      brightnessChart.data.datasets[0].data = [{
        x: state.powerOn ? state.duty : 0,
        y: state.perceivedPct
      }];
      brightnessChart.update('none');
    }
  }

  // --- Theme Change Listener ---
  window.addEventListener('theme-changed', function () {
    var chartText = cssVar('--chart-text') || '#64748b';
    var chartGrid = cssVar('--chart-grid') || 'rgba(0,0,0,0.06)';

    if (ledPwmChart) {
      ledPwmChart.options.scales.y.grid.color = chartGrid;
      ledPwmChart.options.scales.y.ticks.color = chartText;
      ledPwmChart.update('none');
    }
    if (brightnessChart) {
      brightnessChart.options.scales.x.grid.color = chartGrid;
      brightnessChart.options.scales.x.ticks.color = chartText;
      brightnessChart.options.scales.y.grid.color = chartGrid;
      brightnessChart.options.scales.y.ticks.color = chartText;
      brightnessChart.update('none');
    }
  });

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', function () {
    setupKnob();
    setupControls();
    initCharts();
    setDuty(75);
    updatePhysics();
    requestAnimationFrame(animationLoop);
  });

})();
