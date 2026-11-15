/* ==========================================================================
   MARS 3D GLOBE (Plotly Scattergeo Orthographic Projection)
   ==========================================================================
   Data Source: window.MARS_DATA.landmarks [{name, lat, lon, ...}]
   
   Dependencies: 
   - <div id="mars-globe"></div>
   - (Optional) <div id="globe-controls"></div> (Auto-generated if missing)
   
   Public API: 
   - window.updateEVARoute(startLat, startLon, destLat, destLon)
   - window.flyToCoordinate(lat, lon, scale)
   - window.MarsGlobe.setMission(traces)
   ========================================================================== */

(function () {
  "use strict";

  // --- 1. Utilities & Data Initialization ---
  // The backend uses 0-360°E, but Plotly requires -180 to 180°
  const normLon = (lon) => ((((+lon + 180) % 360) + 360) % 360) - 180;
  const clampLat = (lat) => Math.max(-90, Math.min(90, +lat));

  const gd = document.getElementById("mars-globe");
  
  if (!gd || typeof Plotly === "undefined") {
    return;
  }

  const data = window.MARS_DATA;
  
  // Filter out landmarks with invalid coordinates
  const landmarks = ((data && data.landmarks) || []).filter((l) => {
    return l && isFinite(l.lat) && isFinite(l.lon);
  });

  /* ==========================================================================
     2. PLOTLY TRACES (Data Layers)
     ========================================================================== */
     
  // Trace 1: Major Landmarks
  const landmarkTrace = {
    type: "scattergeo",
    name: "Major Landmarks",
    mode: "markers+text",
    lat: landmarks.map((l) => l.lat),
    lon: landmarks.map((l) => normLon(l.lon)),
    text: landmarks.map((l) => l.name),
    textposition: "top center",
    textfont: { 
      color: "#00ffcc", 
      size: 10 
    },
    marker: { 
      size: 9, 
      color: "#00ffcc", 
      symbol: "diamond", 
      line: { width: 1, color: "white" } 
    },
    hovertemplate: "<b>%{text}</b><br>%{lat:.1f}°, %{lon:.1f}°<extra></extra>",
  };

  // Trace 2: EVA Route (Dynamically Generated)
  function routeTrace(sLat, sLon, dLat, dLon) {
    return {
      type: "scattergeo",
      name: "EVA Route",
      mode: "lines+markers+text",
      lat: [sLat, dLat],
      lon: [normLon(sLon), normLon(dLon)],
      text: ["START", "DEST"],
      textposition: "top center",
      textfont: { 
        color: "#ff4b4b", 
        size: 11 
      },
      line: { 
        width: 3, 
        color: "#ff4b4b", 
        dash: "dash" 
      },
      marker: { 
        size: 11, 
        color: "#ff4b4b" 
      },
      hovertemplate: "<b>%{text}</b><br>%{lat:.1f}°, %{lon:.1f}°<extra></extra>",
    };
  }

  /* ==========================================================================
     3. GLOBE LAYOUT & CONFIGURATION
     ========================================================================== */
  function buildLayout(rotLon, rotLat) {
    const axis = { 
      showgrid: true, 
      gridcolor: "rgba(0, 212, 255, 0.2)", 
      dtick: 30 
    };
    
    return {
      paper_bgcolor: "rgba(0,0,0,0)", 
      font: { color: "#e0f7fa" },
      margin: { l: 0, r: 0, t: 0, b: 0 }, // Zero margins to allow the globe to fill the container
      showlegend: false,
      geo: {
        projection: { 
          type: "orthographic", 
          rotation: { lon: rotLon, lat: rotLat, roll: 0 },
          scale: zoomScale
        },
        showland: false,
        showcountries: false,
        showcoastlines: false,
        showocean: true,
        oceancolor: "#1a0d0a",
        lataxis: axis,
        lonaxis: axis,
        bgcolor: "rgba(0,0,0,0)",
      },
    };
  }

  const config = { 
    responsive: true, 
    displayModeBar: false 
  };

  /* ==========================================================================
     4. STATE MANAGEMENT & ANIMATION
     ========================================================================== */
  let cur = { lon: 0, lat: 0 }; // Current globe perspective
  let anim = null;
  let extra = [];
  let zoomScale = 0.92;
  let lastRoute = null;
  
  // Flag indicating if controls should be hidden (used by orbital_maps.html)
  const missionOnly = !!window.MARS_GLOBE_NO_CONTROLS;   
  
  // Aggregate all active traces
  const allTraces = () => {
    const traces = missionOnly || !lastRoute 
      ? [landmarkTrace] 
      : [landmarkTrace, routeTrace(...lastRoute)];
      
    return traces.concat(extra);
  };

  // Smoothly rotate the globe to a target perspective (taking the shortest longitude path)
  function rotateTo(lon, lat) {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(anim);
    
    const from = { ...cur };
    let dLon = lon - from.lon;
    
    // Calculate shortest path for rotation
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    
    const dLat = lat - from.lat;
    cur = { lon, lat };
    
    if (reduce) {
      Plotly.relayout(gd, { 
        "geo.projection.rotation.lon": lon, 
        "geo.projection.rotation.lat": lat 
      });
      return;
    }
    
    const t0 = performance.now();
    const dur = 900;
    
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3); // easeOutCubic easing function
      
      Plotly.relayout(gd, {
        "geo.projection.rotation.lon": from.lon + dLon * e,
        "geo.projection.rotation.lat": from.lat + dLat * e,
      });
      
      if (k < 1) {
        anim = requestAnimationFrame(step);
      }
    })(t0);
  }

  /* ==========================================================================
     5. PUBLIC API: UPDATE ROUTE
     ========================================================================== */
  function updateEVARoute(startLat, startLon, destLat, destLon) {
    const sLat = clampLat(startLat);
    const dLat = clampLat(destLat);
    
    // Ensure all coordinates are valid numbers
    if (![sLat, +startLon, dLat, +destLon].every(isFinite)) {
      return;
    }
    
    // Update Trace 2 coordinates while keeping Trace 1 intact
    lastRoute = [sLat, startLon, dLat, destLon];
    
    Plotly.react(gd, allTraces(), buildLayout(cur.lon, cur.lat), config)
      .then(() => rotateTo(normLon(startLon), sLat)); // Rotate perspective to the new starting point
  }
  
  window.updateEVARoute = updateEVARoute;

  /* ==========================================================================
     6. UI CONTROLS (Input Fields & Dropdowns)
     ========================================================================== */
  function buildControls() {
    let box = document.getElementById("globe-controls");
    
    if (!box) {
      box = document.createElement("div");
      box.id = "globe-controls";
      gd.parentNode.insertBefore(box, gd);
    }
    
    // Generate dropdown options from landmarks
    const opts = landmarks.map((l, i) => {
      return `<option value="${i}">${String(l.name).replace(/[&<>"]/g, "")}</option>`;
    }).join("");
    
    const css = "display:grid;grid-template-columns:auto 1fr 1fr 1fr;gap:6px;align-items:center;font:12px 'Share Tech Mono',monospace;color:#e0f7fa;margin-bottom:8px";
    const inp = "width:100%;background:#0b0f19;color:#e0f7fa;border:1px solid rgba(0,212,255,.35);padding:3px 5px;font:inherit;box-sizing:border-box";
    
    const row = (p, label) => `
      <b>${label}</b>
      <select id="${p}-sel" style="${inp}">
        <option value="">Custom</option>
        ${opts}
      </select>
      <input id="${p}-lat" type="number" step="0.1" min="-90" max="90" placeholder="Lat" style="${inp}">
      <input id="${p}-lon" type="number" step="0.1" placeholder="Lon" style="${inp}">
    `;
    
    box.innerHTML = `<div style="${css}">${row("eva-s", "START")}${row("eva-d", "DEST")}</div>`;

    const $ = (id) => document.getElementById(id);
    const read = () => [$("eva-s-lat").value, $("eva-s-lon").value, $("eva-d-lat").value, $("eva-d-lon").value];
    
    const fire = () => {
      const v = read();
      if (v.every((x) => x !== "")) {
        updateEVARoute(+v[0], +v[1], +v[2], +v[3]);
      }
    };
    
    // Bind Event Listeners
    ["eva-s", "eva-d"].forEach((p) => {
      $(p + "-sel").addEventListener("change", (e) => {
        const l = landmarks[e.target.value];
        if (!l) return;
        
        $(p + "-lat").value = l.lat;
        $(p + "-lon").value = Math.round(normLon(l.lon) * 100) / 100;
        fire();
      });
      
      $(p + "-lat").addEventListener("change", fire);
      $(p + "-lon").addEventListener("change", fire);
    });

    // Default to first two landmarks as Start and Destination if available
    if (landmarks.length >= 2) {
      $("eva-s-sel").value = 0; 
      $("eva-d-sel").value = 1;
      $("eva-s-sel").dispatchEvent(new Event("change"));
      $("eva-d-sel").dispatchEvent(new Event("change"));
    }
  }

  /* ==========================================================================
     7. INITIALIZATION & RENDERING
     ========================================================================== */
  const s0 = landmarks[0] || { lat: 0, lon: 0 };
  const d0 = landmarks[1] || s0;
  
  cur = { lon: normLon(s0.lon), lat: clampLat(s0.lat) };
  lastRoute = [s0.lat, s0.lon, d0.lat, d0.lon];
  
  Plotly.newPlot(gd, allTraces(), buildLayout(cur.lon, cur.lat), config);
  
  if (!missionOnly) {
    buildControls();
  }
  
  window.addEventListener("resize", () => Plotly.Plots.resize(gd));

  /* ==========================================================================
     8. PUBLIC API: CINEMATIC FLY-TO
     ==========================================================================
     Used by orbital_maps.html for custom mission overlays.
     ========================================================================== */
  function flyTo(lat, lon, scale) {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(anim);
    
    const f = { ...cur };
    const la = clampLat(lat);
    const lo = normLon(lon);
    const s0 = zoomScale;
    const s1 = scale || zoomScale;
    
    let dLon = lo - f.lon; 
    
    // Shortest path calculation
    if (dLon > 180) dLon -= 360; 
    if (dLon < -180) dLon += 360;
    
    const t0 = performance.now();
    const dur = reduce ? 0 : 1400;
    
    (function step(now) {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
      
      zoomScale = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * e);
      cur = { 
        lon: f.lon + dLon * e, 
        lat: f.lat + (la - f.lat) * e 
      };
      
      Plotly.relayout(gd, { 
        "geo.projection.rotation.lon": cur.lon, 
        "geo.projection.rotation.lat": cur.lat, 
        "geo.projection.scale": zoomScale 
      });
      
      if (k < 1) {
        anim = requestAnimationFrame(step);
      }
    })(t0);
  }
  
  window.flyToCoordinate = flyTo;
  
  window.MarsGlobe = { 
    flyTo, 
    setMission(traces) { 
      extra = traces || []; 
      Plotly.react(gd, allTraces(), buildLayout(cur.lon, cur.lat), config); 
    } 
  };
  
})();