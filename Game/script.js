// --- Data Containers ---
let gameStructure = [];
let gameDictionary = {};

// --- Game State ---
let currentTargetIndex = 0; // The index of the word in the sentence we are guessing
let currentTargetData = null; // { text: "heated", id: 2 }
let currentInput = ""; 
let revealedPositionalMask = Array(10).fill(false); 
let revealedDeadLetters = new Set();

// --- DOM Elements ---
const historyContainer = document.getElementById('history-container');
const activeRow = document.getElementById('active-row');
const levelIndicator = document.getElementById('level-indicator');
const messageContainer = document.getElementById('message-container');
const lastScoreDisplay = document.getElementById('last-score');
const sentenceDisplay = document.getElementById('sentence-display');
const loadingScreen = document.getElementById('loading-screen');

// --- Initialization ---
function initGame() {
    // 1. Try to read data from words.js (which sets window.GAME_DATA)
    if (window.GAME_DATA) {
        gameStructure = window.GAME_DATA.structure;
        gameDictionary = window.GAME_DATA.dictionary;
        
        // Hide loader
        if(loadingScreen) loadingScreen.style.display = 'none';
        
        createKeyboard();
        startLevel(0); // Start at first target
    } else {
        // If file is huge, give it another 500ms to parse
        setTimeout(initGame, 500);
    }
}

// --- Level Logic ---
function startLevel(targetId) {
    // Find the next target in the structure
    // Note: 'gameStructure' is array of {text, type, id}. 'id' exists only for targets.
    // We look for the item where item.id == targetId
    
    let nextTarget = gameStructure.find(item => item.id === targetId);
    
    if (!nextTarget) {
        handleGrandWin();
        return;
    }

    currentTargetIndex = targetId;
    currentTargetData = nextTarget;
    
    // Reset Board State
    currentInput = "";
    revealedPositionalMask = Array(10).fill(false);
    revealedDeadLetters = new Set();
    historyContainer.innerHTML = "";
    lastScoreDisplay.classList.add('hidden');
    lastScoreDisplay.innerText = "";
    
    // Auto-reveal spaces in the target word (if any)
    // We pad the target word to 10 chars for the grid logic

    // REMOVED THE BELOW ------------------------------------------------
    //let targetWordPadded = nextTarget.text.toLowerCase().padEnd(10, ' ');
    //for(let i=0; i<10; i++) {
    //    if(targetWordPadded[i] === ' ') revealedPositionalMask[i] = true;
    //}

    // Update UI
    renderSentence();
    levelIndicator.innerText = `Guessing Word ${targetId + 1}`;
    renderActiveRow();
    resetKeyboard();
}

