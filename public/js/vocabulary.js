let currentIndex = 0;

function getWordList() {
    let words;
    if (currentTextbookUnit) {
        words = (typeof TEXTBOOK_WORDS !== 'undefined' && TEXTBOOK_WORDS[currentTextbookUnit]) ? TEXTBOOK_WORDS[currentTextbookUnit] : [];
    } else if (currentLevel === 'primary') words = PRIMARY_WORDS;
    else if (currentLevel === 'middle') words = MIDDLE_WORDS;
    else if (currentLevel === 'cet4') words = CET4_WORDS || [];
    else if (currentLevel === 'cet6') words = CET6_WORDS || [];
    else if (currentLevel === 'kaoyan') words = KAOYAN_WORDS || [];
    else if (currentLevel === 'ielts') words = IELTS_WORDS || [];
    else if (currentLevel === 'toefl') words = TOEFL_WORDS || [];
    else if (currentLevel === 'sat') words = SAT_WORDS || [];
    else if (currentLevel === 'gre') words = GRE_WORDS || [];
    else words = WORDS;

    // Attach original index to each word for star/master tracking
    let result = words.map(function(w, i) { w._idx = i; return w; });

    if (currentMode === 'vocab') {
        // 生词本: only starred + not mastered
        var starred = getStarred();
        var mastered = getMastered();
        result = result.filter(function(w) { return starred.has(w._idx) && !mastered.has(w._idx); });
    } else if (wordFilter === 'starred') {
        // Star filter: only starred
        var starred = getStarred();
        result = result.filter(function(w) { return starred.has(w._idx); });
    }

    return result;
}

function renderStar(rating) {
    if (!rating) return '';
    let html = '';
    for (const ch of rating) {
        if (ch === '★') {
            html += '<span class="star-filled">★</span>';
        } else if (ch === '☆') {
            html += '<span class="star-empty">☆</span>';
        } else {
            html += ch;
        }
    }
    return html;
}

function renderDefinition(defText) {
    if (!defText) return '';
    // Parts of speech: n., v., vt., vi., adj., adv., prep., pron., conj., int., art., num., aux., modal, pref., suff.
    const parts = defText.split(/(?=\b(?:n\.|v\.|vt\.|vi\.|adj\.|adv\.|prep\.|pron\.|conj\.|int\.|art\.|num\.|aux\.|modal|pref\.|suff\.)\b)/g);
    return parts.map(p => {
        const match = p.match(/^(n\.|v\.|vt\.|vi\.|adj\.|adv\.|prep\.|pron\.|conj\.|int\.|art\.|num\.|aux\.|modal|pref\.|suff\.)/);
        if (match) {
            return '<span class="pos">' + p + '</span>';
        }
        // Also handle " // " separator
        const parts2 = p.split(/(?=\s*\/\/\s*(?:n\.|v\.|vt\.|vi\.|adj\.|adv\.|prep\.|pron\.|conj\.|int\.|art\.|num\.|aux\.|modal|pref\.|suff\.))/g);
        return parts2.map(p2 => {
            if (p2.includes(' // ')) {
                return p2.replace(/(.*?)(\s*\/\/\s*)(n\.|v\.|vt\.|vi\.|adj\.|adv\.|prep\.|pron\.|conj\.|int\.|art\.|num\.|aux\.|modal|pref\.|suff\.)/g,
                    '$1 <span class="pos">$2$3</span>');
            }
            return p2;
        }).join('');
    }).join('');
}

function showWord(index) {
    const words = getWordList();
    const w = words[index];
    if (!w) return;
    currentIndex = index;

    document.getElementById('wordDisplay').textContent = w.w || '';
    // Use stored phonetic if available, otherwise fetch from API
    if (w.p) {
        document.getElementById('phoneticDisplay').textContent = w.p;
    } else {
        fetchPhonetic(w.w);
    }
    document.getElementById('ratingDisplay').innerHTML = renderStar(w.r);
    document.getElementById('sentenceText').textContent = w.e || '';
    document.getElementById('translationDisplay').textContent = w.c || '';
    document.getElementById('definitionDisplay').innerHTML = renderDefinition(w.d);
    
    document.getElementById('progressText').textContent = `${index + 1} / ${words.length}`;
    document.getElementById('progressIndicator').textContent = `第 ${index + 1} 张 / 共 ${words.length} 张`;
    document.getElementById('searchResult').textContent = '';
    document.getElementById('notFound').classList.remove('show');
    document.getElementById('cardContent').classList.add('show');

    // Update star/master button states (using original index)
    var origIdx = w._idx;
    var starBtn = document.getElementById('starBtn');
    var masterBtn = document.getElementById('masterBtn');
    if (getStarred().has(origIdx)) { starBtn.classList.add('starred'); } else { starBtn.classList.remove('starred'); }
    if (getMastered().has(origIdx)) { masterBtn.classList.add('mastered'); } else { masterBtn.classList.remove('mastered'); }

    // Reset hint if in test mode
    if (currentMode === 'test') {
        hintLevel = 0;
        document.getElementById('sentenceDisplay').style.display = 'none';
        document.getElementById('translationDisplay').style.display = 'none';
        document.getElementById('definitionDisplay').style.display = 'none';
    }

    // Restart auto-play timer if active
    if (autoPlayActive) scheduleAutoPlay();
}

function nextWord() {
    const words = getWordList();
    if (currentIndex < words.length - 1) {
        showWord(currentIndex + 1);
    }
}

function prevWord() {
    if (currentIndex > 0) {
        showWord(currentIndex - 1);
    }
}

function randomWord() {
    const words = getWordList();
    const idx = Math.floor(Math.random() * words.length);
    showWord(idx);
}

function searchWord() {
    const words = getWordList();
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!query) return;

    // Numeric search: jump to word by index (1-based)
    if (/^\d+$/.test(query)) {
        const idx = parseInt(query) - 1;
        if (idx >= 0 && idx < words.length) {
            document.getElementById('searchResult').textContent = '🔍 序号 ' + (idx + 1) + ' / ' + words.length;
            showWord(idx);
        } else {
            document.getElementById('searchResult').textContent = '❌ 序号超出范围 (1-' + words.length + ')';
        }
        return;
    }

    // Exact match first
    for (let i = 0; i < words.length; i++) {
        if (words[i].w.toLowerCase() === query) {
            document.getElementById('searchResult').textContent = `🔍 找到 "${words[i].w}"`;
            showWord(i);
            return;
        }
    }
    // Fuzzy match - starts with
    for (let i = 0; i < words.length; i++) {
        if (words[i].w.toLowerCase().startsWith(query)) {
            document.getElementById('searchResult').textContent = `🔍 找到 "${words[i].w}"`;
            showWord(i);
            return;
        }
    }
    // Contains
    for (let i = 0; i < words.length; i++) {
        if (words[i].w.toLowerCase().includes(query)) {
            document.getElementById('searchResult').textContent = `🔍 找到 "${words[i].w}"`;
            showWord(i);
            return;
        }
    }
    // Not found
    document.getElementById('notFound').classList.add('show');
    document.getElementById('cardContent').classList.remove('show');
    document.getElementById('searchResult').textContent = `❌ 未找到 "${query}"`;
}

// Keyboard navigation (skip in spell/quiz modes and when typing in inputs)
document.addEventListener('keydown', function(e) {
    if (currentMode === 'spell' || currentMode === 'quiz' || currentMode === 'battle' || currentMode === 'multi' || currentMode === 'race' || currentMode === 'online') return;
    var tag = (document.activeElement || {}).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        nextWord();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        prevWord();
    } else if (e.key === 'Enter') {
        if (document.activeElement === document.getElementById('searchInput')) {
            searchWord();
        }
    }
});


// Mode state
let currentMode = 'study';
let hintLevel = 0; // 0=hidden, 1=sentence, 2=translation, 3=definition
let autoPlayActive = false;
let autoPlayTimer = null;
let playbackSpeed = 1; // 0.5x, 1x, 1.5x, 2x
let wordFilter = 'all'; // 'all' | 'starred'
let spellCorrect = 0, spellWrong = 0;
let spellUsed = new Set();
let quizCorrect = 0, quizWrong = 0;
let quizAnswerIdx = -1; // which option is correct
let quizLocked = false; // prevent double-click
let quizUsed = new Set();
let quizWrongWords = [];
let quizTimer = null;

// ========== localStorage helpers ==========
function storageKey(type) { return 'vocab_' + type + '_' + (currentTextbookUnit ? currentTextbookUnit : currentLevel); }
function getStarred() { try { return new Set(JSON.parse(localStorage.getItem(storageKey('starred')) || '[]')); } catch(e) { return new Set(); } }
function saveStarred(s) { localStorage.setItem(storageKey('starred'), JSON.stringify([...s])); }
function getMastered() { try { return new Set(JSON.parse(localStorage.getItem(storageKey('mastered')) || '[]')); } catch(e) { return new Set(); } }
function saveMastered(s) { localStorage.setItem(storageKey('mastered'), JSON.stringify([...s])); }

