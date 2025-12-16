// --- Game Configuration ---
const LEVEL_1_WORD = "heated    "; // 10 chars (6 letters + 4 spaces)
const LEVEL_2_WORD = "blanket   "; // 10 chars (7 letters + 3 spaces)
let currentLevel = 1;

// --- State Variables ---
let wordData = {}; // Will hold the JSON data
let currentInput = "";
let revealedMask = Array(10).fill(false); // true if the user has unlocked this slot
let targetWord = LEVEL_1_WORD;

// DOM Elements
const masterBoard = document.getElementById('master-board');
const historyContainer = document.getElementById('history-container');
const inputDisplay = document.getElementById('current-input');
const modal = document.getElementById('modal');
const keyboardContainer = document.getElementById('keyboard');

// --- Initialization ---
async function init() {
    try {
        const response = await fetch('words.json');
        wordData = await response.json();
        startLevel(1);
    } catch (error) {
        alert("Error loading words.json. Make sure it is in the same folder!");
    }
}

function startLevel(level) {
    currentLevel = level;
    targetWord = (level === 1) ? LEVEL_1_WORD : LEVEL_2_WORD;
    currentInput = "";
    
    // Reset Mask: Unlock spaces immediately (they are "Green" by default)
    revealedMask = Array(10).fill(false);
    for (let i = 0; i < 10; i++) {
        if (targetWord[i] === " ") {
            revealedMask[i] = true;
        }
    }

    // Clear UI
    historyContainer.innerHTML = "";
    document.getElementById('level-display').innerText = `Level ${level} of 2`;
    updateInputDisplay();
    renderMasterBoard();
    createKeyboard();
}

// --- Logic: The "One Clue Per Guess" System ---
function handleGuess() {
    const guessClean = currentInput.trim().toLowerCase();
    
    // Validation
    if (guessClean.length < 2) {
        showMessage("Word too short");
        return;
    }
    
    // Check if word exists in our JSON
    let score = 0;
    if (wordData[guessClean]) {
        // Score is at index 0 for Level 1, index 1 for Level 2
        score = wordData[guessClean][currentLevel - 1];
    } else {
        // If not in list, it's an unknown word (0 score)
        score = 0; 
    }

    // Pad the guess with spaces to make it 10 chars
    const guessPadded = guessClean.padEnd(10, ' ');

    // 1. Calculate what the colors WOULD be for every slot (Wordle Logic)
    const potentialColors = calculateWordleColors(guessPadded, targetWord);

    // 2. Select ONE new hint to reveal
    selectNewHint(potentialColors);

    // 3. Render the Guess in History
    addHistoryRow(guessPadded, score);

    // 4. Update the Top Master Board
    renderMasterBoard();

    // 5. Update Keyboard Colors
    updateKeyboardColors(guessPadded, potentialColors);

    // 6. Check Win
    if (guessPadded === targetWord) {
        handleWin();
    }

    // Reset Input
    currentInput = "";
    updateInputDisplay();
    
    // Scroll history to bottom
    historyContainer.scrollTop = historyContainer.scrollHeight;
}

function calculateWordleColors(guess, target) {
    let colors = Array(10).fill('grey');
    let targetArr = target.split('');
    let guessArr = guess.split('');

    // First pass: Greens (Correct position)
    for (let i = 0; i < 10; i++) {
        if (guessArr[i] === targetArr[i]) {
            colors[i] = 'green';
            targetArr[i] = null; // Mark as used
            guessArr[i] = null;
        }
    }

    // Second pass: Yellows (Wrong position)
    for (let i = 0; i < 10; i++) {
        if (guessArr[i] !== null && targetArr.includes(guessArr[i])) {
            // Find index in target
            let idx = targetArr.indexOf(guessArr[i]);
            if (idx !== -1) {
                colors[i] = 'yellow';
                targetArr[idx] = null; // Mark as used
            }
        }
    }
    return colors;
}

function selectNewHint(potentialColors) {
    let nonGreenCandidates = [];
    let greenCandidates = [];

    for (let i = 0; i < 10; i++) {
        // We only care about slots that are NOT yet revealed
        if (!revealedMask[i]) {
            if (potentialColors[i] === 'green') {
                greenCandidates.push(i);
            } else {
                // Yellow or Grey are "Non-Green" clues
                nonGreenCandidates.push(i);
            }
        }
    }

    let indexToReveal = -1;

    // PREFER Non-Greens (Yellows/Greys) to make it harder
    if (nonGreenCandidates.length > 0) {
        let r = Math.floor(Math.random() * nonGreenCandidates.length);
        indexToReveal = nonGreenCandidates[r];
    } else if (greenCandidates.length > 0) {
        // Only give a green if it's the only option left
        let r = Math.floor(Math.random() * greenCandidates.length);
        indexToReveal = greenCandidates[r];
    }

    // Mark that slot as permanently revealed
    if (indexToReveal !== -1) {
        revealedMask[indexToReveal] = true;
    }
}

// --- Rendering ---

