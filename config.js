// WebAssembly configuration
window.wasmConfig = {};

// Function to set WebAssembly configuration
window.setWasmConfig = function(config) {
    window.wasmConfig = config;
    
    // Dispatch event to notify configuration is ready
    window.dispatchEvent(new CustomEvent('wasmConfigReady', { 
        detail: config 
    }));
};

// Configuration handler using MutationObserver
(function() {
    function handleConfig(configElement) {
        const configData = configElement.getAttribute('data-config');
        if (!configData) return;
        
        try {
            const config = JSON.parse(configData);
            console.log('[CONFIG] Configuration updated:', config);
            
            // Dispatch configuration ready event
            const event = new CustomEvent('wasmConfigReady', {
                bubbles: true,
                detail: config
            });
            configElement.dispatchEvent(event);
        } catch (error) {
            console.error('[CONFIG] Failed to parse configuration:', error);
        }
    }

    // Create observers
    const elementObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            // Look for our config element in added nodes
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === Node.ELEMENT_NODE && node.id === 'wasm-config') {
                    console.log('[CONFIG] Config element added');
                    
                    // Start watching for attribute changes
                    attributeObserver.observe(node, {
                        attributes: true,
                        attributeFilter: ['data-config']
                    });
                    
                    // Check if there's already a configuration
                    if (node.hasAttribute('data-config')) {
                        handleConfig(node);
                    }
                }
            });
        });
    });

    const attributeObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && 
                mutation.attributeName === 'data-config' &&
                mutation.target.id === 'wasm-config') {
                handleConfig(mutation.target);
            }
        });
    });

    // Start observing the document for config element insertion
    elementObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    
    console.log('[CONFIG] Configuration observers initialized');
})(); 