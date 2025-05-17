#include <emscripten.h>
#include <string>
#include <vector>
#include <cctype>

extern "C" {

// Helper struct to store match information
struct Match {
    int start;      // Start position of word1
    int length;     // Total length of the match
    int wordCount;  // Number of words between matches
};

EMSCRIPTEN_KEEPALIVE
int* search(const char* text, int textLen, const char* word1, int word1Len, 
           const char* word2, int word2Len, int gap) {
    std::string str(text, textLen);
    std::string w1(word1, word1Len);
    std::string w2(word2, word2Len);
    
    // Use static vector to persist memory between calls
    static std::vector<int> results;
    results.clear();
    
    // Helper function to check if a character is part of a word
    auto isWordChar = [](char c) {
        return std::isalnum(c) || c == '\'' || c == '-';
    };
    
    // Count words between the matches
    auto countWords = [&isWordChar](const std::string& text, size_t start, size_t end) {
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
        
        return words - 1; // Subtract 1 because we don't count the target word
    };
    
    size_t pos = 0;
    while ((pos = str.find(w1, pos)) != std::string::npos) {
        // Verify this is a word boundary
        if ((pos == 0 || !isWordChar(str[pos-1])) && 
            (pos + w1.length() >= str.length() || !isWordChar(str[pos + w1.length()]))) {
            
            size_t start2 = pos + w1.length();
            
            // Find the next occurrence of word2
            size_t found = str.find(w2, start2);
            while (found != std::string::npos) {
                // Verify this is a word boundary
                if ((found == 0 || !isWordChar(str[found-1])) && 
                    (found + w2.length() >= str.length() || !isWordChar(str[found + w2.length()]))) {
                    
                    // Count words between the matches
                    int words = countWords(str, start2, found);
                    if (words <= gap) {
                        // Store match information:
                        // [start position, total length, word count between]
                        results.push_back(static_cast<int>(pos));
                        results.push_back(static_cast<int>(found + w2.length() - pos));
                        results.push_back(words);
                        break; // Found the closest valid match
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
    
    // Return pointer to the results array
    return results.data();
}

}
