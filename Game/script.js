// --- Configuration ---
const LEVEL_1_WORD = "heated    "; // 10 chars
const LEVEL_2_WORD = "blanket   ";
let currentLevel = 1;
let targetWord = LEVEL_1_WORD;

// --- State ---
let wordData = {};
let currentInput = ""; 
let revealedMask = Array(10).fill(false); 

// --- Elements ---
const historyContainer = document.getElementById('history-container');
const activeRow = document.getElementById('active-row');
const levelIndicator = document.getElementById('level-indicator');
const messageContainer = document.getElementById('message-container');
const lastScoreDisplay = document.getElementById('last-score');

// --- Init ---
async function initGame() {
    try {
        const res = await fetch('words.json');
        wordData = await res.json();
        createKeyboard();
        startLevel(1);
    } catch (e) {
        showToast("Error loading words.json");
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
    lastScoreDisplay.classList.add('hidden');
    
    renderActiveRow();
    resetKeyboard();
}

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
    
    // Check Win FIRST
    if (guessPadded === targetWord) {
        // Reveal everything for the win row
        addHistoryRow(guessPadded, Array(10).fill('green'), score, true);
        handleWin();
        return;
    }

    // Calculate internal colors
    const colors = calculateColors(guessPadded, targetWord);
    
    // Select ONE new hint to permanently reveal
    selectNewHint(colors);

    // Render this guess to history
    addHistoryRow(guessPadded, colors, score, false);
    
    // Update Keyboard
    updateKeyboard(guessPadded, colors);

    // Update Score Header
    lastScoreDisplay.innerText = `Score: ${score}`;
    lastScoreDisplay.classList.remove('hidden');
    let hue = Math.max(0, Math.min(120, score * 1.2));
    lastScoreDisplay.style.color = `hsl(${hue}, 80%, 60%)`;

    // Reset Input
    currentInput = "";
    renderActiveRow();
    
    // Scroll to bottom
    const scrollArea = document.getElementById('board-scroll-area');
    scrollArea.scrollTop = scrollArea.scrollHeight;
}

function selectNewHint(currentColors) {
    let candidates = [];
    
    for (let i = 0; i < 10; i++) {
        // Condition 1: Must not already be revealed
        // Condition 2: Must NOT be a space in the TARGET word (Spaces only reveal on win)
        if (!revealedMask[i] && targetWord[i] !== ' ') {
            
            // Priority Logic: Prefer Non-Green (10x weight) to Green (1x weight)
            let weight = (currentColors[i] === 'green') ? 1 : 10;
            
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
        div.innerText = word[i]; // Show the letter (or space)

        // Logic: Should we show the color?
        // 1. If it's a WIN, show all colors (including green spaces)
        // 2. If it's a normal turn, only show if revealedMask[i] is true
        
        let shouldColor = isWin || revealedMask[i];

        if (shouldColor) {
            div.classList.add(colors[i]);
        } else {
            // If not revealed, it stays default (transparent/black)
            // Even if the user guessed the letter right, we hide the color
            // unless it was the selected hint.
        }
        
        row.appendChild(div);
    }

    // Render Score
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
        
        // Only update keyboard for REVEALED hints
        if (revealedMask[i]) {
            let color = colors[i];
            let btn = document.getElementById('key-'+char);
            if(btn) {
                if(color === 'green') btn.className = 'key green';
                else if(color === 'yellow' && !btn.classList.contains('green')) btn.className = 'key yellow';
                else if(color === 'grey' && !btn.classList.contains('green') && !btn.classList.contains('yellow')) btn.className = 'key grey';
            }
        }
    }
}

function resetKeyboard() {
    document.querySelectorAll('.key').forEach(k => {
        if(k.innerText.length === 1) k.className = 'key'; 
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
        btn.innerText = "Woohoo!";
        btn.onclick = () => modal.classList.add('hidden');
        action.appendChild(btn);
    }
}

initGame();