function setMode(mode) {
    currentMode = mode;
    if (autoPlayActive) stopAutoPlay();
    // Clean UI for spell/quiz/battle modes
    document.body.classList.toggle('clean-mode', mode === 'spell' || mode === 'quiz' || mode === 'battle' || mode === 'multi' || mode === 'race' || mode === 'online');
    document.getElementById('studyMode').classList.toggle('active', mode === 'study');
    document.getElementById('testMode').classList.toggle('active', mode === 'test');
    document.getElementById('vocabMode').classList.toggle('active', mode === 'vocab');
    document.getElementById('spellMode').classList.toggle('active', mode === 'spell');
    document.getElementById('quizMode').classList.toggle('active', mode === 'quiz');
    document.getElementById('battleMode').classList.toggle('active', mode === 'battle');
    document.getElementById('multiMode').classList.toggle('active', mode === 'multi');
    document.getElementById('raceMode').classList.toggle('active', mode === 'race');
    document.getElementById('onlineMode').classList.toggle('active', mode === 'online');

    // Quit online room when switching away
    if (currentMode === 'online' && mode !== 'online') { quitOnlineRoom(); }

    // Reset filter when switching modes
    if (mode === 'vocab') {
        wordFilter = 'all';
        document.getElementById('filterBtn').textContent = '收藏';
        document.getElementById('filterBtn').classList.remove('active-filter');
    }

    // Hide all panels first
    document.getElementById('cardContent').classList.remove('show');
    document.getElementById('notFound').classList.remove('show');
    document.getElementById('spellPanel').classList.remove('show');
    document.getElementById('quizPanel').classList.remove('show');
    document.getElementById('battlePanel').classList.remove('show');
    document.getElementById('multiPanel').classList.remove('show');
    document.getElementById('racePanel').classList.remove('show');
    document.getElementById('onlinePanel').classList.remove('show');

    const hintBtn = document.getElementById('hintBtn');
    const sentence = document.getElementById('sentenceDisplay');
    const translation = document.getElementById('translationDisplay');
    const definition = document.getElementById('definitionDisplay');
    var words = getWordList();

    if (mode === 'study' || mode === 'vocab') {
        sentence.style.display = '';
        translation.style.display = '';
        definition.style.display = '';
        hintBtn.style.display = 'none';
        hintLevel = 0;
        // Show word card
        if (words.length > 0) { showWord(0); }
        else {
            document.getElementById('notFound').classList.add('show');
            document.getElementById('searchResult').textContent = mode === 'vocab' ? '📒 生词本为空，请先收藏单词' : '';
            document.getElementById('progressText').textContent = '0 / 0';
        }
    } else if (mode === 'test') {
        sentence.style.display = 'none';
        translation.style.display = 'none';
        definition.style.display = 'none';
        hintBtn.style.display = '';
        hintLevel = 0;
        if (words.length > 0) { showWord(0); }
        else {
            document.getElementById('notFound').classList.add('show');
            document.getElementById('progressText').textContent = '0 / 0';
        }
    } else if (mode === 'spell') {
        hintBtn.style.display = 'none';
        spellCorrect = 0; spellWrong = 0;
        spellUsed = new Set();
        if (words.length > 0) { startSpell(); }
        else {
            document.getElementById('notFound').classList.add('show');
            document.getElementById('progressText').textContent = '0 / 0';
        }
    } else if (mode === 'quiz') {
        hintBtn.style.display = 'none';
        spellCorrect = 0; spellWrong = 0;
        quizCorrect = 0; quizWrong = 0;
        quizUsed = new Set();
        quizWrongWords = [];
        updateQuizScore();
        if (words.length > 0) { buildQuiz(); }
        else {
            document.getElementById('notFound').classList.add('show');
            document.getElementById('progressText').textContent = '0 / 0';
        }
    } else if (mode === 'battle') {
        hintBtn.style.display = 'none';
        battleScore1 = 0; battleScore2 = 0;
        battleWrong1 = 0; battleWrong2 = 0;
        battleUsed = new Set();
        if (words.length >= 4) { startBattle(); }
        else {
            document.getElementById('notFound').classList.add('show');
            document.getElementById('progressText').textContent = '0 / 0';
        }
    } else if (mode === 'multi') {
        hintBtn.style.display = 'none';
        multiScoreA = 0; multiScoreB = 0; multiScoreC = 0; multiScoreD = 0;
        multiWrongA = 0; multiWrongB = 0; multiWrongC = 0; multiWrongD = 0;
        multiUsed = new Set();
        if (words.length >= 4) { startMulti(); }
        else {
            document.getElementById('notFound').classList.add('show');
            document.getElementById('progressText').textContent = '0 / 0';
        }
    } else if (mode === 'race') {
        hintBtn.style.display = 'none';
        raceScoreA = 0; raceScoreB = 0; raceScoreC = 0; raceScoreD = 0;
        raceWrongA = 0; raceWrongB = 0; raceWrongC = 0; raceWrongD = 0;
        raceWrongWordsA = []; raceWrongWordsB = []; raceWrongWordsC = []; raceWrongWordsD = [];
        raceUsedA = new Set(); raceUsedB = new Set(); raceUsedC = new Set(); raceUsedD = new Set();
        if (words.length >= 4) { startRace(); }
        else {
            document.getElementById('notFound').classList.add('show');
            document.getElementById('progressText').textContent = '0 / 0';
        }
    } else if (mode === 'online') {
        hintBtn.style.display = 'none';
        document.getElementById('onlinePanel').classList.add('show');
        document.getElementById('onlineRoomUI').style.display = '';
        document.getElementById('onlineGameUI').style.display = 'none';
        document.getElementById('onlineMsg').textContent = '';
        document.getElementById('onlineMsg').className = 'online-msg';
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            document.getElementById('onlineMsg').textContent = '⚠️ 请先配置 Supabase';
            document.getElementById('onlineMsg').className = 'online-msg error';
        }
    }
}

function showHint() {
    const sentence = document.getElementById('sentenceDisplay');
    const translation = document.getElementById('translationDisplay');
    const definition = document.getElementById('definitionDisplay');
    
    hintLevel++;
    if (hintLevel === 1) {
        sentence.style.display = '';
        translation.style.display = 'none';
        definition.style.display = 'none';
    } else if (hintLevel === 2) {
        translation.style.display = '';
        definition.style.display = 'none';
    } else if (hintLevel === 3) {
        definition.style.display = '';
    }
}


function playSentence(e) {
    if (e) e.stopPropagation();
    const text = document.getElementById('sentenceText').textContent;
    if (!text) return;
    speakWithTTS(text);
}

// Phonetic cache
const phoneticCache = {};

function playPronunciation(e) {
    if (e) e.stopPropagation();
    const word = document.getElementById('wordDisplay').textContent;
    if (!word) return;
    speakWithTTS(word);
}

// Ensure voices are loaded + server TTS fallback for devices without English voices
var speechVoices = [];
function refreshVoices() { speechVoices = window.speechSynthesis.getVoices(); }
if (window.speechSynthesis) {
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
}

var ttsAudio = null;
function audioSpeak(text) {
    if (ttsAudio) { try { ttsAudio.pause(); } catch (e) {} }
    ttsAudio = new Audio('/api/tts?text=' + encodeURIComponent(text));
    ttsAudio.play().catch(function(err) { console.error('TTS audio error:', err); });
}

function speakWithTTS(text) {
    if (window.speechSynthesis) {
        var v = window.speechSynthesis.getVoices();
        if (v && v.length) speechVoices = v;
    }
    var en = speechVoices.find(function(v) { return v.lang && v.lang.startsWith('en'); });
    if (en) {
        var u = new SpeechSynthesisUtterance(text);
        u.voice = en;
        u.rate = 1;
        u.pitch = 1;
        var started = false;
        var fallbackTimer = setTimeout(function() {
            if (!started) {
                // 本地语音 2 秒内没真正开始出声（可能语音坏了/静音），切到服务器发音
                try { window.speechSynthesis.cancel(); } catch (e) {}
                audioSpeak(text);
            }
        }, 2000);
        u.onstart = function() { started = true; clearTimeout(fallbackTimer); };
        window.speechSynthesis.speak(u);
    } else {
        audioSpeak(text);
    }
}

async function fetchPhonetic(word) {
    if (!word) return;
    if (phoneticCache[word]) {
        document.getElementById('phoneticDisplay').textContent = phoneticCache[word];
        return;
    }
    try {
        const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        // Try phonetic field first, then phonetics array
        let phonetic = data[0]?.phonetic || '';
        if (!phonetic) {
            const ph = data[0]?.phonetics?.find(p => p.text);
            if (ph) phonetic = ph.text;
        }
        if (phonetic) {
            // Clean up: remove hard-to-read combining diacritical marks (e.g. subscript breve)
            const cleaned = phonetic.replace(/[\u0300-\u036f\u0320-\u033f]/g, '');
            phoneticCache[word] = cleaned;
            document.getElementById('phoneticDisplay').textContent = cleaned;
        } else {
            document.getElementById('phoneticDisplay').textContent = '';
        }
    } catch (e) {
        document.getElementById('phoneticDisplay').textContent = '';
    }
}

// Level switching
let currentLevel = 'primary';
let currentTextbookUnit = null;

function switchLevel(level) {
    // Only host can switch level in online mode
    if (currentMode === "online" && onlinePlayerId.indexOf("host_") !== 0) return;
    currentLevel = level;
    currentTextbookUnit = null;
    document.getElementById('textbookBtn').classList.remove('active');
    if (autoPlayActive) stopAutoPlay();
    // 初中模式：所有元素居中；小学/高中保持原样
    document.body.classList.toggle('middle-mode', level === 'middle');
    document.getElementById('levelPrimary').classList.toggle('active', level === 'primary');
    document.getElementById('levelMiddle').classList.toggle('active', level === 'middle');
    document.getElementById('levelHigh').classList.toggle('active', level === 'high');
    document.getElementById('levelCet4').classList.toggle('active', level === 'cet4');
    document.getElementById('levelCet6').classList.toggle('active', level === 'cet6');
    document.getElementById('levelKaoyan').classList.toggle('active', level === 'kaoyan');
    document.getElementById('levelIelts').classList.toggle('active', level === 'ielts');
    document.getElementById('levelToefl').classList.toggle('active', level === 'toefl');
    document.getElementById('levelSat').classList.toggle('active', level === 'sat');
    document.getElementById('levelGre').classList.toggle('active', level === 'gre');

    document.getElementById('searchInput').value = '';
    document.getElementById('searchResult').textContent = '';
    document.getElementById('notFound').classList.remove('show');
    if (currentMode !== 'spell' && currentMode !== 'quiz' && currentMode !== 'battle' && currentMode !== 'multi' && currentMode !== 'race' && currentMode !== 'online') {
        document.getElementById('cardContent').classList.add('show');
    }

    // Lazy-load data on first use (fallback if defer hasn't finished)
    var needLoad = false;
    var loadSrc = '';
    var loadName = '';
    if (level === 'cet4' && typeof CET4_WORDS === 'undefined') { needLoad = true; loadSrc = '/js/vocab-cet4.js'; loadName = '四级'; }
    else if (level === 'cet6' && typeof CET6_WORDS === 'undefined') { needLoad = true; loadSrc = '/js/vocab-cet6.js'; loadName = '六级'; }
    else if (level === 'kaoyan' && typeof KAOYAN_WORDS === 'undefined') { needLoad = true; loadSrc = '/js/vocab-kaoyan.js'; loadName = '考研'; }
    else if (level === 'ielts' && typeof IELTS_WORDS === 'undefined') { needLoad = true; loadSrc = '/js/vocab-ielts.js'; loadName = '雅思'; }
    else if (level === 'toefl' && typeof TOEFL_WORDS === 'undefined') { needLoad = true; loadSrc = '/js/vocab-toefl.js'; loadName = '托福'; }
    else if (level === 'sat' && typeof SAT_WORDS === 'undefined') { needLoad = true; loadSrc = '/js/vocab-sat.js'; loadName = 'SAT'; }
    else if (level === 'gre' && typeof GRE_WORDS === 'undefined') { needLoad = true; loadSrc = '/js/vocab-gre.js'; loadName = 'GRE'; }
    if (needLoad) {
        document.getElementById('progressText').textContent = '加载' + loadName + '词库...';
        var s = document.createElement('script');
        s.src = loadSrc;
        s.onload = function() { loadLevelWords(); };
        document.head.appendChild(s);
        return;
    }
    loadLevelWords();
}

function loadLevelWords() {
    var words = getWordList();
    if (words.length > 0) {
        currentIndex = 0;
        // In spell/quiz modes, restart the respective game instead of showing word card
        if (currentMode === 'spell') {
            spellCorrect = 0; spellWrong = 0;
            spellUsed = new Set();
            startSpell();
        } else if (currentMode === 'quiz') {
            quizCorrect = 0; quizWrong = 0; quizUsed = new Set(); quizWrongWords = []; updateQuizScore();
            buildQuiz();
        } else if (currentMode === 'online') {
            // Restart with new word list
            onlineMyScore = 0; onlineLastWord = '';
            document.getElementById('onlineMyScore').textContent = '0';
            if (onlinePlayerId.indexOf('host_') === 0) { sendNextOnlineRound(); }
        } else if (currentMode === 'battle') {
            battleScore1 = 0; battleScore2 = 0;
            battleWrong1 = 0; battleWrong2 = 0;
            battleUsed = new Set();
            startBattle();
        } else if (currentMode === 'multi') {
            multiScoreA = 0; multiScoreB = 0; multiScoreC = 0; multiScoreD = 0;
            multiWrongA = 0; multiWrongB = 0; multiWrongC = 0; multiWrongD = 0;
            multiUsed = new Set();
            startMulti();
        } else if (currentMode === 'race') {
            raceScoreA = 0; raceScoreB = 0; raceScoreC = 0; raceScoreD = 0;
            raceWrongA = 0; raceWrongB = 0; raceWrongC = 0; raceWrongD = 0;
            raceWrongWordsA = []; raceWrongWordsB = []; raceWrongWordsC = []; raceWrongWordsD = [];
            raceUsedA = new Set(); raceUsedB = new Set(); raceUsedC = new Set(); raceUsedD = new Set();
            startRace();
        } else {
            showWord(0);
        }
    } else {
        document.getElementById('cardContent').classList.remove('show');
        document.getElementById('notFound').classList.add('show');
        document.getElementById('progressText').textContent = '0 / 0';
    }
}

