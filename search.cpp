#include <emscripten.h>
#include <string>
#include <vector>
#include <cctype>
#include <cstdio>

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
    
    // Helper function to check if a character is part of a word
    auto isWordChar = [](char c) {
        return std::isalnum(c) || c == '\'' || c == '-';
    };
    
    // Count words between the matches
    auto countWords = [&isWordChar](const std::string& text, size_t start, size_t end) {
        if (start >= end) {
            printf("countWords: start >= end (start=%zu, end=%zu)\n", start, end);
            return 0;
        }
        
        int words = 0;
        bool inWord = false;
        
        // Skip any punctuation at the start
        while (start < end && !isWordChar(text[start])) {
            start++;
        }
        
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
        
        int result = std::max(0, words - 1);
        printf("countWords: start=%zu, end=%zu, words=%d, result=%d\n", 
               start, end, words, result);
        return result;
    };
    
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
        
        // Verify this is a word boundary
        bool isValidStart = (pos == 0 || !isWordChar(str[pos-1]));
        bool isValidEnd = (pos + w1.length() >= str.length() || !isWordChar(str[pos + w1.length()]));
        printf("Word boundary check: start=%d, end=%d\n", isValidStart, isValidEnd);
        
        if (isValidStart && isValidEnd) {
            size_t start2 = pos + w1.length();
            printf("Looking for word2 starting at position %zu\n", start2);
            
            // Find the next occurrence of word2
            size_t found = str.find(w2, start2);
            while (found != std::string::npos && found < str.length()) {
                printf("Found word2 at position %zu\n", found);
                
                // Verify this is a word boundary
                bool isValid2Start = (found == 0 || !isWordChar(str[found-1]));
                bool isValid2End = (found + w2.length() >= str.length() || !isWordChar(str[found + w2.length()]));
                printf("Word2 boundary check: start=%d, end=%d\n", isValid2Start, isValid2End);
                
                if (isValid2Start && isValid2End) {
                    // Count words between the matches
                    int words = countWords(str, start2, found);
                    printf("Found potential match: pos=%zu, found=%zu, words=%d\n", 
                           pos, found, words);
                    
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
