// Inject styles for UI components
const uiStyles = document.createElement('style');
uiStyles.textContent = `
    .wasm-search-ui {
        font-family: 'Segoe UI', 'Roboto', 'Arial', sans-serif;
        color: #333;
        --primary-color: #2196F3;
        --accent-color: #FF5722;
        --bg-color: #FFFFFF;
        --text-color: #212121;
        --light-gray: #EEEEEE;
        --border-radius: 4px;
    }

    .wasm-search-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background-color: var(--primary-color);
        color: white;
        padding: 8px 16px;
        z-index: 2147483647;
        font-size: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
    }
    
    .wasm-search-banner.error {
        background-color: #f44336;
    }
    
    .wasm-search-highlight {
        background-color: rgba(255, 213, 79, 0.6);
        border-radius: 2px;
        padding: 2px 0;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        transition: background-color 0.2s ease;
    }
    
    .wasm-search-highlight:hover {
        background-color: rgba(255, 193, 7, 0.8);
    }
    
    .wasm-search-nav {
        position: fixed;
        right: 20px;
        bottom: 20px;
        background-color: var(--bg-color);
        border-radius: var(--border-radius);
        box-shadow: 0 2px 10px rgba(0,0,0,0.15);
        padding: 8px;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .wasm-search-button {
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: var(--border-radius);
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: all 0.2s ease;
    }
    
    .wasm-search-button:hover {
        background-color: #1976D2;
    }
    
    .wasm-search-button:disabled {
        background-color: #BDBDBD;
        cursor: not-allowed;
    }
    
    .wasm-search-count {
        font-size: 12px;
        color: var(--text-color);
        padding: 0 8px;
    }
`;
document.head.appendChild(uiStyles);

// Create container for UI elements
const uiContainer = document.createElement('div');
uiContainer.className = 'wasm-search-ui';
document.body.appendChild(uiContainer);

// Create banner
const banner = document.createElement('div');
banner.className = 'wasm-search-banner';
banner.textContent = 'WebAssembly Search - Loading...';
uiContainer.appendChild(banner);

// Helper function to check if extension context is valid
function isExtensionContextValid() {
    try {
        // This will throw if the context is invalid
        chrome.runtime.getURL('');
        return true;
    } catch (e) {
        console.log('[CONTENT] Extension context is invalid');
        return false;
    }
}

// Safe wrapper for sending messages to the extension
function sendMessageToExtension(message) {
    if (!isExtensionContextValid()) {
        console.log('[CONTENT] Cannot send message - extension context invalid');
        return;
    }

    try {
        chrome.runtime.sendMessage(message);
    } catch (error) {
        console.log('[CONTENT] Failed to send message: ', error.message);
    }
}

// Default case sensitivity setting (will be updated from popup)
window.caseSensitive = false;

// Update banner function
function updateBanner(text, isError = false) {
    banner.textContent = text;
    banner.className = isError ? 'wasm-search-banner error' : 'wasm-search-banner';
    console.log('[CONTENT] Banner updated:', text, isError ? '(error)' : '');
}

// Initialize WebAssembly
console.log('[CONTENT] Starting initialization');

// Create navigation controls
const nav = document.createElement('div');
nav.className = 'wasm-search-nav';
nav.style.display = 'none'; // Hide initially

const prevButton = document.createElement('button');
prevButton.className = 'wasm-search-button';
prevButton.innerHTML = '&uarr; Previous';
prevButton.disabled = true;

const matchCount = document.createElement('div');
matchCount.className = 'wasm-search-count';
matchCount.textContent = '0 of 0';

const nextButton = document.createElement('button');
nextButton.className = 'wasm-search-button';
nextButton.innerHTML = '&darr; Next';
nextButton.disabled = true;

nav.appendChild(prevButton);
nav.appendChild(matchCount);
nav.appendChild(nextButton);
uiContainer.appendChild(nav);

let currentMatchIndex = -1;
let totalMatches = 0;

// Function to update navigation
function updateNavigation() {
    const highlights = document.querySelectorAll('.wasm-search-highlight');
    totalMatches = highlights.length;
    
    if (totalMatches > 0) {
        nav.style.display = 'flex';
        matchCount.textContent = `${currentMatchIndex + 1} of ${totalMatches}`;
        prevButton.disabled = currentMatchIndex <= 0;
        nextButton.disabled = currentMatchIndex >= totalMatches - 1;
    } else {
        nav.style.display = 'none';
    }
}