// ========== Auto Play ==========
function toggleAutoPlay() {
    if (autoPlayActive) {
        stopAutoPlay();
    } else {
        startAutoPlay();
    }
}

function startAutoPlay() {
    autoPlayActive = true;
    const btn = document.getElementById('autoBtn');
    btn.textContent = '⏸ 停止';
    btn.classList.add('stop');
    scheduleAutoPlay();
}

function stopAutoPlay() {
    autoPlayActive = false;
    if (autoPlayTimer) {
        if (typeof autoPlayTimer === 'object') {
            // Test mode: clear all timers
            Object.values(autoPlayTimer).forEach(function(t) { clearTimeout(t); });
        } else {
            // Study mode: single timer
            clearTimeout(autoPlayTimer);
        }
        autoPlayTimer = null;
    }
    const btn = document.getElementById('autoBtn');
    btn.textContent = '▶ 自动播放';
    btn.classList.remove('stop');
}

function cycleSpeed() {
    const speeds = [0.5, 1, 1.5, 2];
    const labels = ['0.5x', '1x', '1.5x', '2x'];
    const idx = speeds.indexOf(playbackSpeed);
    const nextIdx = (idx + 1) % speeds.length;
    playbackSpeed = speeds[nextIdx];
    document.getElementById('speedBtn').textContent = '倍速 ' + labels[nextIdx];
    saveProgress();
}

function toggleStarWord() {
    const words = getWordList();
    const w = words[currentIndex];
    if (!w) return;
    var origIdx = w._idx;
    var starred = getStarred();
    if (starred.has(origIdx)) { starred.delete(origIdx); } else { starred.add(origIdx); }
    saveStarred(starred);
    // Update button + re-render if in starred filter or vocab mode
    updateFilteredView(origIdx);
}

function toggleMasterWord() {
    const words = getWordList();
    const w = words[currentIndex];
    if (!w) return;
    var origIdx = w._idx;
    var mastered = getMastered();
    if (mastered.has(origIdx)) { mastered.delete(origIdx); } else { mastered.add(origIdx); }
    saveMastered(mastered);
    updateFilteredView(origIdx);
}

function updateFilteredView(stayOrigIdx) {
    // Re-render word list and find the same word
    var words = getWordList();
    var newIdx = -1;
    for (var i = 0; i < words.length; i++) {
        if (words[i]._idx === stayOrigIdx) { newIdx = i; break; }
    }
    if (newIdx >= 0) {
        showWord(newIdx);
    } else if (words.length > 0) {
        // The current word no longer in filtered list, show first word
        showWord(0);
    } else {
        // Empty list (e.g. all mastered in vocab mode)
        document.getElementById('cardContent').classList.remove('show');
        document.getElementById('notFound').classList.add('show');
        document.getElementById('searchResult').textContent = '📒 生词本为空，请先收藏单词';
        document.getElementById('progressText').textContent = '0 / 0';
    }
}

function toggleWordList() {
    var overlay = document.getElementById('wordListOverlay');
    if (overlay.classList.contains('show')) {
        overlay.classList.remove('show');
        return;
    }
    // Build list
    var words = getWordList();
    var scroll = document.getElementById('wordListScroll');
    var html = '';
    for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var zh = (w.d || '').replace(/<[^>]*>/g, '').substring(0, 30);
        if (!zh) zh = w.c || '';
        html += '<div class=\"word-list-item\" onclick=\"jumpToListWord(' + i + ')\">' +
            '<span class=\"wl-idx\">' + (i + 1) + '</span>' +
            '<span class=\"wl-word\">' + w.w + '</span>' +
            '<span class=\"wl-zh\">' + zh + '</span>' +
            '</div>';
    }
    scroll.innerHTML = html;
    document.getElementById('wordListTitle').textContent = '单词列表 (' + words.length + ')';
    overlay.classList.add('show');
    // Scroll to current word
    setTimeout(function() {
        var items = scroll.querySelectorAll('.word-list-item');
        if (items[currentIndex]) {
            items[currentIndex].scrollIntoView({ block: 'center' });
        }
    }, 50);
}

function jumpToListWord(idx) {
    document.getElementById('wordListOverlay').classList.remove('show');
    showWord(idx);
}

function toggleFilter() {
    if (currentMode === 'vocab') return; // Filter not applicable in vocab mode
    wordFilter = (wordFilter === 'all') ? 'starred' : 'all';
    var btn = document.getElementById('filterBtn');
    if (wordFilter === 'starred') {
        btn.textContent = '全部';
        btn.classList.add('active-filter');
    } else {
        btn.textContent = '收藏';
        btn.classList.remove('active-filter');
    }
    saveProgress();
    // Reload from first word
    var words = getWordList();
    if (words.length > 0) {
        showWord(0);
    } else {
        document.getElementById('cardContent').classList.remove('show');
        document.getElementById('notFound').classList.add('show');
        document.getElementById('searchResult').textContent = '⭐ 暂无收藏单词';
        document.getElementById('progressText').textContent = '0 / 0';
    }
}

function getNextAutoIndex() {
    var words = getWordList();
    if (currentIndex >= words.length - 1) return -1;
    var mastered = getMastered();
    for (var i = currentIndex + 1; i < words.length; i++) {
        if (!mastered.has(words[i]._idx)) return i;
    }
    return -1; // All remaining words mastered
}

function scheduleAutoPlay() {
    if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; }
    if (!autoPlayActive) return;

    var spd = playbackSpeed;
    if (currentMode === 'study' || currentMode === 'vocab') {
        // Study/Vocab mode: switch to next word (5s / speed), skip mastered
        autoPlayTimer = setTimeout(function() {
            if (!autoPlayActive) return;
            var nextIdx = getNextAutoIndex();
            if (nextIdx < 0) { stopAutoPlay(); return; }
            showWord(nextIdx);
        }, 5000 / spd);
    } else {
        // Test mode: 2s→sentence, 4s→translation, 6s→definition, 8s→next word (all / speed), skip mastered
        var t1 = setTimeout(function() {
            if (!autoPlayActive) return;
            document.getElementById('sentenceDisplay').style.display = '';
        }, 2000 / spd);
        var t2 = setTimeout(function() {
            if (!autoPlayActive) return;
            document.getElementById('translationDisplay').style.display = '';
        }, 4000 / spd);
        var t3 = setTimeout(function() {
            if (!autoPlayActive) return;
            document.getElementById('definitionDisplay').style.display = '';
        }, 6000 / spd);
        var t4 = setTimeout(function() {
            if (!autoPlayActive) return;
            var nextIdx = getNextAutoIndex();
            if (nextIdx < 0) { stopAutoPlay(); return; }
            showWord(nextIdx);
        }, 8000 / spd);
        // Store all timer IDs for cleanup
        autoPlayTimer = { t1: t1, t2: t2, t3: t3, t4: t4 };
    }
}

// Click anywhere on page to go next (exclude buttons, input, and quiz/spell modes)
document.addEventListener('click', function(e) {
    if (currentMode === 'spell' || currentMode === 'quiz' || currentMode === 'battle' || currentMode === 'multi' || currentMode === 'race' || currentMode === 'online') return;
    const tag = e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT') return;
    nextWord();
});

// ========== C1: Spelling Mode ==========
function startSpell() {
    // Ensure only spell panel is visible
    document.getElementById('cardContent').classList.remove('show');
    document.getElementById('notFound').classList.remove('show');
    document.getElementById('quizPanel').classList.remove('show');
    document.getElementById('spellPanel').classList.add('show');
    var words = getWordList();
    if (words.length === 0) return;
    if (spellUsed.size >= words.length) {
        // 本轮单词已全部练习完成
        document.getElementById('spellPrompt').textContent = '✅ 此难度单词已全部练习';
        document.getElementById('spellInput').value = '';
        document.getElementById('spellFeedback').textContent = '';
        document.getElementById('spellFeedback').className = 'spell-feedback';
        return;
    }
    var idx;
    do { idx = Math.floor(Math.random() * words.length); } while (spellUsed.has(idx));
    spellUsed.add(idx);
    currentIndex = idx;
    var w = words[idx];
    var prompt = (w.d || '').replace(/<[^>]*>/g, '').substring(0, 60);
    if (!prompt) prompt = w.c || '';
    document.getElementById('spellPrompt').textContent = prompt;
    document.getElementById('spellInput').value = '';
    document.getElementById('spellFeedback').textContent = '';
    document.getElementById('spellFeedback').className = 'spell-feedback';
    document.getElementById('spellPanel').classList.add('show');
    document.getElementById('spellScore').textContent = '✅ ' + spellCorrect + '  ❌ ' + spellWrong;
    document.getElementById('progressText').textContent = '单词 ' + (idx + 1) + ' / ' + words.length;
    setTimeout(function() { document.getElementById('spellInput').focus(); }, 100);
}

function checkSpelling() {
    var words = getWordList();
    var w = words[currentIndex];
    if (!w) return;
    var answer = document.getElementById('spellInput').value.trim();
    var correct = w.w.trim();
    var fb = document.getElementById('spellFeedback');
    if (answer.toLowerCase() === correct.toLowerCase()) {
        spellCorrect++;
        fb.textContent = '✅ 正确！ ' + correct;
        fb.className = 'spell-feedback correct';
    } else {
        spellWrong++;
        fb.textContent = '❌ 错误！正确答案: ' + correct;
        fb.className = 'spell-feedback wrong';
    }
    document.getElementById('spellScore').textContent = '✅ ' + spellCorrect + '  ❌ ' + spellWrong;
    saveProgress();
    // Auto advance after 1.5s
    setTimeout(function() { if (currentMode === 'spell') startSpell(); }, 1500);
}

// Enter key triggers spelling check
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && currentMode === 'spell' && document.activeElement === document.getElementById('spellInput')) {
        e.preventDefault();
        checkSpelling();
    }
});

// ========== Voice Input for Spelling ==========
var voiceMediaStream = null, voiceChunks = [], voiceMime = '', voiceRecorder = null, voiceRecording = false, voiceStopTimer = null;
function startVoiceInput(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var micBtn = document.getElementById('micBtn');
    if (voiceRecording) { stopVoiceInput(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        micBtn.textContent = '🚫';
        setTimeout(function() { micBtn.textContent = '🎤'; }, 2000);
        return;
    }
    var mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    voiceMime = mimes.find(function(m) { return window.MediaRecorder.isTypeSupported(m); }) || '';
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        voiceMediaStream = stream;
        voiceChunks = [];
        try {
            voiceRecorder = voiceMime ? new MediaRecorder(stream, { mimeType: voiceMime }) : new MediaRecorder(stream);
        } catch (err) {
            voiceRecorder = new MediaRecorder(stream);
        }
        voiceRecorder.ondataavailable = function(ev) { if (ev.data && ev.data.size > 0) voiceChunks.push(ev.data); };
        voiceRecorder.onstop = function() {
            micBtn.classList.remove('listening');
            voiceRecording = false;
            if (voiceStopTimer) { clearTimeout(voiceStopTimer); voiceStopTimer = null; }
            if (voiceMediaStream) { voiceMediaStream.getTracks().forEach(function(t) { t.stop(); }); voiceMediaStream = null; }
            transcribeVoice().then(function(word) {
                if (word) {
                    document.getElementById('spellInput').value = word;
                    setTimeout(function() { checkSpelling(); }, 300);
                }
            });
        };
        voiceRecorder.start(100);
        voiceRecording = true;
        micBtn.classList.add('listening');
        voiceStopTimer = setTimeout(function() { if (voiceRecording) stopVoiceInput(); }, 5000);
    }).catch(function(err) {
        console.error('getUserMedia error:', err);
        micBtn.textContent = '🚫';
        setTimeout(function() { micBtn.textContent = '🎤'; }, 2000);
    });
}

