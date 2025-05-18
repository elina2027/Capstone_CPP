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
    sentMessages.add(messageId);
    window.postMessage({ type, detail, messageId }, '*');
    
    // Clean up old message IDs after 5 seconds
    setTimeout(() => {
        sentMessages.delete(messageId);
    }, 5000);
}

// Function to update state and log changes
function updateState(updates) {
    Object.assign(state, updates);
}

// Listen for configuration events
document.addEventListener('wasmConfigReady', function(event) {
    const config = event.detail;
    
    if (state.initialized) {
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

// Initialize memory views
function initMemoryViews() {
    if (!window.Module) {
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
        return true;
    } catch (error) {
        return false;
    }
}

// Verify required exports
function verifyExports() {
    const required = ['_search', '_malloc', '_free'];
    const missing = required.filter(name => !window.Module[name]);
    
    if (missing.length > 0) {
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
    
    return true;
}

// Initialize WebAssembly
function initWasm(searchJsUrl, wasmUrl) {
    window.Module = {
        wasmMemory: state.memory,
        INITIAL_MEMORY: 16777216,  // 16MB
        MAXIMUM_MEMORY: 16777216,  // 16MB
        ALLOW_MEMORY_GROWTH: 0,    // Disable memory growth

        print: function(text) {},
        printErr: function(text) {},

        locateFile: function(path) {
            if (path.endsWith('.wasm')) {
                return wasmUrl;
            }
            return path;
        },

        onAbort: function(what) {
            const error = 'WebAssembly aborted: ' + what;
            updateState({ error, initialized: false });
            sendToContent(MessageTypes.ERROR, error);
        },

        onRuntimeInitialized: function() {
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
                while (state.pendingSearches.length > 0) {
                    const search = state.pendingSearches.shift();
                    executeSearch(search.word1, search.word2, search.gap, search.caseInsensitive);
                }
            }
        }
    };

    const script = document.createElement('script');
    script.src = searchJsUrl;
    script.onerror = (error) => {
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
function initiateSearch(word1, word2, gap, caseInsensitive) {
    // Validate parameters before proceeding
    if (!word1 || !word2 || typeof gap !== 'number') {
        const error = 'Invalid search parameters';
        sendToContent(MessageTypes.SEARCH_ERROR, error);
        return;
    }

    // Queue search if WebAssembly isn't ready
    if (!state.initialized) {
        state.pendingSearches.push({ word1, word2, gap, caseInsensitive });
        return;
    }

    // Execute search
    executeSearch(word1, word2, gap, caseInsensitive);
}

// Handle search execution
function executeSearch(word1, word2, gap, caseInsensitive) {
    // Validate search parameters
    if (!word1 || !word2 || typeof gap !== 'number') {
        const error = 'Invalid search parameters';
        sendToContent(MessageTypes.SEARCH_ERROR, error);
        return;
    }
    
    if (!state.initialized || !window.Module || !window.Module._search || !window.Module.HEAP32) {
        state.pendingSearches.push({ word1, word2, gap, caseInsensitive });
        return;
    }
    
    let textAlloc = null;
    let word1Alloc = null;
    let word2Alloc = null;
    
    try {
        // Capture start time for performance measurement
        const startTime = performance.now();
        
        const text = document.body.textContent;
        if (!text) {
            throw new Error('No text content available for search');
        }

        // Allocate memory for strings
        textAlloc = allocateString(text);
        word1Alloc = allocateString(word1);
        word2Alloc = allocateString(word2);
        
        // Call the search function with case-insensitive parameter
        const resultPtr = Module._search(
            textAlloc.ptr, textAlloc.length - 1,
            word1Alloc.ptr, word1Alloc.length - 1,
            word2Alloc.ptr, word2Alloc.length - 1,
            gap,
            caseInsensitive ? 1 : 0
        );
        
        // Measure execution time
        const endTime = performance.now();
        const executionTime = (endTime - startTime) / 1000; // in seconds
        
        // Process results
        const matches = [];
        if (resultPtr) {
            let i = 0;
            while (true) {
                const start = Module.HEAP32[(resultPtr >> 2) + i];
                if (start === -1) break;
                
                const length = Module.HEAP32[(resultPtr >> 2) + i + 1];
                const wordCount = Module.HEAP32[(resultPtr >> 2) + i + 2];
                
                // WebAssembly module now directly returns character count
                const charCount = wordCount;
                
                // Get the text for the match
                if (start >= 0 && length > 0 && start + length <= text.length) {
                    const matchText = text.substring(start, start + length);
                    
                    matches.push({
                        start,
                        length,
                        charCount,
                        text: matchText,
                        word1,
                        word2,
                        caseInsensitive
                    });
                }
                
                i += 3;
            }
        }
        
        // Send results immediately with execution time
        sendToContent(MessageTypes.SEARCH_COMPLETE, { 
            matches,
            executionTime, 
            parameters: { word1, word2, gap, caseInsensitive }
        });
    } catch (error) {
        sendToContent(MessageTypes.SEARCH_ERROR, error.message || String(error));
    } finally {
        // Free allocated memory
        if (textAlloc && textAlloc.ptr) Module._free(textAlloc.ptr);
        if (word1Alloc && word1Alloc.ptr) Module._free(word1Alloc.ptr);
        if (word2Alloc && word2Alloc.ptr) Module._free(word2Alloc.ptr);
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
    
    switch (type) {
        case MessageTypes.RUN_SEARCH:
            if (!detail || !detail.word1 || !detail.word2 || typeof detail.gap !== 'number') {
                const error = 'Invalid search parameters in message';
                sendToContent(MessageTypes.SEARCH_ERROR, error);
                return;
            }
            
            const { word1, word2, gap, caseInsensitive } = detail;
            initiateSearch(word1, word2, gap, caseInsensitive);
            break;
    }
});

// Make search function available globally for debugging
window.runSearch = function(word1, word2, gap, caseInsensitive) {
    // Validate parameters before sending
    if (!word1 || !word2 || typeof gap !== 'number') {
        return;
    }
    
    // Directly initiate search instead of sending a message to self
    initiateSearch(word1, word2, gap, caseInsensitive);
}; 