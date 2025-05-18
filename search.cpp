#include <emscripten.h>
#include <string>
#include <vector>
#include <cctype>
#include <algorithm>
#include <unordered_set>

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
        std::string lower = str;
        std::transform(lower.begin(), lower.end(), lower.begin(), 
                      [](unsigned char c) { return std::tolower(c); });
        return lower;
    }
    
    // Compute the suffix length table for Boyer-Moore search
    std::vector<int> computeSuffixLength(const std::string& pattern) {
        int m = pattern.length();
        std::vector<int> suffixLength(m, 0);
        
        // Initialize last position
        suffixLength[m - 1] = m;
        
        // Start from the second last character
        int g = m - 1;
        int f = 0;
        
        for (int i = m - 2; i >= 0; i--) {
            if (i > g && suffixLength[m - 1 - f + i] < i - g) {
                suffixLength[i] = suffixLength[m - 1 - f + i];
            } else {
                if (i < g) {
                    g = i;
                }
                f = i;
                
                while (g >= 0 && pattern[g] == pattern[m - 1 - f + g]) {
                    g--;
                }
                
                suffixLength[i] = f - g;
            }
        }
        
        return suffixLength;
    }
    
    // Build a bad character table for Boyer-Moore search
    std::vector<int> buildBadCharTable(const std::string& pattern) {
        const int ALPHABET_SIZE = 256; // Full ASCII range
        std::vector<int> badChar(ALPHABET_SIZE, -1);
        
        for (int i = 0; i < pattern.length(); i++) {
            badChar[static_cast<unsigned char>(pattern[i])] = i;
        }
        
        return badChar;
    }
    
    // Build a good suffix table for Boyer-Moore search
    std::vector<int> buildGoodSuffixTable(const std::string& pattern) {
        int m = pattern.length();
        std::vector<int> goodSuffix(m, 0);
        std::vector<int> suffixLength = computeSuffixLength(pattern);
        
        // Initialize all values to length of pattern
        for (int i = 0; i < m; i++) {
            goodSuffix[i] = m;
        }
        
        // Consider case 2: some substring of pattern matches suffix of another occurrence
        for (int i = m - 1; i >= 0; i--) {
            if (suffixLength[i] == i + 1) {
                for (int j = 0; j < m - 1 - i; j++) {
                    if (goodSuffix[j] == m) {
                        goodSuffix[j] = m - 1 - i;
                    }
                }
            }
        }
        
        // Consider case 1: suffix of pattern appears elsewhere in pattern
        for (int i = 0; i <= m - 2; i++) {
            int suffixLen = suffixLength[i];
            goodSuffix[m - 1 - suffixLen] = m - 1 - i;
        }
        
        return goodSuffix;
    }
    
    // Enhanced Boyer-Moore search algorithm with both bad character and good suffix rules
    std::vector<size_t> boyerMooreSearch(const std::string& text, const std::string& pattern) {
        std::vector<size_t> positions;
        
        // Check for edge cases
        if (pattern.empty() || text.empty() || pattern.length() > text.length()) {
            return positions;
        }
        
        // Compute bad character and good suffix shift tables
        auto badChar = buildBadCharTable(pattern);
        auto goodSuffix = buildGoodSuffixTable(pattern);
        
        int m = pattern.length();
        int n = text.length();
        
        // Create a cache for previously found positions to prevent duplicates
        std::unordered_set<size_t> positionCache;
        
        int s = 0; // current shift of the pattern
        while (s <= (n - m)) {
            int j = m - 1;
            
            // Match pattern from right to left
            while (j >= 0 && pattern[j] == text[s + j]) {
                j--;
            }
            
            if (j < 0) {
                // Pattern match found
                size_t pos = s;
                
                // Only add unique positions
                if (positionCache.find(pos) == positionCache.end()) {
                    positions.push_back(pos);
                    positionCache.insert(pos);
                }
                
                // Shift using good suffix rule for next search
                s += goodSuffix[0];
            } else {
                // Compute shifts using both bad character and good suffix rules
                int badCharShift = j - badChar[static_cast<unsigned char>(text[s + j])];
                int goodSuffixShift = goodSuffix[j];
                
                // Take the maximum of the two shifts
                s += std::max(1, std::max(badCharShift, goodSuffixShift));
            }
        }
        
        return positions;
    }
    
    // Helper function to check if a character is part of a word
    bool isWordChar(char c) {
        return std::isalnum(c) || c == '\'' || c == '-' || c == '_';
    }
    
    // Enhanced word boundary check with proper validation
    bool isWordBoundary(const std::string& text, size_t pos, const std::string& word) {
        // Safety bounds check
        if (pos >= text.length() || pos + word.length() > text.length()) {
            return false;
        }
        
        // Check start boundary
        bool validStart = (pos == 0 || !isWordChar(text[pos - 1]));
        
        // Check end boundary
        size_t endPos = pos + word.length();
        bool validEnd = (endPos >= text.length() || !isWordChar(text[endPos]));
        
        return validStart && validEnd;
    }
    
    // Count characters between positions
    int countCharsBetween(const std::string& text, size_t start, size_t end) {
        if (start >= end || start >= text.length() || end > text.length()) {
            return 0;
        }
        
        return end - start;
    }
    
    // Optimized search for both words with case sensitivity option
    std::vector<Match> findMatches(
        const std::string& text, 
        const std::string& word1, 
        const std::string& word2,
        const std::string& textLower,
        const std::string& word1Lower,
        const std::string& word2Lower,
        int gap,
        bool caseInsensitive) 
    {
        std::vector<Match> matches;
        
        // Search for word1 positions
        std::vector<size_t> word1Positions;
        
        // Choose the appropriate strings based on case sensitivity
        const std::string& searchText = caseInsensitive ? textLower : text;
        const std::string& searchWord1 = caseInsensitive ? word1Lower : word1;
        const std::string& searchWord2 = caseInsensitive ? word2Lower : word2;
        
        // Find all positions of word1 using Boyer-Moore
        word1Positions = boyerMooreSearch(searchText, searchWord1);
        
        // Filter for valid word boundaries
        std::vector<size_t> validWord1Positions;
        for (size_t pos : word1Positions) {
            if (isWordBoundary(text, pos, word1)) {
                validWord1Positions.push_back(pos);
            }
        }
        
        // Safety check
        if (validWord1Positions.empty()) {
            return matches;
        }
        
        // Prevent excessive matches
        const int MAX_MATCHES = 2000; // Increased from previous 100 limit
        
        // Find word2 near each valid word1 position
        for (size_t pos1 : validWord1Positions) {
            if (matches.size() >= MAX_MATCHES) {
                break;
            }
            
            // Start position for word2 search
            size_t start2 = pos1 + word1.length();
            
            // Maximum position to search for word2 (respecting gap limit)
            size_t maxPos2 = std::min(start2 + gap, text.length());
            
            // Find all potential word2 matches within gap
            for (size_t pos2 = start2; pos2 <= maxPos2; pos2++) {
                if (pos2 + word2.length() > text.length()) {
                    continue;
                }
                
                bool found;
                if (caseInsensitive) {
                    found = (textLower.compare(pos2, word2Lower.length(), word2Lower) == 0);
                } else {
                    found = (text.compare(pos2, word2.length(), word2) == 0);
                }
                
                if (found && isWordBoundary(text, pos2, word2)) {
                    // Calculate char count between words
                    int chars = countCharsBetween(text, start2, pos2);
                    
                    // Check if within gap constraint
                    if (chars <= gap) {
                        Match match{
                            static_cast<int>(pos1),
                            static_cast<int>(pos2 + word2.length() - pos1),
                            chars
                        };
                        
                        matches.push_back(match);
                        break; // Found closest match for this word1, move to next word1
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
    // Input validation
    if (!text || textLen <= 0 || !word1 || word1Len <= 0 || 
        !word2 || word2Len <= 0 || gap < 0) {
        return nullptr;
    }
    
    // Static to ensure the vector doesn't get destroyed when the function returns
    static std::vector<int> results;
    results.clear();
    
    try {
        // Convert inputs to C++ strings
        std::string str(text, textLen);
        std::string w1(word1, word1Len);
        std::string w2(word2, word2Len);
        
        // Create lowercase versions for case-insensitive search
        std::string strLower = caseInsensitive ? toLower(str) : "";
        std::string w1Lower = caseInsensitive ? toLower(w1) : "";
        std::string w2Lower = caseInsensitive ? toLower(w2) : "";
        
        // Find matches using optimized algorithm
        auto matches = findMatches(str, w1, w2, strLower, w1Lower, w2Lower, gap, caseInsensitive);
        
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
