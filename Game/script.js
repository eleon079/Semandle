// --- Global Data ---
// window.GAME_DATA is loaded from words.js
// It looks like: { structure: [...], dictionary: {...} }

let gameStructure = [];
let gameDictionary = {};

// --- State ---
let currentTargetIndex = 0; // Which "target" word are we on? (0, 1, 2...)
let currentLevelData = null; // Contains info about the current target word
let currentInput = ""; 
let revealedPositionalMask = Array(10).fill(false); 
let revealedDeadLetters = new Set();

// --- Elements ---
const historyContainer = document.getElementById('history-container');
const activeRow = document.getElementById('active-row');
const levelIndicator = document.getElementById('level-indicator');
const messageContainer = document.getElementById('message-container');
const lastScoreDisplay = document.getElementById('last-score');
const sentenceDisplay = document.getElementById('sentence-display');

// --- Init ---
function initGame() {
    createKeyboard(); 

    if (!window.GAME_DATA) {
        showToast("Error: words.js not loaded!");
        return;
    }

    gameStructure = window.GAME_DATA.structure;
    gameDictionary = window.GAME_DATA.dictionary;

    // Determine the first target
    startLevel(0);
}

function startLevel(targetIdx) {
    currentTargetIndex = targetIdx;
    
    // 1. Find the word in the sentence structure that corresponds to this target index
    // The structure might be: [Filler, Filler, Target(id=0), Filler, Target(id=1)]
    let structureItem = gameStructure.find(item => item.id === targetIdx);
    
    if (!structureItem) {
        // No more targets! Game Over / Grand Win
        handleGrandWin();
        return;
    }

    let targetWordString = structureItem.text.toLowerCase();
    // Pad target to 10 chars (or length of word if you prefer dynamic, but your tiles are fixed 10)
    // Your UI is built for 10 tiles. We must pad.
    currentLevelData = {
        word: targetWordString.padEnd(10, ' '),
        originalLength: targetWordString.length
    };

    // Reset State
    currentInput = "";
    revealedPositionalMask = Array(10).fill(false);
    revealedDeadLetters = new Set();
    historyContainer.innerHTML = "";
    lastScoreDisplay.classList.add('hidden');
    lastScoreDisplay.innerText = "";
    
    // Auto-reveal spaces
    for(let i=0; i<10; i++) {
        if(currentLevelData.word[i] === ' ') revealedPositionalMask[i] = true;
    }

    // Render UI
    renderSentence();
    levelIndicator.innerText = `Guessing Word ${targetIdx + 1}`;
    renderActiveRow();
    resetKeyboard();
}

function renderSentence() {
    sentenceDisplay.innerHTML = '';
    
    gameStructure.forEach(item => {
        let span = document.createElement('span');
        span.className = 'sentence-word';
        
        if (item.type === 'filler') {
            span.innerText = item.text;
            span.classList.add('filler');
        } else {
            // It is a target
            if (item.id < currentTargetIndex) {
                // Already solved
                span.innerText = item.text;
                span.classList.add('target-solved');
            } else if (item.id === currentTargetIndex) {
                // Currently guessing (show blank with highlight)
                span.innerText = item.text; // Text hidden by CSS
                span.classList.add('target-active');
            } else {
                // Future word
                span.innerText = item.text; // Text hidden by CSS
                span.classList.add('target-hidden');
            }
        }
        sentenceDisplay.appendChild(span);
    });
}

// --- Input Handling ---
function handleKey(key) {
    if (key === 'ENTER') submitGuess();
    else if (key === 'BACKSPACE') {
        currentInput = currentInput.slice(0, -1);
        renderActiveRow();
    } else {
        if (currentInput.length < 10) {
            currentInput += key;
            renderActiveRow();
        }
    }
}

function submitGuess() {
    const guessClean = currentInput.trim().toLowerCase();

    if (guessClean.length < 2) { shakeBoard(); showToast("Too short"); return; }
    if (!gameDictionary.hasOwnProperty(guessClean)) { shakeBoard(); showToast("Not in word list"); return; }

    // Get score for CURRENT target index
    // Dictionary format: "word": [score_target_0, score_target_1, ...]
    const scores = gameDictionary[guessClean];
    const score = scores[currentTargetIndex];
    
    const guessPadded = guessClean.padEnd(10, ' ');
    const targetPadded = currentLevelData.word;

    // Win Check
    if (guessClean === targetPadded.trim()) {
        addHistoryRow(guessPadded, Array(10).fill('green'), 100, true);
        handleWin();
        return;
    }

    // Logic for hints (same as before)
    const colors = calculateColors(guessPadded, targetPadded);
    selectNewHint(guessPadded, colors);
    addHistoryRow(guessPadded, colors, score, false);
    updateKeyboard(guessPadded, colors);

    lastScoreDisplay.innerText = `Score: ${score}`;
    lastScoreDisplay.classList.remove('hidden');
    let hue = Math.max(0, Math.min(120, score * 1.2));
    lastScoreDisplay.style.color = `hsl(${hue}, 80%, 60%)`;

    currentInput = "";
    renderActiveRow();
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

// --- Win Logic ---
function handleWin() {
    const modal = document.getElementById('modal');
    const msg = document.getElementById('modal-msg');
    const action = document.getElementById('modal-next-action');
    
    modal.classList.remove('hidden');
    action.innerHTML = ''; 

    // Find current word text
    let wordText = gameStructure.find(i => i.id === currentTargetIndex).text;

    msg.innerText = `You found "${wordText.toUpperCase()}"!`;
    
    let btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.innerText = "Next Word";
    btn.onclick = () => {
        modal.classList.add('hidden');
        startLevel(currentTargetIndex + 1); // Go to next
    };
    action.appendChild(btn);
}

function handleGrandWin() {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const msg = document.getElementById('modal-msg');
    const action = document.getElementById('modal-next-action');

    modal.classList.remove('hidden');
    action.innerHTML = '';
    
    title.innerText = "COMPLETE!";
    // Reconstruct full sentence
    let fullSentence = gameStructure.map(i => i.text).join(' ');
    
    msg.innerText = `The message is:\n"${fullSentence}"`;
    
    let btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.innerText = "Close";
    btn.onclick = () => modal.classList.add('hidden');
    action.appendChild(btn);
    
    // Ensure the sentence display shows everything solved
    currentTargetIndex = 999; 
    renderSentence();
}

initGame();