// Debug banner to show script is running
const banner = document.createElement('div');
banner.style.position = 'fixed';
banner.style.top = '0';
banner.style.left = '0';
banner.style.right = '0';
banner.style.backgroundColor = '#4CAF50';
banner.style.color = 'white';
banner.style.padding = '10px';
banner.style.zIndex = '999999999';
banner.style.fontSize = '14px';
banner.style.fontFamily = 'monospace';
banner.textContent = 'Content Script Active - Loading WebAssembly...';
document.body.appendChild(banner);

// Update banner function
function updateBanner(text, isError = false) {
    banner.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
    banner.textContent = text;
    console.log('[CONTENT] Banner updated:', text, isError ? '(error)' : '');
}

// Initialize WebAssembly
console.log('[CONTENT] Starting initialization');

// Get extension URLs
const searchJsUrl = chrome.runtime.getURL('search.js');
const wasmUrl = chrome.runtime.getURL('search.wasm');
const pageJsUrl = chrome.runtime.getURL('page.js');
console.log('[CONTENT] URLs:', { searchJsUrl, wasmUrl, pageJsUrl });

// Load page.js first
const pageScript = document.createElement('script');
pageScript.src = pageJsUrl;
pageScript.onload = () => {
    console.log('[CONTENT] page.js loaded');
    // Signal that initialization can begin
    window.dispatchEvent(new CustomEvent('wasmInit', {
        detail: { searchJsUrl, wasmUrl }
    }));
};
pageScript.onerror = (error) => {
    console.error('[CONTENT] Failed to load page.js:', error);
    updateBanner('Error: Failed to load page script!', true);
};
document.head.appendChild(pageScript);

// Listen for WebAssembly initialization events
window.addEventListener('wasmReady', () => {
    console.log('[CONTENT] WebAssembly initialized successfully');
    updateBanner('Ready for search!');
});

window.addEventListener('wasmError', () => {
    const error = document.wrappedJSObject?.wasmError || 'Unknown error';
    console.error('[CONTENT] WebAssembly initialization failed:', error);
    updateBanner('Error: ' + error, true);
});

// Listen for search messages
window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data.type !== 'RUN_SEARCH') return;
    
    const { word1, word2, gap } = event.data;
    console.log('[CONTENT] Search requested:', { word1, word2, gap });
    
    // Dispatch search request to page context
    window.dispatchEvent(new CustomEvent('runSearch', {
        detail: { word1, word2, gap }
    }));
});

// Listen for search results
window.addEventListener('searchComplete', (event) => {
    console.log('[CONTENT] Search completed:', event.detail);
    chrome.runtime.sendMessage({
        type: 'MATCH_COUNT',
        count: event.detail
    });
});

window.addEventListener('searchError', (event) => {
    console.error('[CONTENT] Search error:', event.detail);
    updateBanner('Search error: ' + event.detail, true);
    chrome.runtime.sendMessage({
        type: 'MATCH_COUNT',
        count: 0
    });
}); 