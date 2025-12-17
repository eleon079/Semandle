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

// --- CLUE STORAGE ---
let knownGreens = Array(10).fill(null);
let knownYellows = new Set();
let knownGreys = new Set();

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
    let nextTarget = gameStructure.find(item => item.id === targetId);
    
    if (!nextTarget) {
        handleGrandWin();
        return;
    }

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
                span.innerText = item.text;
                span.classList.add('target-solved');
            } else if (item.id === currentTargetIndex) {
                span.innerText = item.text; 
                span.classList.add('target-active');
            } else {
                span.innerText = item.text; 
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
    bestGuesses.forEach(bg => {
        let span = document.createElement('span');
        span.className = 'top-word';
        span.innerText = `${bg.word.toUpperCase()} (${bg.score})`;
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
    
    const scores = gameDictionary[guessClean];
    const score = scores[currentTargetIndex];
    
    // Update Top 3
    bestGuesses.push({ word: guessClean, score: score });
    bestGuesses.sort((a,b) => b.score - a.score);
    if (bestGuesses.length > 3) bestGuesses.length = 3;
    updateDashboard();

    const targetWordString = currentTargetData.text.toLowerCase().padEnd(10, ' ');
    const guessPadded = guessClean.padEnd(10, ' ');

    // Win Check
    if (guessClean === currentTargetData.text.toLowerCase()) {
        for(let i=0; i<10; i++) knownGreens[i] = guessPadded[i];
        addHistoryRow(guessPadded, score, true); 
        handleWin();
        return;
    }

    // Process Hints
    processHintUpdate(guessPadded, targetWordString);
    
    addHistoryRow(guessPadded, score, false);
    updateKeyboard();

    currentInput = "";
    renderActiveRow();
    setTimeout(() => { scrollArea.scrollTop = scrollArea.scrollHeight; }, 10);
}

// --- CORE HINT LOGIC (UPDATED) ---

function processHintUpdate(guess, target) {
    let colors = calculateColors(guess, target);
    
    // 1. Group indices by Letter
    // validLetterMap stores: { 'e': [1, 4], 's': [0] }
    let validLetterMap = {}; 
    let deadCandidates = [];

    for (let i = 0; i < 10; i++) {
        const char = guess[i];
        if (char === ' ') continue; 

        // If char is in target, we track its positions in the guess
        if (target.includes(char)) {
            if (!validLetterMap[char]) validLetterMap[char] = [];
            validLetterMap[char].push(i);
        } else {
            // If char is NOT in target, it's a candidate for a Grey clue
            if (!knownGreys.has(char)) {
                deadCandidates.push(char);
            }
        }
    }

    // 2. Filter Valid Letters: Only keep ones that provide NEW info
    let usefulLetters = [];
    
    for (let char in validLetterMap) {
        let indices = validLetterMap[char];
        let providesNewInfo = false;

        // Check if revealing these indices adds anything new
        for (let idx of indices) {
            let color = colors[idx];
            
            if (color === 'green') {
                if (knownGreens[idx] !== char) providesNewInfo = true;
            } else if (color === 'yellow') {
                let key = `${idx}-${char}`;
                if (!knownYellows.has(key)) providesNewInfo = true;
            }
        }

        if (providesNewInfo) {
            usefulLetters.push(char);
        }
    }

    // 3. Selection Priority: 
    //    A. Reveal a Useful Letter (all instances)
    //    B. Reveal a Dead Letter
    
    if (usefulLetters.length > 0) {
        // Pick one random useful letter
        let chosenChar = usefulLetters[Math.floor(Math.random() * usefulLetters.length)];
        let indices = validLetterMap[chosenChar];
        
        // Reveal ALL instances of this letter in the current guess
        indices.forEach(idx => {
            let color = colors[idx];
            if (color === 'green') {
                knownGreens[idx] = chosenChar;
            } else if (color === 'yellow') {
                knownYellows.add(`${idx}-${chosenChar}`);
            }
        });
        showToast(`Revealing all '${chosenChar.toUpperCase()}'s`);
    } 
    else if (deadCandidates.length > 0) {
        // Pick one random dead letter
        let chosenChar = deadCandidates[Math.floor(Math.random() * deadCandidates.length)];
        knownGreys.add(chosenChar);
        showToast(`'${chosenChar.toUpperCase()}' is not in the word`);
    } else {
        showToast("No new clues available!");
    }
}

function calculateColors(guess, target) {
    let res = Array(10).fill('grey');
    let tArr = target.split('');
    let gArr = guess.split('');

    for(let i=0; i<10; i++) {
        if (gArr[i] === tArr[i]) { res[i] = 'green'; tArr[i] = null; gArr[i] = null; }
    }
    for(let i=0; i<10; i++) {
        if (gArr[i] && tArr.includes(gArr[i])) { res[i] = 'yellow'; let idx = tArr.indexOf(gArr[i]); tArr[idx] = null; }
    }
    return res;
}

// --- RENDERERS ---

function renderActiveRow() {
    activeRow.innerHTML = '';
    const padded = currentInput.padEnd(10, ' ');
    for (let i = 0; i < 10; i++) {
        let div = document.createElement('div');
        div.className = 'tile';
        if (padded[i] !== ' ') { div.innerText = padded[i]; div.classList.add('filled'); }
        if (i === currentInput.length) div.classList.add('active-blink');
        activeRow.appendChild(div);
    }
    let spacer = document.createElement('div');
    spacer.className = 'score-spacer';
    activeRow.appendChild(spacer);
}

function addHistoryRow(word, score, isWin) {
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
        row.appendChild(div);
    }

    let scoreDiv = document.createElement('div');
    scoreDiv.className = 'history-score';
    scoreDiv.innerText = score;
    let hue = Math.max(0, Math.min(120, score * 1.2));
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
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 2000);
}

function shakeBoard() {
    activeRow.classList.add('shake'); setTimeout(() => activeRow.classList.remove('shake'), 500);
}

function handleWin() {
    const modal = document.getElementById('modal');
    const msg = document.getElementById('modal-msg');
    const stats = document.getElementById('modal-stats');
    const action = document.getElementById('modal-next-action');
    
    modal.classList.remove('hidden');
    action.innerHTML = '';
    
    document.getElementById('modal-title').innerText = "Word Found!";
    msg.innerText = `You found "${currentTargetData.text.toUpperCase()}"!`;
    stats.innerText = `Guesses: ${guessCount}`;
    
    let btn = document.createElement('button'); btn.className = 'primary-btn'; btn.innerText = "Next Word";
    btn.onclick = () => { modal.classList.add('hidden'); startLevel(currentTargetIndex + 1); };
    action.appendChild(btn);
}

function handleGrandWin() {
    const modal = document.getElementById('modal');
    modal.classList.remove('hidden');
    document.getElementById('modal-title').innerText = "GIFT REVEALED";
    document.getElementById('modal-msg').innerText = `The message is:\n"${gameStructure.map(x=>x.text).join(' ')}"`;
    document.getElementById('modal-stats').innerText = ""; 
    document.getElementById('modal-next-action').innerHTML = '';
    let btn = document.createElement('button'); btn.className = 'primary-btn'; btn.innerText = "Close";
    btn.onclick = () => modal.classList.add('hidden');
    document.getElementById('modal-next-action').appendChild(btn);
    currentTargetIndex = 999; renderSentence();
}

// Start
initGame();