document.addEventListener('DOMContentLoaded', function() {
  // Get elements
  const word1Input = document.getElementById('word1');
  const word2Input = document.getElementById('word2');
  const gapInput = document.getElementById('gap');
  const searchBtn = document.getElementById('searchBtn');
  const searchBtnText = document.getElementById('searchBtnText');
  const searchBtnSpinner = document.getElementById('searchBtnSpinner');
  const cleanBtn = document.getElementById('cleanBtn');
  const matchCountDiv = document.getElementById('matchCount');
  const resultsText = document.getElementById('resultsText');
  const currentMatchDiv = document.getElementById('currentMatch');
  const searchTimerDiv = document.getElementById('searchTimer');
  const gapBtns = document.querySelectorAll('.gap-btn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const caseInsensitiveCheckbox = document.getElementById('caseInsensitive');
  
  // Focus first input on popup open
  word1Input.focus();
  
  // Navigation button state
  let currentMatchIndex = -1;
  let totalMatches = 0;
  
  // Timer variables
  let searchStartTime = 0;
  let searchTimer = null;
  let searchDuration = 0;
  
  // Function to show loading state
  function showLoadingState() {
    // Show spinner on button only
    searchBtnSpinner.classList.add('active');
    
    // Update button text
    searchBtnText.textContent = 'Searching...';
    
    // Disable the search button
    searchBtn.disabled = true;
    
    // Update status to show searching state
    matchCountDiv.className = 'results searching';
    resultsText.textContent = 'Searching...';
  }
  
  // Function to hide loading state
  function hideLoadingState() {
    // Hide spinner
    searchBtnSpinner.classList.remove('active');
    
    // Restore button text
    searchBtnText.textContent = 'Search';
    
    // Re-enable the search button
    searchBtn.disabled = false;
  }
  
  // Function to start the search timer
  function startSearchTimer() {
    // Clear any existing timer
    clearInterval(searchTimer);
    
    // Record start time and set initial display
    searchStartTime = performance.now();
    searchDuration = 0;
    searchTimerDiv.textContent = 'Searching: 0.0s';
    searchTimerDiv.classList.add('active');
    
    // Start interval to update timer
    searchTimer = setInterval(() => {
      const elapsedTime = performance.now() - searchStartTime;
      searchDuration = Math.round(elapsedTime) / 1000;
      searchTimerDiv.textContent = `Searching: ${searchDuration.toFixed(1)}s`;
    }, 100); // Update every 100ms
  }
  
  // Function to stop the search timer
  function stopSearchTimer() {
    if (searchTimer) {
      clearInterval(searchTimer);
      searchTimer = null;
      
      const elapsedTime = performance.now() - searchStartTime;
      searchDuration = Math.round(elapsedTime) / 1000;
      searchTimerDiv.textContent = `Search time: ${searchDuration.toFixed(1)}s`;
      setTimeout(() => {
        searchTimerDiv.classList.remove('active');
      }, 2000); // Keep timer highlighted for 2 seconds
    }
  }
  
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
    navigateMatches('prev');
  });
  
  nextBtn.addEventListener('click', () => {
    navigateMatches('next');
  });
  
  // Function to navigate between matches
  function navigateMatches(direction) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: navigateMatchesInPage,
        args: [direction],
      }).catch((error) => {
        // Silently fail
      });
    });
  }
  
  // Search button click handler
  searchBtn.addEventListener('click', () => {
    const word1 = word1Input.value.trim();
    const word2 = word2Input.value.trim();
    const gap = parseInt(gapInput.value, 10);
    const caseInsensitive = caseInsensitiveCheckbox.checked;

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
      showError('Character gap must be a positive number');
      gapInput.focus();
      return;
    }

    // Show loading state
    showLoadingState();
    
    // Start the search timer
    startSearchTimer();

    // Disable navigation buttons during search
    updateNavigationButtons(0, -1);

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: runSearch,
        args: [word1, word2, gap, caseInsensitive],
      }).then(() => {
        // Script injected
      }).catch((error) => {
        showError('Could not execute search');
        hideLoadingState();
        stopSearchTimer();
      });
    });
  });

  // Clean button click handler
  cleanBtn.addEventListener('click', () => {
    // Reset the form inputs to default state
    word1Input.value = '';
    word2Input.value = '';
    gapInput.value = '20';
    
    // Focus first input field
    word1Input.focus();
    
    // Reset results display
    matchCountDiv.className = 'results';
    resultsText.textContent = 'Total matches: 0';
    currentMatchDiv.textContent = '';
    searchTimerDiv.textContent = '';
    
    // Stop the timer if it's running
    stopSearchTimer();
    
    // Disable navigation buttons
    updateNavigationButtons(0, -1);
    
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: cleanHighlights,
      }).then(() => {
        // Script injected
      }).catch((error) => {
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
    resultsText.textContent = 'Error: ' + message;
    currentMatchDiv.textContent = '';
    hideLoadingState();
    stopSearchTimer();
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
      
      // Update the match position counter
      currentMatchDiv.textContent = `Match ${current + 1} of ${total}`;
    } else {
      prevBtn.innerHTML = '&uarr;';
      nextBtn.innerHTML = '&darr;';
      currentMatchDiv.textContent = '';
    }
  }

  // Listen for match count messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MATCH_COUNT') {
      // Stop the timer when results are received
      stopSearchTimer();
      
      // Hide loading state
      hideLoadingState();
      
      const count = message.count;
      
      // Update UI with match count
      matchCountDiv.className = count > 0 ? 'results success' : 'results';
      resultsText.textContent = `Total matches: ${count}`;
      
      // Log the count to help with debugging
      console.debug(`Received match count: ${count}`);
      
      // Enable/disable navigation buttons based on match count
      updateNavigationButtons(count, count > 0 ? 0 : -1);
    }
    
    if (message.type === 'MATCH_NAVIGATION') {
      // Update navigation buttons when user navigates in the page
      updateNavigationButtons(message.total, message.current);
      
      // Also update the match count display with the most accurate count
      if (message.total !== totalMatches) {
        totalMatches = message.total;
        resultsText.textContent = `Total matches: ${totalMatches}`;
      }
    }
  });
});