function renderSentence() {
    sentenceDisplay.innerHTML = '';
    
    gameStructure.forEach(item => {
        let span = document.createElement('span');
        span.className = 's-word';
        
        if (item.type === 'filler') {
            span.innerText = item.text;
            span.classList.add('filler');
        } else {
            // It is a target word
            if (item.id < currentTargetIndex) {
                // Already Solved
                span.innerText = item.text;
                span.classList.add('target-solved');
            } else if (item.id === currentTargetIndex) {
                // Current Target
                span.innerText = item.text; // Text exists but hidden by CSS color transparent
                span.classList.add('target-active');
            } else {
                // Future Target
                span.innerText = item.text; // Hidden
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
    const scores = gameDictionary[guessClean];
    const score = scores[currentTargetIndex]; // Dictionary stores array of scores [target0, target1...]
    
    const targetWordString = currentTargetData.text.toLowerCase().padEnd(10, ' ');
    const guessPadded = guessClean.padEnd(10, ' ');

    // Win Check
    if (guessClean === currentTargetData.text.toLowerCase()) {
        addHistoryRow(guessPadded, Array(10).fill('green'), 100, true);
        handleWin();
        return;
    }

    // Logic for hints
    const colors = calculateColors(guessPadded, targetWordString);
    selectNewHint(guessPadded, colors);
    
    addHistoryRow(guessPadded, colors, score, false);
    updateKeyboard(guessPadded, colors);

    // Update Score
    lastScoreDisplay.innerText = `Score: ${score}`;
    lastScoreDisplay.classList.remove('hidden');
    let hue = Math.max(0, Math.min(120, score * 1.2));
    lastScoreDisplay.style.color = `hsl(${hue}, 80%, 60%)`;

    currentInput = "";
    renderActiveRow();
    const scrollArea = document.getElementById('board-scroll-area');
    scrollArea.scrollTop = scrollArea.scrollHeight;
}

// --- Core Game Logic (Same as before) ---

function selectNewHint(guess, colors) {
    let nonGreenCandidates = [];
    let greenCandidates = [];
    
    for (let i = 0; i < 10; i++) {
        const char = guess[i];
        if (char === ' ') continue; 
        
        const color = colors[i];
        
        if (color === 'yellow' && !revealedPositionalMask[i]) {
            nonGreenCandidates.push({ index: i, type: 'positional' });
        }
        else if (color === 'grey' && !revealedDeadLetters.has(char)) {
            nonGreenCandidates.push({ index: i, type: 'deadLetter', char: char });
        }
        else if (color === 'green' && !revealedPositionalMask[i]) {
            greenCandidates.push({ index: i, type: 'positional' });
        }
    }

    let choice = null;
    if (nonGreenCandidates.length > 0) {
        const r = Math.floor(Math.random() * nonGreenCandidates.length);
        choice = nonGreenCandidates[r];
    } else if (greenCandidates.length > 0) {
        const r = Math.floor(Math.random() * greenCandidates.length);
        choice = greenCandidates[r];
    }

    if (choice) {
        if (choice.type === 'positional') revealedPositionalMask[choice.index] = true;
        else if (choice.type === 'deadLetter') revealedDeadLetters.add(choice.char);
    }
}

function calculateColors(guess, target) {
    let res = Array(10).fill('grey');
    let tArr = target.split('');
    let gArr = guess.split('');

    for(let i=0; i<10; i++) {
        if (gArr[i] === tArr[i]) {
            res[i] = 'green';
            tArr[i] = null; gArr[i] = null;
        }
    }
    for(let i=0; i<10; i++) {
        if (gArr[i] && tArr.includes(gArr[i])) {
            res[i] = 'yellow';
            let idx = tArr.indexOf(gArr[i]);
            tArr[idx] = null;
        }
    }
    return res;
}

// --- Rendering Helpers ---

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
        if (i === currentInput.length) div.classList.add('active-blink');
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

        let color = colors[i];
        let showColor = isWin;

        if (!isWin) {
            if ((color === 'green' || color === 'yellow') && revealedPositionalMask[i]) showColor = true;
            else if (color === 'grey' && revealedDeadLetters.has(char)) showColor = true;
        }

        if (showColor) div.classList.add(color);
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

function updateKeyboard(word, colors) {
    for(let i=0; i<10; i++) {
        let char = word[i];
        if (char === ' ') continue;
        let color = colors[i];
        let btn = document.getElementById('key-'+char);
        if(!btn) continue;

        let shouldUpdate = false;
        if ((color === 'green' || color === 'yellow') && revealedPositionalMask[i]) shouldUpdate = true;
        else if (color === 'grey' && revealedDeadLetters.has(char)) shouldUpdate = true;

        if (shouldUpdate) {
            let currentClass = btn.className;
            if (color === 'green') btn.className = 'key green';
            else if (color === 'yellow' && !currentClass.includes('green')) btn.className = 'key yellow';
            else if (color === 'grey' && !currentClass.includes('green') && !currentClass.includes('yellow')) btn.className = 'key grey';
        }
    }
}

function createKeyboard() {
    const kb = document.getElementById('keyboard-container');
    kb.innerHTML = '';
    const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    rows.forEach(rowStr => {
        let row = document.createElement('div');
        row.className = 'kb-row';
        rowStr.split('').forEach(char => {
            let btn = document.createElement('button');
            btn.className = 'key';
            btn.innerText = char;
            btn.id = 'key-'+char;
            btn.onclick = () => handleKey(char);
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
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 1500);
}

function shakeBoard() {
    activeRow.classList.add('shake');
    setTimeout(() => activeRow.classList.remove('shake'), 500);
}

function handleWin() {
    const modal = document.getElementById('modal');
    const msg = document.getElementById('modal-msg');
    const action = document.getElementById('modal-next-action');
    const title = document.getElementById('modal-title');
    
    modal.classList.remove('hidden');
    action.innerHTML = ''; 

    title.innerText = "Word Found!";
    msg.innerText = `You found "${currentTargetData.text.toUpperCase()}"`;
    
    let btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.innerText = "Continue";
    btn.onclick = () => {
        modal.classList.add('hidden');
        startLevel(currentTargetIndex + 1);
    };
    action.appendChild(btn);
}

function handleGrandWin() {
    const modal = document.getElementById('modal');
    const msg = document.getElementById('modal-msg');
    const action = document.getElementById('modal-next-action');
    const title = document.getElementById('modal-title');

    modal.classList.remove('hidden');
    action.innerHTML = '';
    
    title.innerText = "GIFT REVEALED";
    // Construct full sentence from structure
    let full = gameStructure.map(x => x.text).join(' ');
    
    msg.innerText = `The message is:\n"${full}"`;
    
    let btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.innerText = "Close";
    btn.onclick = () => modal.classList.add('hidden');
    action.appendChild(btn);
    
    // Set index high so sentence renders fully revealed
    currentTargetIndex = 999;
    renderSentence();
}

// Start
initGame();