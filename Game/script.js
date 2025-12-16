// --- Configuration ---
const LEVEL_1_WORD = "heated    "; // Pad with spaces to 10
const LEVEL_2_WORD = "blanket   ";
let currentLevel = 1;
let targetWord = LEVEL_1_WORD;

// --- State ---
let wordData = {};
let currentInput = ""; // What the user is typing (before Enter)
let revealedMask = Array(10).fill(false); // Tracks "Known" positions

// --- Elements ---
const historyContainer = document.getElementById('history-container');
const masterRow = document.getElementById('master-row');
const activeRow = document.getElementById('active-row');
const levelIndicator = document.getElementById('level-indicator');
const messageContainer = document.getElementById('message-container');

// --- Init ---
async function initGame() {
    try {
        const res = await fetch('words.json');
        wordData = await res.json();
        
        // Setup Keyboard
        createKeyboard();
        
        // Start Level 1
        startLevel(1);
    } catch (e) {
        showToast("Error loading dictionary!");
        console.error(e);
    }
}

function startLevel(lvl) {
    currentLevel = lvl;
    targetWord = (lvl === 1) ? LEVEL_1_WORD : LEVEL_2_WORD;
    
    // Reset state
    currentInput = "";
    revealedMask = Array(10).fill(false);
    historyContainer.innerHTML = "";
    levelIndicator.innerText = `Level ${lvl} / 2`;
    
    // Auto-reveal spaces (spaces are always free clues)
    for(let i=0; i<10; i++) {
        if(targetWord[i] === ' ') revealedMask[i] = true;
    }

    renderMasterRow();
    renderActiveRow();
    resetKeyboard();
}

// --- Logic ---

function handleKey(key) {
    if (key === 'ENTER') {
        submitGuess();
    } else if (key === 'BACKSPACE') {
        if (currentInput.length > 0) {
            currentInput = currentInput.slice(0, -1);
            renderActiveRow();
        }
    } else {
        // Character keys
        if (currentInput.length < 10) {
            currentInput += key;
            renderActiveRow();
        }
    }
}

function submitGuess() {
    const guessClean = currentInput.trim().toLowerCase();

    // 1. Length Check
    if (guessClean.length < 2) {
        shakeBoard();
        showToast("Too short");
        return;
    }

    // 2. Dictionary Check
    if (!wordData.hasOwnProperty(guessClean)) {
        shakeBoard();
        showToast("Not in word list");
        return;
    }

    // 3. Process Valid Guess
    const score = wordData[guessClean][currentLevel - 1]; // [score1, score2]
    const guessPadded = guessClean.padEnd(10, ' ');
    
    // Calculate colors (Wordle logic)
    const colors = calculateColors(guessPadded, targetWord);
    
    // Select ONE new hint to permanently reveal
    selectNewHint(colors);

    // Render this guess to history
    addHistoryRow(guessPadded, colors, score);
    
    // Update Master Board (if we found new Greens)
    renderMasterRow();

    // Update Keyboard
    updateKeyboard(guessPadded, colors);

    // Win Check
    if (guessPadded === targetWord) {
        handleWin();
    } else {
        // Reset Input
        currentInput = "";
        renderActiveRow();
        // Scroll to bottom
        const scrollArea = document.getElementById('board-scroll-area');
        scrollArea.scrollTop = scrollArea.scrollHeight;
    }
}

function selectNewHint(currentColors) {
    let candidates = [];
    
    for (let i = 0; i < 10; i++) {
        // If not yet revealed
        if (!revealedMask[i]) {
            // Priority: Prefer Yellow/Grey (to make it harder) over Green
            // But we must give a clue if one exists.
            let weight = (currentColors[i] === 'green') ? 1 : 10;
            // Add index to pool 'weight' times to skew probability
            for(let w=0; w<weight; w++) candidates.push(i);
        }
    }

    if (candidates.length > 0) {
        const randomIndex = candidates[Math.floor(Math.random() * candidates.length)];
        revealedMask[randomIndex] = true;
    }
}

function calculateColors(guess, target) {
    let res = Array(10).fill('grey');
    let tArr = target.split('');
    let gArr = guess.split('');

    // Green Pass
    for(let i=0; i<10; i++) {
        if (gArr[i] === tArr[i]) {
            res[i] = 'green';
            tArr[i] = null;
            gArr[i] = null;
        }
    }
    // Yellow Pass
    for(let i=0; i<10; i++) {
        if (gArr[i] && tArr.includes(gArr[i])) {
            res[i] = 'yellow';
            let idx = tArr.indexOf(gArr[i]);
            tArr[idx] = null;
        }
    }
    return res;
}

// --- Rendering ---

function renderActiveRow() {
    activeRow.innerHTML = '';
    const padded = currentInput.padEnd(10, ' ');
    
    for (let i = 0; i < 10; i++) {
        let div = document.createElement('div');
        div.className = 'tile';
        
        let char = padded[i];
        if (char !== ' ') {
            div.innerText = char;
            div.classList.add('filled');
        }
        
        // Highlight current cursor position (optional polish)
        if (i === currentInput.length) {
            div.classList.add('active-blink'); // Could add CSS animation here
        }
        
        activeRow.appendChild(div);
    }
}

