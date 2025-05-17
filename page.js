// Global variables to communicate with content script
window.wasmInitialized = false;
window.wasmError = null;
window.wasmMemoryInitialized = false;

// Create WebAssembly memory once and reuse it
window.wasmMemory = new WebAssembly.Memory({
    initial: 256,  // 16MB (256 pages * 64KB)
    maximum: 512,  // 32MB (512 pages * 64KB)
    shared: false  // Not using shared memory
});

// Function to check if memory is properly initialized
function isMemoryInitialized() {
    // Check each component individually for better diagnostics
    const moduleExists = !!window.Module;
    const heap32Exists = !!(window.Module && window.Module.HEAP32);
    const wasmMemoryExists = !!(window.wasmMemory && window.wasmMemory.buffer);
    
    const status = {
        moduleExists,
        heap32Exists,
        wasmMemoryExists,
        memorySize: wasmMemoryExists ? window.wasmMemory.buffer.byteLength : 0,
        moduleKeys: moduleExists ? Object.keys(window.Module) : [],
        heapKeys: moduleExists ? Object.keys(window.Module).filter(k => k.startsWith('HEAP')) : []
    };
    
    console.log('[PAGE] Detailed memory status:', JSON.stringify(status, null, 2));
    
    // If module exists but HEAP32 doesn't, check if we need to update memory views
    if (moduleExists && !heap32Exists && window.Module.updateMemoryViews) {
        console.log('[PAGE] Attempting to update memory views');
        try {
            window.Module.updateMemoryViews();
        } catch (e) {
            console.error('[PAGE] Failed to update memory views:', e);
        }
    }
    
    return moduleExists && heap32Exists && wasmMemoryExists;
}

// Function to safely grow memory if needed
async function growMemoryIfNeeded(requiredBytes) {
    const currentPages = window.wasmMemory.buffer.byteLength / 65536;
    const requiredPages = Math.ceil(requiredBytes / 65536);
    
    if (requiredPages > currentPages) {
        const additionalPages = requiredPages - currentPages;
        try {
            console.log(`[PAGE] Growing memory by ${additionalPages} pages`);
            const result = window.wasmMemory.grow(additionalPages);
            console.log(`[PAGE] Memory grown successfully. New size: ${window.wasmMemory.buffer.byteLength} bytes`);
            return true;
        } catch (error) {
            console.error('[PAGE] Failed to grow memory:', error);
            return false;
        }
    }
    return true;
}

// Function to wait for memory initialization
function waitForMemory(maxAttempts = 50) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        
        function checkMemory() {
            attempts++;
            console.log(`[PAGE] Memory check attempt ${attempts}/${maxAttempts}`);
            
            if (window.wasmMemoryInitialized) {
                console.log('[PAGE] Using cached memory initialization status');
                resolve();
                return;
            }
            
            if (isMemoryInitialized()) {
                console.log('[PAGE] WebAssembly memory is initialized');
                window.wasmMemoryInitialized = true;
                resolve();
            } else if (attempts < maxAttempts) {
                // Increase delay between attempts
                const delay = Math.min(200 * Math.pow(1.1, attempts), 1000); // Exponential backoff, max 1s
                console.log(`[PAGE] Waiting ${delay}ms before next attempt...`);
                setTimeout(checkMemory, delay);
            } else {
                const error = 'Memory not available after ' + maxAttempts + ' attempts';
                console.error('[PAGE]', error);
                reject(new Error(error));
            }
        }
        
        checkMemory();
    });
}

// Function to check if createModule is available
function waitForCreateModule(callback, maxAttempts = 50) {
    let attempts = 0;
    
    function checkModule() {
        attempts++;
        if (typeof createModule === 'function') {
            console.log('[PAGE] createModule is now available');
            callback();
        } else if (attempts < maxAttempts) {
            console.log('[PAGE] Waiting for createModule... (attempt ' + attempts + ')');
            setTimeout(checkModule, 100);
        } else {
            console.error('[PAGE] createModule not available after ' + maxAttempts + ' attempts');
            window.wasmError = 'Failed to load WebAssembly module';
            window.dispatchEvent(new CustomEvent('wasmError'));
        }
    }
    
    checkModule();
}

