import spacy
import json
import requests
import sys

# --- CONFIGURATION ---
SECRET_SENTENCE = "My beloved koala, since your otter cannot always be nearby to radiate sufficient body heat during this frigid Christmas, please use this substitute to stay toasty: heated blanket !"

def generate_data():
    print("1. Loading Language Model... (approx 10-20 seconds)")
    try:
        nlp = spacy.load("en_core_web_lg")
    except OSError:
        print("Error: Large model not found. Run: python -m spacy download en_core_web_lg")
        return

    # --- STEP 1: Analyze the Target Sentence ---
    print(f"2. Analyzing sentence: '{SECRET_SENTENCE}'")
    doc = nlp(SECRET_SENTENCE)
    
    targets = []
    sentence_structure = []

    for token in doc:
        word_clean = token.text.strip()
        if not word_clean: continue

        # Target Logic: Significant words (Noun/Verb/Adj/Adv) that aren't Stop Words
        is_significant = token.pos_ in ['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN']
        is_long_enough = len(word_clean) >= 3
        is_not_stop = not token.is_stop
        
        is_target = is_significant and is_long_enough and is_not_stop

        if is_target:
            targets.append(token)
            sentence_structure.append({
                "text": word_clean, 
                "type": "target", 
                "id": len(targets)-1
            })
            print(f"   [TARGET]: {word_clean}")
        else:
            sentence_structure.append({
                "text": word_clean, 
                "type": "filler"
            })
            print(f"   [FILLER]: {word_clean}")

    # --- STEP 2: Download LARGER Word List ---
    # Using a frequency list of the top 333,000 words
    print("\n3. Downloading larger dictionary (~300k words)...")
    url = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"
    
    try:
        r = requests.get(url)
        raw_words = r.text.splitlines()
    except:
        print("Error downloading word list.")
        return

    print(f"   Success! Downloaded {len(raw_words)} raw words.")
    print("4. Filtering and calculating scores (this may take 2-3 minutes)...")

    game_dictionary = {}
    
    # We will process ALL words, but we rely on Spacy's vocabulary to filter out nonsense.
    # If Spacy doesn't have a vector for it, we skip it.
    
    count = 0
    max_words = 600000 # Limit to keep file size reasonable for mobile (approx 1.5MB)
    
    # Use a set to avoid duplicates
    processed_words = set()

    for word_str in raw_words:
        word_str = word_str.strip().lower()
        
        if word_str in processed_words: continue
        
        # Game Rules Filters
        if len(word_str) > 10: continue # Max tiles is 10
        if len(word_str) < 2: continue  # No single letters
        
        processed_words.add(word_str)

        token = nlp(word_str)
        
        # CRITICAL FILTER: 
        # Only use words that the AI actually knows (has a vector).
        # This naturally filters out "aasvogel" and keeps "apple".
        if token.has_vector and token.vector_norm != 0:
            scores = []
            
            # Compare this dictionary word against EVERY target word
            for target_token in targets:
                similarity = token.similarity(target_token)
                score = int(similarity * 100)
                if score < 0: score = 0
                scores.append(score)
            
            game_dictionary[word_str] = scores
            count += 1
            
            # Stop if we hit our limit of valid semantic words
            if count >= max_words: break
            
            if count % 5000 == 0:
                print(f"   Processed {count} valid words...")

    # --- STEP 3: Ensure Exact Targets are 100% ---
    for i, t in enumerate(targets):
        w = t.text.lower()
        if w not in game_dictionary:
            game_dictionary[w] = [0] * len(targets)
        game_dictionary[w][i] = 100

    # --- STEP 4: Save to File ---
    output_filename = "words.js"
    final_data = {
        "structure": sentence_structure,
        "dictionary": game_dictionary
    }
    
    print(f"5. Saving {len(game_dictionary)} words to words.js...")
    with open(output_filename, "w") as f:
        # Minify json to save space
        json_str = json.dumps(final_data, separators=(',', ':'))
        f.write(f"window.GAME_DATA = {json_str};")
        
    print(f"\nDONE! File saved as {output_filename}")
    print(f"Targets: {[t.text for t in targets]}")

if __name__ == "__main__":
    generate_data()