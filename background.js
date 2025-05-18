// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SEARCH") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;

      chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      }, () => {
        // Wait for injection to complete, then send message
        chrome.tabs.sendMessage(tabId, message);
      });
    });
  }
  
  // Handle match count messages from content script and forward to popup
  if (message.type === "MATCH_COUNT") {
    console.log('[BACKGROUND] Received match count:', message.count);
    
    // Forward the match count to any open popup
    chrome.runtime.sendMessage(message).catch(error => {
      // Suppress errors when popup is not open
      if (!error.message.includes('receiving end does not exist')) {
        console.error('[BACKGROUND] Error forwarding match count:', error);
      }
    });
  }
});

// Track active tab for match count updates
chrome.tabs.onActivated.addListener(activeInfo => {
  console.log('[BACKGROUND] Tab activated:', activeInfo.tabId);
});
