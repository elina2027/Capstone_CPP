console.log('[POPUP] Script loaded');

// Timer variables
let searchStartTime = 0;
let searchTimerInterval = null;

// Set up port for more reliable communication
let port = null;
try {
  port = chrome.runtime.connect({name: 'popup'});
  console.log('[POPUP] Connected port:', port);
  
  // Listen for messages on the port
  port.onMessage.addListener((message) => {
    console.log('[POPUP] Received port message:', message);
    processMessage(message);
  });
  
  port.onDisconnect.addListener(() => {
    console.log('[POPUP] Port disconnected');
    port = null;
  });
} catch (error) {
  console.error('[POPUP] Failed to connect port:', error);
}

// Also listen for standard messages for backward compatibility
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[POPUP] Received standard message:', JSON.stringify(message));
  
  // Immediately acknowledge receipt
  if (sendResponse) {
    sendResponse({ received: true, timestamp: new Date().toISOString() });
  }
  
  // Process the message
  processMessage(message);
  
  // Return true to indicate async response
  return true;
});

// Helper function to process messages
function processMessage(message) {
  try {
    if (message.type === 'MATCH_COUNT') {
      console.log('[POPUP] Processing MATCH_COUNT message with count:', message.count, 'searchTime:', message.searchTime);
      
      // Always stop the timer first thing
      if (searchTimerInterval) {
        console.log('[POPUP] Stopping search timer interval');
        clearInterval(searchTimerInterval);
        searchTimerInterval = null;
      }
      
      // Update match count display
      const matchCountDiv = document.getElementById('matchCount');
      if (matchCountDiv) {
        // If there was an error, show the error message
        if (message.error) {
          matchCountDiv.textContent = `Error: ${message.error.split('(')[0]}`;
          matchCountDiv.classList.add('error');
          console.log('[POPUP] Updated match count display with error');
        } else {
          matchCountDiv.textContent = `Total matches: ${message.count}`;
          matchCountDiv.classList.remove('error');
          console.log('[POPUP] Updated match count display to:', message.count);
        }
      } else {
        console.error('[POPUP] Could not find matchCount element');
      }
      
      // Update timer display
      const timerText = document.getElementById('timerText');
      if (timerText) {
        if (message.searchTime !== undefined) {
          timerText.textContent = `Search time: ${message.searchTime.toFixed(2)}s`;
          console.log('[POPUP] Updated timer with search time:', message.searchTime.toFixed(2));
        } else {
          const elapsedTime = (performance.now() - searchStartTime) / 1000;
          timerText.textContent = `Search time: ${elapsedTime.toFixed(2)}s`;
          console.log('[POPUP] Updated timer with local time:', elapsedTime.toFixed(2));
        }
      } else {
        console.error('[POPUP] Could not find timerText element');
      }
      
      // Hide spinner
      const spinner = document.getElementById('searchSpinner');
      if (spinner) {
        console.log('[POPUP] Hiding search spinner');
        spinner.classList.remove('active');
      } else {
        console.error('[POPUP] Could not find searchSpinner element');
      }
    }
  } catch (error) {
    console.error('[POPUP] Error processing message:', error);
    emergencyCleanup();
  }
}

// Emergency cleanup function
function emergencyCleanup() {
  try {
    // Update match count
    const matchCountDiv = document.getElementById('matchCount');
    if (matchCountDiv) {
      matchCountDiv.textContent = 'Error processing results';
    }
    
    // Stop timer
    if (searchTimerInterval) {
      clearInterval(searchTimerInterval);
      searchTimerInterval = null;
    }
    
    // Hide spinner
    const spinner = document.getElementById('searchSpinner');
    if (spinner) {
      spinner.classList.remove('active');
    }
    
    // Update timer text
    const timerText = document.getElementById('timerText');
    if (timerText) {
      timerText.textContent = 'Error';
    }
  } catch (e) {
    console.error('[POPUP] Fatal error updating UI:', e);
  }
}

// Function to start the search timer
function startSearchTimer() {
  console.log('[POPUP] Starting search timer');
  searchStartTime = performance.now();
  
  // Show spinner
  const spinner = document.getElementById('searchSpinner');
  spinner.classList.add('active');
  
  // Reset timer text
  const timerText = document.getElementById('timerText');
  timerText.textContent = 'Searching...';
  
  // Clear any existing interval
  if (searchTimerInterval) {
    clearInterval(searchTimerInterval);
  }
  
  // Update timer every 100ms
  searchTimerInterval = setInterval(() => {
    const elapsedTime = (performance.now() - searchStartTime) / 1000;
    timerText.textContent = `Search time: ${elapsedTime.toFixed(1)}s`;
    
    // Add failsafe: If search takes more than 30 seconds, stop the timer
    if (elapsedTime > 30) {
      console.log('[POPUP] Search timed out after 30 seconds');
      clearInterval(searchTimerInterval);
      searchTimerInterval = null;
      
      // Update UI to show timeout
      timerText.textContent = `Search timed out after 30s`;
      document.getElementById('matchCount').textContent = 'Search took too long';
      
      // Hide spinner
      spinner.classList.remove('active');
    }
  }, 100);
}

