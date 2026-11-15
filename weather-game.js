/* ==========================================================================
   ARES-1 MISSION CONTROL (weather-game.js for weather.html)
   ==========================================================================
   Chapters: 
   1. Weather
   2. Crew Health (Body + Mind check)
   3. Threats
   4. Emergency Guide
   5. Dictionary & Maps
   
   Data Source:
   Internal checkpoints mapped to campaign.html + window.MARS_DATA.
   Saves selected checkpoint vitals to localStorage (ares1.*) for cross-page sync.
   ========================================================================== */

(function () {
  "use strict";

  // --- 1. Utilities & Configuration ---
  const $ = (id) => document.getElementById(id);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  
  const lsGet = (k) => { 
    try { return localStorage.getItem(k); } 
    catch (e) { return null; } 
  };
  
  const lsSet = (k, v) => { 
    try { localStorage.setItem(k, v); } 
    catch (e) {} 
  };
  
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  
  // XSS protection
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clean = (t) => String(t).replace(/^\d+[.)]\s*/, "");

  const RED = "#ff3b57", AMB = "#ffb02e", GRN = "#39ff88", BLU = "#38d9ff";
  const col = (s) => (s === "ok" ? GRN : s === "warn" ? AMB : RED);
  const WORD = { ok: "Normal", warn: "Watch", crit: "Alert" };
  const lvl = (v, a, b, w) => (v >= a && v <= b ? "ok" : v >= a - w && v <= b + w ? "warn" : "crit");

  // --- 2. Checkpoints Data (Matched to campaign.html) ---
  const CP = [
    { 
      n: "Landing Zone", hr: 76, sys: 118, dia: 76, t: 36.8, o2: 99, st: "OPTIMAL", 
      th: [20, 45, 25, 30, 35], 
      tip: "Fine dust gets into suit seals. Check seals and avoid soft sand drifts." 
    },
    { 
      n: "Clay-Bearing Unit", hr: 92, sys: 126, dia: 84, t: 37.1, o2: 93, st: "EXERTION", 
      th: [25, 40, 50, 35, 40], 
      tip: "Clay turns slippery when frost melts. Walk slowly and test each step." 
    },
    { 
      n: "Greenheugh Pediment", hr: 118, sys: 140, dia: 90, t: 37.5, o2: 85, st: "CAUTION", 
      th: [40, 65, 70, 45, 45], 
      tip: "Steep edges and strong wind. Always stay clipped to your tether." 
    },
    { 
      n: "Gediz Vallis Ridge", hr: 108, sys: 135, dia: 86, t: 36.9, o2: 78, st: "EXERTION", 
      th: [45, 50, 90, 40, 55], 
      tip: "Boulders can shift under your weight. Re-plan your route before moving." 
    },
    { 
      n: "Gediz Vallis Channel", hr: 100, sys: 130, dia: 84, t: 36.4, o2: 70, st: "COLD ZONE", 
      th: [40, 30, 55, 85, 60], 
      tip: "Deep shade freezes fast. Check your suit cooling loop is working." 
    },
    { 
      n: "Sulfate-Bearing Unit", hr: 122, sys: 142, dia: 92, t: 37.3, o2: 62, st: "PEAK ALERT", 
      th: [85, 60, 50, 70, 65], 
      tip: "High radiation up here. Watch your dosimeter and rest often." 
    }
  ];

  const ST_LEVEL = { 
    OPTIMAL: "ok", 
    EXERTION: "warn", 
    CAUTION: "warn", 
    "COLD ZONE": "warn", 
    "PEAK ALERT": "crit" 
  };
  
  const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
  const cpId = (i) => "CP-0" + (i + 1);
  const AX = ["☢ Radiation", "🌪 Dust & wind", "⛰ Terrain", "❄ Cold", "🔧 Equipment"];
  
  // Sync checkpoint selection with orbital_maps.html state
  const wpm = /^wp_(\d)/.exec(lsGet("ares1.wp") || ""); 
  let cur = wpm ? Math.min(CP.length - 1, +wpm[1] - 1) : Math.max(0, CP.findIndex((c) => String(c.hr) === lsGet("ares1.hr")));

  // --- 3. Chart.js Setup ---
  const hasChart = !!window.Chart;
  const C = {};
  
  if (hasChart) {
    const D = Chart.defaults;
    D.color = "rgba(232,245,255,.8)"; 
    D.borderColor = "rgba(255,255,255,.08)";
    D.font.family = '"Share Tech Mono", monospace'; 
    D.font.size = 13;
    D.maintainAspectRatio = false; 
    D.animation.duration = still ? 0 : 500; 
    D.plugins.legend.display = false;
    
    Object.assign(D.plugins.tooltip, { 
      backgroundColor: "rgba(5,8,15,.92)", 
      borderColor: BLU, 
      borderWidth: 1, 
      cornerRadius: 0 
    });
  } else {
    $$(".chart__box").forEach((b) => { 
      b.textContent = "Chart library not found. Keep chart.js next to this file."; 
    });
  }
  
  const mk = (id, cfg) => { 
    if (hasChart) C[id] = new Chart($(id), cfg); 
  };

  /* ==========================================================================
     4. CHAPTER 1: WEATHER DATA
     ========================================================================== */
  const SOLS = [142, 143, 144, 145, 146, 147, 148].map((s) => "Sol " + s);
  
  const WXD = [
    { e: -4500, h: -8, l: -79, w: 6, d: "Low", u: "High" }, 
    { e: -4390, h: -9, l: -80, w: 7, d: "Low", u: "High" },
    { e: -4210, h: -11, l: -82, w: 11, d: "Med", u: "High" }, 
    { e: -3980, h: -12, l: -83, w: 9, d: "Med", u: "High" },
    { e: -4060, h: -14, l: -88, w: 5, d: "Low", u: "Med" }, 
    { e: -3720, h: -10, l: -81, w: 8, d: "Med", u: "Max" }
  ];
  
  const OFF = { 
    h: [0, 2, -1, 3, 1, -2, 4], 
    l: [0, -1, 3, -2, 0, -4, 2], 
    w: [0, 1, -1, 2, 0, 1, -1], 
    p: [0, -2, 1, -3, 0, 2, -1] 
  };

  // Weather Trend Line Chart
  mk("c-wx", { 
    type: "line", 
    data: { 
      labels: SOLS.map((n) => n.slice(4)), 
      datasets: [
        { label: "High", data: [], borderColor: AMB, backgroundColor: AMB, tension: .35, pointRadius: 3 },
        { label: "Low", data: [], borderColor: BLU, backgroundColor: "rgba(56,217,255,.12)", fill: "-1", tension: .35, pointRadius: 3 }
      ] 
    },
    options: { 
      plugins: { legend: { display: true, labels: { boxWidth: 12 } } }, 
      scales: { y: { ticks: { callback: (v) => v + "°" } } } 
    } 
  });

  const wxTile = (ic, nm, v, unit, s) =>
    `<div class="tile" data-s="${s}">
       <div class="tile__top"><span>${ic} ${nm}</span></div>
       <div class="tile__v">${v}<small>${unit}</small>${s !== "ok" ? `<i class="dot" title="${WORD[s]}"></i>` : ""}</div>
     </div>`;

  function drawWeather(i) {
    const c = CP[i];
    const W = WXD[i];
    const P0 = Math.round(748 - (W.e + 4500) * .12);
    
    const hs = OFF.h.map((o) => W.h + o);
    const ls = OFF.l.map((o) => W.l + o);
    const ws = OFF.w.map((o) => Math.max(1, W.w + o));
    const ps = OFF.p.map((o) => P0 + o);
    
    $("wx").innerHTML = [
      wxTile("🌡", "Day high", W.h, "°C", "ok"),
      wxTile("🌙", "Night low", W.l, "°C", W.l <= -85 ? "crit" : "warn"),
      wxTile("⏲", "Pressure", P0, "Pa", "ok"),
      wxTile("💨", "Wind", W.w, "m/s", W.w >= 12 ? "crit" : W.w >= 8 ? "warn" : "ok"),
      wxTile("🌫", "Dust haze", W.d, "", W.d === "Low" ? "ok" : "warn"),
      wxTile("🔆", "UV index", W.u, "", W.u === "Max" ? "crit" : W.u === "High" ? "warn" : "ok")
    ].join("");
    
    $("wx-tag").textContent = cpId(i) + " · " + W.e + " m";
    $("wx-sw").innerHTML = `Days are mild, nights are brutal: the swing is <b>~${W.h - W.l} °C</b> every sol.`;
    
    const tips = ["🔥 Heater on at night"];
    if (W.d !== "Low") tips.push("🧼 Check suit seals");
    if (W.u === "High" || W.u === "Max") tips.push("🕶 Use visor filter");
    if (W.w >= 8) tips.push("🌬 Stay clipped in");
    
    $("wx-tips").innerHTML = tips.map((t) => `<span>${t}</span>`).join("");
    
    if (C["c-wx"]) { 
      const d = C["c-wx"].data.datasets; 
      d[0].data = hs; 
      d[1].data = ls; 
      C["c-wx"].update(); 
    }
    
    $("wx-tbl").innerHTML = "<tr><th>Sol</th><th>High °C</th><th>Low °C</th><th>Wind m/s</th><th>Pa</th></tr>" +
      SOLS.map((n, k) => `<tr><td>${n}</td><td>${hs[k]}</td><td>${ls[k]}</td><td>${ws[k]}</td><td>${ps[k]}</td></tr>`).join("");
  }

  /* ==========================================================================
     5. CHAPTER 2: CREW HEALTH (BODY VITALS)
     ========================================================================== */
  function vitalTile(ic, nm, val, unit, s, lo, hi, mn, mx, v) {
    const p = (x) => (((x - mn) / (mx - mn)) * 100).toFixed(1) + "%";
    return `
      <div class="tile" data-s="${s}">
        <div class="tile__top">
          <span>${ic} ${nm}</span>
          <span class="tile__st">${WORD[s]}</span>
        </div>
        <div class="tile__v">${val}<small>${unit}</small></div>
        <div class="bar" style="--a:${p(lo)};--w:${(((hi - lo) / (mx - mn)) * 100).toFixed(1)}%;--p:${p(Math.min(mx, Math.max(mn, v)))};--c:${col(s)}">
          <u></u><i></i>
        </div>
      </div>`;
  }

  // Live ECG Simulation for active checkpoint
  const ECG_N = 140;
  let ecgT = 0, hrNow = CP[cur].hr;
  const ecgBuf = Array(ECG_N).fill(0);
  
  const gs = (x, c, w, a) => a * Math.exp(-(((x - c) / w) ** 2));
  const wave = (p) => gs(p, .14, .03, .12) + gs(p, .27, .008, -.15) + gs(p, .30, .01, 1) + gs(p, .33, .01, -.25) + gs(p, .55, .05, .25);
  
  const ecgStep = () => { 
    ecgBuf.shift(); 
    ecgT += .05; 
    const per = 60 / hrNow; 
    ecgBuf.push(wave((ecgT % per) / per)); 
  };
  
  const ecgSeed = () => { 
    for (let i = 0; i < ECG_N; i++) ecgStep(); 
  };
  
  mk("c-ecg", { 
    type: "line", 
    data: { 
      labels: Array(ECG_N).fill(""), 
      datasets: [{ data: ecgBuf, borderColor: GRN, borderWidth: 2, pointRadius: 0, tension: .2 }] 
    },
    options: { 
      animation: false, 
      events: [], 
      scales: { x: { display: false }, y: { display: false, min: -.5, max: 1.2 } } 
    } 
  });

  let act = 0, tab = "body";
  if (hasChart && !still) {
    setInterval(() => {
      if (document.hidden || act !== 1 || tab !== "body") return;
      ecgStep(); 
      C["c-ecg"].update("none");
    }, 50);
  }

  /* ==========================================================================
     6. CHAPTER 3: ENVIRONMENTAL THREATS
     ========================================================================== */
  const VAL = { 
    id: "vals", 
    afterDatasetsDraw(c) {
      const m = c.getDatasetMeta(0);
      const d = c.data.datasets[0].data;
      const x = c.ctx;
      
      x.save(); 
      x.font = '700 13px "Share Tech Mono",monospace'; 
      x.textBaseline = "middle";
      
      m.data.forEach((b, k) => { 
        const v = d[k]; 
        x.fillStyle = v >= 70 ? RED : v >= 40 ? AMB : GRN; 
        x.fillText(v + " " + (v >= 70 ? "HIGH" : v >= 40 ? "MED" : "LOW"), b.x + 8, b.y); 
      });
      x.restore();
    } 
  };
  
  mk("c-thr", { 
    type: "bar", 
    data: { 
      labels: AX, 
      datasets: [{ data: [0, 0, 0, 0, 0], borderWidth: 0, barThickness: 24 }] 
    },
    options: { 
      indexAxis: "y", 
      layout: { padding: { right: 78 } }, 
      scales: { x: { min: 0, max: 100 }, y: { grid: { display: false } } } 
    }, 
    plugins: [VAL] 
  });
  
  mk("c-route", { 
    type: "line", 
    data: { 
      labels: CP.map((_, i) => cpId(i)), 
      datasets: [{ 
        data: CP.map((c) => c.o2), 
        borderColor: BLU, 
        backgroundColor: "rgba(56,217,255,.15)", 
        fill: "start", 
        tension: .3, 
        pointRadius: CP.map(() => 4) 
      }] 
    },
    options: { 
      scales: { y: { min: 50, max: 100, ticks: { callback: (v) => v + "%" } } } 
    } 
  });

  /* ==========================================================================
     7. CHECKPOINT SELECTION LOGIC
     ========================================================================== */
  $("cplist").innerHTML = CP.map((c, i) => {
    const s = ST_LEVEL[c.st] || "warn";
    return `
      <button type="button" class="cp" data-cp="${i}" aria-pressed="false" style="--c:${col(s)}">
        <i></i><span>${esc(c.n)}</span><small>${cpId(i)}</small>
      </button>`;
  }).join("");

  function setCP(i) {
    cur = i;
    const c = CP[i];
    
    // Determine thresholds
    const s1 = lvl(c.hr, 60, 100, 15);
    const s2 = lvl(c.sys, 90, 130, 12);
    const s3 = lvl(c.t, 36.1, 37.3, .5);
    const so = c.o2 >= 90 ? "ok" : c.o2 >= 75 ? "warn" : "crit";
    
    hrNow = c.hr; 
    ecgSeed();
    
    $("vt").innerHTML =
      vitalTile("❤️", "Heart", c.hr, "bpm", s1, 60, 100, 40, 160, c.hr) +
      vitalTile("🩸", "BP", c.sys + "/" + c.dia, "", s2, 90, 130, 70, 170, c.sys) +
      vitalTile("🌡", "Temp", c.t, "°C", s3, 36.1, 37.3, 35, 39, c.t) +
      vitalTile("🫁", "Oxygen", c.o2, "%", so, 90, 100, 50, 100, c.o2);
      
    $("cp-tag").textContent = cpId(i) + " · " + titleCase(c.st);
    $("thr-tag").textContent = cpId(i) + " · " + c.n;
    $("hrlbl").textContent = c.hr + " bpm · live";
    $("thr-tip").innerHTML = "<b>Tip:</b> " + esc(c.tip);
    
    $$(".cp").forEach((b, n) => b.setAttribute("aria-pressed", n === i));
    
    // Update threat chart
    if (C["c-thr"]) { 
      const d = C["c-thr"].data.datasets[0]; 
      d.data = c.th; 
      d.backgroundColor = c.th.map((v) => (v >= 70 ? RED : v >= 40 ? AMB : GRN)); 
      C["c-thr"].update(); 
    }
    
    // Update route chart focus
    if (C["c-route"]) { 
      C["c-route"].data.datasets[0].pointRadius = CP.map((_, n) => (n === i ? 9 : 4)); 
      C["c-route"].update(); 
    }
    
    if (C["c-ecg"]) {
      C["c-ecg"].update("none");
    }
    
    drawWeather(i);
    
    // Save to local storage for other windows (like orbital_maps.html)
    lsSet("ares1.hr", c.hr); 
    lsSet("ares1.bp", c.sys + "/" + c.dia); 
    lsSet("ares1.temp", c.t); 
    lsSet("ares1.o2", c.o2); 
    lsSet("ares1.status", c.st);
  }

  /* ==========================================================================
     8. CREW HEALTH: MIND CHECK (PSS-12)
     ========================================================================== */
  // PSS-12 Items: [dimension, question, reverse-scored (1=yes)]
  const PSS = [
    ["Unpredictability", "Have you been upset because of something that happened unexpectedly in the outpost (e.g., system alarms, dust storms)?", 0],
    ["Uncontrollability", "Have you felt that you were unable to control the important survival and mission-critical operations in the habitat?", 0],
    ["Nervous tension", "Have you felt nervous, anxious, or inexplicably irritable while performing routine maintenance in closed modules?", 0],
    ["Self-efficacy", "Have you felt confident about your ability to handle water mining, soil remediation, and module anomalies?", 1],
    ["Positive flow", "Have you felt that outpost operations and daily routines were going your way as expected?", 1],
    ["Overload", "Have you found that you could not cope with all the scheduled shift duties and felt overloaded by tasks?", 0],
    ["Emotion control", "Have you been able to control feelings of monotony, homesickness, and daily irritations during deployment?", 1],
    ["Mastery", "Have you felt that you were on top of things mentally and physically, in full command of your duties?", 1],
    ["External frustration", "Have you been angered because of environmental limits, comms delays, or hardware faults outside your control?", 0],
    ["Accumulated strain", "Have you felt technical challenges and physical fatigue were piling up so high that you could not overcome them?", 0],
    ["Crew friction", "Have you felt communication strain, interpersonal friction, or social withdrawal when working with the other 3 crew members?", 0],
    ["Sleep recovery", "Have you experienced difficulty falling asleep, restless nights, or waking up exhausted due to stress or circadian drift?", 0]
  ];
  
  const OPTS = ["Never", "Almost never", "Sometimes", "Fairly often", "Very often"];
  
  // Scoring Tiers and Recommendations
  const TIERS = [
    { 
      max: 16, s: "ok", face: "😌", short: "Low stress", name: "Normal / low stress",
      as: "High psychological resilience and healthy adaptation to closed habitat conditions.",
      acts: ["Maintain a standard 8-hour sleep cycle and routine shift schedule (well checks, aeroponic monitoring, daily fitness)."] 
    },
    { 
      max: 32, s: "warn", face: "😰", short: "Moderate stress", name: "Mild / moderate stress",
      as: "Cumulative fatigue, mild anxiety, or early circadian sleep disruption detected.",
      acts: ["Switch cabin lighting to warm ambient mode and play local nature audio.", "Defer non-urgent data logging by 2 hours.", "Spend 20 minutes tending plants inside the pressurized agricultural dome.", "Do 4 cycles of 4-7-8 breathing before sleep."] 
    },
    { 
      max: 48, s: "crit", face: "🥵", short: "High stress", name: "Severe / high stress",
      as: "Critical stress threshold reached; high risk of cognitive decline or acute burnout.",
      acts: ["Stand down from high-risk or heavy tasks (EVA, deep well maintenance); reassign them to the other 3 crew members.", "Schedule 4–6 hours of private rest.", "Open the offline self-help manual: Progressive Muscle Relaxation and 5-4-3-2-1 grounding.", "Quietly notify the Commander on the shared terminal to redistribute routine chores."] 
    }
  ];
  
  const tierOf = (n) => TIERS.find((t) => n <= t.max);
  
  const ICON = ["⚡", "🎛", "😬", "🔧", "🌱", "📦", "🧘", "🎯", "📡", "🪫", "🤝", "😴"];
  const RANK = ["Steady operator", "Strained operator", "Stand-down"];
  
  let crew = Math.min(4, Math.max(1, +lsGet("ares1.crew") || 1));
  let qi = 0;
  let ans = [];
  let busy = false;
  
  const K = (n, c) => "ares1." + n + "." + (c || crew);
  const strain = (a, i) => (PSS[i][2] ? 4 - a : a);
  const sev = (v) => (v <= 1 ? "ok" : v === 2 ? "warn" : "crit");
  
  const complete = () => ans.every((a) => a !== null);
  const pssScore = () => ans.reduce((t, a, i) => t + (a === null ? 0 : strain(a, i)), 0);
  const tierIdx = (n) => TIERS.findIndex((t) => n <= t.max);
  
  const readJSON = (k, d) => { 
    try { const v = JSON.parse(lsGet(k) || "null"); return v == null ? d : v; } 
    catch (e) { return d; } 
  };
  
  const readAns = (c) => { 
    const a = readJSON(K("pss", c), c === 1 ? readJSON("ares1.pss", null) : null); 
    return Array.isArray(a) && a.length === PSS.length ? a : null; 
  };
  
  const crewScore = (c) => { 
    const a = readAns(c); 
    return a && a.every((x) => x !== null) ? a.reduce((t, x, i) => t + strain(x, i), 0) : null; 
  };
  
  const hist = () => { 
    const h = readJSON(K("hist"), []); 
    return Array.isArray(h) ? h : []; 
  };

  function loadCrew() {
    ans = readAns(crew) || Array(PSS.length).fill(null);
    qi = complete() ? PSS.length : Math.max(0, ans.indexOf(null));
  }
  
  function save() {
    lsSet(K("pss"), JSON.stringify(ans)); 
    lsSet("ares1.crew", crew);
    if (crew === 1) lsSet("ares1.pss", JSON.stringify(ans)); // Backwards compat for campaign.html
    lsSet("ares1.stress", complete() ? pssScore() : "");
  }
  
  function pushHist(replace) {
    const h = hist(); 
    if (replace && h.length) {
      h[h.length - 1] = pssScore(); 
    } else {
      h.push(pssScore());
    }
    lsSet(K("hist"), JSON.stringify(h.slice(-7)));
  }

  function drawGlance() {
    const g = $("glance"), go = g.querySelector(".glance__go");
    
    if (!complete()) { 
      g.dataset.s = "none"; 
      $("g-face").textContent = "🧠"; 
      $("g-s").textContent = "Mind check · Crew 0" + crew; 
      $("g-n").textContent = "12 scans · 2 min"; 
      go.textContent = "Start ›"; 
      return; 
    }
    
    const n = pssScore();
    const t = tierOf(n);
    
    g.dataset.s = t.s; 
    $("g-face").textContent = t.face; 
    $("g-s").textContent = "Crew 0" + crew + ": " + t.short; 
    $("g-n").textContent = n + " / 48"; 
    go.textContent = "Details ›";
  }
  
  function drawCrew() {
    $("crew").innerHTML = [1, 2, 3, 4].map((c) => {
      const n = crewScore(c);
      const t = n === null ? null : tierOf(n);
      return `<button type="button" class="pip" data-crew="${c}" aria-pressed="${c === crew}" data-s="${t ? t.s : "none"}">
                <i></i>Crew 0${c}<small>${n === null ? "new" : n + "/48"}</small>
              </button>`;
    }).join("");
  }
  
  function drawLock() {
    // Severe tier forces EVA stand-down
    const n = complete() ? pssScore() : null;
    const lock = n !== null && n > 32;
    
    document.querySelector(".eva").classList.toggle("locked", lock);
    $("eva-lock").hidden = !lock; 
    $("globe-controls").inert = lock;
    $("eva-lock").textContent = lock ? `🔒 Crew 0${crew} is stood down (stress ${n}/48). Hand this EVA to another crew member.` : "";
    $("ms").textContent = n === null ? "--" : n + "/48";
  }
  
  const quests = () => { 
    const o = readJSON(K("quest"), null); 
    return o && complete() && o.t === tierIdx(pssScore()) && Array.isArray(o.d) ? o.d : []; 
  };
  
  const countUp = (el, n) => {
    if (still || !n) { 
      el.textContent = n; 
      return; 
    }
    const t0 = performance.now();
    (function s(now) { 
      const k = Math.min(1, (now - t0) / 700); 
      el.textContent = Math.round(n * (1 - (1 - k) ** 3)); 
      if (k < 1) requestAnimationFrame(s); 
    })(t0);
  };

  function drawMind() {
    if (C["c-pss"]) { 
      C["c-pss"].destroy(); 
      delete C["c-pss"]; 
    }
    
    drawGlance(); 
    drawCrew(); 
    drawLock();
    
    const box = $("mind-box");
    const n = pssScore();
    
    if (qi < PSS.length) {
      const [dim, q, rev] = PSS[qi];
      const nodes = PSS.map((_, i) => `
        <button type="button" class="node${i === qi ? " cur" : ""}" data-j="${i}" 
          ${ans[i] === null ? "" : `data-s="${sev(strain(ans[i], i))}"`} 
          aria-label="Scan ${i + 1}${ans[i] === null ? "" : ", answered"}">
        </button>`).join("");
        
      box.innerHTML = `
        <div class="hud">
          <span>Scan ${qi + 1} of ${PSS.length} · past 7 days</span>
          <span>Strain <b>${n}</b>/48</span>
        </div>
        <div class="hp" aria-hidden="true">
          <i style="width:${100 - (n / 48) * 100}%"></i>
          <s style="left:33.3%"></s><s style="left:66.6%"></s>
        </div>
        <div class="nodes">${nodes}</div>
        <div class="qcard">
          <div class="qdim">
            <span>${ICON[qi]}</span>${esc(dim)}${rev ? '<em class="rev">Positive item</em>' : ""}
          </div>
          <p class="qtext">${esc(q)}</p>
          ${rev ? '<p class="hint">Here a higher answer means you are coping well.</p>' : ""}
        </div>
        <div class="opts" role="radiogroup" aria-label="Answer">
          ${OPTS.map((o, k) => `
            <button type="button" class="opt" role="radio" aria-checked="${ans[qi] === k}" data-v="${k}">
              <b>${k}</b>${o}<kbd>${k + 1}</kbd>
            </button>`).join("")}
        </div>
        <div class="qnav">
          <button type="button" class="link" data-act="back" ${qi === 0 ? "disabled" : ""}>‹ Previous</button>
          ${complete() ? '<button type="button" class="link" data-act="result">Back to result ›</button>' : ""}
        </div>`;
      return;
    }
    
    // Result Screen
    const ti = tierIdx(n);
    const t = TIERS[ti];
    const d = quests();
    const rows = PSS.map((p, i) => ({ d: p[0], v: strain(ans[i], i), i })).sort((a, b) => b.v - a.v || a.i - b.i);
    
    const pp = (r) => `
      <div class="pp" data-s="${sev(r.v)}">
        <span>${ICON[r.i]} ${esc(r.d)}</span>
        <u><i style="width:${r.v * 25}%"></i></u>
        <b>${r.v}</b>
      </div>`;
      
    box.innerHTML = `
      <div class="result" data-s="${t.s}" aria-live="polite">
        <div class="result__top">
          <span class="result__face" aria-hidden="true">${t.face}</span>
          <div>
            <div class="result__s">${RANK[ti]}</div>
            <small class="dim">Crew 0${crew} · ${esc(t.name)}</small>
          </div>
          <div class="result__n"><span id="r-n">${n}</span><small>/48</small></div>
        </div>
        <div class="gauge" aria-hidden="true"><i style="left:${(n / 48) * 100}%"></i></div>
        <div class="gauge__ends" aria-hidden="true"><span>0</span><span>16</span><span>32</span><span>48</span></div>
        <p>${esc(t.as)}</p>
      </div>
      <div class="stack">
        <div class="qdim">Biggest pressure points</div>
        ${rows.slice(0, 3).map(pp).join("")}
        <details class="more">
          <summary>All 12 scans</summary>
          <div class="stack" style="padding:0 12px 12px">${rows.slice(3).map(pp).join("")}</div>
        </details>
      </div>
      <div class="stack">
        <div class="qdim">Recovery quests <span class="qp" id="qp">${t.acts.filter((_, k) => d[k]).length}/${t.acts.length}</span></div>
        ${t.acts.map((x, k) => `
          <button type="button" class="quest" role="checkbox" aria-checked="${!!d[k]}" data-q="${k}">
            <b>${d[k] ? "✓" : k + 1}</b><span>${esc(x)}</span>
          </button>`).join("")}
        <p class="tip" id="qdone" hidden>All quests done. Rest, then rescan in a few hours to see your score drop.</p>
      </div>
      <figure class="chart">
        <figcaption><span>Your last scans</span><em>green line 16 · red line 32</em></figcaption>
        <div class="chart__box" style="--h:110px"><canvas id="c-pss" role="img" aria-label="Stress score history"></canvas></div>
      </figure>
      <div class="qnav">
        <button type="button" class="link" data-act="edit">‹ Review answers</button>
        <button type="button" class="link" data-act="retake">Rescan</button>
      </div>`;
      
    countUp($("r-n"), n); 
    questDone();
    
    // Draw stress history chart
    const h = hist();
    const line = (v, c) => ({ data: h.map(() => v), borderColor: c, borderDash: [4, 4], borderWidth: 1, pointRadius: 0 });
    
    mk("c-pss", { 
      type: "line", 
      data: { 
        labels: h.map((_, i) => "#" + (i + 1)), 
        datasets: [{ data: h, borderColor: BLU, backgroundColor: BLU, tension: .3, pointRadius: 4 }, line(16, GRN), line(32, RED)] 
      }, 
      options: { scales: { y: { min: 0, max: 48 } } } 
    });
  }
  
  function questDone() { 
    const q = $$(".quest"); 
    if (q.length) {
      $("qdone").hidden = !q.every((b) => b.getAttribute("aria-checked") === "true"); 
    }
  }

  function answer(v) {
    if (busy || qi >= PSS.length) return;
    
    const was = complete(); 
    ans[qi] = v; 
    save();
    
    if (complete()) pushHist(was);
    
    const n = pssScore();
    $$(".opt").forEach((x) => x.setAttribute("aria-checked", +x.dataset.v === v));
    $$(".node")[qi].dataset.s = sev(strain(v, qi));
    
    document.querySelector(".hp i").style.width = 100 - (n / 48) * 100 + "%"; 
    document.querySelector(".hud b").textContent = n;
    
    busy = true;
    
    setTimeout(() => { 
      busy = false; 
      const nx = qi + 1; 
      qi = nx < PSS.length ? nx : complete() ? PSS.length : ans.indexOf(null); 
      drawMind(); 
    }, still ? 0 : 280);
  }

  // --- Mind check UI Interactions ---
  $("mind-box").addEventListener("click", (e) => {
    const o = e.target.closest(".opt");
    const a = e.target.closest("[data-act]");
    const j = e.target.closest(".node");
    const qs = e.target.closest(".quest");
    
    if (o) {
      answer(+o.dataset.v);
    } else if (j) { 
      qi = +j.dataset.j; 
      drawMind(); 
    } else if (qs) {
      const d = quests();
      const k = +qs.dataset.q;
      const on = qs.getAttribute("aria-checked") !== "true";
      
      d[k] = on; 
      lsSet(K("quest"), JSON.stringify({ t: tierIdx(pssScore()), d }));
      
      qs.setAttribute("aria-checked", on); 
      qs.querySelector("b").textContent = on ? "✓" : k + 1;
      $("qp").textContent = $$(".quest").filter((b) => b.getAttribute("aria-checked") === "true").length + "/" + $$(".quest").length; 
      questDone();
    } else if (a) {
      const k = a.dataset.act;
      if (k === "back") qi = Math.max(0, qi - 1);
      else if (k === "result") qi = PSS.length;
      else if (k === "edit") qi = 0;
      else if (k === "retake") { 
        ans = Array(PSS.length).fill(null); 
        qi = 0; 
        save(); 
        lsSet(K("quest"), ""); 
      }
      drawMind();
    }
  });
  
  $("crew").addEventListener("click", (e) => { 
    const b = e.target.closest(".pip"); 
    if (b) { 
      crew = +b.dataset.crew; 
      lsSet("ares1.crew", crew); 
      loadCrew(); 
      drawMind(); 
    } 
  });
  
  document.addEventListener("keydown", (e) => {
    if (act !== 1 || tab !== "mind" || qi >= PSS.length || e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (/^[1-5]$/.test(e.key)) { 
      e.stopImmediatePropagation(); 
      answer(+e.key - 1); 
    }
  }, true);
  
  window.CrewPSS = { score: () => (complete() ? pssScore() : null), crew: () => crew };
  
  loadCrew(); 
  drawMind();

  // Health Tabs (Body/Mind)
  function showTab(t) {
    tab = t;
    $$("#hl-tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
    $("hl-body").hidden = t !== "body"; 
    $("hl-mind").hidden = t !== "mind";
    
    if (C["c-ecg"]) {
      C["c-ecg"].resize();
    }
  }
  
  $("hl-tabs").addEventListener("click", (e) => { 
    const b = e.target.closest("button"); 
    if (b) showTab(b.dataset.tab); 
  });
  
  $("glance").addEventListener("click", () => showTab("mind"));

  /* ==========================================================================
     9. EMERGENCY GUIDE & SURVIVAL DICTIONARY (From Backend Data)
     ========================================================================== */
  let SC = [], DICT = [];
  const catOf = (s) => s.category || "General";

  function buildGuide() {
    const cats = [...new Set(SC.map(catOf))];
    $("hz-n").textContent = SC.length + " situations";
    $("hz-cat").innerHTML = cats.map((c) => `<option>${esc(c)}</option>`).join("");
    pickCat();
  }
  
  function pickCat() {
    const cat = $("hz-cat").value;
    $("hz-sc").innerHTML = SC.filter((s) => catOf(s) === cat)
      .map((s) => `<option value="${esc(s.id)}">${esc(clean(s.title))}</option>`).join("");
    showSc();
  }
  
  function showSc() {
    const s = SC.find((x) => x.id === $("hz-sc").value); 
    if (!s) return;
    
    const sv = String(s.severity).toLowerCase();
    const split = (t) => { 
      const m = clean(t).split(/:(.+)/); 
      return m.length > 1 ? [m[0], m[1].trim()] : [clean(t), ""]; 
    };
    
    $("hz-dos").innerHTML = `
      <div class="hz-head">
        <h3>${esc(clean(s.title).split(/[:(]/)[0])}</h3>
        <span class="badge" data-sev="${sv}">${esc(s.severity.toUpperCase())}</span>
      </div>
      <p class="readout"><b>Signs</b>${esc(s.symptoms || "--")}</p>
      <div class="steps">
        ${(s.protocol || []).map((x) => { 
          const t = split(x); 
          return `<details class="stp"><summary>${esc(t[0])}</summary>${t[1] ? `<p>${esc(t[1])}</p>` : ""}</details>`; 
        }).join("")}
      </div>`;
  }
  
  $("hz-cat").addEventListener("change", pickCat);
  $("hz-sc").addEventListener("change", showSc);

  function drawTerms() {
    const q = $("cx-q").value.trim().toLowerCase();
    const r = DICT.filter((t) => (t[0] + t[1]).toLowerCase().includes(q));
    
    $("terms").innerHTML = r.map((t) => `<details class="term"><summary>${esc(t[0])}</summary><p>${esc(t[1])}</p></details>`).join("") 
      || '<p class="hint">No match. Try another word.</p>';
      
    $("cx-n").textContent = r.length + " / " + DICT.length + " terms";
  }
  
  $("cx-q").addEventListener("input", drawTerms);

  // Initialize Backend Data
  Promise.resolve(window.MarsData ? MarsData.ready : window.MARS_DATA).then((D) => {
    if (!D) throw 0;
    SC = D.scenarios || []; 
    DICT = Object.entries(D.dictionary || {});
    buildGuide(); 
    drawTerms();
  }).catch(() => {
    ["hz-dos", "terms"].forEach((id) => {
      $(id).innerHTML = '<p class="hint">No data found. Keep mars_data.js next to this file.</p>';
    });
  });

  /* ==========================================================================
     10. CHAPTER NAVIGATION & RAIL UI
     ========================================================================== */
  const cards = $$(".card");
  const seen = new Set();
  
  const NARR = [
    ["Morning briefing", "Welcome, Commander. Pick a checkpoint below to see today’s weather there."],
    ["Medical check", "How is your body holding up? Then open “Mind check” and run the 12-scan mind check for each crew member."],
    ["Threat scan", "See what can hurt you at this checkpoint. Longer bar = more danger."],
    ["Emergency", "Something went wrong! Choose a situation and follow the steps."],
    ["Field notes", "Learn the Mars words you’ll hear on the radio. Then plan an EVA route on the globe."]
  ];
  
  $("rail").innerHTML = cards.map((c, i) => `
    <button type="button" data-go="${i}">
      <b class="n">${i + 1}</b>${c.dataset.i} ${c.dataset.t}
    </button>`).join("");

  function resizeAll() {
    Object.values(C).forEach((c) => c.resize());
    if (window.Plotly) { 
      try { Plotly.Plots.resize("mars-globe"); } 
      catch (e) {} 
    }
  }
  
  function go(i) {
    act = i; 
    seen.add(i);
    
    cards.forEach((c, n) => c.classList.toggle("on", n === i));
    $$("#rail button").forEach((b, n) => { 
      b.classList.toggle("on", n === i); 
      b.classList.toggle("done", seen.has(n) && n !== i); 
    });
    
    $("narr-ch").textContent = `Chapter ${i + 1} of ${cards.length}`;
    $("narr-t").textContent = NARR[i][0]; 
    $("narr").textContent = NARR[i][1];
    
    // Checkpoints list is only visible in the first three chapters
    $("cps").hidden = i > 2;                       
    $("bk").disabled = i === 0;
    $("nx").textContent = i === cards.length - 1 ? "✔ Finish" : "Continue ›";
    $("xp").textContent = seen.size + " / " + cards.length;
    
    cards[i].scrollTop = 0;
    setTimeout(resizeAll, 40);
  }
  
  const next = () => (act < cards.length - 1 ? go(act + 1) : (location.href = "campaign.html"));
  const back = () => { if (act > 0) go(act - 1); };
  
  $("rail").addEventListener("click", (e) => { 
    const b = e.target.closest("button"); 
    if (b) go(+b.dataset.go); 
  });
  
  $("cplist").addEventListener("click", (e) => { 
    const b = e.target.closest("button"); 
    if (b) setCP(+b.dataset.cp); 
  });
  
  $("nx").addEventListener("click", next);
  $("bk").addEventListener("click", back);
  
  document.addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") next(); 
    else if (e.key === "ArrowLeft") back();
    else if (/^[1-5]$/.test(e.key)) go(+e.key - 1);
  });

  /* ==========================================================================
     11. ENVIRONMENTAL AUDIO & CLOCK
     ========================================================================== */
  const au = $("amb");
  $("snd").addEventListener("click", () => {
    if (au.paused) { 
      au.volume = .35; 
      au.play().catch(() => {}); 
      $("snd").textContent = "🔇 Mute"; 
    } else { 
      au.pause(); 
      $("snd").textContent = "🔊 Wind"; 
    }
  });
  
  const fmt = new Intl.DateTimeFormat("en-GB", { 
    timeZone: "Asia/Kuala_Lumpur", 
    hour12: false, 
    hour: "2-digit", 
    minute: "2-digit", 
    second: "2-digit" 
  });
  
  (function tick() { 
    $("clk").textContent = "SOL-142 " + fmt.format(new Date()); 
    setTimeout(tick, 1000); 
  })();

  /* ==========================================================================
     12. WINDOW RESIZE HANDLING
     ========================================================================== */
  const gl = $("mars-globe");
  if (window.ResizeObserver && window.Plotly && gl) {
    new ResizeObserver(() => Plotly.Plots.resize(gl)).observe(gl);
  }
  addEventListener("resize", resizeAll);

  // Initialize view
  setCP(cur); 
  go(0);
  
})();