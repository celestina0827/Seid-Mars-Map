/* ==========================================================================
   DATA LAYER: Python Backend Interface
   ==========================================================================
   The front-end acts strictly as a display layer for the Python backend.
   Source of truth = data.json / mars_data.js
   
   MarsData.ready resolves with the complete dataset:
   { scenarios[], dictionary{}, landmarks[], psych{}, weather|null, meta{} }
   
   Loading Strategy:
   1) Served via HTTP(S): Fetches data.json fresh on every load.
   2) Opened via local disk: fetch() is blocked, falls back to window.MARS_DATA.
   ========================================================================== */

(function () {
  const URL = "data.json";
  
  window.MarsData = {
    ready: (async function () {
      try {
        // fetch() is blocked on file:// protocols, so we force an error if opened locally
        if (location.protocol === "file:") {
          throw new Error("opened from disk"); 
        }
        
        // Attempt to fetch fresh data from the backend, bypassing the cache
        const r = await fetch(URL, { cache: "no-store" });
        
        if (!r.ok) {
          throw new Error(r.status);
        }
        
        return await r.json();
        
      } catch (e) {
        // Fallback: Use the statically generated JS variable if fetch fails or is blocked
        if (window.MARS_DATA) {
          return window.MARS_DATA;
        }
        
        throw new Error("No data found. Run: python export_data.py");
      }
    })(),
  };
  
  // Global error handler for data initialization failures
  MarsData.ready.catch((err) => {
    const el = document.getElementById("dash-empty");
    
    if (el) {
      el.innerHTML = "<b>NO DATA:</b> " + err.message;
    }
    
    console.error("MarsData Initialization Error:", err);
  });
  
})();