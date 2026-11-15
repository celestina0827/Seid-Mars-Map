/* ==========================================================================
   VITALS MONITORING (Q3 Biometric Monitor)
   ==========================================================================
   This script reads checkpoints saved by the campaign map (via localStorage: 
   ares1.hr, ares1.bp, ares1.temp, ares1.o2, ares1.status) and renders:
   
   - Chart 3: ECG Monitor — Live synthetic PQRST trace matching saved heart rate.
   - Chart 4: O2 Gauge — Doughnut chart indicating remaining oxygen.
   
   Dependencies: Chart.js (must be loaded before execution). If missing, 
   fallback text readouts are displayed.
   
   Public API:
   - renderVitals({ hr, sys, dia, tempC, o2, status })
   - pollVitals(url, ms)
   - renderO2(n)
   ========================================================================== */

(function () {
  
  // --- 1. DOM Elements & Constants ---
  const $ = (id) => document.getElementById(id);
  const root = $("vitals");
  
  if (!root) return;

  const COLOR = { 
    green: "#39ff88", 
    amber: "#ffb02e", 
    red: "#ff3b57", 
    blue: "#38d9ff" 
  };
  
  const LEVEL_COLOR = { 
    ok: COLOR.green, 
    warn: COLOR.amber, 
    crit: COLOR.red 
  };
  
  const num = (v) => { 
    const n = parseFloat(v); 
    return isFinite(n) ? n : null; 
  };
  
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  
  const el = (tag, cls, txt) => { 
    const e = document.createElement(tag); 
    if (cls) e.className = cls; 
    if (txt != null) e.textContent = txt; 
    return e; 
  };

  /* ==========================================================================
     2. BIOMETRIC THRESHOLDS & EVALUATION
     ========================================================================== */
  const SPEC = { 
    hr: { lo: 60, hi: 100 }, 
    sys: { lo: 90, hi: 129 }, 
    temp: { lo: 36.1, hi: 37.2 } 
  };
  
  // Evaluate biometric state: inside band = ok; within half a band = caution; else critical
  function stateOf(v, s) {
    if (v >= s.lo && v <= s.hi) {
      return "ok";
    }
    const m = (s.hi - s.lo) * 0.5;
    return v >= s.lo - m && v <= s.hi + m ? "warn" : "crit";
  }
  
  // Oxygen states: green > 95, amber 75-95, red < 75
  function o2State(o) {
    if (o > 95) {
      return { level: "ok", label: "NOMINAL" };
    } else if (o >= 75) {
      return { level: "warn", label: "LOW · DEPLETING" };
    } else {
      return { level: "crit", label: "CRITICAL" };
    }
  }

  /* ==========================================================================
     3. STATE MANAGEMENT & FALLBACKS
     ========================================================================== */
  // Load initial values from HTML data attributes (overridden by localStorage later)
  const d = root.dataset;
  const S = { 
    hr: num(d.hr) ?? 75, 
    sys: num(d.sys) ?? 120, 
    dia: num(d.dia) ?? 80, 
    temp: num(d.temp) ?? 36.8, 
    o2: num(d.o2) ?? 88, 
    status: "" 
  };

  const STATUS_LEVEL = { 
    "OPTIMAL": "ok", 
    "ACTIVE": "ok", 
    "EXERTION": "warn", 
    "HIGH LOAD": "warn", 
    "CAUTION": "warn", 
    "COLD ZONE": "warn", 
    "PEAK ALERT": "crit" 
  };
  
  // Render textual status strip
  function paintStatus() {
    const s = String(S.status || "").trim().toUpperCase();
    let box = $("vitals-status");
    
    if (!box) {
      box = el("div", "vitals__status"); 
      box.id = "vitals-status"; 
      box.setAttribute("role", "status");
      box.append(el("span", "label", "Telemetry status"), el("b"));
      root.prepend(box);
    }
    
    box.hidden = !s;
    if (!s) return;
    
    box.dataset.level = STATUS_LEVEL[s] || "warn";
    box.querySelector("b").textContent = s;
    
    const up = $("uplink"); 
    if (up) up.textContent = "TELEMETRY: " + s;
  }

  // Update numeric readouts next to charts
  function paintReadouts() {
    $("v-hr").textContent = Math.round(S.hr);
    $("v-bp").textContent = `${Math.round(S.sys)}/${Math.round(S.dia)}`;
    $("v-temp").textContent = S.temp.toFixed(1);
    
    $("rd-hr").dataset.state = stateOf(S.hr, SPEC.hr);
    $("rd-bp").dataset.state = stateOf(S.sys, SPEC.sys);
    $("rd-temp").dataset.state = stateOf(S.temp, SPEC.temp);
    
    $("v-o2").textContent = Math.round(S.o2);
  }

  /* ==========================================================================
     4. CHART.JS CONFIGURATION (Sci-Fi Theme & Plugins)
     ========================================================================== */
  const charts = {};

  function setTheme() {
    const D = Chart.defaults;
    D.color = "rgba(255, 255, 255, 0.7)";
    D.borderColor = "rgba(255, 255, 255, 0.05)"; // Faint gridlines
    D.font.family = '"Share Tech Mono", Consolas, Menlo, monospace'; 
    D.font.size = 12;
    D.maintainAspectRatio = false;
    D.animation.duration = reduceMotion ? 0 : 700;
    D.plugins.legend.labels.color = "rgba(255, 255, 255, 0.7)";
    
    Object.assign(D.plugins.tooltip, { 
      backgroundColor: "rgba(5, 8, 15, 0.9)", 
      borderColor: COLOR.blue, 
      borderWidth: 1, 
      titleColor: COLOR.green, 
      bodyColor: "#e8f5ff", 
      cornerRadius: 0, 
      padding: 10 
    });
    
    Chart.register(neonGlow);
  }

  // Custom Plugin: Renders a glowing neon halo for every dataset based on its color
  const neonGlow = {
    id: "neonGlow",
    beforeDatasetDraw(c, args) {
      const ds = c.data.datasets[args.index];
      const pick = (v) => (Array.isArray(v) ? v[0] : v);
      c.ctx.save();
      c.ctx.shadowColor = c.config.type === "doughnut" ? pick(ds.backgroundColor) : pick(ds.borderColor);
      c.ctx.shadowBlur = 14;
    },
    afterDatasetDraw(c) { 
      c.ctx.restore(); 
    }
  };

  /* ==========================================================================
     5. CHART 3: SYNTHETIC ECG MONITOR
     ========================================================================== */
  const ECG_N = 200; // 200 samples at 50 Hz = ~4 seconds window
  const DT = 0.02;
  const ecgData = [];
  const ecgLabels = new Array(ECG_N).fill("");
  let phase = 0;
  
  // Gaussian function for generating PQRST wave components
  const gauss = (x, c, w, a) => a * Math.exp(-((x - c) * (x - c)) / (2 * w * w));
  
  function ecgAt(beat) {
    const x = beat - Math.floor(beat);
    return gauss(x, 0.16, 0.035, 0.14) + 
           gauss(x, 0.295, 0.011, -0.16) + 
           gauss(x, 0.32, 0.013, 1) + 
           gauss(x, 0.345, 0.012, -0.28) + 
           gauss(x, 0.56, 0.05, 0.3);
  }
  
  function ecgStep() {
    phase += DT * S.hr / 60; // Advance phase based on current HR
    ecgData.push(+(ecgAt(phase) + (Math.random() - 0.5) * 0.02).toFixed(3)); // Add minor noise
    if (ecgData.length > ECG_N) {
      ecgData.shift();
    }
  }
  
  function ecgSeed() { 
    ecgData.length = 0; 
    for (let i = 0; i < ECG_N; i++) {
      ecgStep(); 
    }
  }

  // Custom Plugin: Renders faint monitor grid and a glowing scan head at the tip
  const ecgScope = {
    id: "ecgScope",
    beforeDatasetsDraw(c) {
      const a = c.chartArea;
      const ctx = c.ctx; 
      ctx.save(); 
      ctx.strokeStyle = "rgba(56, 217, 255, 0.06)"; 
      ctx.lineWidth = 1; 
      ctx.beginPath();
      
      for (let x = a.left; x <= a.right; x += 24) { 
        ctx.moveTo(x, a.top); 
        ctx.lineTo(x, a.bottom); 
      }
      for (let y = a.top; y <= a.bottom; y += 24) { 
        ctx.moveTo(a.left, y); 
        ctx.lineTo(a.right, y); 
      }
      
      ctx.stroke(); 
      ctx.restore();
    },
    afterDatasetsDraw(c) {
      const pts = c.getDatasetMeta(0).data;
      const p = pts[pts.length - 1]; 
      if (!p) return;
      
      const ctx = c.ctx; 
      ctx.save(); 
      ctx.fillStyle = "#fff"; 
      ctx.shadowColor = COLOR.blue; 
      ctx.shadowBlur = 18;
      ctx.beginPath(); 
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); 
      ctx.fill(); 
      ctx.restore();
    }
  };

  /* ==========================================================================
     6. CHART 4: OXYGEN GAUGE (Doughnut)
     ========================================================================== */
  const gaugeTicks = {
    id: "gaugeTicks",
    afterDatasetsDraw(c) {
      const arc = c.getDatasetMeta(0).data[0]; 
      if (!arc) return;
      
      const ctx = c.ctx;
      ctx.save(); 
      ctx.lineWidth = 2; 
      ctx.font = '12px "Share Tech Mono", monospace'; 
      ctx.textAlign = "center"; 
      ctx.textBaseline = "middle";
      
      // Draw warning thresholds onto the doughnut chart
      [[75, COLOR.amber], [95, COLOR.green]].forEach(([v, col]) => {
        const th = ((-135 + 270 * v / 100) - 90) * Math.PI / 180;
        const cos = Math.cos(th);
        const sin = Math.sin(th);
        
        ctx.strokeStyle = col; 
        ctx.fillStyle = col; 
        ctx.beginPath();
        ctx.moveTo(arc.x + cos * (arc.innerRadius - 5), arc.y + sin * (arc.innerRadius - 5));
        ctx.lineTo(arc.x + cos * (arc.outerRadius + 5), arc.y + sin * (arc.outerRadius + 5)); 
        ctx.stroke();
        ctx.fillText(v, arc.x + cos * (arc.outerRadius + 18), arc.y + sin * (arc.outerRadius + 18));
      });
      ctx.restore();
    }
  };

  function buildCharts() {
    setTheme();
    ecgSeed();

    charts.ecg = new Chart($("chart-ecg"), {
      type: "line",
      data: { 
        labels: ecgLabels, 
        datasets: [{ 
          label: "ECG", 
          data: ecgData, 
          borderColor: COLOR.blue, 
          backgroundColor: "transparent", 
          borderWidth: 2, 
          tension: 0.15, 
          pointRadius: 0, 
          fill: false 
        }] 
      },
      options: {
        animation: false, 
        events: [],
        scales: { 
          x: { display: false }, 
          y: { display: false, min: -0.5, max: 1.25 } 
        },
        plugins: { 
          legend: { display: false }, 
          tooltip: { enabled: false } 
        }
      },
      plugins: [ecgScope]
    });

    charts.o2 = new Chart($("chart-o2"), {
      type: "doughnut",
      data: { 
        labels: ["Remaining", "Consumed"], 
        datasets: [{ 
          data: [S.o2, 100 - S.o2], 
          backgroundColor: [COLOR.green, "rgba(255, 255, 255, 0.08)"], 
          borderWidth: 0, 
          hoverOffset: 0 
        }] 
      },
      options: {
        rotation: -135, 
        circumference: 270, 
        cutout: "78%", 
        layout: { padding: 26 },
        plugins: { 
          legend: { display: false }, 
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}%` } } 
        }
      },
      plugins: [gaugeTicks]
    });
  }

  function paintCharts() {
    const o = o2State(S.o2);
    const oc = LEVEL_COLOR[o.level];
    const g = charts.o2.data.datasets[0];
    
    g.data = [S.o2, 100 - S.o2]; 
    g.backgroundColor = [oc, "rgba(255, 255, 255, 0.08)"];
    charts.o2.update();
    
    const st = $("o2-state"); 
    st.textContent = o.label; 
    st.style.color = oc;
    
    if (reduceMotion) { 
      ecgSeed(); 
      charts.ecg.update("none"); 
    }
    
    // Accessibility updates
    $("chart-ecg").setAttribute("aria-label", `Live ECG trace at ${Math.round(S.hr)} beats per minute.`);
    $("chart-o2").setAttribute("aria-label", `Oxygen reserve ${Math.round(S.o2)} percent, ${o.label.toLowerCase()}.`);
  }

  function refresh() { 
    paintReadouts(); 
    paintStatus(); 
    if (charts.o2) {
      paintCharts(); 
    }
  }

  /* ==========================================================================
     7. PUBLIC API & DATA FETCHING
     ========================================================================== */
  function renderVitals(v) {
    const hr = num(v.hr);
    const sys = num(v.sys);
    const dia = num(v.dia);
    const t = num(v.tempC);
    const o2 = num(v.o2);
    
    if (hr !== null) S.hr = hr;
    if (sys !== null) S.sys = sys;
    if (dia !== null) S.dia = dia;
    if (t !== null) S.temp = t;
    if (o2 !== null) S.o2 = clamp(o2, 0, 100);
    if (v.status != null) S.status = String(v.status);
    
    refresh();
  }
  
  function pollVitals(url, ms) {
    const tick = () => {
      fetch(url, { cache: "no-store" })
        .then((r) => r.json())
        .then(renderVitals)
        .catch(() => {});
    };
    tick(); 
    return setInterval(tick, ms || 5000);
  }
  
  window.renderVitals = renderVitals; 
  window.pollVitals = pollVitals;
  window.renderO2 = (n) => renderVitals({ o2: n });

  /* ==========================================================================
     8. LOAD GAME (Sync with LocalStorage Checkpoints)
     ========================================================================== */
  const KEYS = ["hr", "bp", "temp", "o2", "status"];
  
  const saved = (n) => { 
    try { 
      const x = localStorage.getItem("ares1." + n); 
      return x == null || x === "" ? null : x; 
    } catch (e) { 
      return null; 
    } 
  };
  
  function parseBP(s) { 
    const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(s || ""); 
    return m ? { sys: +m[1], dia: +m[2] } : null; 
  }
  
  function loadSaved() {
    const bp = parseBP(saved("bp"));
    renderVitals({ 
      hr: saved("hr"), 
      sys: bp && bp.sys, 
      dia: bp && bp.dia, 
      tempC: saved("temp"), 
      o2: saved("o2"), 
      status: saved("status") 
    });
  }

  /* ==========================================================================
     9. INITIALIZATION & LIVE ECG LOOP
     ========================================================================== */
  if (window.Chart) {
    buildCharts();
    
    // Live ECG Simulation Loop (~16 FPS)
    if (!reduceMotion) {                                     
      let last = performance.now();
      
      setInterval(() => {
        const now = performance.now();
        const n = Math.min(12, Math.floor((now - last) / (DT * 1000)));
        
        // Pause animation when tab is inactive to save CPU
        if (document.hidden) { 
          last = now; 
          return; 
        }
        if (n < 1) return;
        
        last += n * DT * 1000;
        
        for (let i = 0; i < n; i++) {
          ecgStep();
        }
        
        charts.ecg.update("none");
      }, 60);
    }
  } else {
    // Chart.js missing fallback
    root.querySelectorAll(".chart__box").forEach((b) => { 
      b.textContent = ""; 
      b.appendChild(el("p", "empty", "CHART LIBRARY OFFLINE · readings are shown above the chart")); 
    });
    $("o2-state").textContent = o2State(S.o2).label;
  }
  
  refresh();
  loadSaved();
  
  // Listen for storage events (e.g., changes made in other tabs/windows like campaign.html)
  window.addEventListener("storage", (e) => { 
    if (e.key === null || KEYS.some((n) => e.key === "ares1." + n)) {
      loadSaved(); 
    }
  });
  
})();