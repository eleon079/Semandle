// --- Data Containers ---
let gameStructure = [];
let gameDictionary = {};

// --- Game State ---
let currentTargetIndex = 0; 
let currentTargetData = null; 
let currentInput = ""; 
let guessCount = 0;
let usedWords = new Set(); 
let bestGuesses = []; 
let totalGameGuesses = 0;

// --- CLUE STORAGE ---
let knownGreens = Array(10).fill(null);
let knownYellows = new Set(); // Tracks specific "Index-Char" combinations for the randomizer
let knownGreys = new Set();
// REMOVED: let knownFoundLetters = new Set(); // NEW: Tracks letters we know exist in the word generally

// --- DOM Elements ---
const historyContainer = document.getElementById('history-container');
const activeRow = document.getElementById('active-row');
const sentenceDisplay = document.getElementById('sentence-display');
const loadingScreen = document.getElementById('loading-screen');
const top3List = document.getElementById('top3-list');
const totalGuessesDisplay = document.getElementById('total-guesses');
const scrollArea = document.getElementById('board-scroll-area');

// --- Initialization ---
function initGame() {
    if (window.GAME_DATA) {
        gameStructure = window.GAME_DATA.structure;
        gameDictionary = window.GAME_DATA.dictionary;
        if(loadingScreen) loadingScreen.style.display = 'none';
        createKeyboard();
        startLevel(0);
    } else {
        setTimeout(initGame, 500);
    }
}

// --- Level Logic ---
function startLevel(targetId) {
    // Find the next item in the structure
    let nextTarget = gameStructure.find(item => item.id === targetId);
    
    // 1. If no target is found, we've reached the end -> Grand Win
    if (!nextTarget) {
        handleGrandWin();
        return;
    }

    // 2. NEW: If this item is a 'filler', skip it immediately!
    // We recursively call startLevel with the next ID.
    if (nextTarget.type === 'filler') {
        startLevel(targetId + 1);
        return;
    }

    // 3. Normal Level Setup (Only runs if it's NOT a filler)
    currentTargetIndex = targetId;
    currentTargetData = nextTarget;
    
    // Reset State
    currentInput = "";
    guessCount = 0;
    usedWords = new Set();
    bestGuesses = [];
    knownGreens = Array(10).fill(null);
    knownYellows = new Set();
    knownGreys = new Set();

    historyContainer.innerHTML = "";
    updateDashboard();
    renderSentence();
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
            if (item.id < currentTargetIndex) {
                // Fully solved word
                span.innerText = item.text;
                span.classList.add('target-solved');
            } else if (item.id === currentTargetIndex) {
                // Active word: show letters for knownGreens, underscores for others
                let displayStr = "";
                let targetText = item.text.toLowerCase();
                
                for (let i = 0; i < targetText.length; i++) {
                    // Check if this specific tile has been revealed as green
                    if (knownGreens[i] === targetText[i]) {
                        displayStr += targetText[i].toUpperCase() + " ";
                    } else {
                        displayStr += "_ ";
                    }
                }
                span.innerText = displayStr.trim();
                span.classList.add('target-active');
            } else {
                // Future word: strictly underscores
                span.innerText = "_ ".repeat(item.text.length).trim(); 
                span.classList.add('target-hidden');
            }
        }
        sentenceDisplay.appendChild(span);
    });
}