function stopVoiceInput() {
    if (voiceRecorder && voiceRecorder.state === 'recording') {
        try { voiceRecorder.stop(); } catch (e) {}
    }
}

async function transcribeVoice() {
    if (!voiceChunks.length) return '';
    var blob = new Blob(voiceChunks, { type: voiceMime || 'audio/webm' });
    voiceChunks = [];
    try {
        var wav = await encodeWAV(blob);
        var base64 = await new Promise(function(res) {
            var fr = new FileReader();
            fr.onload = function() { res(fr.result.split(',')[1]); };
            fr.readAsDataURL(wav);
        });
        var r = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: base64 }) });
        var d = await r.json();
        if (d.success && d.text) return String(d.text).trim().replace(/\./g, '').toLowerCase();
    } catch (err) { console.error('Baidu STT error:', err); }
    return '';
}

async function encodeWAV(blob) {
    var buf = await blob.arrayBuffer();
    var actx = new (window.AudioContext || window.webkitAudioContext)();
    var audioBuf = await actx.decodeAudioData(buf);
    var ch = audioBuf.numberOfChannels, len = audioBuf.length, sr = audioBuf.sampleRate;
    var mono = new Float32Array(len);
    for (var c = 0; c < ch; c++) { var cd = audioBuf.getChannelData(c); for (var i = 0; i < len; i++) mono[i] += cd[i] / ch; }
    var targetSr = 16000, ratio = sr / targetSr, outLen = Math.ceil(len / ratio);
    var oac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, outLen, targetSr);
    var srcNode = oac.createBufferSource();
    var bb = oac.createBuffer(1, len, sr);
    bb.getChannelData(0).set(mono);
    srcNode.buffer = bb; srcNode.connect(oac.destination); srcNode.start();
    var rendered = await oac.startRendering();
    var pcm = rendered.getChannelData(0);
    var bl = 44 + pcm.length * 2, buf2 = new ArrayBuffer(bl), dv = new DataView(buf2);
    function ws(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, 'RIFF'); dv.setUint32(4, bl - 8, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, targetSr, true); dv.setUint32(28, targetSr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ws(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
    for (var i = 0, o = 44; i < pcm.length; i++, o += 2) { var smp = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(o, smp < 0 ? smp * 32768 : smp * 32767, true); }
    return new Blob([buf2], { type: 'audio/wav' });
}

// ========== C2: Quiz Mode ==========
function buildQuiz() {
    quizLocked = false;
    // Ensure conflicting panels are hidden
    document.getElementById('cardContent').classList.remove('show');
    document.getElementById('notFound').classList.remove('show');
    document.getElementById('spellPanel').classList.remove('show');
    var words = getWordList();
    if (words.length < 4) {
        document.getElementById('notFound').classList.add('show');
        return;
    }
    // Pick random word (avoid repeats until all words used)
    if (quizUsed.size >= words.length) {
        document.getElementById('quizWord').textContent = '✅ 此难度单词已全部练习';
        document.getElementById('quizOptions').innerHTML = '';
        document.getElementById('quizNextBtn').classList.remove('show');
        return;
    }
    var idx;
    do {
        idx = Math.floor(Math.random() * words.length);
    } while (quizUsed.has(idx));
    quizUsed.add(idx);
    currentIndex = idx;
    quizAnswerIdx = -1;
    var correctWord = words[idx];

    // Get 3 random wrong definitions
    var usedIndices = new Set([idx]);
    var wrongDefs = [];
    while (wrongDefs.length < 3) {
        var ri = Math.floor(Math.random() * words.length);
        if (usedIndices.has(ri)) continue;
        usedIndices.add(ri);
        var def = (words[ri].d || '').replace(/<[^>]*>/g, '').substring(0, 40);
        if (!def) def = words[ri].c || '';
        if (def) wrongDefs.push(def);
    }

    // Build options: correct + 3 wrong, shuffled
    var correctDef = (correctWord.d || '').replace(/<[^>]*>/g, '').substring(0, 50);
    if (!correctDef) correctDef = correctWord.c || '';
    var options = [correctDef].concat(wrongDefs);
    quizAnswerIdx = 0; // correct is at index 0 before shuffle
    // Fisher-Yates shuffle
    for (var i = options.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
        if (quizAnswerIdx === i) quizAnswerIdx = j;
        else if (quizAnswerIdx === j) quizAnswerIdx = i;
    }

    document.getElementById('quizWord').textContent = correctWord.w;
    var optsHtml = '';
    for (var k = 0; k < options.length; k++) {
        optsHtml += '<div class=\"quiz-option\" onclick=\"pickQuizOption(' + k + ')\">' + options[k] + '</div>';
    }
    document.getElementById('quizOptions').innerHTML = optsHtml;
    document.getElementById('quizNextBtn').classList.remove('show');
    document.getElementById('quizPanel').classList.add('show');
    document.getElementById('progressText').textContent = '单词 ' + (idx + 1) + ' / ' + words.length;
    if (typeof fsApply === 'function') fsApply();
    // 6秒未选择答案则自动跳到下一题
    if (quizTimer) clearTimeout(quizTimer);
    quizTimer = setTimeout(function() {
        if (currentMode === 'quiz' && !quizLocked) {
            quizLocked = true;
            buildQuiz();
        }
    }, 6000);
}

function pickQuizOption(pickedIdx) {
    if (quizLocked) return;
    quizLocked = true;
    if (quizTimer) clearTimeout(quizTimer);
    var options = document.querySelectorAll('#quizOptions .quiz-option');
    // Highlight picked
    if (pickedIdx === quizAnswerIdx) {
        options[pickedIdx].classList.add('correct-pick');
        quizCorrect++;
        updateQuizScore();
        saveProgress();
        // Auto advance after short delay
        setTimeout(function() { if (currentMode === 'quiz') buildQuiz(); }, 600);
    } else {
        options[pickedIdx].classList.add('wrong-pick');
        options[quizAnswerIdx].classList.add('reveal-correct');
        quizWrong++;
        quizWrongWords.push(document.getElementById('quizWord').textContent);
        updateQuizScore();
        document.getElementById('quizNextBtn').classList.add('show');
        saveProgress();
    }
}

function nextQuizWord() {
    if (currentMode === 'quiz') buildQuiz();
}

function updateQuizScore() {
    var total = getWordList().length;
    var statEl = document.getElementById('quizStat');
    if (statEl) statEl.innerHTML = statHtml(quizCorrect, quizWrong, total);
    var btn = document.getElementById('quizWrongBtn');
    if (btn) {
        if (quizWrongWords.length > 0) {
            btn.style.display = '';
            btn.textContent = '错词库 ' + quizWrongWords.length;
        } else {
            btn.style.display = 'none';
        }
    }
}

// ========== C3: Battle Mode (Local Split-Screen) ==========
let battleScore1 = 0, battleScore2 = 0;
let battleP1Done = false, battleP2Done = false;
let battleAnswerIdx1 = -1, battleAnswerIdx2 = -1;
let battleUsed = new Set();
let battleTimer = null;
let battleWrong1 = 0, battleWrong2 = 0;
let multiScoreA = 0, multiScoreB = 0, multiScoreC = 0, multiScoreD = 0;
let multiDoneA = false, multiDoneB = false, multiDoneC = false, multiDoneD = false;
let multiAnswerIdxA = -1, multiAnswerIdxB = -1, multiAnswerIdxC = -1, multiAnswerIdxD = -1;
let multiUsed = new Set();
let multiTimer = null;
let multiWrongA = 0, multiWrongB = 0, multiWrongC = 0, multiWrongD = 0;
let raceScoreA = 0, raceScoreB = 0, raceScoreC = 0, raceScoreD = 0;
let raceDoneA = false, raceDoneB = false, raceDoneC = false, raceDoneD = false;
let raceAnswerIdxA = -1, raceAnswerIdxB = -1, raceAnswerIdxC = -1, raceAnswerIdxD = -1;
let raceUsedA = new Set(), raceUsedB = new Set(), raceUsedC = new Set(), raceUsedD = new Set();
let raceTimerA = null, raceTimerB = null, raceTimerC = null, raceTimerD = null;
let raceWrongA = 0, raceWrongB = 0, raceWrongC = 0, raceWrongD = 0;
let raceWrongWordsA = [], raceWrongWordsB = [], raceWrongWordsC = [], raceWrongWordsD = [];

function startBattle() {
    var words = getWordList();
    if (words.length < 4) { document.getElementById('notFound').classList.add('show'); return; }
    // 避免同一单词重复出现：从本轮未用过的词中随机选取
    if (battleUsed.size >= words.length) {
        document.getElementById('battleResult').textContent = '✅ 此难度单词已全部练习';
        document.getElementById('battleResult').className = 'battle-result';
        document.getElementById('battleOptions1').innerHTML = '';
        document.getElementById('battleOptions2').innerHTML = '';
        document.getElementById('battleWord1').textContent = '';
        document.getElementById('battleWord2').textContent = '';
        return;
    }
    var idx;
    do {
        idx = Math.floor(Math.random() * words.length);
    } while (battleUsed.has(idx));
    battleUsed.add(idx);
    currentIndex = idx;
    battleP1Done = false; battleP2Done = false;
    var w = words[idx];
    var correctDef = (w.d || '').replace(/<[^>]*>/g, '').substring(0, 50);
    if (!correctDef) correctDef = w.c || '';

    // Generate 3 wrong definitions
    var used = new Set([idx]);
    var wrongs = [];
    while (wrongs.length < 3) {
        var ri = Math.floor(Math.random() * words.length);
        if (used.has(ri)) continue;
        used.add(ri);
        var def = (words[ri].d || '').replace(/<[^>]*>/g, '').substring(0, 40);
        if (!def) def = words[ri].c || '';
        if (def) wrongs.push(def);
    }

    // Player 1 options (shuffled)
    var opts1 = [correctDef].concat([...wrongs]);
    battleAnswerIdx1 = 0;
    shuffleOptions(opts1, function(newIdx) { battleAnswerIdx1 = newIdx; });

    // Player 2 options (differently shuffled)
    var opts2 = [correctDef].concat([...wrongs]);
    battleAnswerIdx2 = 0;
    shuffleOptions(opts2, function(newIdx) { battleAnswerIdx2 = newIdx; });

    // Render
    document.getElementById('battleWord1').textContent = w.w;
    document.getElementById('battleWord2').textContent = w.w;
    renderBattleOptions('battleOptions1', opts1, 1);
    renderBattleOptions('battleOptions2', opts2, 2);
    if (typeof fsApply === 'function') fsApply();
    document.getElementById('battleResult').textContent = '';
    document.getElementById('battleResult').className = 'battle-result';
    document.getElementById('battlePanel').classList.add('show');
    document.getElementById('progressText').textContent = '单词 ' + (idx + 1) + ' / ' + words.length;
    updateBattleStats();
    // 6秒无人作答则自动跳到下一个单词
    if (battleTimer) clearTimeout(battleTimer);
    battleTimer = setTimeout(function() {
        if (currentMode === 'battle') {
            battleP1Done = true; battleP2Done = true;
            battleWrong1++; battleWrong2++;
            updateBattleStats();
            startBattle();
        }
    }, 6000);
}

function shuffleOptions(arr, setCorrectIdx) {
    var correctIdx = 0; // correct is at index 0 before shuffle
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        if (correctIdx === i) correctIdx = j;
        else if (correctIdx === j) correctIdx = i;
    }
    setCorrectIdx(correctIdx);
}

function renderBattleOptions(containerId, options, player) {
    var html = '';
    for (var k = 0; k < options.length; k++) {
        html += '<div class=\"battle-option\" onpointerup=\"pickBattleOption(' + k + ',' + player + ')\">' + options[k] + '</div>';
    }
    document.getElementById(containerId).innerHTML = html;
}

