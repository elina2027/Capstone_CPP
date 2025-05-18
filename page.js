// Global state management
const state = {
    initialized: false,
    error: null,
    pendingSearches: [],
    memory: null,
    exports: {
        search: false,
        malloc: false,
        free: false,
        HEAP32: false
    }
};

// Message types
const MessageTypes = {
    INITIALIZED: 'WASM_INITIALIZED',
    ERROR: 'WASM_ERROR',
    RUN_SEARCH: 'RUN_SEARCH',
    SEARCH_COMPLETE: 'SEARCH_COMPLETE',
    SEARCH_ERROR: 'SEARCH_ERROR'
};

// Track outgoing messages to prevent echo
const sentMessages = new Set();

// Function to send message to content script
function sendToContent(type, detail) {
    const messageId = Date.now() + Math.random();
    console.log('[PAGE] Sending message to content:', { 
        type, 
        detail,
        messageId: messageId.toString().slice(-6)
    });
    
    sentMessages.add(messageId);
    window.postMessage({ type, detail, messageId }, '*');
    
    // Clean up old message IDs after 5 seconds
    setTimeout(() => {
        sentMessages.delete(messageId);
    }, 5000);
}

// Function to update state and log changes
function updateState(updates) {
    const oldState = { ...state };
    Object.assign(state, updates);
    
    console.log('[PAGE] State updated:', {
        changes: Object.entries(updates).map(([key, value]) => ({
            key,
            old: oldState[key],
            new: value
        })),
        currentState: { ...state }
    });
}

// Listen for configuration events
document.addEventListener('wasmConfigReady', function(event) {
    const config = event.detail;
    console.log('[PAGE] Received WebAssembly configuration:', config);
    
    if (state.initialized) {
        console.log('[PAGE] WebAssembly already initialized, ignoring configuration');
        return;
    }
    
    initWasm(config.searchJsUrl, config.wasmUrl);
}, { once: true });

// Create WebAssembly memory
state.memory = new WebAssembly.Memory({
    initial: 256,  // 16MB (256 pages * 64KB)
    maximum: 256,  // 16MB (256 pages * 64KB)
    shared: false
});

console.log('[PAGE] Created WebAssembly memory:', state.memory);

// Initialize memory views
function initMemoryViews() {
    console.log('[PAGE] Initializing memory views...');
    if (!window.Module) {
        console.error('[PAGE] Module not available for memory view initialization');
        return false;
    }
    
    try {
        window.Module.HEAP8 = new Int8Array(state.memory.buffer);
        window.Module.HEAP16 = new Int16Array(state.memory.buffer);
        window.Module.HEAP32 = new Int32Array(state.memory.buffer);
        window.Module.HEAPU8 = new Uint8Array(state.memory.buffer);
        window.Module.HEAPU16 = new Uint16Array(state.memory.buffer);
        window.Module.HEAPU32 = new Uint32Array(state.memory.buffer);
        
        updateState({ exports: { ...state.exports, HEAP32: true } });
        console.log('[PAGE] Memory views initialized successfully');
        return true;
    } catch (error) {
        console.error('[PAGE] Failed to initialize memory views:', error);
        return false;
    }
}

// Verify required exports
function verifyExports() {
    const required = ['_search', '_malloc', '_free'];
    const missing = required.filter(name => !window.Module[name]);
    
    if (missing.length > 0) {
        const error = `Missing required exports: ${missing.join(', ')}`;
        console.error('[PAGE]', error);
        return false;
    }
    
    updateState({
        exports: {
            ...state.exports,
            search: true,
            malloc: true,
            free: true
        }
    });
    
    console.log('[PAGE] All required exports verified');
    return true;
}