function updateDashboard() {
    totalGuessesDisplay.innerText = guessCount;
    
    if (bestGuesses.length === 0) {
        top3List.innerHTML = '<span class="empty-state">-</span>';
        return;
    }

    top3List.innerHTML = '';
    
    // Explicitly take the top 5
    let displayList = bestGuesses.slice(0, 5);

    displayList.forEach(bg => {
        let span = document.createElement('span');
        span.className = 'top-word';
        span.innerText = `${bg.word.toUpperCase()} (${bg.score})`;
        
        // COLOR LOGIC: Score 60 = Green (Hue 120).
        // Multiplier: 2.0 (60 * 2 = 120)
        let hue = Math.max(0, Math.min(120, bg.score * 2.0));
        span.style.color = `hsl(${hue}, 70%, 60%)`;
        
        top3List.appendChild(span);
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
    if (usedWords.has(guessClean)) { shakeBoard(); showToast("Already used"); return; }

    usedWords.add(guessClean);
    guessCount++;
    totalGameGuesses++;
    
    const scores = gameDictionary[guessClean];
    const score = scores[currentTargetIndex];
    
    // Update Top List
    bestGuesses.push({ word: guessClean, score: score });
    bestGuesses.sort((a,b) => b.score - a.score);
    
    // FORCE LENGTH TO 5 (This ensures we keep the top 5)
    if (bestGuesses.length > 5) bestGuesses.length = 5;
    
    updateDashboard();

    const targetWordString = currentTargetData.text.toLowerCase().padEnd(10, ' ');
    const guessPadded = guessClean.padEnd(10, ' ');

    if (guessClean === currentTargetData.text.toLowerCase()) {
        for(let i=0; i<10; i++) knownGreens[i] = guessPadded[i];
        addHistoryRow(guessPadded, score, true, -1); 
        handleWin()
        return;
    }

    const revealedIndex = processHintUpdate(guessPadded, targetWordString);
    addHistoryRow(guessPadded, score, false, revealedIndex);
    updateKeyboard();

    currentInput = "";
    renderActiveRow();
    setTimeout(() => { scrollArea.scrollTop = scrollArea.scrollHeight; }, 10);
}

function processHintUpdate(guess, target) {
    let colors = calculateColors(guess, target);
    let candidates = [];

    // Helper: Is the char anywhere in the target?
    const targetHasChar = (c) => target.indexOf(c) !== -1;

    for (let i = 0; i < 10; i++) {
        const char = guess[i];
        if (char === ' ') continue; 
        
        const color = colors[i];
        
        if (color === 'green') {
            if (knownGreens[i] !== char) {
                candidates.push({ type: 'green', index: i, char: char });
            }
        } 
        else if (color === 'yellow') {
            let key = `${i}-${char}`;
            if (!knownYellows.has(key)) {
                // Only a candidate if we haven't revealed this SPECIFIC positional clue yet
                candidates.push({ type: 'yellow', index: i, char: char, key: key });
            }
        } 
        else if (color === 'grey') {
            // Only add to grey if strictly not in target (avoids poisoning duplicates)
            if (!knownGreys.has(char) && !targetHasChar(char)) {
                candidates.push({ type: 'grey', index: i, char: char });
            }
        }
    }

    if (candidates.length > 0) {
        let choice = candidates[Math.floor(Math.random() * candidates.length)];

        if (choice.type === 'green') {
            knownGreens[choice.index] = choice.char;
            // Clean up: If we know it's green, it's no longer a "yellow" clue
            knownYellows.delete(`${choice.index}-${choice.char}`);
            // show letter in sentence
            renderSentence();
        }
        else if (choice.type === 'yellow') {
            knownYellows.add(choice.key);
        }
        else if (choice.type === 'grey') {
            knownGreys.add(choice.char);
        }

        return choice.index;
    }
    return -1;
}

function calculateColors(guess, target) {
    // Standard Wordle Logic handling duplicates
    let res = Array(10).fill('grey');
    let tArr = target.split('');
    let gArr = guess.split('');

    // 1. Find Greens first
    for(let i=0; i<10; i++) {
        if (gArr[i] !== ' ' && gArr[i] === tArr[i]) { 
            res[i] = 'green'; 
            tArr[i] = null; // Mark used in target
            gArr[i] = null; // Mark used in guess
        }
    }
    
    // 2. Find Yellows
    for(let i=0; i<10; i++) {
        if (gArr[i] !== ' ' && gArr[i] !== null) { 
            // Check if letter exists elsewhere in remaining target letters
            let idx = tArr.indexOf(gArr[i]);
            if (idx !== -1) {
                res[i] = 'yellow';
                tArr[idx] = null; // Mark used
            }
        }
    }
    return res;
}

// --- RENDERERS ---

function renderActiveRow() {
    activeRow.innerHTML = '';
    const padded = currentInput.padEnd(10, ' ');
    
    // 1. Render Tiles
    for (let i = 0; i < 10; i++) {
        let div = document.createElement('div');
        div.className = 'tile';
        if (padded[i] !== ' ') { div.innerText = padded[i]; div.classList.add('filled'); }
        if (i === currentInput.length) div.classList.add('active-blink');
        activeRow.appendChild(div);
    }
    
    // 2. Render Ghost Spacer (Fixes alignment)
    let spacer = document.createElement('div');
    spacer.className = 'score-spacer';
    activeRow.appendChild(spacer);
}

function addHistoryRow(word, score, isWin, revealedIndex = -1) {
    let row = document.createElement('div');
    row.className = 'tile-row';
    
    for (let i = 0; i < 10; i++) {
        let div = document.createElement('div');
        div.className = 'tile';
        let char = word[i];
        if (char !== ' ') div.innerText = char;

        let colorClass = null;
        
        if (isWin) {
            if(char !== ' ') colorClass = 'green';
        } else {
            if (char !== ' ') {
                if (knownGreens[i] === char) colorClass = 'green';
                else if (knownYellows.has(`${i}-${char}`)) colorClass = 'yellow';
                else if (knownGreys.has(char)) colorClass = 'grey';
            }
        }

        if (colorClass) div.classList.add(colorClass);
        if (i === revealedIndex) div.classList.add('new-reveal');

        row.appendChild(div);
    }

    let scoreDiv = document.createElement('div');
    scoreDiv.className = 'history-score';
    scoreDiv.innerText = score;
    
    // COLOR LOGIC: Score 60 = Green
    let hue = Math.max(0, Math.min(120, score * 2.0));
    
    scoreDiv.style.backgroundColor = `hsl(${hue}, 70%, 50%)`;
    
    row.appendChild(scoreDiv);
    historyContainer.appendChild(row);
}

function updateKeyboard() {
    knownGreys.forEach(char => {
        let btn = document.getElementById('key-'+char);
        if(btn) btn.className = 'key grey';
    });
    knownYellows.forEach(val => {
        let char = val.split('-')[1];
        let btn = document.getElementById('key-'+char);
        if(btn && !btn.classList.contains('green')) btn.className = 'key yellow';
    });
    knownGreens.forEach(char => {
        if(char && char !== ' ') {
            let btn = document.getElementById('key-'+char);
            if(btn) btn.className = 'key green';
        }
    });
}

function createKeyboard() {
    const kb = document.getElementById('keyboard-container');
    kb.innerHTML = '';
    ["qwertyuiop", "asdfghjkl", "zxcvbnm"].forEach((rowStr, idx) => {
        let row = document.createElement('div');
        row.className = 'kb-row';
        if(idx===2) {
            let enter = document.createElement('button'); enter.className='key wide'; enter.innerText='ENTER'; enter.onclick=submitGuess; row.appendChild(enter);
        }
        rowStr.split('').forEach(char => {
            let btn = document.createElement('button'); btn.className='key'; btn.innerText=char; btn.id='key-'+char; btn.onclick=()=>handleKey(char); row.appendChild(btn);
        });
        if(idx===2) {
            let back = document.createElement('button'); back.className='key wide'; back.innerText='⌫'; back.onclick=()=>handleKey('BACKSPACE'); row.appendChild(back);
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
    let t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
    messageContainer.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 1500);
}

function shakeBoard() {
    activeRow.classList.add('shake'); setTimeout(() => activeRow.classList.remove('shake'), 500);
}

let autoNextTimer = null; // Global variable to track the timer

function handleWin() {
    const modal = document.getElementById('modal');
    const msg = document.getElementById('modal-msg');
    const action = document.getElementById('modal-next-action');
    
    // Clear any previous timers to prevent memory leaks or double-skipping
    if (autoNextTimer) {
        clearInterval(autoNextTimer);
        autoNextTimer = null;
    }

    modal.classList.remove('hidden');
    action.innerHTML = '';
    
    document.getElementById('modal-title').innerText = "Word Found!";
    
    // Display the word found and the number of tries (guessCount)
    msg.innerHTML = `You found "<strong>${currentTargetData.text.toUpperCase()}</strong>"<br>Tries: ${guessCount}`;
    
    // Create the button
    let btn = document.createElement('button'); 
    btn.className = 'primary-btn'; 
    
    let timeLeft = 10; // Set to 5 seconds as requested
    btn.innerText = `Next Word (${timeLeft}s)`;
    
    const proceed = () => {
        if (autoNextTimer) clearInterval(autoNextTimer);
        modal.classList.add('hidden');
        startLevel(currentTargetIndex + 1);
    };

    btn.onclick = proceed;
    action.appendChild(btn);

    // Auto-countdown logic
    autoNextTimer = setInterval(() => {
        timeLeft--;
        btn.innerText = `Next Word (${timeLeft}s)`;
        
        if (timeLeft <= 0) {
            proceed();
        }
    }, 1000);
}

function handleGrandWin() {
    const modal = document.getElementById('modal');
    modal.classList.remove('hidden');
    
    // ...
    
    document.getElementById('modal-title').innerText = "GIFT REVEALED";
    
    const fullMessage = gameStructure.map(x => x.text).join(' ');
    
    document.getElementById('modal-msg').innerHTML = `
        <p>The secret message is:</p>
        <h3 style="color: var(--green); margin: 15px 0;">"${fullMessage}"</h3>
        <p><strong>Total Guesses: ${totalGameGuesses}</strong></p>
    `;
    
    // ...
}

// Start
initGame();