// Function to scroll to match
function scrollToMatch(index) {
    const highlights = document.querySelectorAll('.wasm-search-highlight');
    if (index >= 0 && index < highlights.length) {
        // Remove active class from all highlights
        highlights.forEach(h => h.classList.remove('active'));
        
        // Add active class to current highlight
        const highlight = highlights[index];
        highlight.classList.add('active');
        
        // Scroll the highlight into view
        highlight.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        
        currentMatchIndex = index;
        updateNavigation();
    }
}

// Add navigation event listeners
prevButton.addEventListener('click', () => {
    if (currentMatchIndex > 0) {
        scrollToMatch(currentMatchIndex - 1);
    }
});

nextButton.addEventListener('click', () => {
    if (currentMatchIndex < totalMatches - 1) {
        scrollToMatch(currentMatchIndex + 1);
    }
});

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

// Add window unload listener to clean up gracefully
window.addEventListener('unload', () => {
    console.log('[CONTENT] Page unloading - cleaning up extension resources');
    removeHighlights();
});

// Add a listener for browser extension reload/disconnect
window.addEventListener('beforeunload', () => {
    console.log('[CONTENT] Page about to unload - cleaning up');
    removeHighlights();
});

window.addEventListener('wasmError', () => {
    const error = document.wrappedJSObject?.wasmError || 'Unknown error';
    console.error('[CONTENT] WebAssembly initialization failed:', error);
    updateBanner('Error: ' + error, true);
});

// Listen for search completion
window.addEventListener('searchComplete', (event) => {
    const { count, matches } = event.detail;
    
    // Get document text first to establish position mapping
    const documentText = getDocumentText();
    
    console.log('[CONTENT] Search completed:', { 
        count, 
        documentTextLength: documentText.length,
        textPositionMap: window.textPositionMap,
        matches: matches.map(m => ({
            text: m.text,
            start: m.start,
            length: m.length,
            wordCount: m.wordCount,
            textContext: documentText.substring(
                Math.max(0, m.start - 20),
                Math.min(documentText.length, m.start + m.length + 20)
            )
        }))
    });
    
    // Remove any existing highlights
    removeHighlights();
    
    if (count > 0) {
        // Get search parameters from the most recent search
        const searchParams = window.lastSearchParams || {};
        
        // Add search words to matches
        const matchesWithWords = matches.map(match => ({
            ...match,
            word1: searchParams.word1,
            word2: searchParams.word2
        }));
        
        // Add new highlights
        highlightMatches(matchesWithWords);
        updateBanner(`Found ${count} match${count > 1 ? 'es' : ''}`);
        
        // Send match count back to popup
        sendMessageToExtension({
            type: 'MATCH_COUNT',
            count: count,
            pageCount: count,
            wordDistances: matches.map(m => m.wordCount || 0)
        });
    } else {
        updateBanner('No matches found');
        
        // Send zero count back to popup
        sendMessageToExtension({
            type: 'MATCH_COUNT',
            count: 0,
            pageCount: 0,
            text: 'No matches found'
        });
    }
});

// Listen for search messages
window.addEventListener('message', event => {
    if (event.source !== window) return;
    
    if (event.data.type === 'RUN_SEARCH') {
        const { word1, word2, gap, caseSensitive } = event.data;
        console.log('[CONTENT] Search requested:', { word1, word2, gap, caseSensitive });
        
        // Update case sensitivity setting from the message
        window.caseSensitive = caseSensitive;
        
        // Store search parameters for later use
        window.lastSearchParams = { word1, word2, gap, caseSensitive };
        
        // Dispatch search request to page context
        window.dispatchEvent(new CustomEvent('runSearch', {
            detail: { word1, word2, gap }
        }));
    } else if (event.data.type === 'CLEAN_SEARCH') {
        console.log('[CONTENT] Cleaning search...');
        removeHighlights();
        updateBanner('Ready for search!');
        
        // Reset navigation
        currentMatchIndex = -1;
        totalMatches = 0;
        updateNavigation();
    }
});

window.addEventListener('searchError', (event) => {
    console.error('[CONTENT] Search error:', event.detail);
    updateBanner('Search error: ' + event.detail, true);
    sendMessageToExtension({
        type: 'MATCH_COUNT',
        count: 0
    });
});

// Helper function to normalize text while preserving word boundaries
function normalizeText(text) {
    return text
        .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
        .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Remove zero-width spaces
        .trim();  // Remove leading/trailing whitespace
}

// Function to get document text
function getDocumentText() {
    let text = '';
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    while (node = walker.nextNode()) {
        text += node.textContent;
    }
    
    return text;
}

