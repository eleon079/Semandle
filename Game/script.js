// --- Configuration ---
const LEVEL_1_WORD = "heated    "; // 6 letters + 4 spaces
const LEVEL_2_WORD = "blanket   "; // 7 letters + 3 spaces
let currentLevel = 1;
let targetWord = LEVEL_1_WORD;

// --- State ---
let wordData = window.GAME_DICTIONARY || {}; 

let currentInput = ""; 

// STATE 1: Positional Hints (Yellow/Green)
// true means "We have revealed the color of the tile at this index"
let revealedPositionalMask = Array(10).fill(false); 

// STATE 2: Dead Letter Hints (Grey)
// A set of characters that we have revealed as "Not in word"
let revealedDeadLetters = new Set();

// --- Elements ---
const historyContainer = document.getElementById('history-container');
const activeRow = document.getElementById('active-row');
const levelIndicator = document.getElementById('level-indicator');
const messageContainer = document.getElementById('message-container');
const lastScoreDisplay = document.getElementById('last-score');

// --- Init ---
function initGame() {
    createKeyboard(); // Load UI first
    if (!wordData || Object.keys(wordData).length === 0) {
        showToast("Error: words.js not loaded!");
        return;
    }
    startLevel(1);
}

function startLevel(lvl) {
    currentLevel = lvl;
    targetWord = (lvl === 1) ? LEVEL_1_WORD : LEVEL_2_WORD;
    
    // Reset state
    currentInput = "";
    revealedPositionalMask = Array(10).fill(false);
    revealedDeadLetters = new Set();
    historyContainer.innerHTML = "";
    levelIndicator.innerText = `Level ${lvl} / 2`;
    lastScoreDisplay.classList.add('hidden');
    lastScoreDisplay.innerText = "";
    
    renderActiveRow();
    resetKeyboard();
}

