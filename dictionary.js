/* ==========================================================================
   MARS FIELD SURVIVAL DICTIONARY
   ==========================================================================
   Renders the D.dictionary object (loaded from the Python backend) 
   into an interactive accordion list with live search functionality.
   ========================================================================== */

MarsData.ready.then(function (D) {
  
  // --- 1. DOM Elements & State Initialization ---
  const list = document.getElementById("dict-list");
  const searchInput = document.getElementById("dict-search");
  
  // Abort execution if the dictionary container is not present on the current page
  if (!list) return;
  
  // Convert the dictionary object into an array of [term, definition] pairs
  const entries = Object.entries(D.dictionary);
  
  // --- 2. Render & Filter Logic ---
  function draw() {
    // Get the current search query, normalized to lowercase
    const query = searchInput.value.trim().toLowerCase();
    
    // Clear the current list
    list.innerHTML = "";
    
    // Filter entries: check if the query is in the term (key) OR the definition (value)
    const filteredEntries = entries.filter(([term, definition]) => {
      return term.toLowerCase().includes(query) || definition.toLowerCase().includes(query);
    });
    
    // Build and append HTML elements for each matching entry
    filteredEntries.forEach(([term, definition]) => {
      const detailsEl = document.createElement("details");
      const summaryEl = document.createElement("summary");
      const descEl = document.createElement("p");
      
      summaryEl.textContent = term;
      descEl.textContent = definition;
      
      detailsEl.append(summaryEl, descEl);
      list.appendChild(detailsEl);
    });
    
    // Display a fallback message if no entries match the search query
    if (list.children.length === 0) {
      list.textContent = "No matching terms.";
    }
  }
  
  // --- 3. Setup Listeners & Initial Render ---
  
  // Display the total number of dictionary terms available
  const totalDisplay = document.getElementById("dict-total");
  if (totalDisplay) {
    totalDisplay.textContent = `${entries.length} TERMS`;
  }
  
  // Attach the live search event listener to the input field
  if (searchInput) {
    searchInput.addEventListener("input", draw);
  }
  
  // Trigger the initial render to populate the full list on page load
  draw();
  
});