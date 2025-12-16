import spacy
import json
import requests
import sys

def generate_data():
    print("Loading language model... (this may take a moment)")
    # Load the English model with vectors
    try:
        nlp = spacy.load("en_core_web_lg")
    except OSError:
        print("Error: Model not found. Please run: python -m spacy download en_core_web_lg")
        return

    # Define your two target words
    target_1 = nlp("heated")
    target_2 = nlp("blanket")
    
    # URL for a list of common English words (approx 20k words)
    # Using the 'google-10000-english' repo extended list as a base
    word_list_url = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"
    
    print(f"Downloading word list from {word_list_url}...")
    response = requests.get(word_list_url)
    if response.status_code != 200:
        print("Failed to download word list.")
        return
    
    # split into list and filter empty strings
    raw_words = response.text.splitlines()
    print(f"Processing {len(raw_words)} words...")

    game_data = {}

    for word in raw_words:
        word = word.strip().lower()
        
        # Skip words longer than 10 letters as per your game rules
        if len(word) > 10:
            continue
            
        token = nlp(word)
        
        # Only process if the word has a vector (some rare words might not)
        if token.has_vector and token.vector_norm != 0:
            # Calculate similarity (returns 0.0 to 1.0)
            sim_1 = token.similarity(target_1)
            sim_2 = token.similarity(target_2)
            
            # Round to integer 0-100 to save space
            score_1 = int(sim_1 * 100)
            score_2 = int(sim_2 * 100)
            
            # Ensure no negative scores (rare but possible with vectors)
            score_1 = max(0, score_1)
            score_2 = max(0, score_2)

            # Store in a compact array format: [score_for_heated, score_for_blanket]
            game_data[word] = [score_1, score_2]

    # Add the target words explicitly to ensure they are 100% (Perfect Match)
    game_data["heated"] = [100, int(target_2.similarity(target_1)*100)]
    game_data["blanket"] = [int(target_1.similarity(target_2)*100), 100]

    # Save to JSON
    output_filename = "words.json"
    with open(output_filename, "w") as f:
        json.dump(game_data, f, separators=(',', ':')) # separators removes whitespace for minification
    
    print(f"Success! {output_filename} generated with {len(game_data)} words.")
    print(f"File size estimate: {sys.getsizeof(json.dumps(game_data)) / 1024:.2f} KB")

if __name__ == "__main__":
    generate_data()