// Function to run the search on the page
function runSearch(word1, word2, gap, caseInsensitive) {
  window.postMessage({ 
    type: "RUN_SEARCH", 
    detail: { word1, word2, gap, caseInsensitive }
  }, "*");
}

// Function to clean highlights and reset extension state
function cleanHighlights() {
  try {
    // Remove all highlights with safer approach
    const highlights = document.querySelectorAll(".wasm-search-highlight");
    
    // Remove highlights in reverse order to maintain text node integrity
    Array.from(highlights).reverse().forEach(span => {
      try {
        const parent = span.parentNode;
        if (parent) {
          // Create a new text node with the highlight's content
          const text = document.createTextNode(span.textContent);
          parent.replaceChild(text, span);
          
          // Merge with adjacent text nodes if they exist
          if (text.previousSibling && text.previousSibling.nodeType === Node.TEXT_NODE) {
            text.textContent = text.previousSibling.textContent + text.textContent;
            parent.removeChild(text.previousSibling);
          }
          if (text.nextSibling && text.nextSibling.nodeType === Node.TEXT_NODE) {
            text.textContent = text.textContent + text.nextSibling.textContent;
            parent.removeChild(text.nextSibling);
          }
        }
      } catch (removeError) {
        // Silently fail
      }
    });
    
    // Hide navigation controls if they exist
    const navControls = document.querySelector('.wasm-search-nav');
    if (navControls) {
      navControls.style.display = 'none';
    }
    
    // Reset navigation state
    window.currentMatchIndex = -1;
    window.totalMatches = 0;
    
    // Reset search process flag
    window.inSearchProcess = false;
    
    // Update banner text to default state
    const banner = document.querySelector('div[style*="position: fixed"][style*="top: 0"]');
    if (banner) {
      banner.style.backgroundColor = '#4CAF50';
      banner.textContent = 'Ready for search!';
    }
    
    // Send match count update
    try {
      chrome.runtime.sendMessage({
        type: 'MATCH_COUNT',
        count: 0
      });
    } catch (error) {
      // Silently fail
    }
  } catch (error) {
    // Silently fail
  }
}

// Function to navigate between matches in the page
function navigateMatchesInPage(direction) {
  // Find all highlight elements
  const highlights = document.querySelectorAll('.wasm-search-highlight');
  if (!highlights || highlights.length === 0) {
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
    } catch (error) {
      // Silently fail
    }
  }
}