function pickBattleOption(pickedIdx, player) {
    // Prevent double-click by same player
    if (player === 1) { if (battleP1Done) return; battleP1Done = true; }
    else { if (battleP2Done) return; battleP2Done = true; }
    // 有人作答，清除6秒超时
    if (battleTimer) { clearTimeout(battleTimer); battleTimer = null; }

    var correctIdx = (player === 1) ? battleAnswerIdx1 : battleAnswerIdx2;
    var containerId = (player === 1) ? 'battleOptions1' : 'battleOptions2';
    var options = document.querySelectorAll('#' + containerId + ' .battle-option');
    var otherContainerId = (player === 1) ? 'battleOptions2' : 'battleOptions1';
    var isCorrect = (pickedIdx === correctIdx);

    if (isCorrect) {
        options[pickedIdx].classList.add('correct-pick');
        if (player === 1) { battleScore1++; }
        else { battleScore2++; }
        // Someone won: lock both sides, reveal correct for other player
        document.querySelectorAll('#battleOptions1 .battle-option, #battleOptions2 .battle-option').forEach(function(o) {
            o.classList.add('locked');
        });
        var otherCorrect = (player === 1) ? battleAnswerIdx2 : battleAnswerIdx1;
        document.querySelectorAll('#' + otherContainerId + ' .battle-option')[otherCorrect].classList.add('reveal-correct');
        updateBattleStats();
        saveProgress();
        setTimeout(function() { if (currentMode === 'battle') startBattle(); }, 1500);
    } else {
        // Wrong: lock only this player, other can still try
        options[pickedIdx].classList.add('wrong-pick');
        document.querySelectorAll('#' + containerId + ' .battle-option').forEach(function(o) {
            o.classList.add('locked');
        });
        if (player === 1) { battleWrong1++; } else { battleWrong2++; }
        updateBattleStats();
        saveProgress();
        // If both players got wrong, reveal correct and end round
        if (battleP1Done && battleP2Done) {
            document.querySelectorAll('#battleOptions1 .battle-option')[battleAnswerIdx1].classList.add('reveal-correct');
            document.querySelectorAll('#battleOptions2 .battle-option')[battleAnswerIdx2].classList.add('reveal-correct');
            setTimeout(function() { if (currentMode === 'battle') startBattle(); }, 2000);
        }
    }
}

// ========== C3b: 多战模式（4人） ==========
function startMulti() {
    var words = getWordList();
    if (words.length < 4) { document.getElementById('notFound').classList.add('show'); return; }
    if (multiUsed.size >= words.length) {
        // 本轮单词已全部练习完成
        document.getElementById('multiResult').textContent = '✅ 此难度单词已全部练习';
        document.getElementById('multiResult').className = 'multi-result';
        ['A','B','C','D'].forEach(function(p) {
            document.getElementById('multiOptions' + p).innerHTML = '';
            document.getElementById('multiWord' + p).textContent = '';
        });
        return;
    }
    var idx;
    do { idx = Math.floor(Math.random() * words.length); } while (multiUsed.has(idx));
    multiUsed.add(idx);
    currentIndex = idx;
    multiDoneA = false; multiDoneB = false; multiDoneC = false; multiDoneD = false;
    var w = words[idx];
    var correctDef = (w.d || '').replace(/<[^>]*>/g, '').substring(0, 50);
    if (!correctDef) correctDef = w.c || '';

    var used = new Set([idx]);
    var wrongs = [];
    while (wrongs.length < 3) {
        var ri = Math.floor(Math.random() * words.length);
        if (used.has(ri)) continue;
        used.add(ri);
        var def = (words[ri].d || '').replace(/<[^>]*>/g, '').substring(0, 40);
        if (!def) def = words[ri].c || '';
        if (def) wrongs.push(def);
    }

    var players = ['A', 'B', 'C', 'D'];
    var answerMap = {};
    for (var i = 0; i < players.length; i++) {
        var p = players[i];
        var opts = [correctDef].concat([...wrongs]);
        var correctIdx = 0;
        for (var j = opts.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var tmp = opts[j]; opts[j] = opts[k]; opts[k] = tmp;
            if (correctIdx === j) correctIdx = k;
            else if (correctIdx === k) correctIdx = j;
        }
        answerMap[p] = correctIdx;
        renderMultiOptions('multiOptions' + p, opts, p);
    }
    multiAnswerIdxA = answerMap.A;
    multiAnswerIdxB = answerMap.B;
    multiAnswerIdxC = answerMap.C;
    multiAnswerIdxD = answerMap.D;

    document.getElementById('multiWordA').textContent = w.w;
    document.getElementById('multiWordB').textContent = w.w;
    document.getElementById('multiWordC').textContent = w.w;
    document.getElementById('multiWordD').textContent = w.w;
    if (typeof fsApply === 'function') fsApply();
    document.getElementById('multiResult').textContent = '';
    document.getElementById('multiResult').className = 'multi-result';
    document.getElementById('multiPanel').classList.add('show');
    document.getElementById('progressText').textContent = '单词 ' + (idx + 1) + ' / ' + words.length;
    updateMultiStats();
    // 6秒无人作答则自动跳到下一个单词
    if (multiTimer) clearTimeout(multiTimer);
    multiTimer = setTimeout(function() {
        if (currentMode === 'multi') {
            multiDoneA = true; multiDoneB = true; multiDoneC = true; multiDoneD = true;
            multiWrongA++; multiWrongB++; multiWrongC++; multiWrongD++;
            updateMultiStats();
            startMulti();
        }
    }, 6000);
}

function renderMultiOptions(containerId, options, player) {
    var html = '';
    for (var k = 0; k < options.length; k++) {
        html += '<div class="multi-option" onpointerup="pickMultiOption(' + k + ',\'' + player + '\')">' + options[k] + '</div>';
    }
    document.getElementById(containerId).innerHTML = html;
}

function pickMultiOption(pickedIdx, player) {
    if (player === 'A') { if (multiDoneA) return; multiDoneA = true; }
    else if (player === 'B') { if (multiDoneB) return; multiDoneB = true; }
    else if (player === 'C') { if (multiDoneC) return; multiDoneC = true; }
    else { if (multiDoneD) return; multiDoneD = true; }
    // 有人作答，清除6秒超时
    if (multiTimer) { clearTimeout(multiTimer); multiTimer = null; }

    var correctIdxMap = { A: multiAnswerIdxA, B: multiAnswerIdxB, C: multiAnswerIdxC, D: multiAnswerIdxD };
    var containerId = 'multiOptions' + player;
    var options = document.querySelectorAll('#' + containerId + ' .multi-option');
    var correctIdx = correctIdxMap[player];
    var isCorrect = (pickedIdx === correctIdx);

    if (isCorrect) {
        options[pickedIdx].classList.add('correct-pick');
        if (player === 'A') multiScoreA++;
        else if (player === 'B') multiScoreB++;
        else if (player === 'C') multiScoreC++;
        else multiScoreD++;
        ['A','B','C','D'].forEach(function(p) {
            document.querySelectorAll('#multiOptions' + p + ' .multi-option').forEach(function(o) { o.classList.add('locked'); });
        });
        ['A','B','C','D'].forEach(function(p) {
            if (p !== player) {
                document.querySelectorAll('#multiOptions' + p + ' .multi-option')[correctIdxMap[p]].classList.add('reveal-correct');
            }
        });
        updateMultiStats();
        saveProgress();
        setTimeout(function() { if (currentMode === 'multi') startMulti(); }, 1500);
    } else {
        options[pickedIdx].classList.add('wrong-pick');
        document.querySelectorAll('#' + containerId + ' .multi-option').forEach(function(o) { o.classList.add('locked'); });
        if (player === 'A') multiWrongA++;
        else if (player === 'B') multiWrongB++;
        else if (player === 'C') multiWrongC++;
        else multiWrongD++;
        updateMultiStats();
        saveProgress();
        if (multiDoneA && multiDoneB && multiDoneC && multiDoneD) {
            ['A','B','C','D'].forEach(function(p) {
                document.querySelectorAll('#multiOptions' + p + ' .multi-option')[correctIdxMap[p]].classList.add('reveal-correct');
            });
            setTimeout(function() { if (currentMode === 'multi') startMulti(); }, 2000);
        }
    }
}

// ========== C3b: 多赛模式（4人独立） ==========
function raceUsedSet(player) { if (player === 'A') return raceUsedA; if (player === 'B') return raceUsedB; if (player === 'C') return raceUsedC; return raceUsedD; }
function getRaceDone(player) { if (player === 'A') return raceDoneA; if (player === 'B') return raceDoneB; if (player === 'C') return raceDoneC; return raceDoneD; }
function setRaceDone(player, val) { if (player === 'A') raceDoneA = val; else if (player === 'B') raceDoneB = val; else if (player === 'C') raceDoneC = val; else raceDoneD = val; }
function getRaceAnswerIdx(player) { if (player === 'A') return raceAnswerIdxA; if (player === 'B') return raceAnswerIdxB; if (player === 'C') return raceAnswerIdxC; return raceAnswerIdxD; }
function setRaceAnswerIdx(player, val) { if (player === 'A') raceAnswerIdxA = val; else if (player === 'B') raceAnswerIdxB = val; else if (player === 'C') raceAnswerIdxC = val; else raceAnswerIdxD = val; }
function raceScoreAdd(player) { if (player === 'A') raceScoreA++; else if (player === 'B') raceScoreB++; else if (player === 'C') raceScoreC++; else raceScoreD++; }
function raceWrongAdd(player) { if (player === 'A') raceWrongA++; else if (player === 'B') raceWrongB++; else if (player === 'C') raceWrongC++; else raceWrongD++; }
function getRaceWrongWords(player) { if (player === 'A') return raceWrongWordsA; if (player === 'B') return raceWrongWordsB; if (player === 'C') return raceWrongWordsC; return raceWrongWordsD; }
function raceWrongWordAdd(player, word) { if (word) getRaceWrongWords(player).push(word); }
function getRaceTimer(player) { if (player === 'A') return raceTimerA; if (player === 'B') return raceTimerB; if (player === 'C') return raceTimerC; return raceTimerD; }
function setRaceTimer(player, val) { if (player === 'A') raceTimerA = val; else if (player === 'B') raceTimerB = val; else if (player === 'C') raceTimerC = val; else raceTimerD = val; }
function clearRaceTimer(player) { var t = getRaceTimer(player); if (t) { clearTimeout(t); setRaceTimer(player, null); } }

function startRace() {
    var words = getWordList();
    if (words.length < 4) { document.getElementById('notFound').classList.add('show'); return; }
    document.getElementById('raceResult').textContent = '';
    document.getElementById('raceResult').className = 'race-result';
    document.getElementById('racePanel').classList.add('show');
    updateRaceStats();
    ['A','B','C','D'].forEach(function(p) { advanceRacePlayer(p); });
}

