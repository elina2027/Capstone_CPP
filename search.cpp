#include <emscripten.h>
#include <string>
#include <vector>
#include <cctype>
#include <algorithm>
#include <unordered_set>
#include <string_view>  // Using string_view for better memory efficiency
#include <cstddef>     // For size_t
#include <memory>      // For smart pointers

// For IDE intellisense
#ifndef __EMSCRIPTEN__
using std::size_t;
#endif

// Chunk size for processing large texts
const size_t CHUNK_SIZE = 100000; // 100KB chunks

// Helper struct to store match information
struct Match {
    int start;      // Start position of word1
    int length;     // Total length of the match
    int charCount;  // Number of characters between matches
};

// Namespace for internal helper functions
namespace {
    // Convert string to lowercase for case-insensitive search
    std::string toLower(const std::string_view& str) {
        std::string lower;
        try {
            // Pre-allocate with a safe size check
            if (str.length() > 0) {
                lower.reserve(std::min(str.length(), static_cast<size_t>(1000000)));
            }
            
            // Process the string in chunks if it's very large
            const size_t chunkSize = 10000;
            for (size_t i = 0; i < str.length(); i += chunkSize) {
                const size_t endPos = std::min(i + chunkSize, str.length());
                for (size_t j = i; j < endPos; j++) {
                    lower.push_back(std::tolower(str[j]));
                }
            }
        } catch (const std::bad_alloc&) {
            // If allocation fails, try with a smaller size or return empty
            return "";
        }
        return lower;
    }
    
    // Helper function to check if a character is part of a word
    bool isWordChar(char c) {
        return std::isalnum(c) || c == '\'' || c == '-' || c == '_';
    }
    
    // Enhanced word boundary check with proper validation
    bool isWordBoundary(const std::string_view& text, size_t pos, size_t wordLength) {
        // Safety bounds check
        if (pos >= text.length() || pos + wordLength > text.length()) {
            return false;
        }
        
        // Check start boundary
        bool validStart = (pos == 0 || !isWordChar(text[pos - 1]));
        
        // Check end boundary
        size_t endPos = pos + wordLength;
        bool validEnd = (endPos >= text.length() || !isWordChar(text[endPos]));
        
        return validStart && validEnd;
    }
    
    // Simple search for text in document - processes in chunks to avoid memory issues
    std::vector<size_t> simpleSearch(const std::string_view& text, const std::string_view& pattern, bool caseInsensitive) {
        std::vector<size_t> positions;
        
        // Handle empty inputs
        if (pattern.empty() || text.empty() || pattern.length() > text.length()) {
            return positions;
        }
        
        try {
            // Reserve a reasonable amount of space but don't overdo it
            positions.reserve(std::min(text.length() / 100, static_cast<size_t>(10000)));
            
            const size_t patternLength = pattern.length();
            const size_t textLength = text.length();
            
            // Special case for single character patterns - much faster direct search
            if (patternLength == 1) {
                char searchChar = pattern[0];
                if (caseInsensitive) {
                    searchChar = std::tolower(searchChar);
                    for (size_t i = 0; i < textLength; ++i) {
                        if (std::tolower(text[i]) == searchChar) {
                            positions.push_back(i);
                        }
                    }
                } else {
                    for (size_t i = 0; i < textLength; ++i) {
                        if (text[i] == searchChar) {
                            positions.push_back(i);
                        }
                    }
                }
                return positions;
            }
            
            // Process the text in chunks to avoid memory issues with very large texts
            const size_t chunkSize = CHUNK_SIZE;
            for (size_t chunk = 0; chunk < textLength; chunk += chunkSize) {
                // Determine the end of this chunk, ensuring overlap for pattern matching
                const size_t chunkEnd = std::min(chunk + chunkSize + patternLength - 1, textLength);
                const size_t searchEnd = chunkEnd - patternLength + 1;
                
                // Search within this chunk
                for (size_t i = chunk; i < searchEnd; ++i) {
                    bool match = true;
                    
                    // Match each character
                    for (size_t j = 0; j < patternLength; ++j) {
                        char textChar = text[i + j];
                        char patternChar = pattern[j];
                        
                        if (caseInsensitive) {
                            if (std::tolower(textChar) != std::tolower(patternChar)) {
                                match = false;
                                break;
                            }
                        } else {
                            if (textChar != patternChar) {
                                match = false;
                                break;
                            }
                        }
                    }
                    
                    if (match) {
                        positions.push_back(i);
                    }
                }
            }
        } catch (const std::bad_alloc&) {
            // If we run out of memory, return what we have so far
            return positions;
        }
        
        return positions;
    }
    