// Initialize WebAssembly when the URL is set
window.addEventListener('wasmInit', (event) => {
    const { searchJsUrl, wasmUrl } = event.detail;
    console.log('[PAGE] Initializing with URLs:', { searchJsUrl, wasmUrl });

    // Reset initialization flags
    window.wasmInitialized = false;
    window.wasmMemoryInitialized = false;
    window.wasmError = null;

    // Set up the Module configuration before loading search.js
    window.Module = {
        // Use our pre-created memory
        wasmMemory: window.wasmMemory,
        
        // Memory configuration matching compilation flags
        INITIAL_MEMORY: 16777216,  // 16MB (256 pages * 64KB)
        MAXIMUM_MEMORY: 33554432,  // 32MB (512 pages * 64KB)
        
        // Memory management functions
        updateMemoryViews: function() {
            if (!this.wasmMemory || !this.wasmMemory.buffer) {
                console.error('[PAGE] Cannot update memory views - no memory buffer available');
                return false;
            }
            
            try {
                // Check if HEAP views are available from Module
                if (!Module.HEAP8 || !Module.HEAP32) {
                    console.log('[PAGE] Creating new memory views');
                    
                    // Create views of the memory buffer
                    Object.defineProperties(this, {
                        'HEAP8': {
                            get: function() {
                                if (!this._HEAP8 || this._HEAP8.buffer !== this.wasmMemory.buffer) {
                                    this._HEAP8 = new Int8Array(this.wasmMemory.buffer);
                                }
                                return this._HEAP8;
                            }
                        },
                        'HEAP16': {
                            get: function() {
                                if (!this._HEAP16 || this._HEAP16.buffer !== this.wasmMemory.buffer) {
                                    this._HEAP16 = new Int16Array(this.wasmMemory.buffer);
                                }
                                return this._HEAP16;
                            }
                        },
                        'HEAP32': {
                            get: function() {
                                if (!this._HEAP32 || this._HEAP32.buffer !== this.wasmMemory.buffer) {
                                    this._HEAP32 = new Int32Array(this.wasmMemory.buffer);
                                }
                                return this._HEAP32;
                            }
                        },
                        'HEAPU8': {
                            get: function() {
                                if (!this._HEAPU8 || this._HEAPU8.buffer !== this.wasmMemory.buffer) {
                                    this._HEAPU8 = new Uint8Array(this.wasmMemory.buffer);
                                }
                                return this._HEAPU8;
                            }
                        },
                        'HEAPU16': {
                            get: function() {
                                if (!this._HEAPU16 || this._HEAPU16.buffer !== this.wasmMemory.buffer) {
                                    this._HEAPU16 = new Uint16Array(this.wasmMemory.buffer);
                                }
                                return this._HEAPU16;
                            }
                        },
                        'HEAPU32': {
                            get: function() {
                                if (!this._HEAPU32 || this._HEAPU32.buffer !== this.wasmMemory.buffer) {
                                    this._HEAPU32 = new Uint32Array(this.wasmMemory.buffer);
                                }
                                return this._HEAPU32;
                            }
                        },
                        'HEAPF32': {
                            get: function() {
                                if (!this._HEAPF32 || this._HEAPF32.buffer !== this.wasmMemory.buffer) {
                                    this._HEAPF32 = new Float32Array(this.wasmMemory.buffer);
                                }
                                return this._HEAPF32;
                            }
                        },
                        'HEAPF64': {
                            get: function() {
                                if (!this._HEAPF64 || this._HEAPF64.buffer !== this.wasmMemory.buffer) {
                                    this._HEAPF64 = new Float64Array(this.wasmMemory.buffer);
                                }
                                return this._HEAPF64;
                            }
                        }
                    });
                }
                
                console.log('[PAGE] Memory views updated successfully:', {
                    buffer: this.wasmMemory.buffer.byteLength,
                    HEAP32: this.HEAP32.length,
                    views: {
                        HEAP8: !!this.HEAP8,
                        HEAP16: !!this.HEAP16,
                        HEAP32: !!this.HEAP32,
                        HEAPU8: !!this.HEAPU8,
                        HEAPU16: !!this.HEAPU16,
                        HEAPU32: !!this.HEAPU32,
                        HEAPF32: !!this.HEAPF32,
                        HEAPF64: !!this.HEAPF64
                    }
                });
                return true;
            } catch (error) {
                console.error('[PAGE] Error updating memory views:', error);
                return false;
            }
        },
        
        // WebAssembly file location
        locateFile: function(path) {
            if (path.endsWith('.wasm')) {
                return wasmUrl;
            }
            return path;
        },
        
        // Initialization hooks
        preRun: [
            function() {
                console.log('[PAGE] PreRun - Initializing memory');
                window.Module.updateMemoryViews();
            }
        ],
        
        postRun: [
            function() {
                console.log('[PAGE] PostRun - Verifying memory setup');
                window.Module.updateMemoryViews();
            }
        ],
        
        // Error handling
        onAbort: function(what) {
            const error = 'WebAssembly aborted: ' + what;
            console.error('[PAGE]', error);
            window.wasmError = error;
            window.dispatchEvent(new CustomEvent('wasmError'));
        },
        
        // WebAssembly instantiation
        instantiateWasm: function(imports, successCallback) {
            console.log('[PAGE] Starting WebAssembly instantiation');
            
            // Ensure memory is in imports
            if (!imports.env) {
                imports.env = {};
            }
            imports.env.memory = window.wasmMemory;
            
            // Log memory configuration
            console.log('[PAGE] Memory configuration:', {
                initial: window.wasmMemory.buffer.byteLength / 65536,
                maximum: 512,
                currentSize: window.wasmMemory.buffer.byteLength
            });
            
            // Try streaming instantiation first
            WebAssembly.instantiateStreaming(fetch(wasmUrl), imports)
                .then(output => {
                    console.log('[PAGE] WebAssembly instantiated successfully');
                    window.Module.updateMemoryViews();
                    successCallback(output.instance);
                })
                .catch(err => {
                    console.error('[PAGE] Streaming instantiation failed:', err);
                    console.log('[PAGE] Falling back to ArrayBuffer instantiation');
                    
                    // Fallback to ArrayBuffer instantiation
                    fetch(wasmUrl)
                        .then(response => response.arrayBuffer())
                        .then(bytes => WebAssembly.instantiate(bytes, imports))
                        .then(output => {
                            console.log('[PAGE] Fallback instantiation successful');
                            window.Module.updateMemoryViews();
                            successCallback(output.instance);
                        })
                        .catch(err => {
                            console.error('[PAGE] Fallback instantiation failed:', err);
                            window.wasmError = err.message;
                            window.dispatchEvent(new CustomEvent('wasmError'));
                        });
                });
            
            return {}; // Async instantiation
        },
        
        // Runtime initialization
        onRuntimeInitialized: async function() {
            console.log('[PAGE] WebAssembly runtime initialized');
            try {
                await waitForMemory();
                window.searchFunction = Module.cwrap('search', 'number', 
                    ['string', 'number', 'string', 'number', 'string', 'number', 'number']);
                console.log('[PAGE] Search function created');
                window.wasmInitialized = true;
                window.dispatchEvent(new CustomEvent('wasmReady'));
            } catch (error) {
                console.error('[PAGE] Initialization error:', error);
                window.wasmError = error.message;
                window.dispatchEvent(new CustomEvent('wasmError'));
            }
        }
    };

    // Load the JavaScript glue code
    const script = document.createElement('script');
    script.src = searchJsUrl;
    script.onload = () => console.log('[PAGE] search.js loaded');
    script.onerror = (error) => {
        console.error('[PAGE] Failed to load search.js:', error);
        window.wasmError = 'Failed to load WebAssembly module';
        window.dispatchEvent(new CustomEvent('wasmError'));
    };
    document.head.appendChild(script);
});

