#include <emscripten.h>
#include <string>
#include <vector>
#include <cctype>
#include <cstdio>
#include <algorithm> // for std::max

// For IDE intellisense
#ifndef __EMSCRIPTEN__
#include <cstddef> // for size_t
using std::size_t;
#endif

extern "C" {

// Helper struct to store match information
struct Match {
    int start;      // Start position of word1
    int length;     // Total length of the match
    int wordCount;  // Number of words between matches
};

// Debug function to log match information
EMSCRIPTEN_KEEPALIVE
void debugMatch(const Match& match) {
    printf("Match: start=%d, length=%d, wordCount=%d\n", 
           match.start, match.length, match.wordCount);
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

// Count words between positions
int countWordsBetween(const std::string& text, size_t start, size_t end) {
    if (start >= end) {
        printf("countWordsBetween: Invalid range (start=%zu, end=%zu)\n", start, end);
        return 0;
    }
    
    int words = 0;
    bool inWord = false;
    
    for (size_t i = start; i < end; i++) {
        if (isWordChar(text[i])) {
            if (!inWord) {
                words++;
                inWord = true;
            }
        } else {
            inWord = false;
        }
    }
    
    printf("countWordsBetween: start=%zu, end=%zu, words=%d\n", start, end, words);
    return std::max(0, words - 1);  // Return gaps between words
}

EMSCRIPTEN_KEEPALIVE
int* search(const char* text, int textLen, const char* word1, int word1Len, 
           const char* word2, int word2Len, int gap) {
    // Input validation
    if (!text || textLen <= 0 || !word1 || word1Len <= 0 || !word2 || word2Len <= 0 || gap < 0) {
        printf("Invalid input parameters\n");
        return nullptr;
    }
    
    std::string str(text, textLen);
    std::string w1(word1, word1Len);
    std::string w2(word2, word2Len);
    
    printf("Search parameters: text_len=%d, word1='%s', word2='%s', gap=%d\n", 
           textLen, w1.c_str(), w2.c_str(), gap);
    
    // Use static vector to persist memory between calls
    static std::vector<int> results;
    results.clear();
    debugVector(results, "After clear");
    
    size_t pos = 0;
    int matchCount = 0;
    const int MAX_MATCHES = 100; // Prevent excessive matches
    
    printf("Starting search loop with text: '%s'\n", str.substr(0, 50).c_str());
    
    while (pos < str.length() && (pos = str.find(w1, pos)) != std::string::npos) {
        printf("Found word1 at position %zu\n", pos);
        
        if (matchCount >= MAX_MATCHES) {
            printf("Maximum match count reached\n");
            break;
        }
        
        // Check word boundaries for word1
        if (isWordBoundary(str, pos, w1)) {
            size_t start2 = pos + w1.length();
            printf("Looking for word2 starting at position %zu\n", start2);
            
            // Find the next occurrence of word2
            size_t found = str.find(w2, start2);
            while (found != std::string::npos && found < str.length()) {
                printf("Found word2 at position %zu\n", found);
                
                // Check word boundaries for word2
                if (isWordBoundary(str, found, w2)) {
                    // Count words between matches
                    int words = countWordsBetween(str, start2, found);
                    printf("Words between matches: %d (gap=%d)\n", words, gap);
                    
                    if (words <= gap) {
                        // Store match information
                        Match match{
                            static_cast<int>(pos),
                            static_cast<int>(found + w2.length() - pos),
                            words
                        };
                        
                        // Validate match data before storing
                        if (match.start >= 0 && match.length > 0 && 
                            match.start + match.length <= textLen) {
                            debugMatch(match);
                            
                            // Debug vector before push
                            debugVector(results, "Before push");
                            
                            results.push_back(match.start);
                            results.push_back(match.length);
                            results.push_back(match.wordCount);
                            
                            // Debug vector after push
                            debugVector(results, "After push");
                            
                            matchCount++;
                            break;
                        } else {
                            printf("Invalid match data generated: start=%d, length=%d, textLen=%d\n",
                                   match.start, match.length, textLen);
                        }
                    }
                }
                // Look for next occurrence if this one wasn't valid or was too far
                found = str.find(w2, found + 1);
            }
        }
        pos++;
    }
    
    // Add terminator
    results.push_back(-1);
    
    // Final vector debug
    debugVector(results, "Final results");
    printf("Search complete: found %d matches\n", matchCount);
    
    // Get and validate the data pointer
    int* dataPtr = results.data();
    printf("Returning pointer: %p, first value: %d\n", 
           static_cast<void*>(dataPtr), 
           results.empty() ? -1 : results[0]);
    
    return results.empty() ? nullptr : dataPtr;
}

}