// Initialize WebAssembly
function initWasm(searchJsUrl, wasmUrl) {
    console.log('[PAGE] Starting WebAssembly initialization with URLs:', {
        searchJs: searchJsUrl,
        wasm: wasmUrl
    });

    window.Module = {
        wasmMemory: state.memory,
        INITIAL_MEMORY: 16777216,  // 16MB
        MAXIMUM_MEMORY: 16777216,  // 16MB
        ALLOW_MEMORY_GROWTH: 0,    // Disable memory growth

        print: function(text) { console.log('[WASM]', text); },
        printErr: function(text) { console.error('[WASM]', text); },

        locateFile: function(path) {
            if (path.endsWith('.wasm')) {
                console.log('[PAGE] Returning WASM URL:', wasmUrl);
                return wasmUrl;
            }
            return path;
        },

        onAbort: function(what) {
            const error = 'WebAssembly aborted: ' + what;
            console.error('[PAGE]', error);
            updateState({ error, initialized: false });
            sendToContent(MessageTypes.ERROR, error);
        },

        onRuntimeInitialized: function() {
            console.log('[PAGE] WebAssembly runtime initialized');
            
            if (!initMemoryViews()) {
                const error = 'Failed to initialize memory views';
                updateState({ error, initialized: false });
                sendToContent(MessageTypes.ERROR, error);
                return;
            }
            
            if (!verifyExports()) {
                const error = 'Missing required WebAssembly exports';
                updateState({ error, initialized: false });
                sendToContent(MessageTypes.ERROR, error);
                return;
            }
            
            updateState({ initialized: true, error: null });
            sendToContent(MessageTypes.INITIALIZED);
            
            if (state.pendingSearches.length > 0) {
                console.log('[PAGE] Processing pending searches:', state.pendingSearches.length);
                while (state.pendingSearches.length > 0) {
                    const search = state.pendingSearches.shift();
                    executeSearch(search.word1, search.word2, search.gap);
                }
            }
        }
    };

    const script = document.createElement('script');
    script.src = searchJsUrl;
    script.onload = () => {
        console.log('[PAGE] search.js loaded, Module status:', {
            exists: !!window.Module,
            initialized: state.initialized,
            exports: state.exports
        });
    };
    script.onerror = (error) => {
        console.error('[PAGE] Failed to load search.js:', error);
        const errorMsg = 'Failed to load WebAssembly module';
        updateState({ error: errorMsg, initialized: false });
        sendToContent(MessageTypes.ERROR, errorMsg);
    };
    document.head.appendChild(script);
}

// Helper function to allocate string in WebAssembly memory
function allocateString(str) {
    if (!window.Module || !Module._malloc || !Module.stringToUTF8 || !Module.lengthBytesUTF8) {
        throw new Error('Memory management functions not available');
    }
    
    const length = Module.lengthBytesUTF8(str) + 1; // +1 for null terminator
    const ptr = Module._malloc(length);
    if (!ptr) {
        throw new Error('Failed to allocate memory');
    }
    
    Module.stringToUTF8(str, ptr, length);
    return { ptr, length };
}

// Function to initiate a search
function initiateSearch(word1, word2, gap) {
    console.log('[PAGE] Initiating search:', { word1, word2, gap });
    
    // Validate parameters before proceeding
    if (!word1 || !word2 || typeof gap !== 'number') {
        const error = 'Invalid search parameters';
        console.error('[PAGE] Search error:', {
            error,
            params: { word1, word2, gap }
        });
        sendToContent(MessageTypes.SEARCH_ERROR, error);
        return;
    }

    // Queue search if WebAssembly isn't ready
    if (!state.initialized) {
        console.log('[PAGE] WebAssembly not ready, queueing search');
        state.pendingSearches.push({ word1, word2, gap });
        return;
    }

    // Execute search
    executeSearch(word1, word2, gap);
}

