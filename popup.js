console.log('[POPUP] Script loaded');

document.addEventListener('DOMContentLoaded', function() {
  // Get elements
  const word1Input = document.getElementById('word1');
  const word2Input = document.getElementById('word2');
  const gapInput = document.getElementById('gap');
  const searchBtn = document.getElementById('searchBtn');
  const cleanBtn = document.getElementById('cleanBtn');
  const matchCountDiv = document.getElementById('matchCount');
  const gapBtns = document.querySelectorAll('.gap-btn');
  
  // Focus first input on popup open
  word1Input.focus();
  
  // Gap increment/decrement buttons
  gapBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      const currentValue = parseInt(gapInput.value) || 0;
      
      if (action === 'increase') {
        gapInput.value = currentValue + 1;
      } else if (action === 'decrease') {
        gapInput.value = Math.max(0, currentValue - 1);
      }
    });
  });
  
  // Search button click handler
  searchBtn.addEventListener('click', () => {
    console.log('[POPUP] Search button clicked');
    
    const word1 = word1Input.value.trim();
    const word2 = word2Input.value.trim();
    const gap = parseInt(gapInput.value, 10);

    // Validate inputs
    if (!word1) {
      showError('Please enter the first word');
      word1Input.focus();
      return;
    }
    
    if (!word2) {
      showError('Please enter the second word');
      word2Input.focus();
      return;
    }
    
    if (isNaN(gap) || gap < 0) {
      showError('Gap must be a positive number');
      gapInput.focus();
      return;
    }

    console.log('[POPUP] Search parameters:', { word1, word2, gap });

    // Update status to show searching state while maintaining total matches format
    matchCountDiv.className = 'results searching';
    matchCountDiv.textContent = 'Total matches: 0';
    console.log('[POPUP] Updated status to searching state');

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      console.log('[POPUP] Found active tab:', tab);
      
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: runSearch,
        args: [word1, word2, gap],
      }).then(() => {
        console.log('[POPUP] Search script injected successfully');
      }).catch((error) => {
        console.error('[POPUP] Error injecting search script:', error);
        showError('Could not execute search');
      });
    });
  });

  // Clean button click handler
  cleanBtn.addEventListener('click', () => {
    console.log('[POPUP] Clean button clicked');
    
    matchCountDiv.className = 'results';
    matchCountDiv.textContent = 'Total matches: 0';
    
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      console.log('[POPUP] Found active tab for cleaning:', tab);
      
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: cleanHighlights,
      }).then(() => {
        console.log('[POPUP] Clean script injected successfully');
      }).catch((error) => {
        console.error('[POPUP] Error injecting clean script:', error);
        showError('Could not clean highlights');
      });
    });
  });

  // Listen for Enter key on inputs
  [word1Input, word2Input, gapInput].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        searchBtn.click();
      }
    });
  });

  // Function to show error message
  function showError(message) {
    matchCountDiv.className = 'results error';
    matchCountDiv.textContent = 'Error: ' + message;
  }

  // Listen for match count messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[POPUP] Received message:', message);
    
    if (message.type === 'MATCH_COUNT') {
      const count = message.count;
      matchCountDiv.className = count > 0 ? 'results success' : 'results';
      matchCountDiv.textContent = `Total matches: ${count}`;
      console.log('[POPUP] Updated match count display to:', count);
    }
  });
});

// Function to run the search on the page
function runSearch(word1, word2, gap) {
  console.log('[PAGE] Running search with parameters:', { word1, word2, gap });
  window.postMessage({ 
    type: "RUN_SEARCH", 
    detail: { word1, word2, gap }
  }, "*");
}

// Function to clean highlights
function cleanHighlights() {
  console.log('[PAGE] Cleaning highlights');
  
  // Remove all highlights
  document.querySelectorAll(".wasm-search-highlight").forEach(span => {
    const text = document.createTextNode(span.textContent);
    span.replaceWith(text);
  });
  
  // Send match count update
  try {
    chrome.runtime.sendMessage({
      type: 'MATCH_COUNT',
      count: 0
    });
    console.log('[PAGE] Sent zero match count to background after cleaning');
  } catch (error) {
    console.error('[PAGE] Failed to send match count to background:', error);
  }
}