function advanceRacePlayer(player) {
    var words = getWordList();
    var usedSet = raceUsedSet(player);
    if (usedSet.size >= words.length) {
        document.getElementById('raceWord' + player).textContent = '';
        document.getElementById('raceOptions' + player).innerHTML = '<div class="race-option" style="cursor:default;border-style:dashed;color:#999">✅ 已全部完成</div>';
        setRaceDone(player, true);
        return;
    }
    var idx;
    do { idx = Math.floor(Math.random() * words.length); } while (usedSet.has(idx));
    usedSet.add(idx);
    var w = words[idx];
    var correctDef = (w.d || '').replace(/<[^>]*>/g, '').substring(0, 50);
    if (!correctDef) correctDef = w.c || '';
    var used = new Set([idx]);
    var wrongs = [];
    while (wrongs.length < 3) {
        var ri = Math.floor(Math.random() * words.length);
        if (used.has(ri)) continue;
        used.add(ri);
        var def = (words[ri].d || '').replace(/<[^>]*>/g, '').substring(0, 40);
        if (!def) def = words[ri].c || '';
        if (def) wrongs.push(def);
    }
    var opts = [correctDef].concat([...wrongs]);
    var correctIdx = 0;
    for (var j = opts.length - 1; j > 0; j--) {
        var k = Math.floor(Math.random() * (j + 1));
        var tmp = opts[j]; opts[j] = opts[k]; opts[k] = tmp;
        if (correctIdx === j) correctIdx = k;
        else if (correctIdx === k) correctIdx = j;
    }
    setRaceAnswerIdx(player, correctIdx);
    setRaceDone(player, false);
    document.getElementById('raceWord' + player).textContent = w.w;
    renderRaceOptions('raceOptions' + player, opts, player);
    // 该玩家6秒未作答：先显示正确选项1秒，再自动切换
    clearRaceTimer(player);
    setRaceTimer(player, setTimeout(function() {
        if (currentMode === 'race' && !getRaceDone(player)) {
            setRaceDone(player, true);
            raceWrongAdd(player);
            raceWrongWordAdd(player, w.w);
            updateRaceStats();
            var cIdx = getRaceAnswerIdx(player);
            var opts = document.querySelectorAll('#raceOptions' + player + ' .race-option');
            if (opts[cIdx]) opts[cIdx].classList.add('reveal-correct');
            opts.forEach(function(o) { o.classList.add('locked'); });
            setTimeout(function() {
                if (currentMode === 'race') advanceRacePlayer(player);
            }, 1000);
        }
    }, 6000));
}

function renderRaceOptions(containerId, options, player) {
    var html = '';
    for (var k = 0; k < options.length; k++) {
        html += '<div class="race-option" onpointerup="pickRaceOption(' + k + ',\'' + player + '\')">' + options[k] + '</div>';
    }
    document.getElementById(containerId).innerHTML = html;
    if (typeof fsApply === 'function') fsApply();
}

function pickRaceOption(pickedIdx, player) {
    if (getRaceDone(player)) return;
    setRaceDone(player, true);
    clearRaceTimer(player);
    var correctIdx = getRaceAnswerIdx(player);
    var options = document.querySelectorAll('#raceOptions' + player + ' .race-option');
    var isCorrect = (pickedIdx === correctIdx);
    if (isCorrect) {
        options[pickedIdx].classList.add('correct-pick');
        raceScoreAdd(player);
        updateRaceStats();
        saveProgress();
        options.forEach(function(o) { o.classList.add('locked'); });
        setTimeout(function() { if (currentMode === 'race') advanceRacePlayer(player); }, 800);
    } else {
        options[pickedIdx].classList.add('wrong-pick');
        options[correctIdx].classList.add('reveal-correct');
        raceWrongAdd(player);
        raceWrongWordAdd(player, document.getElementById('raceWord' + player).textContent);
        updateRaceStats();
        saveProgress();
        options.forEach(function(o) { o.classList.add('locked'); });
        setTimeout(function() { if (currentMode === 'race') advanceRacePlayer(player); }, 1200);
    }
}

// ===== 对战/多战/多赛 每玩家统计 =====
function statHtml(correct, wrong, total) {
    var answered = correct + wrong;
    var acc = answered > 0 ? Math.round(correct / answered * 100) : 0;
    return '<span class="st">'
        + '<span class="st-ok">✓' + correct + '</span> '
        + '<span class="st-bad">✗' + wrong + '</span> '
        + '<span class="st-total">/' + total + '</span> '
        + '<span class="st-acc">' + acc + '%</span>'
        + '</span>';
}
function updateBattleStats() {
    var total = getWordList().length;
    var el1 = document.getElementById('battleStat1');
    var el2 = document.getElementById('battleStat2');
    if (el1) el1.innerHTML = statHtml(battleScore1, battleWrong1, total);
    if (el2) el2.innerHTML = statHtml(battleScore2, battleWrong2, total);
}
function updateMultiStats() {
    var total = getWordList().length;
    [['multiStatA', multiScoreA, multiWrongA],
     ['multiStatB', multiScoreB, multiWrongB],
     ['multiStatC', multiScoreC, multiWrongC],
     ['multiStatD', multiScoreD, multiWrongD]].forEach(function(p) {
        var el = document.getElementById(p[0]);
        if (el) el.innerHTML = statHtml(p[1], p[2], total);
    });
}
function updateRaceStats() {
    var total = getWordList().length;
    [['raceStatA', 'A', raceScoreA, raceWrongA],
     ['raceStatB', 'B', raceScoreB, raceWrongB],
     ['raceStatC', 'C', raceScoreC, raceWrongC],
     ['raceStatD', 'D', raceScoreD, raceWrongD]].forEach(function(p) {
        var el = document.getElementById(p[0]);
        if (el) {
            var wrongCount = getRaceWrongWords(p[1]).length;
            var btn = wrongCount > 0 ? ' <button class="wrong-word-btn" type="button" onclick="showRaceWrongWords(\'' + p[1] + '\')">错词库 ' + wrongCount + '</button>' : '';
            el.innerHTML = statHtml(p[2], p[3], total) + btn;
        }
    });
}

// ===== 错词库弹窗：状态 + 工具函数 =====
var wwLabel = '';
var wwDocTitle = '';
var wwWords = [];
var wwEssay = '';
var wwTranslation = '';
var wwFontSize = 16;

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
}

function highlightWrongWords(text, words, inline) {
    var html = escapeHtml(text);
    var sorted = words.slice().sort(function(a, b) { return b.length - a.length; });
    var patterns = sorted.map(function(w) {
        return '\\b' + String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b';
    });
    if (!patterns.length) return html;
    var re = new RegExp('(' + patterns.join('|') + ')', 'gi');
    html = html.replace(re, function(m) {
        return inline ? '<span style="color:#c62828;font-weight:700;text-decoration:underline">' + m + '</span>' : '<span class="essay-word">' + m + '</span>';
    });
    return html;
}

function adjustEssayFont(delta) {
    var isLarge = window.matchMedia('(min-width: 900px)').matches;
    var minFs = isLarge ? 20 : 14;
    wwFontSize = Math.max(minFs, Math.min(60, wwFontSize + delta));
    var panel = document.querySelector('.wrong-word-panel');
    if (panel) panel.style.fontSize = wwFontSize + 'px';
}

function findWordPhonetic(word) {
    var words = getWordList();
    for (var i = 0; i < words.length; i++) {
        if (words[i].w === word) return words[i].p || '';
    }
    return '';
}

function speakEssay() {
    if (wwEssay) speakWithTTS(wwEssay);
}

function speakAllWrongWords() {
    if (wwWords && wwWords.length) speakWithTTS(wwWords.join(', '));
}

function toggleTranslation() {
    var el = document.getElementById('wwTranslationBox');
    var btn = document.querySelector('.translation-toggle');
    if (!el) return;
    if (el.style.display === 'none') {
        el.style.display = '';
        if (btn) btn.textContent = '收起译文 ▴';
    } else {
        el.style.display = 'none';
        if (btn) btn.textContent = '展开译文 ▾';
    }
}

async function generateEssayForWrongWords() {
    var btn = document.querySelector('.gen-essay-btn');
    var box = document.getElementById('wwEssay');
    if (!box || !wwWords.length) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中…'; }
    box.style.display = '';
    box.innerHTML = '<div class="essay-loading">正在用 DeepSeek 生成短文…</div>';
    try {
        var n = wwWords.length;
        var userMsg = n === 1
            ? 'Write ONE natural, grammatically correct English sentence (suitable for high school level) that uses this word/phrase: ' + wwWords[0] + '. Output ONLY the sentence itself — no explanation, no quotation marks.'
            : 'Write a short coherent English passage (no more than 200 words, roughly ' + n + ' sentences) that naturally incorporates ALL of these words/phrases: ' + wwWords.join(', ') + '. The passage should be suitable for high school (高中) level, grammatically correct, meaningful, and read naturally. Output ONLY the passage itself — no title, no explanation, no markdown code fences, no surrounding quotation marks.';
        var r = await fetch('/api/deepseek/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: 'You are an English teacher creating study materials for Chinese high school students.' },
                    { role: 'user', content: userMsg }
                ],
                temperature: 0.7,
                max_tokens: 1500
            })
        });
        var d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
        var text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '')
            .replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
        if (!text) throw new Error('empty response');
        wwEssay = text;
        // 生成中文译文
        wwTranslation = '';
        try {
            var tr = await fetch('/api/deepseek/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: 'You are a translator. Translate English to natural, fluent Chinese suitable for Chinese high school students.' },
                        { role: 'user', content: 'Translate the following English passage into natural Chinese (keep the meaning and style). Output ONLY the Chinese translation, no explanation:\n\n' + text }
                    ],
                    temperature: 0.3,
                    max_tokens: 1500
                })
            });
            var td = await tr.json();
            if (tr.ok && td.choices && td.choices[0] && td.choices[0].message) {
                wwTranslation = (td.choices[0].message.content || '').replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
            }
        } catch (e) {
            console.error('Translation error:', e);
        }
        var translationHtml = wwTranslation
            ? '<div class="translation-toggle" onclick="toggleTranslation()">展开译文 ▾</div>'
              + '<div class="translation-container" id="wwTranslationBox" style="display:none"><div class="translation-text">' + escapeHtml(wwTranslation).replace(/\n/g, '<br>') + '</div></div>'
            : '';
        box.innerHTML = '<div class="essay-title">📖 融入错词的短文 <button class="essay-speak" type="button" onclick="speakEssay()" title="朗读短文">🔊</button></div>'
            + '<div class="essay-text">' + highlightWrongWords(text, wwWords, false) + '</div>'
            + translationHtml;
        var dl = document.getElementById('wwDownloadBtn');
        if (dl) dl.style.display = '';
    } catch (e) {
        console.error('Essay generation error:', e);
        box.innerHTML = '<div class="essay-error">生成失败，请重试。' + escapeHtml(e.message || '') + '</div>';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = wwEssay ? '🔄 重新生成短文' : '✨ 生成短文'; }
    }
}