function renderMasterBoard() {
    masterBoard.innerHTML = '';
    // Show the "Truth" state so far
    // If revealedMask[i] is true, we show the Target Letter (Green)
    // Wait... standard Semantle/Wordle doesn't show the letter unless you guessed it.
    // BUT your request says "feedback on one randomly selected letter... colored black or yellow".
    
    // INTERPRETATION: The Master Board shows the TARGET spaces.
    // If you found a Green, it locks in here. 
    // If you found a Yellow/Black, that applies to a specific guess, not the board.
    
    // However, to track progress, let's render the Master Board as:
    // Locked Green letters stay visible. Unknowns are blank.
    
    for (let i = 0; i < 10; i++) {
        let tile = document.createElement('div');
        tile.className = 'tile';
        
        if (targetWord[i] === ' ') {
            // Spaces are always shown as "Green Slots"
            tile.classList.add('space-slot');
        } else if (revealedMask[i] && targetWord[i] !== ' ') {
            // If we have found the GREEN tile (exact match) somehow?
            // Actually, `revealedMask` tracks if we gave feedback for that slot.
            // If the feedback was GREEN, we show the letter.
            // If the feedback was YELLOW/GREY, we can't show it on the Master Board (position is wrong).
            
            // To make this solvable, let's keep the Master Board for GREENS only.
            // But we track `revealedMask` for giving clues.
        }
        
        // Simpler approach for Master Board: Only show Correct Letters found so far.
        // We need a separate mask for "Correctly Placed Letters Found".
        // Let's recalculate "Found Greens" based on history or just check revealedMask logic?
        
        // Actually, let's keep it simple:
        // The Master Board shows empty tiles. 
        // We rely on the History to show the clues.
        masterBoard.appendChild(tile);
    }
}

function addHistoryRow(guessWord, score) {
    const row = document.createElement('div');
    row.className = 'history-row';

    // 1. Semantic Score
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'history-score';
    scoreDiv.innerText = score;
    // Color score: Red(0) -> Green(100)
    let hue = Math.max(0, Math.min(120, score * 1.2)); 
    scoreDiv.style.color = `hsl(${hue}, 80%, 60%)`;
    row.appendChild(scoreDiv);

    // 2. The Word Tiles
    const wordDiv = document.createElement('div');
    wordDiv.className = 'history-word';
    
    const colors = calculateWordleColors(guessWord, targetWord);

    for (let i = 0; i < 10; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        
        if (guessWord[i] === ' ') {
            tile.classList.add('space-slot');
        } else {
            tile.innerText = guessWord[i];
            // Only color the tile if this slot has been REVEALED by the game logic
            // (i.e., this slot was selected as the "Hint" at some point)
            if (revealedMask[i]) {
                tile.classList.add(colors[i]);
            } else {
                tile.classList.add('neutral');
            }
        }
        wordDiv.appendChild(tile);
    }
    row.appendChild(wordDiv);
    historyContainer.appendChild(row);
}

// --- Keyboard & Input ---
function createKeyboard() {
    keyboardContainer.innerHTML = '';
    const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    
    rows.forEach(rowStr => {
        let rowDiv = document.createElement('div');
        rowDiv.style.width = "100%";
        rowDiv.style.display = "flex";
        rowDiv.style.justifyContent = "center";
        rowDiv.style.gap = "2px";

        rowStr.split('').forEach(char => {
            let btn = document.createElement('button');
            btn.className = 'key';
            btn.id = 'key-' + char;
            btn.innerText = char;
            btn.onclick = () => {
                if (currentInput.length < 10) {
                    currentInput += char;
                    updateInputDisplay();
                }
            };
            rowDiv.appendChild(btn);
        });
        keyboardContainer.appendChild(rowDiv);
    });
}

function updateKeyboardColors(guess, colors) {
    // Standard Wordle Keyboard Logic
    for(let i=0; i<10; i++) {
        let char = guess[i];
        if(char === ' ') continue;
        
        let color = colors[i];
        let keyBtn = document.getElementById('key-' + char);
        if(!keyBtn) continue;

        // Priority: Green > Yellow > Grey
        if (color === 'green') {
            keyBtn.className = 'key used-green';
        } else if (color === 'yellow' && !keyBtn.classList.contains('used-green')) {
            keyBtn.className = 'key used-yellow';
        } else if (color === 'grey' && !keyBtn.classList.contains('used-green') && !keyBtn.classList.contains('used-yellow')) {
            keyBtn.className = 'key used-grey';
        }
    }
}

function updateInputDisplay() {
    inputDisplay.innerText = currentInput;
}

// --- Buttons ---
document.getElementById('backspace-btn').onclick = () => {
    currentInput = currentInput.slice(0, -1);
    updateInputDisplay();
};
document.getElementById('enter-btn').onclick = handleGuess;

function showMessage(msg) {
    const m = document.getElementById('message-area');
    m.innerText = msg;
    setTimeout(() => m.innerText = "", 2000);
}

function handleWin() {
    modal.classList.remove('hidden');
    const title = document.getElementById('modal-title');
    const text = document.getElementById('modal-text');
    const btn = document.getElementById('next-level-btn');

    if (currentLevel === 1) {
        title.innerText = "HEATED Found!";
        text.innerText = "That's word #1. Ready for word #2?";
        btn.onclick = () => {
            modal.classList.add('hidden');
            startLevel(2);
        };
    } else {
        title.innerText = "YOU WON!";
        text.innerText = "The Secret Gift is a HEATED BLANKET!";
        btn.innerText = "Close";
        btn.onclick = () => modal.classList.add('hidden');
    }
}

init();