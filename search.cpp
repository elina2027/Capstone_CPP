#include <emscripten.h>
#include <string>
#include <vector>
#include <cctype>
#include <algorithm>
#include <unordered_set>
#include <string_view>  // Using string_view for better memory efficiency

// For IDE intellisense
#ifndef __EMSCRIPTEN__
#include <cstddef> // for size_t
using std::size_t;
#endif

// Helper struct to store match information
struct Match {
    int start;      // Start position of word1
    int length;     // Total length of the match
    int charCount;  // Number of characters between matches
};

// Namespace for internal helper functions
namespace {
    // Convert string to lowercase for case-insensitive search
    std::string toLower(const std::string& str) {
        std::string lower;
        lower.reserve(str.length()); // Pre-allocate memory
        std::transform(str.begin(), str.end(), std::back_inserter(lower),
                      [](unsigned char c) { return std::tolower(c); });
        return lower;
    }
    
    // Helper function to check if a character is part of a word
    bool isWordChar(char c) {
        return std::isalnum(c) || c == '\'' || c == '-' || c == '_';
    }
    
    // Enhanced word boundary check with proper validation
    bool isWordBoundary(const std::string& text, size_t pos, size_t wordLength) {
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
    
    // Simple search for text in document - more reliable than Boyer-Moore for smaller patterns
    std::vector<size_t> simpleSearch(const std::string& text, const std::string& pattern, bool caseInsensitive) {
        std::vector<size_t> positions;
        
        // Handle empty inputs
        if (pattern.empty() || text.empty() || pattern.length() > text.length()) {
            return positions;
        }
        
        const size_t patternLength = pattern.length();
        const size_t textLength = text.length();
        const size_t searchLimit = textLength - patternLength + 1;
        
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
        
        // For case insensitive search
        if (caseInsensitive) {
            for (size_t i = 0; i < searchLimit; ++i) {
                bool match = true;
                for (size_t j = 0; j < patternLength; ++j) {
                    if (std::tolower(text[i + j]) != std::tolower(pattern[j])) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    positions.push_back(i);
                }
            }
        } else { // For case sensitive search
            for (size_t i = 0; i < searchLimit; ++i) {
                bool match = true;
                for (size_t j = 0; j < patternLength; ++j) {
                    if (text[i + j] != pattern[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    positions.push_back(i);
                }
            }
        }
        
        return positions;
    }
    
    // Optimized search for both words with case sensitivity option
    std::vector<Match> findMatches(
        const std::string& text, 
        const std::string& word1, 
        const std::string& word2,
        int gap,
        bool caseInsensitive) 
    {
        std::vector<Match> matches;
        
        // Validate inputs to prevent crashes
        if (text.empty() || word1.empty() || word2.empty() || gap < 0) {
            return matches;
        }
        
        // Find all positions of word1
        std::vector<size_t> word1Positions = simpleSearch(text, word1, caseInsensitive);
        
        // Safety check
        if (word1Positions.empty()) {
            return matches;
        }
        
        // Filter for valid word boundaries
        std::vector<size_t> validWord1Positions;
        validWord1Positions.reserve(word1Positions.size()); // Pre-allocate memory
        
        for (size_t pos : word1Positions) {
            if (isWordBoundary(text, pos, word1.length())) {
                validWord1Positions.push_back(pos);
            }
        }
        
        // Safety check
        if (validWord1Positions.empty()) {
            return matches;
        }
        
        // Prevent excessive matches
        // Remove artificial limit
        // const int MAX_MATCHES = 3000; // Reduced to prevent memory issues
        
        // Reserve memory for matches to avoid reallocations
        matches.reserve(validWord1Positions.size() * 2);
        
        // Find word2 near each valid word1 position
        for (size_t pos1 : validWord1Positions) {
            // Remove the MAX_MATCHES check
            // if (matches.size() >= MAX_MATCHES) {
            //     break;
            // }
            
            // Start position for word2 search
            size_t start2 = pos1 + word1.length();
            
            // Skip if we've already reached the end of text
            if (start2 >= text.length()) {
                continue;
            }
            
            // Maximum position to search for word2 (respecting gap limit)
            size_t maxPos2 = std::min(start2 + gap, text.length() - word2.length());
            
            // Skip if no valid positions for word2
            if (maxPos2 < start2) {
                continue;
            }
            
            // Extract the substring to search for word2 matches
            // This is more efficient than checking each position individually
            std::string_view searchRange(text.data() + start2, maxPos2 - start2 + 1);
            
            // Find all positions of word2 in this range
            std::vector<size_t> word2Positions;
            
            // For small ranges, do a direct substring search
            if (searchRange.length() < 100) {
                size_t pos = 0;
                while (pos <= searchRange.length() - word2.length()) {
                    bool match = true;
                    
                    // Check each character
                    for (size_t i = 0; i < word2.length(); i++) {
                        char c1 = searchRange[pos + i];
                        char c2 = word2[i];
                        
                        if (caseInsensitive) {
                            if (std::tolower(c1) != std::tolower(c2)) {
                                match = false;
                                break;
                            }
                        } else {
                            if (c1 != c2) {
                                match = false;
                                break;
                            }
                        }
                    }
                    
                    if (match) {
                        word2Positions.push_back(pos);
                    }
                    pos++;
                }
            } else {
                // For larger ranges, convert to string and use the simple search
                std::string rangeStr(searchRange);
                auto tempPositions = simpleSearch(rangeStr, word2, caseInsensitive);
                word2Positions.insert(word2Positions.end(), tempPositions.begin(), tempPositions.end());
            }
            
            // Process each found position of word2
            for (size_t offsetPos2 : word2Positions) {
                size_t pos2 = start2 + offsetPos2;
                
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
                        Match match{
                            static_cast<int>(pos1),
                            static_cast<int>(pos2 + word2.length() - pos1),
                            chars
                        };
                        
                        matches.push_back(match);
                    }
                }
            }
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
    
    // Remove text length limit
    // Cap text length to prevent memory issues
    // const int MAX_TEXT_LENGTH = 5000000; // 5MB limit for safety
    // if (textLen > MAX_TEXT_LENGTH) {
    //     textLen = MAX_TEXT_LENGTH;
    // }
    
    // Static to ensure the vector doesn't get destroyed when the function returns
    static std::vector<int> results;
    results.clear();
    
    try {
        // Convert inputs to C++ strings
        std::string str(text, textLen);
        std::string w1(word1, word1Len);
        std::string w2(word2, word2Len);
        
        // Find matches using optimized algorithm
        auto matches = findMatches(str, w1, w2, gap, caseInsensitive);
        
        // Pre-allocate result vector
        results.reserve(matches.size() * 3 + 1);
        
        // Store results in flat array format: [start1, length1, charCount1, start2, length2, charCount2, ... -1]
        for (const auto& match : matches) {
            results.push_back(match.start);
            results.push_back(match.length);
            results.push_back(match.charCount);
        }
        
        // Add terminator value
        results.push_back(-1);
        
        return results.data();
    } 
    catch (...) {
        // Handle any unexpected errors
        results.clear();
        results.push_back(-1);
        return results.data();
    }
}

} // extern "C"
