console.log('[POPUP] Script loaded');

document.getElementById('searchBtn').addEventListener('click', () => {
  console.log('[POPUP] Search button clicked');
  
  const word1 = document.getElementById('word1').value;
  const word2 = document.getElementById('word2').value;
  const gap = parseInt(document.getElementById('gap').value, 10);

  console.log('[POPUP] Search parameters:', { word1, word2, gap });

  // Reset count when starting new search
  const matchCountDiv = document.getElementById('matchCount');
  matchCountDiv.textContent = 'Searching...';
  console.log('[POPUP] Updated status to Searching...');

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
      matchCountDiv.textContent = 'Error: Could not execute search';
    });
  });
});

document.getElementById('cleanBtn').addEventListener('click', () => {
  console.log('[POPUP] Clean button clicked');
  
  document.getElementById('matchCount').textContent = 'Total matches: 0';
  
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

// Listen for match count messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[POPUP] Received message:', message);
  
  if (message.type === 'MATCH_COUNT') {
    const matchCountDiv = document.getElementById('matchCount');
    matchCountDiv.textContent = `Total matches: ${message.count}`;
    console.log('[POPUP] Updated match count display to:', message.count);
  }
});

function runSearch(word1, word2, gap) {
  console.log('[PAGE] Running search with parameters:', { word1, word2, gap });
  window.postMessage({ 
    type: "RUN_SEARCH", 
    detail: { word1, word2, gap }
  }, "*");
}

function cleanHighlights() {
  console.log('[PAGE] Cleaning highlights');
  document.querySelectorAll(".wasm-highlight").forEach(span => {
    const text = document.createTextNode(span.textContent);
    span.replaceWith(text);
  });
}
