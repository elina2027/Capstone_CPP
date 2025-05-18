#include <emscripten.h>
#include <string>
#include <vector>
#include <cctype>
#include <cstdio>
#include <algorithm>
#include <unordered_set>

// For IDE intellisense
#ifndef __EMSCRIPTEN__
#include <cstddef> // for size_t
using std::size_t;
#endif

// Helper function to convert string to lowercase
namespace {
    std::string toLower(const std::string& str) {
        std::string lower = str;
        std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
        return lower;
    }
    
    // Build a bad character table for Boyer-Moore search
    std::vector<int> buildBadCharTable(const std::string& pattern) {
        const int ALPHABET_SIZE = 256; // ASCII
        std::vector<int> badChar(ALPHABET_SIZE, -1);
        
        for (int i = 0; i < pattern.length(); i++) {
            badChar[static_cast<unsigned char>(pattern[i])] = i;
        }
        
        return badChar;
    }
    
    // Boyer-Moore search algorithm - much faster for long patterns
    std::vector<size_t> boyerMooreSearch(const std::string& text, const std::string& pattern) {
        std::vector<size_t> positions;
        if (pattern.empty() || text.empty() || pattern.length() > text.length()) {
            return positions;
        }
        
        auto badChar = buildBadCharTable(pattern);
        int m = pattern.length();
        int n = text.length();
        
        int s = 0; // shift of the pattern with respect to text
        while (s <= (n - m)) {
            int j = m - 1;
            
            // Check pattern from right to left
            while (j >= 0 && pattern[j] == text[s + j]) {
                j--;
            }
            
            if (j < 0) {
                // Pattern found
                positions.push_back(s);
                
                // Shift the pattern to the right
                s += (s + m < n) ? m - badChar[static_cast<unsigned char>(text[s + m])] : 1;
            } else {
                // Shift based on bad character rule
                int badCharShift = j - badChar[static_cast<unsigned char>(text[s + j])];
                s += std::max(1, badCharShift);
            }
        }
        
        return positions;
    }
}