// Function to get document text and search for specific matches
function findTextInDocument(searchText) {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // Skip script and style contents
                const parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                
                if (parent.tagName === 'SCRIPT' || 
                    parent.tagName === 'STYLE') {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip hidden elements
                if (parent.offsetParent === null) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip existing highlights
                if (parent.classList?.contains('wasm-search-highlight')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );
    
    let node;
    while (node = walker.nextNode()) {
        const nodeText = node.textContent;
        if (nodeText.includes(searchText)) {
            return {
                node,
                text: nodeText,
                index: nodeText.indexOf(searchText)
            };
        }
    }
    
    return null;
}

// Function to remove existing highlights
function removeHighlights() {
    console.log('[CONTENT] Removing existing highlights');
    const highlights = document.querySelectorAll('.wasm-search-highlight');
    
    // Remove highlights in reverse order to maintain text node integrity
    Array.from(highlights).reverse().forEach(highlight => {
        const parent = highlight.parentNode;
        if (parent) {
            // Create a new text node with the highlight's content
            const textNode = document.createTextNode(highlight.textContent);
            parent.replaceChild(textNode, highlight);
            
            // Merge with adjacent text nodes if they exist
            if (textNode.previousSibling && textNode.previousSibling.nodeType === Node.TEXT_NODE) {
                textNode.textContent = textNode.previousSibling.textContent + textNode.textContent;
                parent.removeChild(textNode.previousSibling);
            }
            if (textNode.nextSibling && textNode.nextSibling.nodeType === Node.TEXT_NODE) {
                textNode.textContent = textNode.textContent + textNode.nextSibling.textContent;
                parent.removeChild(textNode.nextSibling);
            }
        }
    });
    
    // Hide navigation and reset state
    nav.style.display = 'none';
    currentMatchIndex = -1;
    totalMatches = 0;
}

// Update highlight matches function
function highlightMatches(matches) {
    console.log('[CONTENT] Starting highlight process for matches:', 
        matches.map(m => ({
            start: m.start,
            length: m.length,
            text: m.text,
            word1: m.word1,
            word2: m.word2
        }))
    );
    
    // Remove existing highlights first
    removeHighlights();
    
    let highlightCount = 0;
    
    // Process each match
    for (const match of matches) {
        if (!match.word1 || !match.word2) {
            console.error('[CONTENT] Match missing search words');
            continue;
        }
        
        // Get the actual text from the document at this position
        const caseFlag = window.caseSensitive ? '' : 'i';
        const searchRegex = new RegExp(`${match.word1}.*?${match.word2}`, caseFlag);
        const fullText = getDocumentText();
        const context = fullText.substring(
            Math.max(0, match.start - 10),
            Math.min(fullText.length, match.start + match.length + 10)
        );
        
        console.log('[CONTENT] Match context:', {
            context,
            searchRegex: searchRegex.toString(),
            caseSensitive: window.caseSensitive
        });
        
        // Find the text in the document
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip script and style contents
                    const parent = node.parentNode;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    if (parent.tagName === 'SCRIPT' || 
                        parent.tagName === 'STYLE') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Skip existing highlights
                    if (parent.classList?.contains('wasm-search-highlight')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );
        
        let foundNode = false;
        let node;
        while (node = walker.nextNode()) {
            const nodeText = node.textContent;
            const matches = nodeText.match(searchRegex);
            
            if (matches && matches.length > 0) {
                const matchedText = matches[0];
                const parent = node.parentNode;
                const index = nodeText.indexOf(matchedText);
                
                console.log('[CONTENT] Found match in node:', {
                    matchedText,
                    nodeText,
                    index
                });
                
                // Create text segments
                const beforeText = nodeText.substring(0, index);
                const afterText = nodeText.substring(index + matchedText.length);
                
                // Create the DOM nodes
                const beforeNode = document.createTextNode(beforeText);
                const highlight = document.createElement('span');
                highlight.className = 'wasm-search-highlight';
                highlight.textContent = matchedText;
                const afterNode = document.createTextNode(afterText);
                
                // Replace the original node
                parent.insertBefore(beforeNode, node);
                parent.insertBefore(highlight, node);
                parent.insertBefore(afterNode, node);
                parent.removeChild(node);
                
                console.log('[CONTENT] Created highlight for:', matchedText);
                highlightCount++;
                foundNode = true;
                break;
            }
        }
        
        if (!foundNode) {
            console.error('[CONTENT] Could not find match text in DOM');
        }
    }
    
    // Update banner with match count
    updateBanner(`Found ${highlightCount} match${highlightCount !== 1 ? 'es' : ''}`);
} 