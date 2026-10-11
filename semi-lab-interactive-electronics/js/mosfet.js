/* ========================================================
   Semi Lab – Power MOSFET Physics Engine (js/mosfet.js)
   ======================================================== */

(function () {
  'use strict';

  // --- Parameters & State ---
  var state = {
    vgs: 6.0,          // Volts (0 - 12)
    vds: 0.5,          // Volts (0 - 12)
    vth: 2.0,          // Volts (1.0 - 4.5)
    wl: 500,           // Aspect ratio (50 - 1500)
    kPrime: 200,       // uA/V^2 (50 - 500)
    id: 0,             // Drain current (A)
    rdsOn: 0,          // Ohms
    powerLoss: 0,      // Watts
    regime: 'triode',  // 'cutoff', 'triode', 'saturation'
    vSat: 4.0          // Vgs - Vth
  };

  // --- DOM Elements ---
  var el = {
    regionBadge: document.getElementById('regionBadge'),
    readoutId: document.getElementById('readoutId'),
    readoutRds: document.getElementById('readoutRds'),
    readoutPower: document.getElementById('readoutPower'),
    readoutVsat: document.getElementById('readoutVsat'),

    // Inputs
    sliderVgs: document.getElementById('sliderVgs'),
    sliderVds: document.getElementById('sliderVds'),
    sliderVth: document.getElementById('sliderVth'),
    sliderWL: document.getElementById('sliderWL'),
    sliderK: document.getElementById('sliderK'),

    valVgs: document.getElementById('valVgs'),
    valVds: document.getElementById('valVds'),
    valVth: document.getElementById('valVth'),
    valWL: document.getElementById('valWL'),
    valK: document.getElementById('valK'),

    // Equation Results
    eqResultSat: document.getElementById('eqResultSat'),
    eqResultTriode: document.getElementById('eqResultTriode'),
    eqResultRds: document.getElementById('eqResultRds'),
    badgeSatStatus: document.getElementById('badgeSatStatus'),
    badgeTriodeStatus: document.getElementById('badgeTriodeStatus'),

    // Cross section
    channelStatusTag: document.getElementById('channelStatusTag'),
    svgGateVgsLabel: document.getElementById('svgGateVgsLabel'),
    svgChannelShape: document.getElementById('svgChannelShape'),
    channelElectrons: document.getElementById('channelElectrons'),
    tooltipTitle: document.getElementById('tooltipTitle'),
    tooltipDesc: document.getElementById('tooltipDesc'),

    // Presets
    presetCutoff: document.getElementById('presetCutoff'),
    presetLinear: document.getElementById('presetLinear'),
    presetSat: document.getElementById('presetSat'),
    btnResetMosfet: document.getElementById('btnResetMosfet')
  };

  var familyChart = null;
  var transferChart = null;

  // --- Physics Model Equations ---
  function computeMosfetPhysics() {
    var vgs = state.vgs;
    var vds = state.vds;
    var vth = state.vth;
    var wl = state.wl;
    var kp = state.kPrime * 1e-6; // convert uA/V^2 to A/V^2

    var vOverdrive = vgs - vth;
    state.vSat = Math.max(0, vOverdrive);

    var id = 0;
    var rds = 0;
    var regime = 'cutoff';

    if (vOverdrive <= 0) {
      // CUTOFF
      regime = 'cutoff';
      id = 0;
      rds = Infinity;
    } else {
      // Channel exists
      rds = 1 / (kp * wl * vOverdrive); // Ohms

      if (vds < vOverdrive) {
        // TRIODE / LINEAR
        regime = 'triode';
        id = kp * wl * (vOverdrive * vds - 0.5 * Math.pow(vds, 2));
      } else {
        // SATURATION (Pinch-off)
        regime = 'saturation';
        id = 0.5 * kp * wl * Math.pow(vOverdrive, 2);
      }
    }

    state.id = id;
    state.rdsOn = rds;
    state.regime = regime;
    state.powerLoss = id * vds;

    updateUI();
  }

  function updateUI() {
    // Readouts
    if (el.readoutId) {
      el.readoutId.innerHTML = state.id >= 10
        ? state.id.toFixed(1) + '<span class="readout-unit">A</span>'
        : (state.id >= 0.01 ? state.id.toFixed(2) + '<span class="readout-unit">A</span>' : (state.id * 1000).toFixed(1) + '<span class="readout-unit">mA</span>');
    }

    if (el.readoutRds) {
      if (state.rdsOn === Infinity || state.regime === 'cutoff') {
        el.readoutRds.innerHTML = '&gt; 10<span class="readout-unit">MΩ</span>';
      } else {
        var rdsMilli = state.rdsOn * 1000;
        el.readoutRds.innerHTML = rdsMilli.toFixed(1) + '<span class="readout-unit">mΩ</span>';
      }
    }

    if (el.readoutPower) {
      el.readoutPower.innerHTML = state.powerLoss.toFixed(2) + '<span class="readout-unit">W</span>';
    }

    if (el.readoutVsat) {
      el.readoutVsat.innerHTML = state.vSat.toFixed(2) + '<span class="readout-unit">V</span>';
    }

    // Regime Badge
    if (el.regionBadge) {
      el.regionBadge.className = 'region-indicator ' + state.regime;
      if (state.regime === 'cutoff') {
        el.regionBadge.textContent = 'CUTOFF (OFF)';
      } else if (state.regime === 'triode') {
        el.regionBadge.textContent = 'TRIODE / LINEAR';
      } else {
        el.regionBadge.textContent = 'SATURATION (PINCH-OFF)';
      }
    }

    // Equation Card Results
    var kp = state.kPrime * 1e-6;
    var vOverdrive = Math.max(0, state.vgs - state.vth);
    var idSatVal = 0.5 * kp * state.wl * Math.pow(vOverdrive, 2);

    if (el.eqResultSat) el.eqResultSat.textContent = 'Id(sat) = ' + idSatVal.toFixed(2) + ' A';
    if (el.eqResultTriode) {
      var idTriodeVal = vOverdrive > 0 ? kp * state.wl * (vOverdrive * state.vds - 0.5 * Math.pow(state.vds, 2)) : 0;
      el.eqResultTriode.textContent = 'Id(triode) = ' + Math.max(0, idTriodeVal).toFixed(2) + ' A';
    }
    if (el.eqResultRds) {
      if (vOverdrive > 0) {
        var rdsVal = (1 / (kp * state.wl * vOverdrive)) * 1000;
        el.eqResultRds.textContent = 'Rds(on) = ' + rdsVal.toFixed(1) + ' mΩ';
      } else {
        el.eqResultRds.textContent = 'Rds(on) = Off (>10 MΩ)';
      }
    }

    if (el.badgeSatStatus) {
      el.badgeSatStatus.textContent = state.regime === 'saturation' ? 'Active' : 'Inactive';
      el.badgeSatStatus.style.background = state.regime === 'saturation' ? 'var(--accent)' : 'var(--bg-secondary)';
      el.badgeSatStatus.style.color = state.regime === 'saturation' ? '#fff' : 'var(--text-muted)';
    }

    if (el.badgeTriodeStatus) {
      el.badgeTriodeStatus.textContent = state.regime === 'triode' ? 'Active' : 'Inactive';
      el.badgeTriodeStatus.style.background = state.regime === 'triode' ? 'rgba(22,163,74,0.15)' : 'var(--bg-secondary)';
      el.badgeTriodeStatus.style.color = state.regime === 'triode' ? 'var(--success)' : 'var(--text-muted)';
    }

    // Cross section graphics
    if (el.svgGateVgsLabel) el.svgGateVgsLabel.textContent = 'Applied Vgs = ' + state.vgs.toFixed(1) + ' V';
    if (el.channelStatusTag) {
      if (state.regime === 'cutoff') {
        el.channelStatusTag.textContent = 'Channel Depleted';
        el.channelStatusTag.style.background = 'rgba(239,68,68,0.12)';
        el.channelStatusTag.style.color = 'var(--danger)';
      } else if (state.regime === 'saturation') {
        el.channelStatusTag.textContent = 'Drain Pinched Off';
        el.channelStatusTag.style.background = 'var(--accent-glow)';
        el.channelStatusTag.style.color = 'var(--accent)';
      } else {
        el.channelStatusTag.textContent = 'Inversion Channel Active';
        el.channelStatusTag.style.background = 'rgba(22,163,74,0.12)';
        el.channelStatusTag.style.color = 'var(--success)';
      }
    }

    // Dynamic channel geometry in SVG
    if (el.svgChannelShape && el.channelElectrons) {
      if (state.regime === 'cutoff') {
        el.svgChannelShape.setAttribute('d', 'M 170 100 L 450 100 L 450 100 L 170 100 Z');
        el.svgChannelShape.setAttribute('opacity', '0');
        el.channelElectrons.setAttribute('opacity', '0');
      } else if (state.regime === 'saturation') {
        // Pinched off at drain (taper to 0 at drain side)
        el.svgChannelShape.setAttribute('d', 'M 170 100 L 450 100 L 410 101 L 170 115 Z');
        el.svgChannelShape.setAttribute('opacity', '0.9');
        el.channelElectrons.setAttribute('opacity', '0.6');
      } else {
        // Triode channel: conductive slab with slight taper depending on Vds
        var drainThickness = Math.max(103, 114 - (state.vds / Math.max(0.1, state.vSat)) * 10);
        el.svgChannelShape.setAttribute('d', 'M 170 100 L 450 100 L 450 ' + drainThickness.toFixed(0) + ' L 170 114 Z');
        el.svgChannelShape.setAttribute('opacity', '0.9');
        el.channelElectrons.setAttribute('opacity', '1');
      }
    }

    updateCharts();
  }

  // --- Region Explanations Tooltip ---
  var regionDescriptions = {
    gate: {
      title: 'Gate Electrode (Highly Doped Polysilicon):',
      desc: 'Applied voltage Vgs creates a vertical electric field across the gate dielectric to control channel conductance with zero static gate current.'
    },
    oxide: {
      title: 'Gate Oxide (SiO2 Dielectric, ~20 nm):',
      desc: 'An ultra-thin, defect-free silicon dioxide insulator preventing DC conduction while providing high capacitive coupling (Cox = eps_ox / tox).'
    },
    source: {
      title: 'Source Well (N+ Doped, ~10²⁰ cm⁻³):',
      desc: 'Supplies abundant conduction band electrons that inject into the channel when gate bias inverts the surface potential.'
    },
    drain: {
      title: 'Drain Well (N+ Doped):',
      desc: 'Collects drifting channel electrons under the influence of positive drain bias Vds.'
    },
    channel: {
      title: 'Inversion Channel (N-Channel):',
      desc: 'When Vgs > Vth, minority electrons in the P-substrate are drawn to the surface, creating an inverted N-type pathway between source and drain.'
    },
    body: {
      title: 'P-type Silicon Substrate (Body):',
      desc: 'Bulk semiconductor silicon lightly doped with boron acceptors (NA ≈ 10¹⁶ cm⁻³), tied to source potential to prevent body-effect threshold shifts.'
    }
  };

  function setupCrossSectionHover() {
    var regions = document.querySelectorAll('.cross-section-svg .region');
    regions.forEach(function (r) {
      r.addEventListener('mouseenter', function () {
        var key = this.dataset.region;
        var info = regionDescriptions[key];
        if (info && el.tooltipTitle && el.tooltipDesc) {
          el.tooltipTitle.textContent = info.title;
          el.tooltipDesc.textContent = ' ' + info.desc;
        }
      });
    });
  }

  // --- Controls & Slider Listeners ---
  function setupControls() {
    el.sliderVgs.addEventListener('input', function () {
      state.vgs = parseFloat(this.value);
      el.valVgs.textContent = state.vgs.toFixed(1) + ' V';
      computeMosfetPhysics();
    });

    el.sliderVds.addEventListener('input', function () {
      state.vds = parseFloat(this.value);
      el.valVds.textContent = state.vds.toFixed(1) + ' V';
      computeMosfetPhysics();
    });

    el.sliderVth.addEventListener('input', function () {
      state.vth = parseFloat(this.value);
      el.valVth.textContent = state.vth.toFixed(1) + ' V';
      computeMosfetPhysics();
    });

    el.sliderWL.addEventListener('input', function () {
      state.wl = parseInt(this.value, 10);
      el.valWL.textContent = state.wl.toString();
      computeMosfetPhysics();
    });

    el.sliderK.addEventListener('input', function () {
      state.kPrime = parseInt(this.value, 10);
      el.valK.textContent = state.kPrime + ' µA/V²';
      computeMosfetPhysics();
    });

    // Presets
    if (el.presetCutoff) {
      el.presetCutoff.addEventListener('click', function () {
        setActivePreset(this);
        setParams(1.0, 10.0, 2.0); // Vgs < Vth
      });
    }

    if (el.presetLinear) {
      el.presetLinear.addEventListener('click', function () {
        setActivePreset(this);
        setParams(10.0, 0.4, 2.0); // Vgs high, Vds small
      });
    }

    if (el.presetSat) {
      el.presetSat.addEventListener('click', function () {
        setActivePreset(this);
        setParams(5.0, 6.0, 2.0); // Vds >= Vgs - Vth
      });
    }

    if (el.btnResetMosfet) {
      el.btnResetMosfet.addEventListener('click', function () {
        if (el.presetLinear) setActivePreset(el.presetLinear);
        setParams(6.0, 0.5, 2.0, 500, 200);
      });
    }
  }

  function setActivePreset(button) {
    document.querySelectorAll('.preset-btn').forEach(function (b) { b.classList.remove('active'); });
    button.classList.add('active');
  }

  function setParams(vgs, vds, vth, wl, k) {
    state.vgs = vgs;
    state.vds = vds;
    if (vth !== undefined) state.vth = vth;
    if (wl !== undefined) state.wl = wl;
    if (k !== undefined) state.kPrime = k;

    el.sliderVgs.value = state.vgs;
    el.valVgs.textContent = state.vgs.toFixed(1) + ' V';
    el.sliderVds.value = state.vds;
    el.valVds.textContent = state.vds.toFixed(1) + ' V';
    el.sliderVth.value = state.vth;
    el.valVth.textContent = state.vth.toFixed(1) + ' V';

    if (wl) {
      el.sliderWL.value = state.wl;
      el.valWL.textContent = state.wl.toString();
    }
    if (k) {
      el.sliderK.value = state.kPrime;
      el.valK.textContent = state.kPrime + ' µA/V²';
    }

    computeMosfetPhysics();
  }

  // --- Charts: Family of Curves & Transfer Curve ---
  function initCharts() {
    var ctxFamily = document.getElementById('familyOfCurvesChart');
    var ctxTransfer = document.getElementById('transferCurveChart');
    if (!ctxFamily || !ctxTransfer) return;

    var chartText = cssVar('--chart-text') || '#64748b';
    var chartGrid = cssVar('--chart-grid') || 'rgba(0,0,0,0.06)';

    // Family of curves: Vgs = [3, 4, 5, 6, 8, 10]
    var vgsValues = [3, 4, 5, 6, 8, 10];
    var colors = ['#94a3b8', '#64748b', '#0284c7', '#2563eb', '#16a34a', '#8b5cf6'];
    var datasets = [];

    // Operating point dataset (first so on top)
    datasets.push({
      label: 'Operating Point',
      data: [{ x: state.vds, y: state.id }],
      backgroundColor: '#ef4444',
      borderColor: '#ffffff',
      borderWidth: 2,
      pointRadius: 7,
      pointHoverRadius: 9,
      type: 'scatter'
    });

    // Pinch-off locus parabola
    var locusPts = [];
    var kp = state.kPrime * 1e-6;
    for (var v = 0; v <= 10; v += 0.2) {
      var idSatLocus = 0.5 * kp * state.wl * Math.pow(v, 2);
      locusPts.push({ x: v, y: idSatLocus });
    }
    datasets.push({
      label: 'Pinch-off Boundary (Vds = Vgs - Vth)',
      data: locusPts,
      borderColor: '#f59e0b',
      borderWidth: 1.5,
      borderDash: [4, 4],
      fill: false,
      pointRadius: 0
    });

    // Curves for each Vgs
    vgsValues.forEach(function (vVal, idx) {
      var pts = [];
      var vOverdrive = Math.max(0, vVal - state.vth);
      for (var vds = 0; vds <= 12; vds += 0.25) {
        var idVal = 0;
        if (vOverdrive > 0) {
          if (vds < vOverdrive) {
            idVal = kp * state.wl * (vOverdrive * vds - 0.5 * Math.pow(vds, 2));
          } else {
            idVal = 0.5 * kp * state.wl * Math.pow(vOverdrive, 2);
          }
        }
        pts.push({ x: vds, y: idVal });
      }

      datasets.push({
        label: 'Vgs = ' + vVal + 'V',
        data: pts,
        borderColor: colors[idx],
        borderWidth: vVal === 6 ? 2.5 : 1.5,
        fill: false,
        pointRadius: 0
      });
    });

    familyChart = new Chart(ctxFamily, {
      type: 'line',
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: 12,
            title: { display: true, text: 'Drain-Source Voltage Vds (V)', color: chartText },
            grid: { color: chartGrid },
            ticks: { color: chartText }
          },
          y: {
            min: 0,
            max: 8,
            title: { display: true, text: 'Drain Current Id (A)', color: chartText },
            grid: { color: chartGrid },
            ticks: { color: chartText }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });

    // Transfer curve Id vs Vgs at current Vds
    var transferPts = [];
    for (var vgs = 0; vgs <= 12; vgs += 0.2) {
      var vOver = Math.max(0, vgs - state.vth);
      var idVal = 0;
      if (vOver > 0) {
        if (state.vds < vOver) {
          idVal = kp * state.wl * (vOver * state.vds - 0.5 * Math.pow(state.vds, 2));
        } else {
          idVal = 0.5 * kp * state.wl * Math.pow(vOver, 2);
        }
      }
      transferPts.push({ x: vgs, y: idVal });
    }

    transferChart = new Chart(ctxTransfer, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Operating Point',
            data: [{ x: state.vgs, y: state.id }],
            backgroundColor: '#ef4444',
            borderColor: '#ffffff',
            borderWidth: 2,
            pointRadius: 7,
            type: 'scatter'
          },
          {
            label: 'Transfer Characteristic (Id vs Vgs)',
            data: transferPts,
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
        animation: false,
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: 12,
            title: { display: true, text: 'Gate-Source Voltage Vgs (V)', color: chartText },
            grid: { color: chartGrid },
            ticks: { color: chartText }
          },
          y: {
            min: 0,
            max: 8,
            title: { display: true, text: 'Drain Current Id (A)', color: chartText },
            grid: { color: chartGrid },
            ticks: { color: chartText }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function updateCharts() {
    var kp = state.kPrime * 1e-6;

    if (familyChart) {
      // Update operating point
      familyChart.data.datasets[0].data = [{ x: state.vds, y: state.id }];

      // Recompute pinch-off boundary
      var locusPts = [];
      for (var v = 0; v <= 10; v += 0.2) {
        var idSatLocus = 0.5 * kp * state.wl * Math.pow(v, 2);
        locusPts.push({ x: v, y: idSatLocus });
      }
      familyChart.data.datasets[1].data = locusPts;

      // Update curves for Vgs values
      var vgsValues = [3, 4, 5, 6, 8, 10];
      vgsValues.forEach(function (vVal, idx) {
        var pts = [];
        var vOverdrive = Math.max(0, vVal - state.vth);
        for (var vds = 0; vds <= 12; vds += 0.25) {
          var idVal = 0;
          if (vOverdrive > 0) {
            if (vds < vOverdrive) {
              idVal = kp * state.wl * (vOverdrive * vds - 0.5 * Math.pow(vds, 2));
            } else {
              idVal = 0.5 * kp * state.wl * Math.pow(vOverdrive, 2);
            }
          }
          pts.push({ x: vds, y: idVal });
        }
        familyChart.data.datasets[idx + 2].data = pts;
      });

      familyChart.update('none');
    }

    if (transferChart) {
      // Update transfer operating point
      transferChart.data.datasets[0].data = [{ x: state.vgs, y: state.id }];

      var transferPts = [];
      for (var vgs = 0; vgs <= 12; vgs += 0.2) {
        var vOver = Math.max(0, vgs - state.vth);
        var idVal = 0;
        if (vOver > 0) {
          if (state.vds < vOver) {
            idVal = kp * state.wl * (vOver * state.vds - 0.5 * Math.pow(state.vds, 2));
          } else {
            idVal = 0.5 * kp * state.wl * Math.pow(vOver, 2);
          }
        }
        transferPts.push({ x: vgs, y: idVal });
      }
      transferChart.data.datasets[1].data = transferPts;
      transferChart.update('none');
    }
  }

  // --- Theme Change Listener ---
  window.addEventListener('theme-changed', function () {
    var chartText = cssVar('--chart-text') || '#64748b';
    var chartGrid = cssVar('--chart-grid') || 'rgba(0,0,0,0.06)';

    [familyChart, transferChart].forEach(function (ch) {
      if (!ch) return;
      ch.options.scales.x.grid.color = chartGrid;
      ch.options.scales.x.ticks.color = chartText;
      ch.options.scales.y.grid.color = chartGrid;
      ch.options.scales.y.ticks.color = chartText;
      ch.update('none');
    });
  });

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', function () {
    setupControls();
    setupCrossSectionHover();
    initCharts();
    computeMosfetPhysics();
  });

})();
