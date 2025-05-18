#!/bin/bash

# Ensure EMSDK environment is available
if [ -z "$EMSDK" ]; then
    echo "Error: EMSDK environment variable not set"
    echo "Please source your emsdk_env.sh before running this script"
    exit 1
fi

# Compile the WebAssembly module with imported memory
emcc \
    -I${EMSDK}/upstream/emscripten/cache/sysroot/include \
    -sIMPORTED_MEMORY \
    -sINITIAL_MEMORY=16777216 \
    -sMAXIMUM_MEMORY=16777216 \
    -sALLOW_MEMORY_GROWTH=0 \
    -sEXPORTED_FUNCTIONS=_search,_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,stringToUTF8,lengthBytesUTF8 \
    -sENVIRONMENT=web \
    -sEXCEPTION_CATCHING_ALLOWED='["_search"]' \
    -fexceptions \
    --bind \
    -std=c++17 \
    -O2 \
    search.cpp -o search.js

echo "Build complete!" 