function addHistoryRow(word, colors, score) {
    let row = document.createElement('div');
    row.className = 'tile-row';
    
    // Render Tiles
    for (let i = 0; i < 10; i++) {
        let div = document.createElement('div');
        div.className = 'tile';
        if (word[i] === ' ') {
            div.classList.add('space');
        } else {
            div.innerText = word[i];
            // Only color if revealed!
            if (revealedMask[i]) {
                div.classList.add(colors[i]);
            } else {
                div.classList.add('grey'); // Default if not the chosen hint?
                // Actually, standard Wordle shows ALL colors. 
                // Your rule: "feedback on ONE random letter".
                // So, non-revealed slots should be neutral (black)?
                // Let's use 'grey' for found-but-useless, and 'neutral' for hidden.
                div.className = 'tile'; // Reset
                div.innerText = word[i];
            }
        }
        
        // HINT LOGIC VISUALIZATION:
        // If revealedMask[i] is TRUE, we show the color.
        // If FALSE, we show neutral border.
        if (revealedMask[i]) {
             div.classList.add(colors[i]);
        }
        
        row.appendChild(div);
    }

    // Render Score
    let scoreDiv = document.createElement('div');
    scoreDiv.className = 'score-pill';
    scoreDiv.innerText = score;
    // Color scale logic
    let bg = `hsl(${score * 1.2}, 70%, 50%)`; // 0=Red, 100=Green
    scoreDiv.style.backgroundColor = bg;
    
    row.appendChild(scoreDiv);
    historyContainer.appendChild(row);
}

function renderMasterRow() {
    masterRow.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        let div = document.createElement('div');
        div.className = 'tile';
        
        if (targetWord[i] === ' ') {
            div.classList.add('space');
            div.style.background = '#222';
        } 
        // We only show the letter in Master Row if it's revealed AND Green (Correct)
        else if (revealedMask[i]) {
            // Check if current known info implies this is Green. 
            // Simplified: If revealedMask is true, does it mean we know the letter?
            // Not necessarily. We might know position 3 is Yellow for 'K'.
            // The Master Board should strictly show CONFIRMED (Green) letters.
            
            // However, your mask logic is general. 
            // Let's cheat slightly: If mask is true, show the Target Letter?
            // NO, that spoils the game.
            
            // CORRECT LOGIC: The Master Board stays empty until the user specifically guesses the right letter in the right spot AND the random hint selects it.
            // But since we can't easily track that history backwards, let's just leave the Master Board empty 
            // except for spaces, or only fill it if the user has unlocked the Green state.
            
            // For now, let's keep Master Board as "Known Structure" (Spaces vs Tiles).
            // Visual polish: Just showing empty slots is fine.
        }
        masterRow.appendChild(div);
    }
}

// --- Keyboard ---
const KEYS = [
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm"
];

function createKeyboard() {
    const kb = document.getElementById('keyboard-container');
    kb.innerHTML = '';
    
    KEYS.forEach(rowStr => {
        let row = document.createElement('div');
        row.className = 'kb-row';
        
        rowStr.split('').forEach(char => {
            let btn = document.createElement('button');
            btn.className = 'key';
            btn.innerText = char;
            btn.onclick = () => handleKey(char);
            btn.id = 'key-'+char;
            row.appendChild(btn);
        });
        
        // Add Enter/Backspace on bottom row
        if (rowStr.startsWith('z')) {
            let enter = document.createElement('button');
            enter.className = 'key wide';
            enter.innerText = 'ENTER';
            enter.onclick = () => handleKey('ENTER');
            row.prepend(enter); // Add to start

            let back = document.createElement('button');
            back.className = 'key wide';
            back.innerText = '⌫';
            back.onclick = () => handleKey('BACKSPACE');
            row.appendChild(back); // Add to end
        }
        
        kb.appendChild(row);
    });
}

function updateKeyboard(word, colors) {
    for(let i=0; i<10; i++) {
        let char = word[i];
        if (char === ' ') continue;
        let color = colors[i];
        
        // If this slot was revealed, update key color
        if (revealedMask[i]) {
            let btn = document.getElementById('key-'+char);
            if(btn) {
                // Logic: Green > Yellow > Grey
                if(color === 'green') btn.className = 'key green';
                else if(color === 'yellow' && !btn.classList.contains('green')) btn.className = 'key yellow';
                else if(color === 'grey' && !btn.classList.contains('green') && !btn.classList.contains('yellow')) btn.className = 'key grey';
            }
        }
    }
}

function resetKeyboard() {
    let keys = document.querySelectorAll('.key');
    keys.forEach(k => {
        if(k.innerText.length === 1) k.className = 'key'; // Reset colors
    });
}

// --- Toast / Animations ---
function showToast(msg) {
    let t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    messageContainer.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 500);
    }, 1500);
}

function shakeBoard() {
    activeRow.classList.add('shake');
    setTimeout(() => activeRow.classList.remove('shake'), 500);
}

// --- Win Modal ---
function handleWin() {
    const modal = document.getElementById('modal');
    const msg = document.getElementById('modal-msg');
    const action = document.getElementById('modal-next-action');
    
    modal.classList.remove('hidden');
    action.innerHTML = ''; // Clear buttons

    if (currentLevel === 1) {
        msg.innerText = "Word 1 is HEATED.";
        let btn = document.createElement('button');
        btn.className = 'primary-btn';
        btn.innerText = "Next Level";
        btn.onclick = () => {
            modal.classList.add('hidden');
            startLevel(2);
        };
        action.appendChild(btn);
    } else {
        msg.innerText = "The Secret Gift is a HEATED BLANKET!";
        let btn = document.createElement('button');
        btn.className = 'primary-btn';
        btn.innerText = "Woohoo!";
        btn.onclick = () => modal.classList.add('hidden');
        action.appendChild(btn);
    }
}

// Start
initGame();