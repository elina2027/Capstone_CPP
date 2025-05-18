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
banner.style.display = 'flex';
banner.style.alignItems = 'center';
banner.style.justifyContent = 'center';
banner.innerHTML = `
  <span>Content Script Active - Loading WebAssembly...</span>
  <span id="banner-spinner" style="display: inline-block; margin-left: 10px; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: banner-spin 1s linear infinite;"></span>
`;
document.head.appendChild(document.createElement('style')).textContent = `
  @keyframes banner-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.body.appendChild(banner);

// Update banner function
function updateBanner(text, isError = false) {
    banner.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
    
    // Update the text part
    const textSpan = banner.querySelector('span:first-child');
    if (textSpan) {
        textSpan.textContent = text;
    } else {
        banner.innerHTML = `
            <span>${text}</span>
            <span id="banner-spinner" style="display: none; margin-left: 10px; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: banner-spin 1s linear infinite;"></span>
        `;
    }
    
    // Show/hide spinner based on text content
    const spinner = banner.querySelector('#banner-spinner');
    if (spinner) {
        if (text.includes('Searching') || text.includes('Loading') || text.includes('Initializing')) {
            spinner.style.display = 'inline-block';
        } else {
            spinner.style.display = 'none';
        }
    }
}

// Inject highlight styles
const style = document.createElement('style');
style.textContent = `
    .wasm-search-highlight {
        background-color: #ffeb3b;
    }
    
    .wasm-search-highlight:hover {
        background-color: #fdd835;
    }
    
    .wasm-search-highlight.active {
        background-color: #fbc02d;
    }
    
    @keyframes highlight-pulse {
        0% {
            transform: scale(1);
            background-color: #ffd54f;
        }
        50% {
            transform: scale(1.05);
            background-color: #ffb300;
        }
        100% {
            transform: scale(1);
            background-color: #ffd54f;
        }
    }
    
    .wasm-search-highlight.new {
        animation: highlight-pulse 0.5s ease-in-out;
    }
    
    /* Navigation buttons */
    .wasm-search-nav {
        position: fixed;
        right: 20px;
        bottom: 20px;
        display: flex;
        gap: 10px;
        z-index: 999999999;
        background: white;
        padding: 10px;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    }
    
    .wasm-search-nav button {
        background: #4CAF50;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: all 0.2s ease;
    }
    
    .wasm-search-nav button:hover {
        background: #43A047;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    
    .wasm-search-nav button:disabled {
        background: #ccc;
        cursor: not-allowed;
    }
    
    .wasm-search-nav .count {
        font-size: 14px;
        color: #666;
        margin: 0 10px;
        display: flex;
        align-items: center;
    }
`;
document.head.appendChild(style);

// Add navigation controls
const nav = document.createElement('div');
nav.className = 'wasm-search-nav';
nav.style.display = 'none'; // Hide initially
nav.innerHTML = `
    <button class="prev" disabled>↑ Previous</button>
    <div class="count">0 of 0</div>
    <button class="next" disabled>↓ Next</button>
`;
document.body.appendChild(nav);

let currentMatchIndex = -1;
let totalMatches = 0;

// Function to update navigation
function updateNavigation() {
    const highlights = document.querySelectorAll('.wasm-search-highlight');
    
    // Get the fixed total from C++
    const fixedTotal = window.fixedTotalMatches || totalMatches;
    
    if (highlights.length > 0) {
        nav.style.display = 'flex';
        nav.querySelector('.count').textContent = 
            `${currentMatchIndex + 1} of ${fixedTotal}`;
        nav.querySelector('.prev').disabled = currentMatchIndex <= 0;
        nav.querySelector('.next').disabled = currentMatchIndex >= highlights.length - 1;
        
        // Update banner to also show match position
        updateBanner(`Found ${fixedTotal} matches - Currently on match ${currentMatchIndex + 1}`);
    } else {
        nav.style.display = 'none';
    }
}

// Function to scroll to match
function scrollToMatch(index) {
    const highlights = document.querySelectorAll('.wasm-search-highlight');
    
    // Do NOT update totalMatches here - use the fixed count from C++
    // Get the fixed total matches from the global variable
    const fixedTotal = window.fixedTotalMatches || totalMatches;
    
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
        
        // Update navigation display using the current index but FIXED total
        nav.style.display = 'flex';
        nav.querySelector('.count').textContent = 
            `${currentMatchIndex + 1} of ${fixedTotal}`;
        nav.querySelector('.prev').disabled = currentMatchIndex <= 0;
        nav.querySelector('.next').disabled = currentMatchIndex >= highlights.length - 1;
        
        // Update banner to also show match position with FIXED total
        updateBanner(`Found ${fixedTotal} matches - Currently on match ${currentMatchIndex + 1}`);
        
        // Send navigation update to the popup with FIXED total count
        try {
            safeSendMessage({
                type: 'MATCH_NAVIGATION',
                current: index,
                total: fixedTotal // Use the fixed total from C++
            });
            console.debug(`Sent navigation update: current=${index}, total=${fixedTotal}`);
        } catch (error) {
            // Silently fail
        }
    }
}

// Add navigation event listeners
nav.querySelector('.prev').addEventListener('click', () => {
    if (currentMatchIndex > 0) {
        scrollToMatch(currentMatchIndex - 1);
    }
});

nav.querySelector('.next').addEventListener('click', () => {
    const highlights = document.querySelectorAll('.wasm-search-highlight');
    if (currentMatchIndex < highlights.length - 1) {
        scrollToMatch(currentMatchIndex + 1);
    }
});

// Track initialization state
let isWasmInitialized = false;
let initializationInProgress = false;

// Track processing state
const sentMessages = new Set();
const processedResults = new Set();
let lastSearchTime = 0;

// Cache for document text
let textCache = {
  text: null,
  nodes: [],
  positions: [],
  timestamp: 0
};

// Message types
const MessageTypes = {
    INIT: 'WASM_INIT',
    INITIALIZED: 'WASM_INITIALIZED',
    ERROR: 'WASM_ERROR',
    RUN_SEARCH: 'RUN_SEARCH',
    SEARCH_COMPLETE: 'SEARCH_COMPLETE',
    SEARCH_ERROR: 'SEARCH_ERROR'
};

// Function to clear the text cache
function clearTextCache() {
    textCache = {
        text: null,
        nodes: [],
        positions: [],
        timestamp: 0
    };
}

// Function to send messages to page script
function sendToPage(type, detail) {
    const messageId = Date.now() + Math.random();
    sentMessages.add(messageId);
    window.postMessage({ type, detail, messageId }, '*');
    
    // Clean up old message IDs after 5 seconds
    setTimeout(() => {
        sentMessages.delete(messageId);
    }, 5000);
}

// Force quit any existing search operation and clear highlights
function forceCleanState() {
    removeHighlights();
    clearTextCache(); // Clear cache on clean state
    window.inSearchProcess = false;
}

// Message handler for all incoming messages
function handleMessage(type, detail, messageId) {
    // If we're already in a search process, skip new search requests
    if (window.inSearchProcess && type === MessageTypes.SEARCH_COMPLETE) {
        return;
    }
    
    switch (type) {
        case MessageTypes.INITIALIZED:
            isWasmInitialized = true;
            initializationInProgress = false;
            updateBanner('Ready for search!');
            break;
            
        case MessageTypes.ERROR:
            isWasmInitialized = false;
            initializationInProgress = false;
            const error = detail || 'Unknown error';
            updateBanner('Error: ' + error, true);
            break;
            
        case MessageTypes.SEARCH_COMPLETE:
            // Set the search process flag
            window.inSearchProcess = true;
            
            try {
                if (!detail || !Array.isArray(detail.matches)) {
                    throw new Error('Invalid search results');
                }

                const { matches, executionTime, parameters } = detail;
                
                // Remove existing highlights first
                removeHighlights();
                
                // CRITICAL - Immediate notification to popup with match count
                // This must happen before any DOM manipulation
                try {
                    console.log(`Sending immediate match count: ${matches.length}, time: ${executionTime}s`);
                    // Store the C++ match count and use it consistently
                    totalMatches = matches.length;
                    // Set a global variable to remember this is the authoritative count
                    window.fixedTotalMatches = totalMatches;
                    
                    // Set current index to 0 if we have matches - enables navigation immediately
                    currentMatchIndex = totalMatches > 0 ? 0 : -1;
                    
                    safeSendMessage({
                        type: 'MATCH_COUNT',
                        count: totalMatches,
                        executionTime: executionTime,
                        parameters: parameters,
                        currentIndex: currentMatchIndex // Include current index to enable navigation early
                    });
                } catch (error) {
                    console.error('Failed to send match count:', error);
                }
                
                if (matches.length > 0) {
                    highlightMatches(matches);
                } else {
                    updateBanner('No matches found');
                }
            } catch (error) {
                handleSearchError(error);
            } finally {
                // Reset search process flag
                window.inSearchProcess = false;
            }
            break;
            
        case MessageTypes.SEARCH_ERROR:
            handleSearchError(detail || 'Unknown search error');
            window.inSearchProcess = false;
            break;
            
        case MessageTypes.RUN_SEARCH:
            // Ensure we have valid details
            if (!detail) {
                return;
            }
            
            const { word1, word2, gap, caseInsensitive } = detail;
            
            // Validate minimal parameters
            if (!word1 || !word2 || gap === undefined) {
                updateBanner('Error: Missing search parameters', true);
                return;
            }
            
            initiateSearch(word1, word2, gap, caseInsensitive);
            break;
    }
}

// Global message listener
window.addEventListener('message', event => {
    if (event.source !== window) return;
    
    const { type, detail, messageId } = event.data;
    if (!type) return;

    // Ignore messages we sent
    if (messageId && sentMessages.has(messageId)) {
        return;
    }
    
    handleMessage(type, detail, messageId);
});

// Function to initialize WebAssembly
function initializeWebAssembly() {
    if (initializationInProgress) {
        return;
    }
    
    initializationInProgress = true;
    updateBanner('Initializing WebAssembly...');

    // Get extension URLs
    const searchJsUrl = chrome.runtime.getURL('search.js');
    const wasmUrl = chrome.runtime.getURL('search.wasm');
    const pageJsUrl = chrome.runtime.getURL('page.js');

    // Verify URLs are valid
    if (!searchJsUrl || !wasmUrl || !pageJsUrl) {
        const error = 'Failed to get valid URLs';
        updateBanner('Error: ' + error, true);
        initializationInProgress = false;
        return;
    }

    // Create configuration element
    const configElement = document.createElement('div');
    configElement.id = 'wasm-config';
    configElement.style.display = 'none';
    document.body.appendChild(configElement);

    // Load page.js first
    const pageScript = document.createElement('script');
    pageScript.src = pageJsUrl;
    pageScript.onload = () => {
        // Set configuration after page.js is loaded
        configElement.setAttribute('data-config', JSON.stringify({
            searchJsUrl,
            wasmUrl
        }));
    };
    pageScript.onerror = (error) => {
        updateBanner('Error: Failed to load page script!', true);
        initializationInProgress = false;
    };
    document.head.appendChild(pageScript);
}

// Initialize WebAssembly
initializeWebAssembly();

// Make search function available globally for debugging
window.runSearch = function(word1, word2, gap) {
    // Convert gap to number if it's a string
    if (typeof gap === 'string') {
        gap = parseInt(gap, 10);
    }
    
    // Validate parameters
    if (!word1 || typeof word1 !== 'string') {
        updateBanner('Error: Invalid first word', true);
        return;
    }
    if (!word2 || typeof word2 !== 'string') {
        updateBanner('Error: Invalid second word', true);
        return;
    }
    if (isNaN(gap) || gap < 0) {
        updateBanner('Error: Invalid gap value', true);
        return;
    }
    
    // Send search request to page script
    sendToPage(MessageTypes.RUN_SEARCH, {
        word1: word1.trim(),
        word2: word2.trim(),
        gap: gap
    });
};

// Function to initiate a search
function initiateSearch(word1, word2, gap, caseInsensitive = false) {
    try {
        // Validate parameters
        if (!word1 || typeof word1 !== 'string' || word1.trim().length === 0) {
            throw new Error('Invalid first word');
        }
        if (!word2 || typeof word2 !== 'string' || word2.trim().length === 0) {
            throw new Error('Invalid second word');
        }
        if (typeof gap !== 'number' || gap < 0) {
            throw new Error('Invalid gap value');
        }
        
        if (!isWasmInitialized) {
            if (initializationInProgress) {
                throw new Error('Please wait, WebAssembly is still initializing...');
            } else {
                throw new Error('WebAssembly not initialized');
            }
        }
        
        updateBanner('Searching...');
        sendToPage(MessageTypes.RUN_SEARCH, { 
            word1: word1.trim(), 
            word2: word2.trim(), 
            gap,
            caseInsensitive
        });
    } catch (error) {
        updateBanner('Error: ' + error.message, true);
    }
}

// Handle search errors
function handleSearchError(error) {
    const errorMessage = error instanceof Error ? error.message : 
                        typeof error === 'string' ? error : 
                        'Unknown search error';
    
    updateBanner('Search error: ' + errorMessage, true);
}

// Function to remove existing highlights
function removeHighlights() {
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
    
    // The DOM structure has changed, clear the text cache
    clearTextCache();
    
    // Hide navigation and reset state
    nav.style.display = 'none';
    currentMatchIndex = -1;
    totalMatches = 0;
    
    // Send zero match count to background script
    try {
        safeSendMessage({
            type: 'MATCH_COUNT',
            count: 0
        });
    } catch (error) {
        // Silently fail
    }
}

// Helper function to normalize text while preserving word boundaries
function normalizeText(text) {
    return text
        .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
        .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Remove zero-width spaces
        .trim();  // Remove leading/trailing whitespace
}

// Helper function to get normalized document text
function getDocumentText() {
    // Check if we have a valid cached version (less than 5 seconds old)
    const now = Date.now();
    if (textCache.text && textCache.timestamp > now - 5000) {
        return textCache.text;
    }
    
    // Get all text nodes in document order
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
    
    let originalText = '';
    let normalizedText = '';
    let positions = [];
    let normalizedPosition = 0;
    let originalPosition = 0;
    
    // First pass: collect all text nodes
    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
        nodes.push(node);
    }
    
    // Second pass: process nodes and build position mapping
    for (const node of nodes) {
        const nodeText = node.textContent;
        const normalizedNodeText = normalizeText(nodeText);
        
        if (normalizedNodeText.length === 0) continue;
        
        // Verify node still has a parent
        if (!node.parentNode) {
            continue;
        }
        
        positions.push({
            node,
            originalStart: originalPosition,
            originalLength: nodeText.length,
            normalizedStart: normalizedPosition,
            normalizedLength: normalizedNodeText.length,
            originalText: nodeText,
            normalizedText: normalizedNodeText
        });
        
        originalText += nodeText;
        normalizedText += normalizedNodeText;
        originalPosition += nodeText.length;
        normalizedPosition += normalizedNodeText.length;
    }
    
    // Store the mapping between original and normalized positions
    window.textPositionMap = {
        original: originalText,
        normalized: normalizedText,
        positions: positions
    };
    
    // Cache the results
    textCache = {
        text: normalizedText,
        nodes: nodes,
        positions: positions,
        timestamp: now
    };
    
    return normalizedText;
}

// Update highlight matches function with optimized DOM operations
function highlightMatches(matches) {
    // Reset navigation
    currentMatchIndex = -1;
    
    if (!matches || matches.length === 0) {
        totalMatches = 0;
        return;
    }
    
    // Create a array to store highlighted elements
    const highlightedElements = [];
    
    // Create a set to store already highlighted text ranges to prevent duplication
    const highlightedTexts = new Set();
    
    // Track total matches for early reporting
    let processedMatchCount = 0;
    const totalMatchesToProcess = matches.length;
    
    // Batch processing using requestAnimationFrame for better UI responsiveness
    function processMatchBatch(matchIndex, nodeIndex) {
        // Check if we've processed all matches
        if (matchIndex >= matches.length) {
            // Set the final count
            totalMatches = highlightedElements.length;
            
            // Force sync to ensure accurate count
            syncMatchCount();
            
            // Now continue with other finalization tasks
            finishHighlighting();
            return;
        }
        
        // Process a batch of matches (up to 5 per frame)
        const batchSize = 5;
        const endMatchIndex = Math.min(matchIndex + batchSize, matches.length);
        
        for (let i = matchIndex; i < endMatchIndex; i++) {
            const match = matches[i];
            processMatch(match);
            processedMatchCount++;
        }
        
        // Update banner with progress
        if (processedMatchCount % 20 === 0 || processedMatchCount === totalMatchesToProcess) {
            updateBanner(`Processing matches: ${processedMatchCount}/${totalMatchesToProcess}`);
        }
        
        // Schedule next batch
        requestAnimationFrame(() => processMatchBatch(endMatchIndex, 0));
    }
    
    // Process a single match
    function processMatch(match) {
        // Skip invalid matches
        if (!match.text || !match.word1) {
            return;
        }
        
        // Create a unique ID for this match
        const matchId = `${match.start}-${match.length}`;
        
        // Skip if we've already highlighted this text
        if (highlightedTexts.has(matchId)) {
            return;
        }
        
        // Find text in DOM
        findAndHighlightText(match);
        
        // Mark this match as processed
        highlightedTexts.add(matchId);
    }
    
    // Function to find and highlight specific text
    function findAndHighlightText(match) {
        // Text to search for - use the original match text to ensure we find exact matches
        const searchText = match.text;
        
        // Function to find the index of search text in a string
        const findIndex = (text, search, startPos = 0) => {
            if (!text || !search) return -1;
            
            // For case insensitive search, convert both to lowercase
            if (match.caseInsensitive) {
                const lowerText = text.toLowerCase();
                const lowerSearch = search.toLowerCase();
                return lowerText.indexOf(lowerSearch, startPos);
            }
            
            return text.indexOf(search, startPos);
        };
        
        // Get all text nodes in a single pass (using cached nodes if available)
        const nodesToProcess = textCache.nodes.length > 0 ? 
            textCache.nodes : 
            collectTextNodes();
        
        // Use efficient node processing with DocumentFragment
        for (const node of nodesToProcess) {
            if (!node.parentNode) continue;
            
            const nodeText = node.textContent;
            if (!nodeText) continue;
            
            // Find text in this node
            const foundPos = findIndex(nodeText, searchText, 0);
            if (foundPos === -1) continue;
            
            // Create DocumentFragment for efficient DOM operations
            const fragment = document.createDocumentFragment();
            
            // Create before text node
            if (foundPos > 0) {
                fragment.appendChild(document.createTextNode(
                    nodeText.substring(0, foundPos)
                ));
            }
            
            // Create highlight span
            const span = document.createElement('span');
            span.className = 'wasm-search-highlight';
            span.textContent = nodeText.substring(foundPos, foundPos + searchText.length);
            fragment.appendChild(span);
            
            // Create after text node
            if (foundPos + searchText.length < nodeText.length) {
                fragment.appendChild(document.createTextNode(
                    nodeText.substring(foundPos + searchText.length)
                ));
            }
            
            // Replace node with fragment (single DOM operation)
            const parent = node.parentNode;
            parent.replaceChild(fragment, node);
            
            // Add to highlighted elements
            highlightedElements.push(span);
            
            // Found a match, no need to check further
            break;
        }
    }
    
    // Function to collect all text nodes
    function collectTextNodes() {
        const nodes = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip scripts, styles, and hidden elements
                    const parent = node.parentNode;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    if (parent.tagName === 'SCRIPT' || 
                        parent.tagName === 'STYLE' ||
                        parent.offsetParent === null) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Skip nodes that are already highlighted
                    if (parent.classList && 
                        parent.classList.contains('wasm-search-highlight')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        let node;
        while (node = walker.nextNode()) {
            nodes.push(node);
        }
        
        return nodes;
    }
    
    // Function to finalize the highlighting process
    function finishHighlighting() {
        // Get the highlights to use for navigation
        const highlights = document.querySelectorAll('.wasm-search-highlight');
        
        // Get the fixed total matches from C++
        const fixedTotal = window.fixedTotalMatches || totalMatches;
        
        // Update banner to ensure UI is responsive - use the FIXED total
        updateBanner(`Found ${fixedTotal} matches`);
        
        // Update navigation display with the FIXED total
        nav.style.display = 'flex';
        nav.querySelector('.count').textContent = `1 of ${fixedTotal}`;
        nav.querySelector('.prev').disabled = true;
        nav.querySelector('.next').disabled = highlights.length <= 1;
        
        // Set first match as active
        currentMatchIndex = highlights.length > 0 ? 0 : -1;
        
        // If we found matches, navigate to the first one
        if (highlights.length > 0) {
            // Just scroll to first match without updating the total
            const highlight = highlights[0];
            highlight.classList.add('active');
            highlight.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            
            // Send navigation update with FIXED total
            try {
                safeSendMessage({
                    type: 'MATCH_NAVIGATION',
                    current: 0,
                    total: fixedTotal
                });
            } catch (error) {
                console.error('Failed to send navigation update:', error);
            }
        }
        
        // Clear text cache if it's getting too large (memory optimization)
        if (textCache.nodes.length > 10000) {
            clearTextCache();
        }
    }
    
    // Start processing the first batch of matches
    processMatchBatch(0, 0);
}

// Add a function to force-sync the match count
function syncMatchCount() {
    const highlights = document.querySelectorAll('.wasm-search-highlight');
    totalMatches = highlights.length; // Always use the actual DOM count as source of truth
    
    // Send the accurate count to the popup
    try {
        safeSendMessage({
            type: 'FORCE_SYNC_COUNT',
            count: totalMatches
        });
        console.debug(`Force-synced match count: ${totalMatches}`);
    } catch (error) {
        // Silently fail
    }
    
    return totalMatches;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_MATCH_COUNT') {
        const count = syncMatchCount();
        sendResponse({ count: count });
    }
    
    if (message.type === 'NAVIGATE_MATCH' && message.direction) {
        if (message.direction === 'next' && currentMatchIndex < totalMatches - 1) {
            scrollToMatch(currentMatchIndex + 1);
        } else if (message.direction === 'prev' && currentMatchIndex > 0) {
            scrollToMatch(currentMatchIndex - 1);
        }
        
        // Always sync after navigation
        syncMatchCount();
    }
    
    return true; // Keep the message channel open for async response
});

// Helper function for safe message sending
function safeSendMessage(message) {
    try {
        chrome.runtime.sendMessage(message).catch(error => {
            // Silently handle connection errors
            if (error && !error.message.includes('receiving end does not exist')) {
                console.debug('Non-connection error in message sending:', error);
            }
        });
    } catch (error) {
        // Silently catch any other errors
        console.debug('Error sending message:', error);
    }
} 