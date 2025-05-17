// Global variables to communicate with content script
window.wasmInitialized = false;
window.wasmError = null;
window.wasmMemoryInitialized = false;

// Create WebAssembly memory once and reuse it
window.wasmMemory = new WebAssembly.Memory({
    initial: 256,  // 16MB (256 pages * 64KB)
    maximum: 512   // 32MB (512 pages * 64KB)
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
        wasmMemory: window.wasmMemory, // Use the globally created memory
        INITIAL_MEMORY: 16777216, // 16MB (256 pages * 64KB per page)
        MAXIMUM_MEMORY: 33554432, // 32MB (512 pages * 64KB per page)
        
        // Add updateMemoryViews function
        updateMemoryViews: function() {
            if (this.wasmMemory && this.wasmMemory.buffer) {
                this.HEAP8 = new Int8Array(this.wasmMemory.buffer);
                this.HEAP16 = new Int16Array(this.wasmMemory.buffer);
                this.HEAP32 = new Int32Array(this.wasmMemory.buffer);
                this.HEAPU8 = new Uint8Array(this.wasmMemory.buffer);
                this.HEAPU16 = new Uint16Array(this.wasmMemory.buffer);
                this.HEAPU32 = new Uint32Array(this.wasmMemory.buffer);
                this.HEAPF32 = new Float32Array(this.wasmMemory.buffer);
                this.HEAPF64 = new Float64Array(this.wasmMemory.buffer);
                console.log('[PAGE] Memory views updated successfully');
                return true;
            }
            return false;
        },
        
        locateFile: function(path) {
            if (path.endsWith('.wasm')) {
                return wasmUrl;
            }
            return path;
        },
        preRun: [
            function() {
                console.log('[PAGE] PreRun - Module setup:', {
                    hasMemory: !!window.Module.wasmMemory,
                    memoryBuffer: !!window.Module.wasmMemory.buffer,
                    memoryLength: window.Module.wasmMemory.buffer.byteLength
                });
                // Try to initialize memory views
                window.Module.updateMemoryViews();
            }
        ],
        postRun: [
            function() {
                console.log('[PAGE] PostRun - Memory status:', {
                    hasMemory: !!window.Module.wasmMemory,
                    hasHeap: !!window.Module.HEAP32,
                    memoryBuffer: !!window.Module.wasmMemory.buffer,
                    memoryLength: window.Module.wasmMemory.buffer.byteLength
                });
                // Ensure memory views are set up
                window.Module.updateMemoryViews();
            }
        ],
        onAbort: function(what) {
            console.error('[PAGE] WebAssembly aborted:', what);
            window.wasmError = 'WebAssembly aborted: ' + what;
            window.dispatchEvent(new CustomEvent('wasmError'));
        },
        instantiateWasm: function(imports, successCallback) {
            console.log('[PAGE] Starting WebAssembly instantiation');
            
            // Add memory to the imports
            if (!imports.env) {
                imports.env = {};
            }
            imports.env.memory = window.wasmMemory;
            
            // Log imports object
            console.log('[PAGE] WebAssembly imports:', JSON.stringify({
                envKeys: Object.keys(imports.env),
                hasMemory: !!imports.env.memory,
                memoryPages: imports.env.memory.buffer.byteLength / 65536
            }, null, 2));
            
            WebAssembly.instantiateStreaming(fetch(wasmUrl), imports)
                .then(output => {
                    console.log('[PAGE] WebAssembly instantiated successfully');
                    // Initialize memory views right after instantiation
                    window.Module.updateMemoryViews();
                    successCallback(output.instance);
                })
                .catch(err => {
                    console.error('[PAGE] WebAssembly instantiation failed:', err);
                    // Try fallback to ArrayBuffer instantiation
                    fetch(wasmUrl)
                        .then(response => response.arrayBuffer())
                        .then(bytes => WebAssembly.instantiate(bytes, imports))
                        .then(output => {
                            console.log('[PAGE] WebAssembly instantiated successfully (fallback)');
                            // Initialize memory views after fallback instantiation
                            window.Module.updateMemoryViews();
                            successCallback(output.instance);
                        })
                        .catch(err => {
                            console.error('[PAGE] WebAssembly instantiation failed (fallback):', err);
                            window.wasmError = err.message;
                            window.dispatchEvent(new CustomEvent('wasmError'));
                        });
                });
            return {}; // Return empty object to indicate async instantiation
        },
        onRuntimeInitialized: async function() {
            console.log('[PAGE] WebAssembly runtime initialized');
            try {
                // Wait for memory to be properly initialized
                await waitForMemory();
                
                // Create search function using Module.cwrap
                window.searchFunction = Module.cwrap('search', 'number', 
                    ['string', 'number', 'string', 'number', 'string', 'number', 'number']);
                console.log('[PAGE] Search function created');
                window.wasmInitialized = true;
                window.dispatchEvent(new CustomEvent('wasmReady'));
            } catch (error) {
                console.error('[PAGE] Error during initialization:', error);
                window.wasmError = error.message;
                window.dispatchEvent(new CustomEvent('wasmError'));
            }
        }
    };

    // Now load search.js
    const script = document.createElement('script');
    script.src = searchJsUrl;
    script.onload = () => {
        console.log('[PAGE] search.js loaded');
    };
    script.onerror = (error) => {
        console.error('[PAGE] Failed to load search.js:', error);
        window.wasmError = 'Failed to load WebAssembly module';
        window.dispatchEvent(new CustomEvent('wasmError'));
    };
    document.head.appendChild(script);
});