// Handle search execution
function executeSearch(word1, word2, gap) {
    // Validate search parameters
    if (!word1 || !word2 || typeof gap !== 'number') {
        const error = 'Invalid search parameters';
        console.error('[PAGE] Search error:', {
            error,
            params: { word1, word2, gap },
            valid: {
                word1: !!word1,
                word2: !!word2,
                gap: typeof gap === 'number'
            }
        });
        sendToContent(MessageTypes.SEARCH_ERROR, error);
        return;
    }

    console.log('[PAGE] Executing search:', { word1, word2, gap });
    
    if (!state.initialized || !window.Module || !window.Module._search || !window.Module.HEAP32) {
        console.log('[PAGE] WebAssembly not ready, queueing search');
        state.pendingSearches.push({ word1, word2, gap });
        return;
    }
    
    let textAlloc = null;
    let word1Alloc = null;
    let word2Alloc = null;
    
    try {
        const text = document.body.textContent;
        if (!text) {
            throw new Error('No text content available for search');
        }

        // Allocate memory for strings
        textAlloc = allocateString(text);
        word1Alloc = allocateString(word1);
        word2Alloc = allocateString(word2);
        
        // Call the search function
        const resultPtr = Module._search(
            textAlloc.ptr, textAlloc.length - 1,
            word1Alloc.ptr, word1Alloc.length - 1,
            word2Alloc.ptr, word2Alloc.length - 1,
            gap
        );
        
        // Process results
        const matches = [];
        if (resultPtr) {
            let i = 0;
            while (true) {
                const start = Module.HEAP32[(resultPtr >> 2) + i];
                if (start === -1) break;
                
                const length = Module.HEAP32[(resultPtr >> 2) + i + 1];
                const wordCount = Module.HEAP32[(resultPtr >> 2) + i + 2];
                
                matches.push({
                    start,
                    length,
                    wordCount,
                    text: text.substr(start, length),
                    word1,
                    word2
                });
                
                i += 3;
            }
        }
        
        console.log('[PAGE] Search results:', {
            matchCount: matches.length,
            params: { word1, word2, gap }
        });
        sendToContent(MessageTypes.SEARCH_COMPLETE, { matches });
        
    } catch (error) {
        console.error('[PAGE] Search error:', error);
        sendToContent(MessageTypes.SEARCH_ERROR, error.message);
    } finally {
        // Clean up allocated memory
        if (textAlloc && Module._free) Module._free(textAlloc.ptr);
        if (word1Alloc && Module._free) Module._free(word1Alloc.ptr);
        if (word2Alloc && Module._free) Module._free(word2Alloc.ptr);
    }
}

// Update the message listener to validate search parameters
window.addEventListener('message', event => {
    if (event.source !== window) return;
    
    const { type, detail, messageId } = event.data;
    if (!type) return;
    
    // Ignore messages we sent
    if (messageId && sentMessages.has(messageId)) {
        return;
    }
    
    console.log('[PAGE] Received message from content:', { 
        type, 
        detail,
        messageId: messageId ? messageId.toString().slice(-6) : undefined
    });
    
    switch (type) {
        case MessageTypes.RUN_SEARCH:
            if (!detail || !detail.word1 || !detail.word2 || typeof detail.gap !== 'number') {
                const error = 'Invalid search parameters in message';
                console.error('[PAGE] Search error:', {
                    error,
                    detail
                });
                sendToContent(MessageTypes.SEARCH_ERROR, error);
                return;
            }
            
            const { word1, word2, gap } = detail;
            initiateSearch(word1, word2, gap);
            break;
    }
});

// Make search function available globally for debugging
window.runSearch = function(word1, word2, gap) {
    console.log('[PAGE] Running search with parameters:', { word1, word2, gap });
    
    // Validate parameters before sending
    if (!word1 || !word2 || typeof gap !== 'number') {
        const error = 'Invalid search parameters';
        console.error('[PAGE] Search error:', {
            error,
            params: { word1, word2, gap }
        });
        return;
    }
    
    // Directly initiate search instead of sending a message to self
    initiateSearch(word1, word2, gap);
}; 