/* ==========================================================================
   CREW PSYCH STATUS WIDGET
   ==========================================================================
   This widget is fully driven by the backend's evaluator configuration 
   (D.psych), which is loaded via MarsData.
   
   The formula, input ranges, option points, thresholds, messages, and 
   recovery steps all originate from data.json (exported from app_1.py). 
   Nothing is hard-coded within this file.
   
   Public API: CrewPsych.setStress(0-100)
   ========================================================================== */

MarsData.ready.then(function (D) {
  
  // --- 1. DOM & Data Initialization ---
  const root = document.getElementById("psych-widget");
  const P = D.psych;
  
  // Abort if the container doesn't exist on this page or if data is missing
  if (!root || !P) return;
  
  const SEGMENTS = 25; // Number of visual blocks in the stress bar
  
  // Utility for escaping HTML strings to prevent XSS
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });

  // --- 2. Widget HTML Construction ---
  root.className = "psych";
  
  // Generate input fields dynamically based on the backend configuration
  const inputsHTML = P.inputs.map((i) => {
    if (i.type === "range") {
      return `
        <label>
          <span>${esc(i.label)} <b id="o-${i.id}">${i.value}</b></span>
          <input type="range" id="i-${i.id}" min="${i.min}" max="${i.max}" value="${i.value}">
        </label>
      `;
    } else {
      const optionsHTML = i.options.map((o, n) => {
        return `<option value="${n}">${esc(o.label)}</option>`;
      }).join("");
      
      return `
        <label>
          <span>${esc(i.label)}</span>
          <select id="i-${i.id}">
            ${optionsHTML}
          </select>
        </label>
      `;
    }
  }).join("");

  // Generate recovery steps list
  const recoveryHTML = P.recovery.map((r) => `<li>${esc(r)}</li>`).join("");
  
  // Assemble the full widget markup
  root.innerHTML = `
    <div class="psych__top">
      <div>
        <div class="psych__label">STRESS INDEX</div>
        <div class="psych__status" id="ps-status">—</div>
      </div>
      <div class="psych__value">
        <span id="ps-val">0</span><small>%</small>
      </div>
    </div>
    
    <div class="ecg">
      <svg viewBox="0 0 400 46" preserveAspectRatio="none">
        <path d="${ecgPath()}"/>
      </svg>
    </div>
    
    <div class="bar" id="ps-bar">
      ${"<i></i>".repeat(SEGMENTS)}
    </div>
    
    <div class="bar-scale">
      <span>0</span>
      <span>${P.midAbove}</span>
      <span>${P.highAbove}</span>
      <span>${P.max}</span>
    </div>
    
    <div class="psych__inputs">
      ${inputsHTML}
    </div>
    
    <p class="psych__advice" id="ps-advice"></p>
    
    <div class="bar-scale" style="margin-top:8px">
      <span>MENTAL HEALTH INDEX</span>
      <span id="ps-mhi">—</span>
    </div>
    
    <ol class="psych__recovery">
      ${recoveryHTML}
    </ol>
  `;

  // --- 3. Internal Element Selectors & Helpers ---
  const $ = (id) => root.querySelector("#" + id);
  const segs = [...root.querySelectorAll("#ps-bar i")];

  // Generates the SVG path for the ECG heartbeat animation
  function ecgPath() {
    const beat = (x) => `L${x},23 L${x + 15},23 L${x + 20},18 L${x + 25},23 L${x + 40},23 L${x + 45},29 L${x + 50},3 L${x + 56},40 L${x + 62},23 L${x + 85},23 L${x + 95},16 L${x + 105},23 L${x + 120},23`;
    return `M0,23 ${beat(0)} ${beat(200)} L400,23`;
  }

  // --- 4. Logic & Computation ---
  
  // Mirrors the stress_score block computation from the backend (app_1.py)
  function compute() {
    let s = P.base;
    const val = (id) => $("i-" + id);
    
    const days = +val("days").value;
    const sleep = +val("sleep").value;
    
    // Add points for days in isolation (capped at daysCapPoints)
    s += Math.min(P.daysCapPoints, Math.floor(days / P.daysPerPoint));
    
    // Add penalty points for lack of sleep
    if (sleep < P.sleepTarget) {
      s += (P.sleepTarget - sleep) * P.sleepPointsPerHour;
    }
    
    // Add points based on dropdown selections
    P.inputs.filter((i) => i.type === "select").forEach((i) => {
      s += i.options[+val(i.id).value].points;
    });
    
    // Ensure final score is clamped within bounds
    return Math.max(P.min, Math.min(P.max, s));
  }

  // --- 5. UI Rendering ---
  function render(stress) {
    // Determine threat level based on backend thresholds
    const level = stress > P.highAbove ? "high" : stress > P.midAbove ? "mid" : "low";
    root.dataset.level = level;
    
    // Split the backend message into header and detailed advice
    const [head, ...rest] = P.messages[level].split(": ");
    
    $("ps-val").textContent = stress;
    $("ps-status").textContent = head.replace(/[:!]$/, "").toUpperCase();
    $("ps-advice").textContent = rest.join(": ") || P.messages[level];
    $("ps-mhi").textContent = `${100 - stress} / 100`;
    
    // Adjust ECG animation speed based on stress level
    root.style.setProperty("--ecg-speed", (2.8 - stress * 0.02).toFixed(2) + "s");
    
    // Light up the segmented stress bar
    const lit = Math.round((stress / P.max) * SEGMENTS);
    segs.forEach((el, i) => {
      const v = ((i + 1) / SEGMENTS) * P.max;
      
      // Determine segment color based on its threshold position
      const color = v > P.highAbove ? "#ff3b57" : v > P.midAbove ? "#ffb02e" : "#39ff88";
      el.style.setProperty("--seg", color);
      el.classList.toggle("on", i < lit);
    });
  }

  function update() {
    // Sync the displayed numeric values next to the range sliders
    P.inputs.filter((i) => i.type === "range").forEach((i) => {
      $("o-" + i.id).textContent = $("i-" + i.id).value;
    });
    
    // Compute and render the new stress score
    render(compute());
  }
  
  // Attach change listeners to all dynamic inputs
  root.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", update);
  });
  
  // Initial render
  update();
  
  // --- 6. Public API ---
  window.CrewPsych = { 
    setStress: (n) => {
      render(Math.max(P.min, Math.min(P.max, Math.round(n))));
    }
  };
  
});