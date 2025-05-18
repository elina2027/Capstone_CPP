// Debug script to track WebAssembly initialization and message passing
(function() {
    const originalPostMessage = window.postMessage;
    window.postMessage = function(message, targetOrigin, transfer) {
        console.log('[DEBUG] postMessage:', {
            type: message.type,
            detail: message.detail,
            target: targetOrigin
        });
        return originalPostMessage.call(this, message, targetOrigin, transfer);
    };

    // Track Module initialization
    Object.defineProperty(window, 'Module', {
        set: function(value) {
            console.log('[DEBUG] Module being set:', {
                hasValue: !!value,
                exports: value ? Object.keys(value) : null
            });
            this._module = value;
        },
        get: function() {
            return this._module;
        }
    });

    // Track wasmInitialized state
    Object.defineProperty(window, 'wasmInitialized', {
        set: function(value) {
            console.log('[DEBUG] wasmInitialized changed:', {
                from: this._wasmInitialized,
                to: value
            });
            this._wasmInitialized = value;
        },
        get: function() {
            return this._wasmInitialized;
        }
    });

    console.log('[DEBUG] Debug script initialized');
})(); 