// Handle search requests
window.addEventListener('runSearch', async (event) => {
    const { word1, word2, gap } = event.detail;
    
    console.log('[PAGE] Search requested with state:', {
        wasmInitialized: window.wasmInitialized,
        moduleExists: !!window.Module,
        heapExists: isMemoryInitialized(),
        searchFunctionExists: !!window.searchFunction
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
        console.log('[PAGE] Running search on text length:', text.length);
        
        // Ensure we have enough memory for the search
        const estimatedMemoryNeeded = text.length * 4 + 1024; // rough estimate
        if (!await growMemoryIfNeeded(estimatedMemoryNeeded)) {
            throw new Error('Failed to allocate required memory');
        }
        
        // Call the search function
        const resultPtr = window.searchFunction(
            text, text.length,
            word1, word1.length,
            word2, word2.length,
            gap
        );
        
        if (!resultPtr) {
            console.log('[PAGE] No matches found (null pointer returned)');
            window.dispatchEvent(new CustomEvent('searchComplete', { 
                detail: { count: 0, matches: [] }
            }));
            return;
        }
        
        // Access the results array through HEAP32
        const matches = [];
        let offset = resultPtr >> 2; // Convert byte offset to 32-bit integer offset
        
        // Add bounds checking
        const maxOffset = Module.HEAP32.length;
        while (offset < maxOffset) {
            const start = Module.HEAP32[offset];
            if (start === -1) break;  // End marker
            
            // Ensure we can read the next two values
            if (offset + 2 >= maxOffset) {
                console.error('[PAGE] Unexpected end of memory buffer');
                break;
            }
            
            const length = Module.HEAP32[offset + 1];
            const wordCount = Module.HEAP32[offset + 2];
            
            if (start < 0 || length < 0 || wordCount < 0 || 
                start + length > text.length) {
                console.error('[PAGE] Invalid match data:', { start, length, wordCount });
                break;
            }
            
            // Extract the matched text
            const matchText = text.substring(start, start + length);
            
            matches.push({
                text: matchText,
                start: start,
                length: length,
                wordCount: wordCount
            });
            
            offset += 3;  // Move to next match entry (3 integers per entry)
        }
        
        console.log('[PAGE] Search completed, matches:', matches);
        window.dispatchEvent(new CustomEvent('searchComplete', { 
            detail: { count: matches.length, matches: matches }
        }));
    } catch (error) {
        console.error('[PAGE] Search error:', error);
        window.dispatchEvent(new CustomEvent('searchError', { 
            detail: error.message 
        }));
    }
}); 