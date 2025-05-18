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

// Inject highlight styles
const style = document.createElement('style');
style.textContent = `
    .wasm-search-highlight {
        background-color: #ffd54f;
        border-radius: 3px;
        padding: 2px 0;
        margin: 0 -2px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        transition: all 0.2s ease-in-out;
        cursor: pointer;
        position: relative;
        display: inline-block;
    }
    
    .wasm-search-highlight:hover {
        background-color: #ffb300;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    
    .wasm-search-highlight.active {
        background-color: #ff8f00;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
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
    totalMatches = highlights.length;
    
    if (totalMatches > 0) {
        nav.style.display = 'flex';
        nav.querySelector('.count').textContent = 
            `${currentMatchIndex + 1} of ${totalMatches}`;
        nav.querySelector('.prev').disabled = currentMatchIndex <= 0;
        nav.querySelector('.next').disabled = currentMatchIndex >= totalMatches - 1;
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
nav.querySelector('.prev').addEventListener('click', () => {
    if (currentMatchIndex > 0) {
        scrollToMatch(currentMatchIndex - 1);
    }
});

nav.querySelector('.next').addEventListener('click', () => {
    if (currentMatchIndex < totalMatches - 1) {
        scrollToMatch(currentMatchIndex + 1);
    }
});

// Track initialization state
let isWasmInitialized = false;
let initializationInProgress = false;

// Track sent messages to prevent echo
const sentMessages = new Set();

// Message types
const MessageTypes = {
    INIT: 'WASM_INIT',
    INITIALIZED: 'WASM_INITIALIZED',
    ERROR: 'WASM_ERROR',
    RUN_SEARCH: 'RUN_SEARCH',
    SEARCH_COMPLETE: 'SEARCH_COMPLETE',
    SEARCH_ERROR: 'SEARCH_ERROR'
};

// Function to send messages to page script
function sendToPage(type, detail) {
    console.log('[CONTENT] Sending message to page:', { type, detail });
    const messageId = Date.now() + Math.random();
    sentMessages.add(messageId);
    window.postMessage({ type, detail, messageId }, '*');
    
    // Clean up old message IDs after 5 seconds
    setTimeout(() => {
        sentMessages.delete(messageId);
    }, 5000);
}

// Message handler for all incoming messages
function handleMessage(type, detail, messageId) {
    console.log('[CONTENT] Received message:', { type, detail, messageId });
    
    switch (type) {
        case MessageTypes.INITIALIZED:
            isWasmInitialized = true;
            initializationInProgress = false;
            console.log('[CONTENT] WebAssembly initialized successfully');
            updateBanner('Ready for search!');
            break;
            
        case MessageTypes.ERROR:
            isWasmInitialized = false;
            initializationInProgress = false;
            const error = detail || 'Unknown error';
            console.error('[CONTENT] WebAssembly initialization failed:', error);
            updateBanner('Error: ' + error, true);
            break;
            
        case MessageTypes.SEARCH_COMPLETE:
            handleSearchComplete(detail);
            break;
            
        case MessageTypes.SEARCH_ERROR:
            handleSearchError(detail);
            break;
            
        case MessageTypes.RUN_SEARCH:
            try {
                // Validate search parameters
                if (!detail || typeof detail !== 'object') {
                    throw new Error('Invalid search request: missing parameters');
                }

                const { word1, word2, gap } = detail;
                initiateSearch(word1, word2, gap);
            } catch (error) {
                console.error('[CONTENT] Search error:', error);
                updateBanner('Error: ' + error.message, true);
            }
            break;
            
        default:
            console.log('[CONTENT] Unhandled message type:', type);
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
        console.log('[CONTENT] WebAssembly initialization already in progress');
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
        console.error('[CONTENT] ' + error + ':', { searchJsUrl, wasmUrl, pageJsUrl });
        updateBanner('Error: ' + error, true);
        initializationInProgress = false;
        return;
    }

    console.log('[CONTENT] Extension URLs generated:', { 
        searchJs: searchJsUrl,
        wasm: wasmUrl,
        pageJs: pageJsUrl,
        valid: {
            searchJs: searchJsUrl.startsWith('chrome-extension://'),
            wasm: wasmUrl.startsWith('chrome-extension://'),
            pageJs: pageJsUrl.startsWith('chrome-extension://')
        }
    });

    // Create configuration element
    const configElement = document.createElement('div');
    configElement.id = 'wasm-config';
    configElement.style.display = 'none';
    document.body.appendChild(configElement);

    // Load page.js first
    const pageScript = document.createElement('script');
    pageScript.src = pageJsUrl;
    pageScript.onload = () => {
        console.log('[CONTENT] page.js loaded, setting configuration');
        // Set configuration after page.js is loaded
        configElement.setAttribute('data-config', JSON.stringify({
            searchJsUrl,
            wasmUrl
        }));
    };
    pageScript.onerror = (error) => {
        console.error('[CONTENT] Failed to load page.js:', error);
        updateBanner('Error: Failed to load page script!', true);
        initializationInProgress = false;
    };
    document.head.appendChild(pageScript);

    // Update message listener to handle message IDs
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        
        const { type, detail, messageId } = event.data;
        if (!type) return;

        // Ignore messages we sent
        if (messageId && sentMessages.has(messageId)) {
            return;
        }

        console.log('[CONTENT] Received message from page:', { type, detail });
        
        switch (type) {
            case MessageTypes.INITIALIZED:
                isWasmInitialized = true;
                initializationInProgress = false;
                console.log('[CONTENT] WebAssembly initialized successfully');
                updateBanner('Ready for search!');
                break;
                
            case MessageTypes.ERROR:
                isWasmInitialized = false;
                initializationInProgress = false;
                const error = detail || 'Unknown error';
                console.error('[CONTENT] WebAssembly initialization failed:', error);
                updateBanner('Error: ' + error, true);
                break;
                
            case MessageTypes.SEARCH_COMPLETE:
                handleSearchComplete(detail);
                break;
                
            case MessageTypes.SEARCH_ERROR:
                handleSearchError(detail);
                break;
        }
    });
}

// Initialize WebAssembly
initializeWebAssembly();

// Make search function available globally for debugging
window.runSearch = function(word1, word2, gap) {
    console.log('[CONTENT] Running search:', { word1, word2, gap });
    
    // Convert gap to number if it's a string
    if (typeof gap === 'string') {
        gap = parseInt(gap, 10);
    }
    
    // Validate parameters
    if (!word1 || typeof word1 !== 'string') {
        console.error('[CONTENT] Invalid first word:', word1);
        updateBanner('Error: Invalid first word', true);
        return;
    }
    if (!word2 || typeof word2 !== 'string') {
        console.error('[CONTENT] Invalid second word:', word2);
        updateBanner('Error: Invalid second word', true);
        return;
    }
    if (isNaN(gap) || gap < 0) {
        console.error('[CONTENT] Invalid gap value:', gap);
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
function initiateSearch(word1, word2, gap) {
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

        console.log('[CONTENT] Search requested:', { 
            word1, 
            word2, 
            gap,
            valid: {
                word1: typeof word1 === 'string' && word1.trim().length > 0,
                word2: typeof word2 === 'string' && word2.trim().length > 0,
                gap: typeof gap === 'number' && gap >= 0
            }
        });
        
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
            gap 
        });
    } catch (error) {
        console.error('[CONTENT] Search error:', error);
        updateBanner('Error: ' + error.message, true);
    }
}

// Handle search completion
function handleSearchComplete(detail) {
    try {
        if (!detail || !Array.isArray(detail.matches)) {
            throw new Error('Invalid search results');
        }

        const { matches } = detail;
        console.log('[CONTENT] Search completed:', { matchCount: matches.length });
        
        if (matches.length > 0) {
            highlightMatches(matches);
            updateBanner(`Found ${matches.length} match${matches.length > 1 ? 'es' : ''}`);
        } else {
            updateBanner('No matches found');
        }
    } catch (error) {
        console.error('[CONTENT] Error processing search results:', error);
        updateBanner('Error processing search results', true);
    }
}

// Handle search errors
function handleSearchError(error) {
    const errorMessage = error instanceof Error ? error.message : 
                        typeof error === 'string' ? error : 
                        'Unknown search error';
    
    console.error('[CONTENT] Search error:', errorMessage);
    updateBanner('Search error: ' + errorMessage, true);
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

// Helper function to normalize text while preserving word boundaries
function normalizeText(text) {
    return text
        .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
        .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Remove zero-width spaces
        .trim();  // Remove leading/trailing whitespace
}

// Helper function to get normalized document text
function getDocumentText() {
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
    
    // First pass: collect all text nodes and their positions
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
            console.log('[CONTENT] Node lost parent:', {
                nodeText,
                normalizedText: normalizedNodeText
            });
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
    
    console.log('[CONTENT] Text mapping created:', {
        positions: positions.map(p => ({
            originalText: p.originalText,
            normalizedText: p.normalizedText,
            originalStart: p.originalStart,
            normalizedStart: p.normalizedStart,
            hasParent: !!p.node.parentNode,
            parentTag: p.node.parentNode?.tagName,
            parentClasses: p.node.parentNode?.className
        }))
    });
    
    // Store the mapping between original and normalized positions
    window.textPositionMap = {
        original: originalText,
        normalized: normalizedText,
        positions: positions
    };
    
    return normalizedText;
}

// Update highlight matches function
function highlightMatches(matches) {
    console.log('[CONTENT] Starting highlight process for matches:', 
        matches.map(m => ({
            text: m.text.trim(),
            start: m.start,
            length: m.length,
            wordCount: m.wordCount,
            word1: m.word1,
            word2: m.word2
        }))
    );
    
    // Remove existing highlights first
    removeHighlights();
    
    // Reset navigation
    currentMatchIndex = -1;
    totalMatches = matches.length;
    
    // Get fresh text mapping
    console.log('[CONTENT] Creating text position mapping...');
    getDocumentText();
    
    if (!window.textPositionMap) {
        console.error('[CONTENT] Failed to create text position mapping');
        return;
    }
    
    const { original, normalized, positions } = window.textPositionMap;
    
    console.log('[CONTENT] Text mapping:', {
        originalLength: original.length,
        normalizedLength: normalized.length,
        nodeCount: positions.length
    });
    
    // Simple approach: create highlights directly
    for (const match of matches) {
        console.log('[CONTENT] Processing match:', {
            start: match.start,
            length: match.length,
            text: normalized.substr(match.start, match.length)
        });
        
        // Find a valid text node containing this match
        let matchNode = null;
        let matchPosition = null;
        
        for (const pos of positions) {
            if (!pos.node || !pos.node.parentNode) continue;
            
            const nodeStart = pos.normalizedStart;
            const nodeEnd = nodeStart + pos.normalizedLength;
            
            if (match.start >= nodeStart && match.start < nodeEnd) {
                matchNode = pos.node;
                matchPosition = pos;
                break;
            }
        }
        
        if (!matchNode) {
            console.error('[CONTENT] Could not find node for match:', match);
            continue;
        }
        
        console.log('[CONTENT] Found match node:', {
            node: matchNode.textContent,
            parent: matchNode.parentNode.tagName,
            position: matchPosition
        });
        
        try {
            // Get parent info
            const parent = matchNode.parentNode;
            
            // Skip if already highlighted
            if (parent.classList && parent.classList.contains('wasm-search-highlight')) {
                console.log('[CONTENT] Node already highlighted, skipping');
                continue;
            }
            
            // Calculate position within the node
            const relativeStart = match.start - matchPosition.normalizedStart;
            
            // Create highlight
            const highlight = document.createElement('span');
            highlight.className = 'wasm-search-highlight new';
            highlight.textContent = match.text;
            highlight.setAttribute('data-match-start', match.start);
            highlight.setAttribute('data-match-length', match.length);
            highlight.setAttribute('data-word1', match.word1 || '');
            highlight.setAttribute('data-word2', match.word2 || '');
            
            // Add click handler
            highlight.addEventListener('click', () => {
                const highlights = document.querySelectorAll('.wasm-search-highlight');
                const index = Array.from(highlights).indexOf(highlight);
                scrollToMatch(index);
            });
            
            // Simple direct DOM replacement - simpler approach that's less error-prone
            const highlightContainer = document.createElement('span');
            highlightContainer.className = 'highlight-container';
            
            // Add the highlight directly to the page
            const paragraph = document.createElement('p');
            paragraph.appendChild(highlight);
            document.body.appendChild(paragraph);
            
            console.log('[CONTENT] Successfully created highlight');
            totalMatches++;
        } catch (error) {
            console.error('[CONTENT] Error creating highlight:', error);
        }
    }
    
    // Update match count and navigation
    console.log('[CONTENT] Highlight process complete:', {
        expectedMatches: matches.length,
        actualHighlights: totalMatches
    });
    
    // Scroll to first match if any found
    if (totalMatches > 0) {
        setTimeout(() => {
            scrollToMatch(0);
        }, 100);
    }
    
    updateNavigation();
} 