extern "C" {

// Helper struct to store match information
struct Match {
    int start;      // Start position of word1
    int length;     // Total length of the match
    int charCount;  // Number of characters between matches
};

// Debug function to log match information
EMSCRIPTEN_KEEPALIVE
void debugMatch(const Match& match) {
    printf("Match: start=%d, length=%d, charCount=%d\n", 
           match.start, match.length, match.charCount);
}

// Debug function to print vector contents
void debugVector(const std::vector<int>& vec, const char* label) {
    printf("%s: size=%zu, capacity=%zu, data=%p\n", 
           label, vec.size(), vec.capacity(), vec.data());
    if (!vec.empty()) {
        printf("Contents: ");
        for (size_t i = 0; i < vec.size(); ++i) {
            printf("%d ", vec[i]);
        }
        printf("\n");
    }
}

// Helper function to check if a character is part of a word
bool isWordChar(char c) {
    return std::isalnum(c) || c == '\'' || c == '-' || c == '_';
}

// Helper function to check word boundaries
bool isWordBoundary(const std::string& text, size_t pos, const std::string& word) {
    // Check start boundary
    bool validStart = (pos == 0 || !isWordChar(text[pos - 1]));
    
    // Check end boundary
    size_t endPos = pos + word.length();
    bool validEnd = (endPos >= text.length() || !isWordChar(text[endPos]));
    
    printf("Word boundary check at pos %zu: validStart=%d, validEnd=%d\n", 
           pos, validStart, validEnd);
           
    return validStart && validEnd;
}

// Count characters between positions
int countCharsBetween(const std::string& text, size_t start, size_t end) {
    if (start >= end) {
        printf("countCharsBetween: Invalid range (start=%zu, end=%zu)\n", start, end);
        return 0;
    }
    
    // Simply return the number of characters between the positions
    int chars = end - start;
    
    printf("countCharsBetween: start=%zu, end=%zu, chars=%d\n", start, end, chars);
    return chars;
}

// Fast search with Boyer-Moore algorithm and case sensitivity option
std::vector<size_t> fastSearch(const std::string& text, const std::string& word, 
                           const std::string& textLower, const std::string& wordLower,
                           bool caseInsensitive) {
    std::vector<size_t> positions;
    
    if (caseInsensitive) {
        positions = boyerMooreSearch(textLower, wordLower);
    } else {
        positions = boyerMooreSearch(text, word);
    }
    
    // Filter for word boundaries
    std::vector<size_t> validPositions;
    for (size_t pos : positions) {
        if (isWordBoundary(text, pos, word)) {
            validPositions.push_back(pos);
        }
    }
    
    return validPositions;
}

// Process text in chunks to avoid long blocking operations
EMSCRIPTEN_KEEPALIVE
int* search(const char* text, int textLen, const char* word1, int word1Len, 
           const char* word2, int word2Len, int gap, bool caseInsensitive) {
    // Input validation
    if (!text || textLen <= 0 || !word1 || word1Len <= 0 || !word2 || word2Len <= 0 || gap < 0) {
        return nullptr;
    }
    
    static std::vector<int> results;
    results.clear();
    
    // Convert to C++ strings
    std::string str(text, textLen);
    std::string w1(word1, word1Len);
    std::string w2(word2, word2Len);
    
    // Create lowercase versions for case-insensitive search
    std::string strLower = caseInsensitive ? toLower(str) : "";
    std::string w1Lower = caseInsensitive ? toLower(w1) : "";
    std::string w2Lower = caseInsensitive ? toLower(w2) : "";
    
    printf("Starting search loop with text: '%s'\n", str.substr(0, 50).c_str());
    
    // Find positions of word1 with optimized search
    std::vector<size_t> word1Positions = fastSearch(str, w1, strLower, w1Lower, caseInsensitive);
    
    // Process the text in chunks
    const int CHUNK_SIZE = 100000; // Process 100K chars at a time
    int matchCount = 0;
    const int MAX_MATCHES = 100; // Prevent excessive matches

    // Process each chunk for word1 matches
    for (size_t pos1 : word1Positions) {
        if (matchCount >= MAX_MATCHES) {
            printf("Maximum match count reached\n");
            break;
        }
        
        printf("Found word1 at position %zu\n", pos1);
        
        size_t start2 = pos1 + w1.length();
        printf("Looking for word2 starting at position %zu\n", start2);
        
        // Calculate the end of search range (don't exceed gap)
        size_t endSearchPos = start2 + gap + 1;
        if (endSearchPos > str.length()) {
            endSearchPos = str.length();
        }
        
        // Extract substring to search for word2
        std::string chunk = str.substr(start2, endSearchPos - start2);
        std::string chunkLower = caseInsensitive ? toLower(chunk) : "";
        
        // Find word2 in this chunk
        size_t localPos = 0;
        size_t found = std::string::npos;
        
        if (caseInsensitive) {
            found = chunkLower.find(w2Lower, localPos);
        } else {
            found = chunk.find(w2, localPos);
        }
        
        while (found != std::string::npos && found < chunk.length()) {
            size_t globalPos = start2 + found;
            printf("Found word2 at position %zu\n", globalPos);
            
            // Check word boundaries for word2
            if (isWordBoundary(str, globalPos, w2)) {
                // Count characters between matches
                int chars = countCharsBetween(str, start2, globalPos);
                printf("Characters between matches: %d (gap=%d)\n", chars, gap);
                
                if (chars <= gap) {
                    // Store match information
                    Match match{
                        static_cast<int>(pos1),
                        static_cast<int>(globalPos + w2.length() - pos1),
                        chars
                    };
                    
                    // Validate match data before storing
                    if (match.start >= 0 && match.length > 0 && 
                        match.start + match.length <= textLen) {
                        
                        results.push_back(match.start);
                        results.push_back(match.length);
                        results.push_back(match.charCount);
                        
                        matchCount++;
                        break; // Found closest match, stop searching
                    } else {
                        printf("Invalid match data generated: start=%d, length=%d, textLen=%d\n",
                               match.start, match.length, textLen);
                    }
                }
            }
            
            // Look for next occurrence
            localPos = found + 1;
            if (caseInsensitive) {
                found = chunkLower.find(w2Lower, localPos);
            } else {
                found = chunk.find(w2, localPos);
            }
        }
    }
    
    // Add terminator
    results.push_back(-1);
    printf("Search complete: found %d matches\n", matchCount);
    
    return results.empty() ? nullptr : results.data();
}

}