// Function to save settings to chrome.storage
function saveSettings() {
  const settings = {
    caseSensitive: !document.getElementById('caseToggle').checked
  };
  chrome.storage.sync.set({ wasmSearchSettings: settings }, () => {
    console.log('[POPUP] Settings saved:', settings);
  });
}

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', () => {
  // Try to load saved settings
  chrome.storage.sync.get('wasmSearchSettings', (result) => {
    const settings = result.wasmSearchSettings || { caseSensitive: false };
    console.log('[POPUP] Loaded settings:', settings);
    
    // Apply settings to UI
    document.getElementById('caseToggle').checked = !settings.caseSensitive;
  });
  
  // Clear timer display
  document.getElementById('timerText').textContent = '';
});

// Save settings when toggle changes
document.getElementById('caseToggle').addEventListener('change', saveSettings);

document.getElementById('searchBtn').addEventListener('click', () => {
  console.log('[POPUP] Search button clicked');
  
  const word1 = document.getElementById('word1').value;
  const word2 = document.getElementById('word2').value;
  const gap = parseInt(document.getElementById('gap').value, 10);
  const caseSensitive = !document.getElementById('caseToggle').checked;

  console.log('[POPUP] Search parameters:', { word1, word2, gap, caseSensitive });

  // Save settings
  saveSettings();

  // Reset count when starting new search
  const matchCountDiv = document.getElementById('matchCount');
  matchCountDiv.textContent = 'Searching...';
  console.log('[POPUP] Updated status to Searching...');
  
  // Start search timer
  startSearchTimer();

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    console.log('[POPUP] Found active tab:', tab);
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: runSearch,
      args: [word1, word2, gap, caseSensitive],
    }).then(() => {
      console.log('[POPUP] Search script injected successfully');
    }).catch((error) => {
      console.error('[POPUP] Error injecting search script:', error);
      matchCountDiv.textContent = 'Error: Could not execute search';
      
      // Stop timer if there's an error injecting the script
      if (searchTimerInterval) {
        clearInterval(searchTimerInterval);
        searchTimerInterval = null;
      }
      
      // Hide spinner
      const spinner = document.getElementById('searchSpinner');
      if (spinner) {
        spinner.classList.remove('active');
      }
      
      // Update timer text
      const timerText = document.getElementById('timerText');
      if (timerText) {
        timerText.textContent = 'Search failed';
      }
    });
  });
});

document.getElementById('cleanBtn').addEventListener('click', () => {
  console.log('[POPUP] Clean button clicked');
  
  // Reset the search results display
  document.getElementById('matchCount').textContent = 'Total matches: 0';
  document.getElementById('timerText').textContent = '';
  
  // Stop timer if running
  if (searchTimerInterval) {
    clearInterval(searchTimerInterval);
    searchTimerInterval = null;
  }
  
  // Hide spinner
  const spinner = document.getElementById('searchSpinner');
  if (spinner) {
    spinner.classList.remove('active');
  }
  
  // Reset input fields to default values
  document.getElementById('word1').value = '';
  document.getElementById('word2').value = '';
  document.getElementById('gap').value = '20'; // Reset to default gap value
  
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    console.log('[POPUP] Found active tab for cleaning:', tab);
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: cleanHighlights,
    }).then(() => {
      console.log('[POPUP] Clean script injected successfully');
    }).catch((error) => {
      console.error('[POPUP] Error injecting clean script:', error);
    });
  });
});

function runSearch(word1, word2, gap, caseSensitive) {
  console.log('[PAGE] Running search with parameters:', { word1, word2, gap, caseSensitive });
  
  // Record start time for performance measurement
  const searchStartTime = performance.now();
  
  // Set case sensitivity in window for content script to access
  window.caseSensitive = caseSensitive;
  
  window.postMessage({ 
    type: "RUN_SEARCH", 
    word1, 
    word2, 
    gap,
    caseSensitive,
    startTime: searchStartTime  // Pass start time to track duration
  }, "*");
}

function cleanHighlights() {
  console.log('[PAGE] Cleaning highlights');
  window.postMessage({ 
    type: "CLEAN_SEARCH" 
  }, "*");
}
