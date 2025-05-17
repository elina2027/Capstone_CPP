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
        background-color: yellow;
        padding: 2px;
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
            length: m.length
        }))
    );
    
    // Remove existing highlights first
    removeHighlights();
    
    // Get fresh text mapping
    console.log('[CONTENT] Creating text position mapping...');
    getDocumentText();
    
    if (!window.textPositionMap) {
        console.error('[CONTENT] Failed to create text position mapping');
        return;
    }
    
    const { original, normalized, positions } = window.textPositionMap;
    
    // Process each match
    for (const match of matches) {
        // Find the node containing this match
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
        
        if (!matchNode) continue;
        
        try {
            // Calculate position within the node
            const offsetInNode = match.start - matchPosition.normalizedStart;
            const parent = matchNode.parentNode;
            
            // Skip if already highlighted
            if (parent.classList && parent.classList.contains('wasm-search-highlight')) {
                continue;
            }
            
            // Create highlight element
            const highlight = document.createElement('span');
            highlight.className = 'wasm-search-highlight';
            
            // Get the actual text of the match
            const matchLength = Math.min(
                match.length,
                matchPosition.normalizedLength - offsetInNode
            );
            
            // Create text segments
            const beforeText = matchNode.textContent.substring(0, offsetInNode);
            const matchText = matchNode.textContent.substring(offsetInNode, offsetInNode + matchLength);
            const afterText = matchNode.textContent.substring(offsetInNode + matchLength);
            
            // Perform the DOM manipulation
            const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
            const afterNode = afterText ? document.createTextNode(afterText) : null;
            
            // Set the highlight text
            highlight.textContent = matchText;
            
            // Replace the original node
            if (beforeNode) parent.insertBefore(beforeNode, matchNode);
            parent.insertBefore(highlight, matchNode);
            if (afterNode) parent.insertBefore(afterNode, matchNode);
            
            // Remove the original node
            parent.removeChild(matchNode);
            
        } catch (error) {
            console.error('[CONTENT] Error creating highlight:', error);
        }
    }
    
    // Update banner with match count
    updateBanner(`Found ${matches.length} match${matches.length !== 1 ? 'es' : ''}`);
} 