    // Optimized search for both words with case sensitivity option
    std::vector<Match> findMatches(
        const std::string_view& text, 
        const std::string_view& word1, 
        const std::string_view& word2,
        int gap,
        bool caseInsensitive) 
    {
        std::vector<Match> matches;
        
        // Validate inputs to prevent crashes
        if (text.empty() || word1.empty() || word2.empty() || gap < 0) {
            return matches;
        }
        
        try {
            // Find all positions of word1 using chunked search
            std::vector<size_t> word1Positions = simpleSearch(text, word1, caseInsensitive);
            
            // Safety check
            if (word1Positions.empty()) {
                return matches;
            }
            
            // Filter for valid word boundaries - use progressive allocation
            std::vector<size_t> validWord1Positions;
            validWord1Positions.reserve(std::min(word1Positions.size(), static_cast<size_t>(10000)));
            
            for (size_t pos : word1Positions) {
                if (isWordBoundary(text, pos, word1.length())) {
                    validWord1Positions.push_back(pos);
                    
                    // If the vector gets too large, process in batches
                    if (validWord1Positions.size() >= 10000) {
                        break;
                    }
                }
            }
            
            // Safety check
            if (validWord1Positions.empty()) {
                return matches;
            }
            
            // Reserve memory for matches - be conservative
            matches.reserve(std::min(validWord1Positions.size(), static_cast<size_t>(5000)));
            
            // Process word1 positions in chunks to avoid memory issues
            const size_t batchSize = 1000; // Process 1000 positions at a time
            
            for (size_t batchStart = 0; batchStart < validWord1Positions.size(); batchStart += batchSize) {
                const size_t batchEnd = std::min(batchStart + batchSize, validWord1Positions.size());
                
                // Process this batch
                for (size_t i = batchStart; i < batchEnd; i++) {
                    size_t pos1 = validWord1Positions[i];
                    
                    // Start position for word2 search
                    size_t start2 = pos1 + word1.length();
                    
                    // Skip if we've already reached the end of text
                    if (start2 >= text.length()) {
                        continue;
                    }
                    
                    // Maximum position to search for word2 (respecting gap limit)
                    size_t maxPos2 = std::min(start2 + static_cast<size_t>(gap), text.length() - word2.length());
                    
                    // Skip if no valid positions for word2
                    if (maxPos2 < start2) {
                        continue;
                    }
                    
                    // For very large gap ranges, use chunked search
                    const size_t gapSearchChunkSize = 10000;
                    
                    for (size_t chunkStart = start2; chunkStart <= maxPos2; chunkStart += gapSearchChunkSize) {
                        const size_t chunkEnd = std::min(chunkStart + gapSearchChunkSize, maxPos2 + 1);
                        
                        // Create a view of this chunk for searching
                        std::string_view searchRange(&text[chunkStart], chunkEnd - chunkStart);
                        
                        // Find word2 positions in this chunk
                        std::vector<size_t> chunkPositions = simpleSearch(searchRange, word2, caseInsensitive);
                        
                        // Process each found position
                        for (size_t offsetPos2 : chunkPositions) {
                            size_t pos2 = chunkStart + offsetPos2;
                            
                            // Validate position
                            if (pos2 >= text.length() || pos2 + word2.length() > text.length()) {
                                continue;
                            }
                            
                            // Check word boundary
                            if (isWordBoundary(text, pos2, word2.length())) {
                                // Calculate char count between words
                                int chars = static_cast<int>(pos2 - start2);
                                
                                // Check if within gap constraint
                                if (chars <= gap) {
                                    // Add the match and verify we can still allocate memory
                                    try {
                                        Match match{
                                            static_cast<int>(pos1),
                                            static_cast<int>(pos2 + word2.length() - pos1),
                                            chars
                                        };
                                        
                                        matches.push_back(match);
                                    } catch (const std::bad_alloc&) {
                                        // If we can't allocate more memory, return what we have
                                        return matches;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (const std::bad_alloc&) {
            // If we run out of memory, return what we have so far
            return matches;
        }
        
        return matches;
    }
}

extern "C" {

// Debug function to log match information
EMSCRIPTEN_KEEPALIVE
void debugMatch(const Match& match) {
    // No debugging prints in production build
}

// Main search function exposed to JavaScript
EMSCRIPTEN_KEEPALIVE
int* search(const char* text, int textLen, 
           const char* word1, int word1Len, 
           const char* word2, int word2Len, 
           int gap, bool caseInsensitive) {
    // Input validation with extra safety
    if (!text || textLen <= 0 || !word1 || word1Len <= 0 || 
        !word2 || word2Len <= 0 || gap < 0 || gap > 1000000) {
        // Return empty result for invalid inputs
        static std::vector<int> emptyResult = {-1};
        return emptyResult.data();
    }
    
    // Static to ensure the vector doesn't get destroyed when the function returns
    static std::vector<int> results;
    results.clear();
    
    try {
        // Use string_view to avoid copies
        std::string_view str(text, textLen);
        std::string_view w1(word1, word1Len);
        std::string_view w2(word2, word2Len);
        
        // Find matches using optimized algorithm
        auto matches = findMatches(str, w1, w2, gap, caseInsensitive);
        
        // Pre-allocate result vector cautiously
        try {
            results.reserve(matches.size() * 3 + 1);
        } catch (const std::bad_alloc&) {
            // If allocation fails, try with a smaller size
            results.reserve(100); // Small size to at least return some results
        }
        
        // Store results in flat array format: [start1, length1, charCount1, start2, length2, charCount2, ... -1]
        for (const auto& match : matches) {
            try {
                results.push_back(match.start);
                results.push_back(match.length);
                results.push_back(match.charCount);
            } catch (const std::bad_alloc&) {
                // If we can't add more results, break and return what we have
                break;
            }
        }
        
        // Add terminator value
        results.push_back(-1);
        
        return results.data();
    } 
    catch (const std::bad_alloc&) {
        // Handle memory allocation failures
        results.clear();
        results.push_back(-1);
        return results.data();
    }
    catch (...) {
        // Handle any other unexpected errors
        results.clear();
        results.push_back(-1);
        return results.data();
    }
}

} // extern "C"