function downloadWrongWordsDoc() {
    var d = new Date();
    var dateStr = '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var title = wwDocTitle || '错词';
    var wordsHtml = wwWords.map(function(w, i) {
        return '<p style="font-size:12pt;color:#c62828;margin:4pt 0">' + (i + 1) + '. ' + escapeHtml(w) + '</p>';
    }).join('');
    var essayHtml = '';
    if (wwEssay) {
        essayHtml = '<h3 style="font-size:13pt">融入错词的短文</h3><p style="font-size:12pt;text-align:justify;line-height:1.6">' + highlightWrongWords(wwEssay, wwWords, true) + '</p>';
    }
    var translationHtml = '';
    if (wwTranslation) {
        translationHtml = '<h3 style="font-size:13pt">中文译文</h3><p style="font-size:12pt;text-align:justify;line-height:1.6">' + escapeHtml(wwTranslation).replace(/\n/g, '<br>') + '</p>';
    }
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
        + '<head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title></head>'
        + '<body style="font-family:Arial,sans-serif">'
        + '<h1 style="font-size:16pt">' + escapeHtml(title) + '</h1>'
        + '<h3 style="font-size:13pt">错词列表</h3>'
        + wordsHtml
        + essayHtml
        + translationHtml
        + '</body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/msword' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = dateStr + ' ' + title + '.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function showWrongWords(words, label, docTitle) {
    wwWords = words;
    wwLabel = label;
    wwDocTitle = docTitle;
    wwEssay = '';
    wwTranslation = '';
    wwFontSize = 16;
    var listHtml = '';
    if (!wwWords.length) {
        listHtml = '<div class="wrong-word-empty">本轮没有答错的词汇 🎉</div>';
    } else {
        listHtml = wwWords.map(function(w, i) {
            var ph = findWordPhonetic(w);
            return '<div class="wrong-word-item">'
                + '<span class="wrong-word-num">' + (i + 1) + '.</span>'
                + '<span class="wrong-word-text">' + escapeHtml(w) + '</span>'
                + (ph ? '<span class="wrong-word-phonetic">' + escapeHtml(ph) + '</span>' : '')
                + '<button class="wrong-word-speak" type="button" data-word="' + escapeHtml(w) + '" onclick="speakWithTTS(this.dataset.word)" title="发音">🔊</button>'
                + '</div>';
        }).join('');
    }
    var overlay = document.createElement('div');
    overlay.className = 'wrong-word-overlay';
    overlay.innerHTML = '<div class="wrong-word-panel">'
        + '<div class="wrong-word-head"><span>' + wwLabel + ' · 错词库</span>'
        + '<div class="wrong-word-head-actions">'
        + '<button class="font-adjust-btn" type="button" onclick="speakAllWrongWords()" title="朗读全部错词">🔊</button>'
        + '<button class="font-adjust-btn" type="button" onclick="adjustEssayFont(-2)" title="缩小字号">A−</button>'
        + '<button class="font-adjust-btn" type="button" onclick="adjustEssayFont(2)" title="放大字号">A+</button>'
        + '<button class="wrong-word-close" type="button">✕</button>'
        + '</div></div>'
        + '<div class="wrong-word-body">'
        + '<div class="wrong-word-list" id="wwList">' + listHtml + '</div>'
        + (wwWords.length ? '<button class="gen-essay-btn" type="button" onclick="generateEssayForWrongWords()">✨ 生成短文</button>' : '')
        + '<div class="essay-container" id="wwEssay" style="display:none"></div>'
        + '</div>'
        + '<button class="download-btn" id="wwDownloadBtn" type="button" style="display:none" onclick="downloadWrongWordsDoc()">⬇ 下载 Word</button>'
        + '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.wrong-word-close').addEventListener('click', function() { overlay.remove(); });
    document.body.appendChild(overlay);
    var panel = overlay.querySelector('.wrong-word-panel');
    if (panel) {
        var fs = parseFloat(window.getComputedStyle(panel).fontSize);
        wwFontSize = isNaN(fs) ? 16 : fs;
    }
}

function showRaceWrongWords(player) {
    showWrongWords(getRaceWrongWords(player), '👤 玩家' + player, '多赛错词 - 玩家' + player);
}

function showQuizWrongWords() {
    showWrongWords(quizWrongWords, '📝 选择题', '选择题错词');
}

// ========== C4: Online Battle (Supabase REST API - Multiplayer) ==========
var SUPABASE_URL = "https://ovyhuvtxvenggyoiybwu.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92eWh1dnR4dmVuZ2d5b2l5Ynd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNTU5NjUsImV4cCI6MjEwMTgzMTk2NX0.VdxSF6zpR54tQ-sZWUxQbCnf1SYKxVsbtbg-wOrpTzI";
var onlineRoomCode = "";
var onlinePlayerId = "";
var onlineMyScore = 0;
var onlineAnswerIdx = -1;
var onlineDone = false;
var onlinePollTimer = null;
var onlineNextScheduled = false;
var onlinePlayerCount = 0;
var onlineLastWord = '';
var onlineWordStartTime = 0;
var onlineTimeoutFired = false;

function supabaseHeaders() { return { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }; }
function randomPlayerId() { return "p_" + Math.random().toString(36).slice(2, 8); }

function createOnlineRoom() {
    var code = "";
    for (var i = 0; i < 6; i++) { code += Math.floor(Math.random() * 10); }
    onlineRoomCode = code;
    onlinePlayerId = "host_" + randomPlayerId();
    onlineMyScore = 0;
    onlinePlayerCount = 1;
    var scores = {}; scores[onlinePlayerId] = 0;
    fetch("/api/supabase/rooms", { method: "POST", headers: supabaseHeaders(),
        body: JSON.stringify({ code: code, status: "waiting", scores_json: JSON.stringify(scores), player_count: 1, level: currentLevel })
    }).then(function(r) {
        if (!r.ok) return r.text().then(function(t) { throw new Error(t); });
        return r.text().then(function(t) { return t ? JSON.parse(t) : null; });
    }).then(function() {
        document.getElementById("onlineRoomCode").textContent = "🏠 房间: " + code;
        document.getElementById("onlineMyScore").textContent = "0";
        document.getElementById("onlineOppScore").textContent = "0人";
        document.getElementById("onlineRoomUI").style.display = "none";
        document.getElementById("onlineGameUI").style.display = "";
        document.getElementById("onlineGameMsg").textContent = "你是房主 | 等待玩家加入... 房间号: " + code;
        startOnlinePoll();
    }).catch(function(err) {
        document.getElementById("onlineMsg").textContent = "创建失败: " + (err.message || "未知错误");
        document.getElementById("onlineMsg").className = "online-msg error";
    });
}

function joinOnlineRoom() {
    var code = document.getElementById("joinCodeInput").value.trim();
    if (code.length !== 6) { document.getElementById("onlineMsg").textContent = "请输入6位房间号"; document.getElementById("onlineMsg").className = "online-msg error"; return; }
    fetch("/api/supabase/rooms?code=eq." + code, { headers: supabaseHeaders() }).then(function(r) { return r.json(); }).then(function(data) {
        if (!data || data.length === 0) { document.getElementById("onlineMsg").textContent = "房间不存在"; document.getElementById("onlineMsg").className = "online-msg error"; return; }
        var room = data[0];
        onlineRoomCode = code;
        onlinePlayerId = randomPlayerId();
        onlineMyScore = 0;
        onlinePlayerCount = (room.player_count || 1) + 1;
        var scores; try { scores = JSON.parse(room.scores_json || "{}"); } catch(e) { scores = {}; }
        onlineMyScore = scores[onlinePlayerId] || 0;
        scores[onlinePlayerId] = onlineMyScore;
        document.getElementById("onlineRoomCode").textContent = "房间: " + code;
        document.getElementById("onlineMyScore").textContent = "0";
        document.getElementById("onlineOppScore").textContent = "0人";
        document.getElementById("onlineRoomUI").style.display = "none";
        document.getElementById("onlineGameUI").style.display = "";
        document.getElementById("onlineGameMsg").textContent = "已加入房间 " + code + "（第" + onlinePlayerCount + "位玩家）";
        fetch("/api/supabase/rooms?code=eq." + code, { method: "PATCH", headers: supabaseHeaders(),
            body: JSON.stringify({ scores_json: JSON.stringify(scores), player_count: onlinePlayerCount, status: "playing" })
        }).then(function() { startOnlinePoll(); });
    });
}

function startOnlinePoll() {
    if (onlinePollTimer) clearInterval(onlinePollTimer);
    onlinePollTimer = setInterval(function() {
        if (!onlineRoomCode) { clearInterval(onlinePollTimer); return; }
        fetch("/api/supabase/rooms?code=eq." + onlineRoomCode, { headers: supabaseHeaders() }).then(function(r) { return r.json(); }).then(function(data) {
            if (!data || data.length === 0) return;
            var room = data[0];
            var scores; try { scores = JSON.parse(room.scores_json || "{}"); } catch(e) { scores = {}; }
            // Score is locally authoritative - never overwrite from DB
            onlinePlayerCount = room.player_count || 0;
            document.getElementById("onlineMyScore").textContent = onlineMyScore;
            document.getElementById("onlineOppScore").textContent = (onlinePlayerCount - 1) + "人";
            var isHost = onlinePlayerId.indexOf("host_") === 0;
            document.getElementById("onlineRoomCode").textContent = (isHost ? "🏠 " : "") + "房间: " + onlineRoomCode + " (" + onlinePlayerCount + "人)";
            if (room.status === "playing" && !room.current_word && isHost) {
                document.getElementById("onlineGameMsg").textContent = onlinePlayerCount + "位玩家，开始对战！";
                onlineLastWord = "";
                sendNextOnlineRound();
            } else if (room.status === "playing" && room.current_word && room.current_word !== onlineLastWord) {
                onlineLastWord = room.current_word;
                onlineDone = false; onlineNextScheduled = false; onlineSendingRound = false;
                onlineWordStartTime = Date.now(); onlineTimeoutFired = false;
                document.getElementById("onlineGameMsg").textContent = "";
                onlineAnswerIdx = room.correct_idx;
                document.getElementById("onlineWord").textContent = room.current_word;
                var opts; try { opts = JSON.parse(room.options_json); } catch(e) { return; }
                var html = "";
                for (var k = 0; k < opts.length; k++) { html += '<div class=\"online-option\" onclick=\"pickOnlineOption(' + k + ')\">' + opts[k] + '</div>'; }
                document.getElementById("onlineOptions").innerHTML = html;
            } else if (room.status === "round_end") {
                var options = document.querySelectorAll("#onlineOptions .online-option");
                if (options.length > 0 && room.correct_idx >= 0) {
                    options[room.correct_idx].classList.add("reveal-correct");
                    document.querySelectorAll("#onlineOptions .online-option").forEach(function(o) { o.classList.add("locked"); });
                }
                if (isHost && !onlineNextScheduled) { onlineNextScheduled = true; setTimeout(function() { sendNextOnlineRound(); }, 1200); }
            }
            if (isHost && room.status === 'playing' && room.current_word && !onlineTimeoutFired && onlineWordStartTime && (Date.now() - onlineWordStartTime > 3000)) {
                onlineTimeoutFired = true;
                var topts = document.querySelectorAll('#onlineOptions .online-option');
                if (topts.length > 0 && room.correct_idx >= 0) { topts[room.correct_idx].classList.add('reveal-correct'); topts.forEach(function(o){o.classList.add('locked')}); }
                fetch('/api/supabase/rooms?code=eq.' + onlineRoomCode, { method: 'PATCH', headers: supabaseHeaders(), body: JSON.stringify({ status: 'round_end' }) })
                .then(function() { if (!onlineNextScheduled) { onlineNextScheduled = true; setTimeout(function() { sendNextOnlineRound(); }, 1200); } });
            }
        });
    }, 500);
}


function pickOnlineOption(pickedIdx) {
    if (onlineDone || !onlineRoomCode) return;
    onlineDone = true;
    var isCorrect = (pickedIdx === onlineAnswerIdx);
    var options = document.querySelectorAll("#onlineOptions .online-option");
    if (isCorrect) {
        options[pickedIdx].classList.add("correct-pick");
        onlineMyScore++;
        document.getElementById("onlineMyScore").textContent = onlineMyScore;
    } else {
        options[pickedIdx].classList.add("wrong-pick");
        options[onlineAnswerIdx].classList.add("reveal-correct");
    }
    document.querySelectorAll("#onlineOptions .online-option").forEach(function(o) { o.classList.add("locked"); });
}

var onlineSendingRound = false;
function sendNextOnlineRound() {
    if (onlineSendingRound) return;
    onlineSendingRound = true;
    var words = getWordList(); if (words.length < 4) { onlineSendingRound = false; return; }
    var idx = Math.floor(Math.random() * words.length); var w = words[idx];
    var correctDef = (w.d || "").replace(/<[^>]*>/g, "").substring(0, 50);
    if (!correctDef) correctDef = w.c || "";
    var used = new Set([idx]); var wrongs = [];
    while (wrongs.length < 3) { var ri = Math.floor(Math.random() * words.length); if (used.has(ri)) continue; used.add(ri); var def = (words[ri].d || "").replace(/<[^>]*>/g, "").substring(0, 40); if (!def) def = words[ri].c || ""; if (def) wrongs.push(def); }
    var opts = [correctDef].concat(wrongs); var correctIdx = 0;
    for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp; if (correctIdx === i) correctIdx = j; else if (correctIdx === j) correctIdx = i; }
    fetch("/api/supabase/rooms?code=eq." + onlineRoomCode, { method: "PATCH", headers: supabaseHeaders(),
        body: JSON.stringify({ status: "playing", current_word: w.w, options_json: JSON.stringify(opts), correct_idx: correctIdx })
    });
}

