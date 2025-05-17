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
});
