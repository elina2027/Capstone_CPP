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

// Listen for search completion
window.addEventListener('searchComplete', (event) => {
    const { count, matches } = event.detail;
    console.log('[CONTENT] Search completed:', { 
        count, 
        matches: matches.map(m => ({
            text: m.text,
            start: m.start,
            length: m.length,
            wordCount: m.wordCount,
            textContext: document.body.textContent.substring(
                Math.max(0, m.start - 20),
                Math.min(document.body.textContent.length, m.start + m.length + 20)
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
    } else {
        updateBanner('No matches found');
    }
});

// Listen for search messages
window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data.type !== 'RUN_SEARCH') return;
    
    const { word1, word2, gap } = event.data;
    console.log('[CONTENT] Search requested:', { word1, word2, gap });
    
    // Store search parameters for later use
    window.lastSearchParams = { word1, word2, gap };
    
    // Dispatch search request to page context
    window.dispatchEvent(new CustomEvent('runSearch', {
        detail: { word1, word2, gap }
    }));
});

// Listen for clean request
window.addEventListener('message', event => {
    if (event.source !== window) return;
    
    if (event.data.type === 'RUN_SEARCH') {
        const { word1, word2, gap } = event.data;
        console.log('[CONTENT] Search requested:', { word1, word2, gap });
        
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
    chrome.runtime.sendMessage({
        type: 'MATCH_COUNT',
        count: 0
    });
});

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

// Helper function to normalize text for position calculation
function normalizeText(text) {
    // Convert to innerText-like format
    return text.replace(/[\r\n]+/g, '\n')  // Normalize line endings
              .replace(/[ \t]+/g, ' ')      // Collapse multiple spaces
              .trim();                      // Trim ends
}

// Helper function to get normalized document text
function getDocumentText() {
    return document.body.innerText;
}

// Update highlight matches function
function highlightMatches(matches) {
    console.log('[CONTENT] Starting highlight process for matches:', 
        matches.map(m => ({
            text: m.text.trim(),
            start: m.start,
            length: m.length,
            wordCount: m.wordCount,
            context: getDocumentText().substring(
                Math.max(0, m.start - 20),
                Math.min(getDocumentText().length, m.start + m.length + 20)
            )
        }))
    );
    
    // Remove existing highlights first
    removeHighlights();
    
    // Reset navigation
    currentMatchIndex = -1;
    totalMatches = matches.length;
    
    // Get the full document text for verification
    const fullText = getDocumentText();
    console.log('[CONTENT] Document text length:', fullText.length);
    
    // Sort matches by start position in reverse order
    matches.sort((a, b) => b.start - a.start);
    
    // Helper function to check word boundaries
    function isWordBoundary(char) {
        return /[\s,.!?;:()\[\]{}"']/.test(char) || !char;
    }
    
    // Collect all text nodes first
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // Skip script and style contents
                if (node.parentNode.tagName === 'SCRIPT' || 
                    node.parentNode.tagName === 'STYLE') {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip hidden elements
                if (node.parentNode.offsetParent === null) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip existing highlights
                if (node.parentNode.classList?.contains('wasm-search-highlight')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );
    
    let textNodes = [];
    let node;
    let position = 0;
    let normalizedText = '';
    
    // First pass: collect all text and build position mapping
    while (node = walker.nextNode()) {
        const nodeText = normalizeText(node.textContent);
        if (nodeText.length === 0) continue;
        
        textNodes.push({
            node: node,
            originalText: node.textContent,
            normalizedText: nodeText,
            start: position,
            length: nodeText.length,
            end: position + nodeText.length
        });
        
        normalizedText += nodeText;
        position += nodeText.length;
    }
    
    console.log('[CONTENT] Text verification:', {
        fullText: fullText,
        normalizedText: normalizedText,
        match: fullText === normalizedText ? 'texts match' : 'texts differ'
    });
    
    // Process each match
    for (const match of matches) {
        // Get the actual text at the match position
        const matchText = fullText.substring(match.start, match.start + match.length);
        
        console.log('[CONTENT] Processing match:', {
            start: match.start,
            length: match.length,
            text: matchText,
            word1: match.word1,
            word2: match.word2,
            context: fullText.substring(
                Math.max(0, match.start - 20),
                Math.min(fullText.length, match.start + match.length + 20)
            )
        });
        
        // Find nodes that contain this match
        const relevantNodes = textNodes.filter(tn => 
            (tn.start <= match.start && match.start < tn.end) || // Contains start
            (tn.start < match.start + match.length && match.start + match.length <= tn.end) || // Contains end
            (match.start <= tn.start && tn.end <= match.start + match.length) // Completely contained
        );
        
        if (relevantNodes.length === 0) {
            console.warn('[CONTENT] No nodes found for match:', match);
            continue;
        }
        
        // Process each relevant node
        for (let i = 0; i < relevantNodes.length; i++) {
            const nodeInfo = relevantNodes[i];
            const node = nodeInfo.node;
            
            // Skip if node is already part of a highlight
            if (node.parentNode.classList?.contains('wasm-search-highlight')) {
                continue;
            }
            
            // Calculate highlight boundaries within this node
            const startInNode = Math.max(0, match.start - nodeInfo.start);
            const endInNode = Math.min(
                nodeInfo.length,
                match.start + match.length - nodeInfo.start
            );
            
            if (startInNode >= endInNode) continue;
            
            const highlightText = nodeInfo.normalizedText.substring(startInNode, endInNode);
            
            console.log('[CONTENT] Creating highlight in node:', {
                startInNode,
                endInNode,
                highlightText,
                nodeText: nodeInfo.normalizedText,
                originalText: nodeInfo.originalText,
                nodeStart: nodeInfo.start,
                nodeEnd: nodeInfo.end
            });
            
            // Create highlight element
            const highlight = document.createElement('span');
            highlight.className = 'wasm-search-highlight new';
            highlight.textContent = highlightText;
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
            
            // Split text node if necessary and insert highlight
            if (startInNode > 0) {
                node.splitText(startInNode);
            }
            
            const nodeToReplace = startInNode > 0 ? node.nextSibling : node;
            if (endInNode < nodeToReplace.textContent.length) {
                nodeToReplace.splitText(endInNode - startInNode);
            }
            
            nodeToReplace.parentNode.replaceChild(highlight, nodeToReplace);
        }
    }
    
    // Verify highlights
    const highlights = document.querySelectorAll('.wasm-search-highlight');
    console.log('[CONTENT] Verification - Created highlights:', 
        Array.from(highlights).map(h => ({
            text: h.textContent.trim(),
            length: h.textContent.length,
            start: parseInt(h.getAttribute('data-match-start')),
            matchLength: parseInt(h.getAttribute('data-match-length')),
            word1: h.getAttribute('data-word1'),
            word2: h.getAttribute('data-word2'),
            context: fullText.substring(
                Math.max(0, parseInt(h.getAttribute('data-match-start')) - 20),
                Math.min(fullText.length, parseInt(h.getAttribute('data-match-start')) + parseInt(h.getAttribute('data-match-length')) + 20)
            )
        }))
    );
    
    // Update match count
    totalMatches = highlights.length;
    
    // Scroll to first match if any found
    if (totalMatches > 0) {
        setTimeout(() => {
            scrollToMatch(0);
        }, 100);
    }
    
    // Update navigation
    updateNavigation();
} 