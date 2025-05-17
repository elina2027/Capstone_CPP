// background.js
console.log('[BACKGROUND] Background script loaded');

// Keep track of port connections
let popupPort = null;
let contentPorts = {};

// Listen for port connections
chrome.runtime.onConnect.addListener((port) => {
  console.log('[BACKGROUND] Port connected:', port.name);
  
  if (port.name === 'popup') {
    popupPort = port;
    port.onDisconnect.addListener(() => {
      console.log('[BACKGROUND] Popup port disconnected');
      popupPort = null;
    });
  } else if (port.name.startsWith('content-')) {
    const tabId = port.name.split('-')[1];
    contentPorts[tabId] = port;
    port.onDisconnect.addListener(() => {
      console.log(`[BACKGROUND] Content port for tab ${tabId} disconnected`);
      delete contentPorts[tabId];
    });
  }
});

// Standard message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BACKGROUND] Message received:', message, 'from', sender);
  
  // Immediately acknowledge receipt
  if (sendResponse) {
    sendResponse({ received: true, from: 'background' });
  }
  
  // If it's a search message
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
  
  // If it's a MATCH_COUNT message from content script, forward to popup
  if (message.type === "MATCH_COUNT" && sender.tab) {
    console.log('[BACKGROUND] Forwarding MATCH_COUNT message to popup');
    
    // Try to forward the message to all extensions views
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[BACKGROUND] Error forwarding message:', chrome.runtime.lastError);
      } else {
        console.log('[BACKGROUND] Message forwarded successfully, response:', response);
      }
    });
  }
  
  // Return true to indicate asynchronous response
  return true;
});
