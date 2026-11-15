/* ==========================================================================
   RANDOM EMERGENCY EVENT SYSTEM
   ==========================================================================
   Dependencies: data-layer.js (backend dataset), map.js (window.MarsApp)
   Required HTML Elements: #scan-btn, #alert-overlay, #alert-text, 
                           #alert-sev, #alert-init
   ========================================================================== */

MarsData.ready.then(function (D) {
  
  // --- 1. DOM Elements & State Initialization ---
  const btn = document.getElementById("scan-btn");
  const overlay = document.getElementById("alert-overlay");
  
  // Abort execution if required elements are missing from the DOM
  if (!btn || !overlay) return;

  // Utility function to remove numbered list prefixes (e.g., "1. ") from strings
  const clean = (t) => t.replace(/^\d+\.\s*/, "");
  
  // Filter the dataset to include only high-severity events
  const pool = D.scenarios.filter((s) => {
    return s.severity === "Critical" || s.severity === "Warning";
  });
  
  let current = null;
  let last = null;
  let busy = false;
  let opener = null;

  // --- 2. Random Scenario Selection Logic ---
  function pick() {
    let s;
    
    // Pick a random scenario. The loop ensures we don't pick the exact same 
    // scenario twice in a row, provided there is more than one option available.
    do { 
      s = pool[Math.floor(Math.random() * pool.length)]; 
    } while (pool.length > 1 && s === last); 
    
    last = s;
    return last;
  }

  // --- 3. Scanning Animation & Trigger ---
  btn.addEventListener("click", () => {
    // Prevent triggering a new scan while one is already in progress
    if (busy) return;
    
    busy = true;
    btn.classList.add("is-scanning");
    
    const label = btn.querySelector(".scan__label");
    const idle = label.textContent;
    const steps = ["SCANNING SECTORS...", "ANALYSING TELEMETRY...", "ANOMALY DETECTED"];
    let i = 0;
    
    label.textContent = steps[0];
    
    // Cycle through the scanning text sequence
    const t = setInterval(() => {
      label.textContent = steps[++i] || steps[steps.length - 1];
      
      // Once the animation steps are complete, clear the interval and show the alert
      if (i >= steps.length - 1) {
        clearInterval(t);
        
        setTimeout(() => { 
          label.textContent = idle; 
          btn.classList.remove("is-scanning"); 
          busy = false; 
          show(pick()); 
        }, 350);
      }
    }, 550);
  });

  // --- 4. Alert Modal Control (Show/Close) ---
  function show(s) {
    current = s;
    opener = document.activeElement; // Save the currently focused element for accessibility restoration
    
    // Use textContent (instead of innerHTML) to prevent XSS injection from external data
    const alertText = document.getElementById("alert-text");
    alertText.textContent = `🚨 RANDOM EVENT TRIGGERED: ${clean(s.title)} in ${s.sector}!`;
    
    const sev = document.getElementById("alert-sev");
    sev.textContent = s.severity.toUpperCase();
    sev.className = "badge badge--" + s.severity.toLowerCase();
    
    overlay.hidden = false;
    document.body.classList.add("alarm-on");
    
    // Shift focus to the modal's primary action button
    document.getElementById("alert-init").focus();
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove("alarm-on");
    
    // Restore focus to the element that originally triggered the modal
    if (opener && opener.focus) {
      opener.focus();
    }
  }

  // --- 5. Protocol Initialization & Accessibility ---
  
  // INITIALIZE PROTOCOL: Close the modal and load the response guide in the dashboard
  document.getElementById("alert-init").addEventListener("click", () => {
    const s = current;
    close();
    
    // Interface with map.js / MarsApp logic if available
    if (s && window.MarsApp) {
      window.MarsApp.focus(s.id);
    }
  });

  // Keyboard navigation for the modal
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    
    // Allow users to dismiss the alert with the Escape key
    if (e.key === "Escape") {
      close();
    }
    
    // Trap focus inside the dialog (since it only has one interactive button)
    if (e.key === "Tab") { 
      e.preventDefault(); 
      document.getElementById("alert-init").focus(); 
    }
  });
  
});