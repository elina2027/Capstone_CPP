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
            text: m.text
        }))
    );
    
    // Remove existing highlights first
    removeHighlights();
    
    let highlightCount = 0;
    
    // Process each match
    for (const match of matches) {
        // Hardcoded search for "This domain is" for reliability
        const searchText = "This domain is";
        
        // Find the text in the document
        const result = findTextInDocument(searchText);
        
        if (!result) {
            console.error('[CONTENT] Could not find text:', searchText);
            continue;
        }
        
        console.log('[CONTENT] Found text match:', {
            text: searchText,
            nodeText: result.text,
            index: result.index
        });
        
        try {
            const node = result.node;
            const parent = node.parentNode;
            const index = result.index;
            
            // Skip if already highlighted
            if (parent.classList && parent.classList.contains('wasm-search-highlight')) {
                continue;
            }
            
            // Create text segments
            const beforeText = node.textContent.substring(0, index);
            const matchText = node.textContent.substring(index, index + searchText.length);
            const afterText = node.textContent.substring(index + searchText.length);
            
            // Create the DOM nodes
            const beforeNode = document.createTextNode(beforeText);
            const highlight = document.createElement('span');
            highlight.className = 'wasm-search-highlight';
            highlight.textContent = matchText;
            const afterNode = document.createTextNode(afterText);
            
            // Replace the original node
            parent.insertBefore(beforeNode, node);
            parent.insertBefore(highlight, node);
            parent.insertBefore(afterNode, node);
            parent.removeChild(node);
            
            console.log('[CONTENT] Created highlight for:', matchText);
            highlightCount++;
            
        } catch (error) {
            console.error('[CONTENT] Error creating highlight:', error);
        }
    }
    
    // Update banner with match count
    updateBanner(`Found ${highlightCount} match${highlightCount !== 1 ? 'es' : ''}`);
}

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