function quitOnlineRoom() {
    if (onlinePollTimer) { clearInterval(onlinePollTimer); onlinePollTimer = null; }
    if (onlineRoomCode && onlinePlayerId.indexOf("host_") === 0) { fetch("/api/supabase/rooms?code=eq." + onlineRoomCode, { method: "DELETE", headers: supabaseHeaders() }); }
    onlineRoomCode = ""; onlinePlayerId = "";
    document.getElementById("onlineRoomUI").style.display = "";
    document.getElementById("onlineGameUI").style.display = "none";
}
// ========== Save/Restore Progress ==========
function saveProgress() {
    var progress = {
        level: currentLevel,
        index: currentIndex,
        mode: currentMode,
        speed: playbackSpeed,
        filter: wordFilter
    };
    try { localStorage.setItem('vocab_progress', JSON.stringify(progress)); } catch(e) {}
}

function restoreProgress() {
    try {
        var saved = JSON.parse(localStorage.getItem('vocab_progress'));
        if (!saved) return false;
        if (saved.level) currentLevel = saved.level;
        if (saved.mode) {
            // Spell/quiz modes use random words; restore to study instead
            currentMode = (saved.mode === 'spell' || saved.mode === 'quiz' || saved.mode === 'battle' || saved.mode === 'multi' || saved.mode === 'race') ? 'study' : saved.mode;
        }
        // If saved level is cet4/cet6 but data not loaded, fall back to primary
        if ((saved.level === 'cet4' && typeof CET4_WORDS === 'undefined') ||
            (saved.level === 'cet6' && typeof CET6_WORDS === 'undefined') ||
            (saved.level === 'kaoyan' && typeof KAOYAN_WORDS === 'undefined') ||
            (saved.level === 'ielts' && typeof IELTS_WORDS === 'undefined') ||
            (saved.level === 'toefl' && typeof TOEFL_WORDS === 'undefined') ||
            (saved.level === 'sat' && typeof SAT_WORDS === 'undefined') ||
            (saved.level === 'gre' && typeof GRE_WORDS === 'undefined')) {
            currentLevel = 'primary';
        }
        if (typeof saved.speed === 'number') playbackSpeed = saved.speed;
        if (saved.filter) wordFilter = saved.filter;
        // Apply UI
        document.getElementById('studyMode').classList.toggle('active', currentMode === 'study');
        document.getElementById('testMode').classList.toggle('active', currentMode === 'test');
        document.getElementById('vocabMode').classList.toggle('active', currentMode === 'vocab');
        document.getElementById('levelPrimary').classList.toggle('active', currentLevel === 'primary');
        document.getElementById('levelMiddle').classList.toggle('active', currentLevel === 'middle');
        document.getElementById('levelHigh').classList.toggle('active', currentLevel === 'high');
        document.body.classList.toggle('middle-mode', currentLevel === 'middle');
        // Restore speed display
        var speedLabels = {'0.5':'0.5x','1':'1x','1.5':'1.5x','2':'2x'};
        document.getElementById('speedBtn').textContent = '倍速 ' + (speedLabels[String(playbackSpeed)] || '1x');
        // Restore filter display
        if (wordFilter === 'starred') {
            var fb = document.getElementById('filterBtn');
            fb.textContent = '全部';
            fb.classList.add('active-filter');
        }
        // Restore test mode UI
        if (currentMode === 'test') {
            document.getElementById('hintBtn').style.display = '';
            document.getElementById('sentenceDisplay').style.display = 'none';
            document.getElementById('translationDisplay').style.display = 'none';
            document.getElementById('definitionDisplay').style.display = 'none';
        }
        return typeof saved.index === 'number';
    } catch(e) { return false; }
}

// ========== Theme Detection ==========
function applyTheme() {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark');
    } else {
        document.body.classList.remove('dark');
    }
}

// Initialize
applyTheme();
var hasProgress = restoreProgress();
var words = getWordList();
// Fallback: if word list is empty (e.g. CET data not loaded yet), default to primary
if (words.length === 0 && currentLevel !== 'primary') {
    currentLevel = 'primary';
    document.getElementById('levelPrimary').classList.add('active');
    words = getWordList();
}
if (words.length > 0 && hasProgress) {
    var idx = Math.min(currentIndex || 0, words.length - 1);
    showWord(idx);
} else if (words.length > 0) {
    showWord(0);
} else {
    document.getElementById('cardContent').classList.remove('show');
    document.getElementById('notFound').classList.add('show');
    document.getElementById('progressText').textContent = '0 / 0';
}

// Save progress on each word change (wrap showWord)
var _origShowWord = showWord;
showWord = function(index) {
    _origShowWord(index);
    saveProgress();
};

// ===== 侧栏折叠切换 =====
function toggleRail(type) {
    if (type === 'mode') {
        document.body.classList.toggle('mode-rail-collapsed');
    } else if (type === 'level') {
        document.body.classList.toggle('level-rail-collapsed');
    }
}

// ===== 全屏模式 =====
var fsExitByButton = false;
var fsExitByEsc = false;

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function(){});
    } else {
        fsExitByButton = true;
        document.exitFullscreen();
    }
}

// 游戏模式判断
function isGameMode() {
    return currentMode === 'quiz' || currentMode === 'battle' || currentMode === 'multi' || currentMode === 'race';
}

// 游戏模式禁止右键菜单（长按不会弹出菜单）
document.addEventListener('contextmenu', function(e) {
    if (isGameMode()) {
        e.preventDefault();
    }
});

// 记录 Esc 退出
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.fullscreenElement) {
        fsExitByEsc = true;
    }
});

document.addEventListener('fullscreenchange', function() {
    var isFS = !!document.fullscreenElement;
    document.body.classList.toggle('fullscreen-mode', isFS);
    var btn = document.getElementById('fsToggle');
    if (btn) btn.textContent = isFS ? '✕ 退出全屏' : '⛶ 全屏';
    if (!isFS) {
        var byButton = fsExitByButton, byEsc = fsExitByEsc;
        fsExitByButton = false; fsExitByEsc = false;
        // 游戏模式下，若非按钮/Esc退出，自动重新进入全屏
        if (isGameMode() && !byButton && !byEsc) {
            setTimeout(function() {
                if (!document.fullscreenElement && isGameMode()) {
                    document.documentElement.requestFullscreen().catch(function(){});
                }
            }, 100);
        }
    }
});

// ===== 全屏字号调节（整体缩放所有文字元素） =====
var fsWordSize = null; // 单词字号（20-100px），作为缩放基准
var fsBaseSizes = {};
var fsSels = [
    '.word', '.phonetic', '.rating', '.sentence', '.translation', '.definition',
    '.spell-prompt', '.spell-input-row input', '.spell-feedback', '.spell-score',
    '.quiz-word', '.quiz-option', '.quiz-score-row',
    '.battle-word', '.battle-option', '.battle-result', '.battle-score',
    '.multi-word', '.multi-option', '.multi-result', '.multi-score',
    '.race-word', '.race-option', '.race-result', '.race-score',
    '.online-word', '.online-option', '.online-game-msg'
];

function fsCollectBase() {
    fsSels.forEach(function(sel) {
        if (fsBaseSizes[sel] !== undefined) return;
        var el = document.querySelector(sel);
        if (el) {
            var sz = parseFloat(window.getComputedStyle(el).fontSize);
            fsBaseSizes[sel] = sz > 0 ? sz : 16;
        }
    });
}

function fsApply() {
    if (fsWordSize === null) {
        fsSels.forEach(function(sel) {
            document.querySelectorAll(sel).forEach(function(el) { el.style.fontSize = ''; });
        });
        return;
    }
    var wordBase = fsBaseSizes['.word'] || 40;
    var scale = fsWordSize / wordBase;
    fsSels.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(el) {
            if (fsBaseSizes[sel]) {
                el.style.fontSize = Math.round(fsBaseSizes[sel] * scale) + 'px';
            }
        });
    });
}

function increaseFont() {
    fsCollectBase();
    if (fsWordSize === null) fsWordSize = fsBaseSizes['.word'] || 40;
    fsWordSize = Math.min(100, fsWordSize + 4);
    fsApply();
}

function decreaseFont() {
    fsCollectBase();
    if (fsWordSize === null) fsWordSize = fsBaseSizes['.word'] || 40;
    fsWordSize = Math.max(20, fsWordSize - 4);
    fsApply();
}
// ===== 课本下拉菜单 =====
var TEXTBOOK_BOOKS = [
    { name: '必修一', units: ['Welcome Unit', 'Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'] },
    { name: '必修二', units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'] },
    { name: '必修三', units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'] },
    { name: '选必一', units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'] },
    { name: '选必二', units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'] },
    { name: '选必三', units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'] },
    { name: '选必四', units: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'] }
];

function buildTextbookMenu() {
    var menu = document.getElementById('textbookMenu');
    if (!menu) return;
    var html = '';
    for (var i = 0; i < TEXTBOOK_BOOKS.length; i++) {
        var book = TEXTBOOK_BOOKS[i];
        html += '<div class="textbook-group">' + book.name + '</div>';
        for (var j = 0; j < book.units.length; j++) {
            var unitName = book.name + ' ' + book.units[j];
            var label = book.units[j];
            html += '<div class="textbook-item' + (currentTextbookUnit === unitName ? ' active' : '') + '" onclick="selectTextbookUnit(\'' + unitName + '\')">' + label + '</div>';
        }
    }
    menu.innerHTML = html;
}

function toggleTextbookMenu() {
    var menu = document.getElementById('textbookMenu');
    if (!menu) return;
    buildTextbookMenu();
    var willShow = !menu.classList.contains('show');
    if (willShow) {
        // 下拉菜单高度 = 课本按钮顶部到 GRE 按钮底部的距离
        var tbBtn = document.getElementById('textbookBtn');
        var greBtn = document.getElementById('levelGre');
        if (tbBtn && greBtn) {
            var top = tbBtn.getBoundingClientRect().top;
            var bottom = greBtn.getBoundingClientRect().bottom;
            menu.style.height = Math.max(140, bottom - top) + 'px';
        }
    }
    menu.classList.toggle('show');
}

function selectTextbookUnit(unitName) {
    currentTextbookUnit = unitName;
    currentLevel = 'textbook';
    // 高亮课本按钮，取消其他难度按钮高亮
    var ids = ['levelPrimary','levelMiddle','levelHigh','levelCet4','levelCet6','levelKaoyan','levelIelts','levelToefl','levelSat','levelGre'];
    for (var i = 0; i < ids.length; i++) {
        document.getElementById(ids[i]).classList.remove('active');
    }
    document.getElementById('textbookBtn').classList.add('active');
    document.getElementById('textbookMenu').classList.remove('show');
    document.body.classList.remove('middle-mode');
    if (autoPlayActive) stopAutoPlay();
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResult').textContent = '';
    document.getElementById('notFound').classList.remove('show');
    if (typeof TEXTBOOK_WORDS === 'undefined') {
        var s = document.createElement('script');
        s.src = '/js/vocab-textbook.js';
        s.onload = function() { loadLevelWords(); };
        document.head.appendChild(s);
        return;
    }
    loadLevelWords();
}

// 点击页面其他区域关闭课本下拉
document.addEventListener('click', function(e) {
    var menu = document.getElementById('textbookMenu');
    if (!menu || !menu.classList.contains('show')) return;
    if (e.target.closest('.textbook-wrap')) return;
    menu.classList.remove('show');
});
