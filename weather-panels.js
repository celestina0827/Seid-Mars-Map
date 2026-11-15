/* ==========================================================================
   WEATHER PANELS SCRIPT (weather-panels.js)
   ==========================================================================
   Handles three key interactive components:
   1. Scenario Selector & Dossier (Target Dossier)
   2. Survival Dictionary (Searchable Glossary)
   3. Crew Psychological & Stress Evaluator (Q4 Evaluator)
   
   Data Source: window.MARS_DATA { scenarios[], dictionary{}, psych{} }
   Fallback: MarsData.ready (Promise)
   
   Security Note: All text is injected via textContent to prevent XSS.
   ========================================================================== */

(function () {
  
  // --- Core Utilities ---
  const $ = (id) => document.getElementById(id);
  
  const el = (tag, cls, txt) => { 
    const e = document.createElement(tag); 
    if (cls) e.className = cls; 
    if (txt != null) e.textContent = txt; 
    return e; 
  };
  
  // Removes numerical list prefixes (e.g., "1. " or "1) ")
  const clean = (t) => String(t).replace(/^\d+[.)]\s*/, "");
  
  // Formats latitude and longitude for display
  const fmt = (lat, lon) => { 
    const l = lon > 180 ? lon - 360 : lon; 
    return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(l).toFixed(1)}°${l >= 0 ? "E" : "W"}`; 
  };

  // --- Initialization Hook ---
  Promise.resolve(window.MARS_DATA || (window.MarsData && MarsData.ready))
    .then((D) => {
      if (!D) return;
      initOps(D.scenarios || []);
      initDict(D.dictionary || {});
      initPsych(D.psych);
    })
    .catch(console.error);

  /* ==========================================================================
     1. SCENARIO SELECTOR & TARGET DOSSIER
     ========================================================================== */
  function initOps(all) {
    if (!$("ops-cats") || !all.length) return;
    
    const catOf = (s) => s.category || (s.scope === "map" ? "Surface Locations" : "General");
    const cats = [...new Set(all.map(catOf))];
    
    let cat = cats[0];
    let cur = null;
    
    $("ops-total").textContent = `${all.length} SCENARIOS`;

    // Render the category filter chips
    function drawCats() {
      const box = $("ops-cats"); 
      box.textContent = "";
      
      cats.forEach((c) => {
        const b = el("button", "chip" + (c === cat ? " is-active" : ""), c); 
        b.type = "button";
        b.setAttribute("aria-pressed", c === cat);
        
        // Append count of scenarios in this category
        b.append(el("em", null, all.filter((s) => catOf(s) === c).length));
        
        b.addEventListener("click", () => { 
          cat = c; 
          drawCats(); 
          drawSelect(); 
        });
        
        box.appendChild(b);
      });
    }

    // Render the dropdown selector based on the active category
    function drawSelect(keepId) {
      const sel = $("ops-select");
      const list = all.filter((s) => catOf(s) === cat);
      sel.textContent = "";
      
      list.forEach((s) => { 
        const o = el("option", null, clean(s.title)); 
        o.value = s.id; 
        sel.appendChild(o); 
      });
      
      const pick = list.find((s) => s.id === keepId) || list[0];
      sel.value = pick.id; 
      show(pick);
    }

    // Populate the dossier panel with scenario details
    function show(s) {
      cur = s;
      const sev = String(s.severity || "").toLowerCase();
      
      $("ops-title").textContent = clean(s.title);
      $("ops-sector").textContent = s.sector || "--";
      
      const badge = $("ops-sev"); 
      badge.textContent = sev.toUpperCase(); 
      badge.dataset.sev = sev;
      
      $("ops-symptoms").textContent = s.symptoms || "--";
      
      const ol = $("ops-protocol"); 
      ol.textContent = "";
      (s.protocol || []).forEach((p) => {
        ol.appendChild(el("li", null, clean(p)));
      });

      const st = $("ops-status"); 
      st.dataset.sev = sev; 
      st.textContent = "";
      
      // Format coordinate location string
      let where = s.lat == null 
        ? "Base operation · no map coordinates" 
        : fmt(s.lat, s.lon) + (s.scope === "base" ? " · base operation (not pinned)" : "");
        
      if (s.coordCheck) {
        where += ` · coord check: USGS "${s.coordCheck.feature}" at ${fmt(s.coordCheck.lat, s.coordCheck.lon)}`;
      }
      
      st.append(el("b", null, sev.toUpperCase()), el("span", null, where));

      // Trigger CSS flash animation
      const d = $("ops-dossier"); 
      d.classList.remove("flash"); 
      void d.offsetWidth; // Force DOM reflow
      d.classList.add("flash");
    }

    $("ops-select").addEventListener("change", (e) => {
      show(all.find((s) => String(s.id) === e.target.value));
    });
    
    // Public API to externally focus a specific dossier item
    window.OpsDossier = { 
      focus: (id) => { 
        const s = all.find((x) => x.id === id); 
        if (s) { 
          cat = catOf(s); 
          drawCats(); 
          drawSelect(id); 
        } 
      } 
    };
    
    drawCats(); 
    drawSelect();
  }

  /* ==========================================================================
     2. SURVIVAL DICTIONARY (Searchable Glossary)
     ========================================================================== */
  function initDict(dict) {
    const list = $("dict-list");
    const q = $("dict-search");
    
    if (!list) return;
    
    const rows = Object.entries(dict).map(([k, v]) => {
      const d = document.createElement("details");
      d.append(el("summary", null, k), el("p", null, v));
      list.appendChild(d);
      
      return { 
        d, 
        hay: (k + " " + v).toLowerCase() 
      };
    });
    
    $("dict-total").textContent = `${rows.length} TERMS`;
    
    function filter() {
      const t = q.value.trim().toLowerCase();
      let n = 0;
      
      rows.forEach((r) => { 
        const ok = !t || r.hay.includes(t); 
        r.d.hidden = !ok; 
        if (ok) n++; 
      });
      
      $("dict-empty").hidden = n > 0;
    }
    
    q.addEventListener("input", filter);
    filter();
  }

  /* ==========================================================================
     3. CREW PSYCHOLOGICAL & STRESS EVALUATOR
     ==========================================================================
     Configured purely via the backend data object (D.psych).
     Generates inputs, layout, and logic dynamically.
     ========================================================================== */
  function initPsych(P) {
    const root = $("psych-widget");
    if (!root) return;
    
    if (!P) { 
      root.appendChild(el("p", "empty", "No psych config in backend data.")); 
      return; 
    }
    
    const N = 25; // Visual segment count
    const svgNS = "http://www.w3.org/2000/svg";

    // --- 3.1 Construct Widget Header ---
    const top = el("div", "psy__top");
    const left = el("div");
    const val = el("div", "psy__value");
    
    left.append(el("div", "label", "Stress index"), el("div", "psy__status")); 
    left.lastChild.id = "ps-status";
    
    val.append(el("span", null, "0"), el("small", null, "%")); 
    val.firstChild.id = "ps-val";
    top.append(left, val);

    // --- 3.2 Construct ECG Heartbeat Monitor ---
    const ecg = el("div", "ecg");
    const svg = document.createElementNS(svgNS, "svg");
    const path = document.createElementNS(svgNS, "path");
    
    const beat = (x) => `L${x},23 L${x+15},23 L${x+20},18 L${x+25},23 L${x+40},23 L${x+45},29 L${x+50},3 L${x+56},40 L${x+62},23 L${x+85},23 L${x+95},16 L${x+105},23 L${x+120},23`;
    
    svg.setAttribute("viewBox", "0 0 400 46"); 
    svg.setAttribute("preserveAspectRatio", "none");
    path.setAttribute("d", `M0,23 ${beat(0)} ${beat(200)} L400,23`); 
    
    svg.appendChild(path); 
    ecg.appendChild(svg);

    // --- 3.3 Construct Stress Segment Bar ---
    const bar = el("div", "psy__bar"); 
    for (let i = 0; i < N; i++) {
      bar.appendChild(document.createElement("i"));
    }
    
    const scale = el("div", "psy__scale"); 
    [0, P.midAbove, P.highAbove, P.max].forEach((n) => {
      scale.appendChild(el("span", null, n));
    });

    // --- 3.4 Construct Inputs Form dynamically from D.psych.inputs ---
    const form = el("div", "psy__inputs");
    const ctl = {};
    const out = {};
    
    P.inputs.forEach((i) => {
      const lab = el("label");
      const span = el("span", null, i.label);
      
      if (i.type === "range") {
        out[i.id] = el("b", null, i.value); 
        span.append(out[i.id]);
        
        const r = document.createElement("input"); 
        r.type = "range"; 
        r.min = i.min; 
        r.max = i.max; 
        r.value = i.value;
        
        ctl[i.id] = r; 
        lab.append(span, r);
      } else {
        const s = el("select", "field"); 
        i.options.forEach((o, n) => { 
          const op = el("option", null, o.label); 
          op.value = n; 
          s.appendChild(op); 
        });
        
        ctl[i.id] = s; 
        lab.append(span, s);
      }
      form.appendChild(lab);
    });

    // --- 3.5 Construct Footer (Advice & Recovery) ---
    const advice = el("p", "psy__advice");
    const mhi = el("div", "psy__scale");
    const mhiV = el("span", null, "--");
    mhi.append(el("span", null, "Mental health index"), mhiV);
    
    const rec = el("ol", "psy__recovery"); 
    P.recovery.forEach((r) => rec.appendChild(el("li", null, r)));
    
    root.append(top, ecg, bar, scale, form, advice, mhi, rec);

    // Node References
    const segs = [...bar.children];
    const status = $("ps-status");
    const num = $("ps-val");

    // --- 3.6 Evaluation Logic ---
    function compute() {
      // Mirrors backend's `stress_score` block formula
      let s = P.base;
      
      // Calculate Days in Isolation Points
      s += Math.min(P.daysCapPoints, Math.floor(+ctl.days.value / P.daysPerPoint));
      
      // Calculate Sleep Deficit Penalty
      if (+ctl.sleep.value < P.sleepTarget) {
        s += (P.sleepTarget - +ctl.sleep.value) * P.sleepPointsPerHour;
      }
      
      // Add Dropdown Select Points
      P.inputs.filter((i) => i.type === "select").forEach((i) => { 
        s += i.options[+ctl[i.id].value].points; 
      });
      
      return Math.max(P.min, Math.min(P.max, s));
    }

    // --- 3.7 UI State Renderer ---
    function render(stress) {
      const level = stress > P.highAbove ? "high" : stress > P.midAbove ? "mid" : "low";
      root.dataset.level = level;
      
      const [head, ...rest] = P.messages[level].split(": ");
      
      num.textContent = stress;
      status.textContent = head.replace(/[:!]$/, "").toUpperCase();
      advice.textContent = rest.join(": ") || P.messages[level];
      mhiV.textContent = `${100 - stress} / 100`;
      
      // Adjust ECG pulse speed relative to stress
      root.style.setProperty("--ecg-speed", (2.8 - stress * 0.02).toFixed(2) + "s");
      
      const lit = Math.round((stress / P.max) * N);
      
      segs.forEach((s, i) => {
        const v = ((i + 1) / N) * P.max;
        s.style.setProperty("--seg", v > P.highAbove ? "var(--red)" : v > P.midAbove ? "var(--amber)" : "var(--green)");
        s.classList.toggle("on", i < lit);
      });
    }

    function update() {
      P.inputs.filter((i) => i.type === "range").forEach((i) => {
        out[i.id].textContent = ctl[i.id].value;
      });
      render(compute());
    }
    
    Object.values(ctl).forEach((c) => c.addEventListener("input", update));
    update();
    
    window.CrewPsych = { 
      setStress: (n) => render(Math.max(P.min, Math.min(P.max, Math.round(n)))) 
    };
  }
})();

/* ==========================================================================
   4. GLOBE RESPONSIVENESS LISTENER
   ==========================================================================
   Keeps the Plotly globe sized to its container, which uses modern container 
   queries resulting in flexible bounds.
   ========================================================================== */
(function () {
  const g = document.getElementById("mars-globe");
  if (g && window.ResizeObserver && window.Plotly) {
    new ResizeObserver(() => Plotly.Plots.resize(g)).observe(g);
  }
})();