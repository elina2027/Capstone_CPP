#!/bin/bash

# Ensure EMSDK environment is available
if [ -z "$EMSDK" ]; then
    echo "Error: EMSDK environment variable not set"
    echo "Please source your emsdk_env.sh before running this script"
    exit 1
fi

# Clean previous build artifacts
rm -f search.js search.wasm

# Compile the WebAssembly module with imported memory
emcc \
    -I${EMSDK}/upstream/emscripten/cache/sysroot/include \
    -sIMPORTED_MEMORY \
    -sINITIAL_MEMORY=16777216 \
    -sMAXIMUM_MEMORY=67108864 \
    -sALLOW_MEMORY_GROWTH=1 \
    -sEXPORTED_FUNCTIONS=_search,_malloc,_free,_debugMatch \
    -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,stringToUTF8,lengthBytesUTF8,HEAP32 \
    -sENVIRONMENT=web \
    -sEXCEPTION_CATCHING_ALLOWED='["_search"]' \
    -fexceptions \
    --bind \
    -std=c++17 \
    -O2 \
    -g4 \
    -s ASSERTIONS=2 \
    -s SAFE_HEAP=1 \
    search.cpp -o search.js

echo "Build complete!" 