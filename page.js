// Global variables to communicate with content script
window.wasmInitialized = false;
window.wasmError = null;

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

    // Set up the Module configuration before loading search.js
    window.Module = {
        locateFile: function(path) {
            if (path.endsWith('.wasm')) {
                return wasmUrl;
            }
            return path;
        },
        onRuntimeInitialized: function() {
            console.log('[PAGE] WebAssembly runtime initialized');
            try {
                // Create search function using Module.cwrap
                window.searchFunction = Module.cwrap('search', 'number', 
                    ['string', 'number', 'string', 'number', 'string', 'number', 'number']);
                console.log('[PAGE] Search function created');
                window.wasmInitialized = true;
                window.dispatchEvent(new CustomEvent('wasmReady'));
            } catch (error) {
                console.error('[PAGE] Error creating search function:', error);
                window.wasmError = error.message;
                window.dispatchEvent(new CustomEvent('wasmError'));
            }
        }
    };

    // Now load search.js
    const script = document.createElement('script');
    script.src = searchJsUrl;
    script.onerror = (error) => {
        console.error('[PAGE] Failed to load search.js:', error);
        window.wasmError = 'Failed to load WebAssembly module';
        window.dispatchEvent(new CustomEvent('wasmError'));
    };
    document.head.appendChild(script);
});

// Handle search requests
window.addEventListener('runSearch', (event) => {
    const { word1, word2, gap } = event.detail;
    
    if (!window.wasmInitialized) {
        console.error('[PAGE] WebAssembly not initialized');
        window.dispatchEvent(new CustomEvent('searchError', { 
            detail: 'WebAssembly not initialized' 
        }));
        return;
    }
    
    try {
        const text = document.body.innerText;
        console.log('[PAGE] Running search on text length:', text.length);
        
        // Call the search function
        const resultPtr = window.searchFunction(
            text, text.length,
            word1, word1.length,
            word2, word2.length,
            gap
        );
        
        // Access the results array through HEAP32
        const matches = [];
        let i = 0;
        const heap = new Int32Array(Module.HEAP8.buffer);
        
        while (true) {
            const start = heap[(resultPtr >> 2) + i];
            if (start === -1) break;  // End marker
            
            const length = heap[(resultPtr >> 2) + i + 1];
            const wordCount = heap[(resultPtr >> 2) + i + 2];
            
            // Extract the matched text
            const matchText = text.substring(start, start + length);
            
            matches.push({
                text: matchText,
                start: start,
                length: length,
                wordCount: wordCount
            });
            
            i += 3;  // Move to next match entry
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