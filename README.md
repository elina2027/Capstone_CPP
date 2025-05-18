# Ctrl-F with Gap - WebAssembly Text Search Extension

A high-performance browser extension that enables searching for two words with a specified character gap between them. This extension leverages WebAssembly (compiled from C++) for extremely fast text searching even in large documents.

## Features

- Search for two words with a character gap between them
- Case-sensitive and case-insensitive search options
- High-performance Boyer-Moore string search algorithm
- Word boundary detection for accurate matches
- Interactive highlighting of matches
- Microsecond-precision timer display
- Navigation controls to move between matches

## Prerequisites

To build and develop this extension, you need:

1. **Emscripten SDK** - Required to compile C++ to WebAssembly
   - Version 3.1.42 or higher recommended
   - Install from [emscripten.org](https://emscripten.org/docs/getting_started/downloads.html)

2. **Node.js** (optional) - For development tools
   - Version 14.0.0 or higher recommended
   - Install from [nodejs.org](https://nodejs.org/)

3. **Chrome** or **Edge** - For testing the extension
   - Chrome 80+ or Edge 80+ recommended

## Installation

### 1. Clone or Download the Repository

```bash
git clone <repository-url>
cd ctrl-f-with-gap
```

### 2. Install Emscripten SDK

Follow the official Emscripten installation guide:

```bash
# Clone the Emscripten repository
git clone https://github.com/emscripten-core/emsdk.git

# Enter the emsdk directory
cd emsdk

# Download and install the latest SDK tools
./emsdk install latest

# Activate the latest SDK
./emsdk activate latest

# Set up the environment variables
source ./emsdk_env.sh  # On Windows, use: emsdk_env.bat
```

### 3. Compile the WebAssembly Module

Navigate back to the extension directory and run the build script:

```bash
# Make the build script executable
chmod +x build.sh

# Run the build script
./build.sh
```

This will compile the C++ code (`search.cpp`) into WebAssembly (`.wasm`) and JavaScript glue code (`.js`).

### 4. Load the Extension in Chrome/Edge

1. Open Chrome/Edge and go to `chrome://extensions` or `edge://extensions`
2. Enable "Developer mode" using the toggle in the top-right corner
3. Click "Load unpacked" and select the extension directory
4. The extension should appear in your browser toolbar

## Directory Structure

```
├── manifest.json         # Extension manifest
├── popup.html            # Extension popup interface
├── popup.js              # Popup JavaScript logic
├── popup.css             # Popup styling
├── content.js            # Content script injected into pages
├── search.cpp            # C++ search algorithm (compiled to WebAssembly)
├── search.js             # Generated JavaScript glue code for WebAssembly
├── search.wasm           # Compiled WebAssembly binary
├── page.js               # Helper script for WebAssembly integration
├── background.js         # Extension background script
├── build.sh              # Build script for WebAssembly compilation
├── config.js             # Configuration settings
├── debug.js              # Debugging utilities
└── README.md             # This documentation
```

## Building WebAssembly from C++

The C++ code in `search.cpp` implements an optimized Boyer-Moore string search algorithm with the following features:

- Fast string search with both bad character and good suffix rules
- Word boundary detection for accurate matches
- Support for case-insensitive search
- Result formatting for easy integration with JavaScript

To rebuild the WebAssembly module after making changes to `search.cpp`:

1. Ensure your Emscripten environment is activated:
   ```bash
   # Navigate to your emsdk directory
   cd emsdk
   source ./emsdk_env.sh  # On Windows, use: emsdk_env.bat
   ```

2. Return to the extension directory and run the build script:
   ```bash
   cd /path/to/extension
   ./build.sh
   ```

The build script sets up the following Emscripten compilation options:
- 16MB of memory allocation
- Imports memory from JavaScript
- Disables memory growth for performance
- Exports the necessary C++ functions
- Sets optimization level to O2 with debugging information

## WebAssembly Integration

The extension uses a multi-stage process to integrate WebAssembly:

1. `content.js` initializes the environment and injects `page.js`
2. `page.js` loads and initializes the WebAssembly module
3. The search function is called from JavaScript and results are processed
4. Matches are highlighted in the DOM and navigation controls are added

## Usage

1. Click the extension icon in your browser toolbar
2. Enter the first word in the "First Word" field
3. Enter the second word in the "Second Word" field
4. Specify the maximum character gap between words
5. Toggle case sensitivity as needed
6. Click "Search" to perform the search
7. Results will be highlighted in the page with navigation controls

## Performance Considerations

- For very large documents, the search is extremely fast due to the WebAssembly implementation
- DOM highlighting may take longer than the actual search
- The timer shows the execution time with microsecond precision
- Maximum match count is limited to 2000 to prevent performance issues
- Text content is cached to improve performance of subsequent searches

## Troubleshooting

### WebAssembly Compilation Issues

If you encounter errors during WebAssembly compilation:

1. Ensure Emscripten is properly installed and activated
2. Check for C++ syntax errors in `search.cpp`
3. Verify you have sufficient memory for compilation
4. Look for detailed error messages in the terminal output

### Extension Loading Issues

If the extension fails to load:

1. Check the browser console for error messages
2. Ensure all required files are present
3. Verify the manifest.json is properly formatted
4. Try reloading the extension from the extensions page

### Search Not Working

If searches aren't producing expected results:

1. Check the browser console for error messages
2. Verify the WebAssembly module is being loaded (look for "WebAssembly initialized" messages)
3. Try with simpler search terms first
4. Ensure the gap value is appropriate for your search