// Handle search requests
window.addEventListener('runSearch', async (event) => {
    const { word1, word2, gap, caseSensitive } = event.detail;
    
    console.log('[PAGE] Search requested with state:', {
        wasmInitialized: window.wasmInitialized,
        moduleExists: !!window.Module,
        heapExists: isMemoryInitialized(),
        searchFunctionExists: !!window.searchFunction,
        memorySize: window.wasmMemory.buffer.byteLength,
        caseSensitive,
        heapViews: {
            HEAP8: !!window.Module.HEAP8,
            HEAP16: !!window.Module.HEAP16,
            HEAP32: !!window.Module.HEAP32
        }
    });
    
    if (!window.wasmInitialized) {
        console.error('[PAGE] WebAssembly not initialized');
        window.dispatchEvent(new CustomEvent('searchError', { 
            detail: 'WebAssembly not initialized' 
        }));
        return;
    }
    
    try {
        // Double-check memory initialization before search
        if (!isMemoryInitialized()) {
            await waitForMemory();
        }
        
        const text = document.body.innerText;
        
        // Validate input parameters
        if (!text || !word1 || !word2 || typeof gap !== 'number' || gap < 0) {
            throw new Error('Invalid search parameters');
        }
        
        console.log('[PAGE] Search parameters:', {
            caseSensitive,
            word1,
            word2,
            gap,
            textLength: text.length
        });
        
        // Find the actual positions of the words first
        const word1Pos = caseSensitive ? text.indexOf(word1) : text.toLowerCase().indexOf(word1.toLowerCase());
        const word2Pos = caseSensitive ? text.indexOf(word2) : text.toLowerCase().indexOf(word2.toLowerCase());
        
        console.log('[PAGE] Running search:', {
            textLength: text.length,
            word1,
            word2,
            gap,
            caseSensitive,
            word1Position: word1Pos,
            word2Position: word2Pos,
            actualGap: word2Pos !== -1 && word1Pos !== -1 ? word2Pos - (word1Pos + word1.length) : 'N/A',
            textPreview: text.substring(0, 100) + '...'
        });
        
        // Check if words exist in the text at all
        if (word1Pos === -1 || word2Pos === -1) {
            console.log('[PAGE] One or both words not found in text');
            window.dispatchEvent(new CustomEvent('searchComplete', { 
                detail: { count: 0, matches: [] }
            }));
            return;
        }
        
        // Ensure memory has enough space
        const requiredBytes = text.length * 4 + 1024; // Extra space for results
        if (!await growMemoryIfNeeded(requiredBytes)) {
            throw new Error('Failed to allocate required memory');
        }
        
        // Update memory views before the search
        window.Module.updateMemoryViews();
        
        // Apply case sensitivity in JavaScript if needed
        let searchText = text;
        let searchWord1 = word1;
        let searchWord2 = word2;
        
        if (!caseSensitive) {
            // For case-insensitive search, convert everything to lowercase
            searchText = text.toLowerCase();
            searchWord1 = word1.toLowerCase();
            searchWord2 = word2.toLowerCase();
            console.log('[PAGE] Using case-insensitive search');
        } else {
            console.log('[PAGE] Using case-sensitive search');
        }
        
        // Call the search function
        const resultPtr = window.searchFunction(
            searchText, searchText.length,
            searchWord1, searchWord1.length,
            searchWord2, searchWord2.length,
            gap
        );
        
        // Update memory views after the search
        window.Module.updateMemoryViews();
        
        console.log('[PAGE] Search function returned:', {
            resultPtr,
            resultPtrHex: '0x' + resultPtr.toString(16),
            offset: resultPtr >> 2,
            alignmentCheck: resultPtr % 4 === 0 ? 'aligned' : 'misaligned',
            memoryState: {
                buffer: !!window.wasmMemory.buffer,
                byteLength: window.wasmMemory.buffer.byteLength,
                HEAP32Length: window.Module.HEAP32.length
            }
        });
        
        if (!resultPtr) {
            console.log('[PAGE] No matches found (null pointer returned)');
            window.dispatchEvent(new CustomEvent('searchComplete', { 
                detail: { count: 0, matches: [] }
            }));
            return;
        }
        
        // Verify pointer is within bounds
        const ptrOffset = resultPtr >> 2;
        if (ptrOffset < 0 || ptrOffset >= window.Module.HEAP32.length) {
            throw new Error(`Invalid pointer: ${resultPtr} (offset ${ptrOffset} out of bounds)`);
        }
        
        // Read raw memory values for debugging
        const rawMemory = new Int32Array(window.wasmMemory.buffer);
        console.log('[PAGE] Raw memory at result pointer:', {
            directAccess: Array.from(rawMemory.slice(ptrOffset, ptrOffset + 3)),
            heapAccess: Array.from(window.Module.HEAP32.slice(ptrOffset, ptrOffset + 3))
        });
        
        // Access the results array through HEAP32
        const matches = [];
        let offset = ptrOffset;
        const MAX_MATCHES = 100; // Match the C++ limit
        let matchCount = 0;
        
        while (offset < window.Module.HEAP32.length && matchCount < MAX_MATCHES) {
            const start = window.Module.HEAP32[offset];
            if (start === -1) break;  // End marker
            
            // Ensure we can read the next two values
            if (offset + 2 >= window.Module.HEAP32.length) {
                console.error('[PAGE] Unexpected end of memory buffer');
                break;
            }
            
            const length = window.Module.HEAP32[offset + 1];
            const wordCount = window.Module.HEAP32[offset + 2];
            
            console.log('[PAGE] Processing match data:', {
                offset,
                start,
                length,
                wordCount,
                nextThreeValues: Array.from(window.Module.HEAP32.slice(offset, offset + 3)),
                rawValues: Array.from(rawMemory.slice(offset, offset + 3))
            });
            
            // Basic sanity checks
            if (start < 0 || length <= 0 || wordCount < 0 || 
                start >= text.length || 
                length > text.length || 
                start + length > text.length) {
                console.error('[PAGE] Invalid match data:', {
                    start,
                    length,
                    wordCount,
                    textLength: text.length
                });
                // Stop processing on invalid data
                matches.length = 0; // Clear any matches we might have collected
                break;
            }
            
            // Extract the matched text
            const matchText = searchText.substring(start, start + length);
            
            // For displaying, we need to use the original text
            const originalMatchText = text.substring(start, start + length);
            
            // Verify match contains both words
            const hasWord1 = !caseSensitive ? 
                matchText.includes(searchWord1) : 
                matchText.includes(word1);
                
            const hasWord2 = !caseSensitive ? 
                matchText.includes(searchWord2) : 
                matchText.includes(word2);
            
            if (!hasWord1 || !hasWord2) {
                console.error('[PAGE] Match missing search words:', {
                    matchText,
                    hasWord1,
                    hasWord2,
                    start,
                    length,
                    word1: !caseSensitive ? searchWord1 : word1,
                    word2: !caseSensitive ? searchWord2 : word2
                });
                // Skip this match but continue processing
                offset += 3;
                continue;
            }
            
            // Find positions in either the case-sensitive or insensitive text
            let word1PosInMatch, word2PosInMatch;
            
            if (!caseSensitive) {
                word1PosInMatch = matchText.indexOf(searchWord1);
                word2PosInMatch = matchText.indexOf(searchWord2);
            } else {
                word1PosInMatch = matchText.indexOf(word1);
                word2PosInMatch = matchText.indexOf(word2);
            }
            
            const actualGap = word2PosInMatch - (word1PosInMatch + (!caseSensitive ? searchWord1.length : word1.length));
            
            matches.push({
                text: originalMatchText, // Use original text for display
                start: start,
                length: length,
                wordCount: wordCount,
                word1: word1, // Use original words
                word2: word2,
                word1Position: start + word1PosInMatch,
                word2Position: start + word2PosInMatch,
                actualGap,
                caseSensitive,
                context: text.substring(
                    Math.max(0, start - 20),
                    Math.min(text.length, start + length + 20)
                )
            });
            
            matchCount++;
            offset += 3;
        }
        
        console.log('[PAGE] Search complete:', {
            matchCount: matches.length,
            matches: matches.map(m => ({
                text: m.text.substring(0, 50) + '...',
                start: m.start,
                length: m.length,
                wordCount: m.wordCount
            }))
        });
        
        window.dispatchEvent(new CustomEvent('searchComplete', { 
            detail: { count: matches.length, matches }
        }));
        
    } catch (error) {
        console.error('[PAGE] Search error:', error);
        window.dispatchEvent(new CustomEvent('searchError', { 
            detail: error.message 
        }));
    }
}); 