// --- Input Handling ---
function handleKey(key) {
    if (key === 'ENTER') {
        submitGuess();
    } else if (key === 'BACKSPACE') {
        if (currentInput.length > 0) {
            currentInput = currentInput.slice(0, -1);
            renderActiveRow();
        }
    } else {
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
    const score = wordData[guessClean][currentLevel - 1]; 
    const guessPadded = guessClean.padEnd(10, ' ');
    
    // Win Check
    if (guessPadded === targetWord) {
        // Reveal everything for the win
        addHistoryRow(guessPadded, Array(10).fill('green'), score, true);
        handleWin();
        return;
    }

    // Calculate Colors
    const colors = calculateColors(guessPadded, targetWord);
    
    // Select ONE new hint using STRICT PRIORITY
    selectNewHint(guessPadded, colors);

    // Render History
    addHistoryRow(guessPadded, colors, score, false);
    
    // Update Keyboard
    updateKeyboard(guessPadded, colors);

    // Update Score UI
    lastScoreDisplay.innerText = `Score: ${score}`;
    lastScoreDisplay.classList.remove('hidden');
    let hue = Math.max(0, Math.min(120, score * 1.2));
    lastScoreDisplay.style.color = `hsl(${hue}, 80%, 60%)`;

    // Reset Input
    currentInput = "";
    renderActiveRow();
    
    // Auto-scroll
    const scrollArea = document.getElementById('board-scroll-area');
    scrollArea.scrollTop = scrollArea.scrollHeight;
}

function selectNewHint(guess, colors) {
    let nonGreenCandidates = [];
    let greenCandidates = [];
    
    for (let i = 0; i < 10; i++) {
        const char = guess[i];
        if (char === ' ') continue; // Never give hints on spaces
        
        const color = colors[i];
        
        // 1. YELLOW: Candidate if position is not yet revealed
        if (color === 'yellow' && !revealedPositionalMask[i]) {
            nonGreenCandidates.push({ index: i, type: 'positional' });
        }
        
        // 2. GREY: Candidate if letter is not yet marked dead
        else if (color === 'grey' && !revealedDeadLetters.has(char)) {
            nonGreenCandidates.push({ index: i, type: 'deadLetter', char: char });
        }
        
        // 3. GREEN: Candidate if position is not yet revealed
        else if (color === 'green' && !revealedPositionalMask[i]) {
            greenCandidates.push({ index: i, type: 'positional' });
        }
    }

    // STRICT SELECTION LOGIC
    // If there are ANY yellow/grey options, we MUST pick one of them.
    // We only pick Green if the nonGreen list is empty.
    
    let choice = null;

    if (nonGreenCandidates.length > 0) {
        const r = Math.floor(Math.random() * nonGreenCandidates.length);
        choice = nonGreenCandidates[r];
    } else if (greenCandidates.length > 0) {
        const r = Math.floor(Math.random() * greenCandidates.length);
        choice = greenCandidates[r];
    }

    // Apply the choice
    if (choice) {
        if (choice.type === 'positional') {
            revealedPositionalMask[choice.index] = true;
        } else if (choice.type === 'deadLetter') {
            revealedDeadLetters.add(choice.char);
        }
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
        if (padded[i] !== ' ') {
            div.innerText = padded[i];
            div.classList.add('filled');
        }
        if (i === currentInput.length) {
            div.classList.add('active-blink'); 
        }
        activeRow.appendChild(div);
    }
}

function addHistoryRow(word, colors, score, isWin) {
    let row = document.createElement('div');
    row.className = 'tile-row';
    
    for (let i = 0; i < 10; i++) {
        let div = document.createElement('div');
        div.className = 'tile';
        let char = word[i];
        
        if (char !== ' ') div.innerText = char;

        // DISPLAY LOGIC:
        let color = colors[i];
        let showColor = false;

        if (isWin) {
            showColor = true;
        } else {
            // Positional Logic (Green/Yellow)
            if ((color === 'green' || color === 'yellow') && revealedPositionalMask[i]) {
                showColor = true;
            }
            // Dead Letter Logic (Grey)
            // If the letter is dead, show Grey on ALL instances of that letter in this row
            else if (color === 'grey' && revealedDeadLetters.has(char)) {
                showColor = true;
            }
        }

        if (showColor) {
            div.classList.add(color);
        }
        
        row.appendChild(div);
    }

    let scoreDiv = document.createElement('div');
    scoreDiv.className = 'score-pill';
    scoreDiv.innerText = score;
    let bg = `hsl(${score * 1.2}, 70%, 50%)`; 
    scoreDiv.style.backgroundColor = bg;
    row.appendChild(scoreDiv);
    historyContainer.appendChild(row);
}

// --- Keyboard ---
const KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

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
        if (rowStr.startsWith('z')) {
            let enter = document.createElement('button');
            enter.className = 'key wide';
            enter.innerText = 'ENTER';
            enter.onclick = () => handleKey('ENTER');
            row.prepend(enter);
            let back = document.createElement('button');
            back.className = 'key wide';
            back.innerText = '⌫';
            back.onclick = () => handleKey('BACKSPACE');
            row.appendChild(back);
        }
        kb.appendChild(row);
    });
}

function updateKeyboard(word, colors) {
    for(let i=0; i<10; i++) {
        let char = word[i];
        if (char === ' ') continue;
        
        let color = colors[i];
        let btn = document.getElementById('key-'+char);
        if(!btn) continue;

        let shouldUpdate = false;
        
        // Update if we know the position (Yellow/Green)
        if ((color === 'green' || color === 'yellow') && revealedPositionalMask[i]) {
            shouldUpdate = true;
        } 
        // Update if we know the letter is dead (Grey)
        else if (color === 'grey' && revealedDeadLetters.has(char)) {
            shouldUpdate = true;
        }

        if (shouldUpdate) {
            let currentClass = btn.className;
            if (color === 'green') {
                btn.className = 'key green';
            } 
            else if (color === 'yellow' && !currentClass.includes('green')) {
                btn.className = 'key yellow';
            } 
            else if (color === 'grey' && !currentClass.includes('green') && !currentClass.includes('yellow')) {
                btn.className = 'key grey';
            }
        }
    }
}

function resetKeyboard() {
    document.querySelectorAll('.key').forEach(k => {
        if (k.innerText.length === 1 || k.innerText === 'ENTER' || k.innerText === '⌫') {
            k.className = k.classList.contains('wide') ? 'key wide' : 'key';
        }
    });
}

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

function handleWin() {
    const modal = document.getElementById('modal');
    const msg = document.getElementById('modal-msg');
    const action = document.getElementById('modal-next-action');
    
    modal.classList.remove('hidden');
    action.innerHTML = ''; 

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
        btn.innerText = "See Gift";
        btn.onclick = () => modal.classList.add('hidden');
        action.appendChild(btn);
    }
}

initGame();