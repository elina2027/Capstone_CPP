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
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
  // Focus first input on popup open
  word1Input.focus();
  
  // Navigation button state
  let currentMatchIndex = -1;
  let totalMatches = 0;
  
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
  
  // Navigation buttons click handlers
  prevBtn.addEventListener('click', () => {
    console.log('[POPUP] Previous match button clicked');
    navigateMatches('prev');
  });
  
  nextBtn.addEventListener('click', () => {
    console.log('[POPUP] Next match button clicked');
    navigateMatches('next');
  });
  
  // Function to navigate between matches
  function navigateMatches(direction) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      console.log('[POPUP] Sending navigation command:', direction);
      
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: navigateMatchesInPage,
        args: [direction],
      }).catch((error) => {
        console.error('[POPUP] Error injecting navigation script:', error);
      });
    });
  }
  
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
    
    // Disable navigation buttons during search
    updateNavigationButtons(0, -1);

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
    
    // Disable navigation buttons
    updateNavigationButtons(0, -1);
    
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
    updateNavigationButtons(0, -1);
  }
  
  // Function to update navigation buttons state
  function updateNavigationButtons(total, current) {
    totalMatches = total;
    currentMatchIndex = current;
    
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current < 0 || current >= total - 1;
    
    // Update button text with current position
    if (total > 0 && current >= 0) {
      prevBtn.innerHTML = '&uarr;';
      nextBtn.innerHTML = '&darr;';
    } else {
      prevBtn.innerHTML = '&uarr;';
      nextBtn.innerHTML = '&darr;';
    }
    
    console.log('[POPUP] Updated navigation buttons:', {
      total,
      current,
      prevEnabled: !prevBtn.disabled,
      nextEnabled: !nextBtn.disabled
    });
  }

  // Listen for match count messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[POPUP] Received message:', message);
    
    if (message.type === 'MATCH_COUNT') {
      const count = message.count;
      matchCountDiv.className = count > 0 ? 'results success' : 'results';
      matchCountDiv.textContent = `Total matches: ${count}`;
      console.log('[POPUP] Updated match count display to:', count);
      
      // Enable/disable navigation buttons based on match count
      updateNavigationButtons(count, count > 0 ? 0 : -1);
    }
    
    if (message.type === 'MATCH_NAVIGATION') {
      // Update navigation buttons when user navigates in the page
      updateNavigationButtons(message.total, message.current);
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

// Function to navigate between matches in the page
function navigateMatchesInPage(direction) {
  console.log('[PAGE] Navigating matches:', direction);
  
  // Find all highlight elements
  const highlights = document.querySelectorAll('.wasm-search-highlight');
  if (!highlights || highlights.length === 0) {
    console.log('[PAGE] No highlights found for navigation');
    return;
  }
  
  // Find current active highlight
  let currentIndex = -1;
  highlights.forEach((highlight, index) => {
    if (highlight.classList.contains('active')) {
      currentIndex = index;
    }
  });
  
  // Calculate new index based on direction
  let newIndex = currentIndex;
  if (direction === 'next') {
    newIndex = currentIndex < highlights.length - 1 ? currentIndex + 1 : currentIndex;
  } else if (direction === 'prev') {
    newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
  }
  
  // Only update if index changed
  if (newIndex !== currentIndex) {
    // Remove active class from all highlights
    highlights.forEach(h => h.classList.remove('active'));
    
    // Add active class to new highlight
    const highlight = highlights[newIndex];
    highlight.classList.add('active');
    
    // Scroll the highlight into view
    highlight.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    
    // Send navigation update message
    try {
      chrome.runtime.sendMessage({
        type: 'MATCH_NAVIGATION',
        current: newIndex,
        total: highlights.length
      });
      console.log('[PAGE] Sent navigation update:', { current: newIndex, total: highlights.length });
    } catch (error) {
      console.error('[PAGE] Failed to send navigation update:', error);
    }
  }
}
