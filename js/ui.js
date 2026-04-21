// UI — screen routing, rendering, event handling

let _studyMode = 'choice';  // initialised from settings on app start
let _allVerbs = [];
let _pendingCorrect = null;
let _pendingCard = null;
let _pendingItem = null;     // verb object OR vocab object for the current card
let _sessionMistakes = [];   // { card, item, typed, correct }
let _currentChapterId = null;

// ── EXAMPLE SENTENCES ─────────────────────────────────────────────────────────
function findExample(georgianWord) {
  if (!window._tatoeba?.length || !georgianWord) return null;
  const word = georgianWord.trim();
  const matches = window._tatoeba.filter(s => s.ka.includes(word));
  if (!matches.length) return null;
  // Pick randomly from up to the first 5 matches for variety
  return matches[Math.floor(Math.random() * Math.min(matches.length, 5))];
}

// ── LEVENSHTEIN ────────────────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// ── ROUTING ────────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button[data-screen]').forEach(b => b.classList.remove('active'));
  document.getElementById(name + '-screen')?.classList.add('active');
  document.querySelector(`nav button[data-screen="${name}"]`)?.classList.add('active');
}

// ── TOAST ──────────────────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── HOME ───────────────────────────────────────────────────────────────────────
async function renderHome() {
  const [due, streak, introduced, total, settings] = await Promise.all([
    getDueCount(), getStreak(), countIntroducedVerbs(), getTotalCards(), getSettings()
  ]);
  document.getElementById('home-streak').textContent = streak;
  document.getElementById('home-streak-label').textContent =
    streak === 1 ? '1 day streak' : `${streak} day streak`;
  document.getElementById('home-due').textContent = due;
  document.getElementById('home-verbs').textContent = introduced;
  document.getElementById('home-cards').textContent = total;
  document.getElementById('home-new-per-day').textContent = settings.newVerbs;

  const btn = document.getElementById('start-study-btn');
  btn.disabled = false;
  btn.textContent = due > 0 ? `Study now  ·  ${due} due` : 'Start session';
}

// ── STUDY SESSION ──────────────────────────────────────────────────────────────
async function initStudy() {
  _sessionMistakes = [];
  const screen = document.getElementById('study-screen');
  screen.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading session…</p></div>`;
  showScreen('study');

  const count = await startSession();
  if (count === 0) {
    screen.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎉</div>
        <h2>All done!</h2>
        <p>No cards due right now.<br>Check back tomorrow.</p>
        <button class="btn btn-secondary" id="back-from-empty">Back to home</button>
      </div>`;
    document.getElementById('back-from-empty').onclick = () => { showScreen('home'); renderHome(); };
    return;
  }
  renderStudyCard();
}

async function initChapterStudy(chapterId) {
  _sessionMistakes = [];
  _currentChapterId = chapterId;
  const screen = document.getElementById('study-screen');
  screen.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading session…</p></div>`;
  showScreen('study');

  const count = await startChapterSession(chapterId);
  if (count === 0) {
    screen.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎉</div>
        <h2>All caught up!</h2>
        <p>No cards due for this chapter right now.</p>
        <button class="btn btn-secondary" id="back-from-empty">Back to chapter</button>
      </div>`;
    document.getElementById('back-from-empty').onclick = () => showChapterDetail(chapterId);
    return;
  }
  renderStudyCard();
}

function renderStudyCard() {
  const card = currentCard();
  if (!card || isSessionDone()) { renderSessionDone(); return; }

  const { index, total } = sessionProgress();
  const pct = Math.round((index / total) * 100);

  const screen = document.getElementById('study-screen');
  screen.innerHTML = `
    <div class="session-header">
      <button class="exit-btn" id="exit-study">✕</button>
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width:${pct}%"></div>
      </div>
      <span class="session-count">${index}/${total}</span>
    </div>
    <div class="card-area" id="card-area"></div>`;

  document.getElementById('exit-study').onclick = () => { showScreen('home'); renderHome(); };

  if (card.cardType === 'vocab') {
    getVocabItem(card.vocabId).then(vocab => {
      if (!vocab) { submitRating(0).then(renderStudyCard); return; }
      _pendingCard = card;
      _pendingItem = vocab;
      _pendingCorrect = card.direction === 'g2e' ? vocab.english : vocab.georgian;
      renderVocabStudyCard(card, vocab);
    });
  } else {
    getVerb(card.verbId).then(verb => {
      if (!verb) { submitRating(0).then(renderStudyCard); return; }
      const correct = verb.conjugations?.[card.tense]?.[card.person] || '—';
      _pendingCorrect = correct;
      _pendingCard = card;
      _pendingItem = verb;
      renderVerbStudyCard(card, verb, correct);
    });
  }
}

function renderVerbStudyCard(card, verb, correct) {
  const area = document.getElementById('card-area');
  if (!area) return;

  area.innerHTML = `
    <div class="verb-card">
      <div class="tense-label">${TENSE_LABELS[card.tense]}</div>
      <div class="english">${buildEnglishPhrase(card.person, card.tense, verb.english)}</div>
      <div class="infinitive">${verb.conjugations?.present?.['3sg'] || verb.infinitive}</div>
      <div class="prompt">How do you say this in Georgian?</div>
    </div>
    <div class="mode-toggle">
      <button data-mode="choice" class="${_studyMode === 'choice' ? 'active' : ''}">Multiple choice</button>
      <button data-mode="type"   class="${_studyMode === 'type'   ? 'active' : ''}">Type it</button>
    </div>
    <div id="answer-area" class="answer-area"></div>`;

  document.querySelectorAll('.mode-toggle button').forEach(btn => {
    btn.onclick = () => { _studyMode = btn.dataset.mode; renderStudyCard(); };
  });

  if (_studyMode === 'choice') renderChoiceMode(card, verb, correct);
  else renderTypeMode(card, verb, correct);
}

function renderVocabStudyCard(card, vocab) {
  const area = document.getElementById('card-area');
  if (!area) return;

  const isG2E = card.direction === 'g2e';
  const prompt = isG2E ? vocab.georgian : vocab.english;
  const correct = isG2E ? vocab.english : vocab.georgian;
  const dirLabel = isG2E ? 'What does this mean?' : 'How do you say this in Georgian?';
  const typeLabel = VOCAB_TYPE_LABELS[vocab.type] || '';

  area.innerHTML = `
    <div class="verb-card">
      ${typeLabel ? `<div class="tense-label">${typeLabel}</div>` : ''}
      <div class="infinitive">${prompt}</div>
      <div class="prompt">${dirLabel}</div>
    </div>
    <div class="mode-toggle">
      <button data-mode="choice" class="${_studyMode === 'choice' ? 'active' : ''}">Multiple choice</button>
      <button data-mode="type"   class="${_studyMode === 'type'   ? 'active' : ''}">Type it</button>
    </div>
    <div id="answer-area" class="answer-area"></div>`;

  document.querySelectorAll('.mode-toggle button').forEach(btn => {
    btn.onclick = () => { _studyMode = btn.dataset.mode; renderStudyCard(); };
  });

  if (_studyMode === 'choice') renderChoiceMode(card, vocab, correct);
  else renderTypeMode(card, vocab, correct);
}

function renderChoiceMode(card, item, correct) {
  const distPromise = card.cardType === 'vocab'
    ? getVocabDistractors(card, item)
    : getDistractors(card, item);

  distPromise.then(options => {
    const area = document.getElementById('answer-area');
    if (!area) return;

    const grid = document.createElement('div');
    grid.className = 'choice-grid' + (card.cardType === 'vocab' ? ' vocab-choices' : '');
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = opt;
      btn.dataset.answer = opt;
      btn.dataset.correct = correct;
      btn.onclick = handleChoiceAnswer;
      grid.appendChild(btn);
    });
    area.appendChild(grid);
  });
}

function handleChoiceAnswer(e) {
  const btn = e.currentTarget;
  const chosen = btn.dataset.answer;
  const correct = btn.dataset.correct;
  const isCorrect = chosen === correct;

  if (!isCorrect && _pendingCard && _pendingItem) {
    _sessionMistakes.push({ card: _pendingCard, item: _pendingItem, typed: chosen, correct });
  }

  document.querySelectorAll('.choice-btn').forEach(b => {
    b.disabled = true;
    if (b.dataset.answer === correct) b.classList.add(isCorrect && b === btn ? 'correct' : 'reveal');
  });
  if (!isCorrect) btn.classList.remove('reveal');
  if (!isCorrect) btn.classList.add('wrong');

  showRatingButtons(isCorrect, correct);
}

// ── GEORGIAN KEYBOARD ──────────────────────────────────────────────────────────
const GEO_ROWS = [
  ['ა','ბ','გ','დ','ე','ვ','ზ','თ','ი'],
  ['კ','ლ','მ','ნ','ო','პ','ჟ','რ','ს'],
  ['ტ','უ','ფ','ქ','ღ','ყ','შ','ჩ','ც'],
  ['ძ','წ','ჭ','ხ','ჯ','ჰ','⌫'],
];

function buildGeoKeyboard(input) {
  const keyboard = document.createElement('div');
  keyboard.className = 'geo-keyboard';
  GEO_ROWS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'geo-keyboard-row';
    row.forEach(ch => {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'geo-key' + (ch === '⌫' ? ' backspace' : '');
      key.textContent = ch;
      key.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (ch === '⌫') {
          const pos = input.selectionStart;
          const val = input.value;
          if (pos > 0) {
            input.value = val.slice(0, pos - 1) + val.slice(pos);
            input.setSelectionRange(pos - 1, pos - 1);
          }
        } else {
          const pos = input.selectionStart;
          const val = input.value;
          input.value = val.slice(0, pos) + ch + val.slice(pos);
          input.setSelectionRange(pos + 1, pos + 1);
        }
      });
      rowEl.appendChild(key);
    });
    keyboard.appendChild(rowEl);
  });
  return keyboard;
}

function renderTypeMode(card, item, correct) {
  const area = document.getElementById('answer-area');
  if (!area) return;

  const wrap = document.createElement('div');
  wrap.className = 'type-wrap';

  const input = document.createElement('input');
  input.id = 'type-input';
  input.className = 'type-input';
  input.type = 'text';
  input.placeholder = 'type the answer…';
  input.autocomplete = 'off';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('spellcheck', 'false');

  const checkBtn = document.createElement('button');
  checkBtn.className = 'btn btn-primary';
  checkBtn.id = 'check-btn';
  checkBtn.textContent = 'Check';

  const doCheck = () => {
    const typed = input.value.trim();
    if (!typed) { input.focus(); return; }

    const isExact = typed === correct;
    const isFuzzy = !isExact && levenshtein(typed, correct) <= 1;
    const isCorrect = isExact || isFuzzy;

    input.disabled = true;
    checkBtn.remove();
    input.classList.add(isCorrect ? 'correct' : 'wrong');

    if (!isCorrect) {
      _sessionMistakes.push({ card, item, typed, correct });
    }
    if (isFuzzy) showToast('Almost! Accepted');

    showRatingButtons(isCorrect, correct, isFuzzy);
  };

  checkBtn.onclick = doCheck;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doCheck(); });

  wrap.appendChild(input);
  wrap.appendChild(checkBtn);

  // Show Georgian keyboard unless the expected answer is in English (g2e vocab)
  const needsGeoKeyboard = !(card.cardType === 'vocab' && card.direction === 'g2e');
  if (needsGeoKeyboard) wrap.appendChild(buildGeoKeyboard(input));

  area.appendChild(wrap);
  input.focus();
}

function showRatingButtons(wasCorrect, correct, showCorrection = false) {
  const area = document.getElementById('answer-area');
  if (!area) return;

  if (!wasCorrect || showCorrection) {
    const reveal = document.createElement('div');
    reveal.className = 'answer-reveal';
    reveal.innerHTML = `<div class="correct-answer">${correct}</div><div class="answer-note">${showCorrection ? 'Correct form' : 'Correct answer'}</div>`;
    area.appendChild(reveal);
  }

  // Show a Tatoeba example sentence for vocab cards
  if (_pendingCard?.cardType === 'vocab' && _pendingItem?.georgian) {
    const ex = findExample(_pendingItem.georgian);
    if (ex) {
      const exEl = document.createElement('div');
      exEl.className = 'example-sentence';
      exEl.innerHTML = `<div class="example-label">Example</div><div class="example-ka">${ex.ka}</div><div class="example-en">${ex.en}</div>`;
      area.appendChild(exEl);
    }
  }

  const btn = document.createElement('button');
  btn.className = 'btn btn-primary next-btn';
  btn.style.marginTop = '16px';
  btn.textContent = wasCorrect ? 'Next' : 'Got it';
  btn.onclick = () => submitRating(wasCorrect ? 2 : 0).then(renderStudyCard);
  area.appendChild(btn);
}

function renderSessionDone() {
  const { correct, reviewed } = sessionStats();
  const pct = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
  const missCount = _sessionMistakes.length;
  const screen = document.getElementById('study-screen');
  screen.innerHTML = `
    <div class="session-done">
      <div class="big-icon">${pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📚'}</div>
      <h2>${pct >= 80 ? 'Great work!' : pct >= 50 ? 'Keep going!' : 'Keep practicing!'}</h2>
      <p>${reviewed} cards reviewed</p>
      <div class="done-stats">
        <div class="done-stat"><div class="n">${correct}</div><div class="l">Correct</div></div>
        <div class="done-stat"><div class="n">${pct}%</div><div class="l">Accuracy</div></div>
        <div class="done-stat"><div class="n">${reviewed - correct}</div><div class="l">Missed</div></div>
      </div>
      ${missCount > 0 ? `<button class="btn btn-secondary" id="review-mistakes-btn">Review ${missCount} mistake${missCount !== 1 ? 's' : ''}</button>` : ''}
      <button class="btn btn-secondary" id="more-btn">Study more</button>
      <button class="btn btn-primary" id="done-btn">Done</button>
    </div>`;
  if (missCount > 0) document.getElementById('review-mistakes-btn').onclick = renderMistakesReview;
  document.getElementById('more-btn').onclick = () => extendDailyLimit().then(initStudy);
  document.getElementById('done-btn').onclick = () => { showScreen('home'); renderHome(); };
}

function renderMistakesReview() {
  const screen = document.getElementById('study-screen');
  const items = _sessionMistakes.map(m => {
    let tenseOrType, phrase, display;
    if (m.card.cardType === 'vocab') {
      const dir = m.card.direction === 'g2e' ? 'Georgian → English' : 'English → Georgian';
      tenseOrType = dir;
      phrase = VOCAB_TYPE_LABELS[m.item.type] || '';
      display = m.card.direction === 'g2e' ? m.item.georgian : m.item.english;
    } else {
      tenseOrType = TENSE_LABELS[m.card.tense];
      phrase = buildEnglishPhrase(m.card.person, m.card.tense, m.item.english);
      display = m.item.conjugations?.present?.['3sg'] || m.item.infinitive;
    }
    return `
      <div class="mistake-card">
        <div class="mistake-meta">
          <span class="mistake-tense">${tenseOrType}</span>
          <span class="mistake-phrase">${phrase}</span>
        </div>
        <div class="mistake-verb">${display}</div>
        <div class="mistake-answers">
          <span class="mistake-wrong">${m.typed || '—'}</span>
          <span class="mistake-arrow">→</span>
          <span class="mistake-right">${m.correct}</span>
        </div>
      </div>`;
  }).join('');

  screen.innerHTML = `
    <div class="session-header">
      <button class="exit-btn" id="exit-review">✕</button>
      <span style="font-weight:700;font-size:15px">Mistakes (${_sessionMistakes.length})</span>
    </div>
    <div class="mistakes-list">${items}</div>
    <button class="btn btn-primary" id="close-review-btn" style="margin-top:auto;flex-shrink:0">Done</button>`;

  document.getElementById('exit-review').onclick = () => { showScreen('home'); renderHome(); };
  document.getElementById('close-review-btn').onclick = () => { showScreen('home'); renderHome(); };
}

// ── CHAPTERS DASHBOARD ─────────────────────────────────────────────────────────
async function renderChapters() {
  const chapters = await getChapters();
  const screen = document.getElementById('chapters-screen');

  if (chapters.length === 0) {
    screen.innerHTML = `
      <div class="chapters-header">
        <div class="screen-title" style="margin:0">Chapters</div>
        <button class="btn btn-secondary" id="new-chapter-btn" style="width:auto;padding:8px 16px;font-size:13px">+ New</button>
      </div>
      <div class="empty-state" style="flex:1">
        <div class="icon" style="font-size:48px">📖</div>
        <h2>No chapters yet</h2>
        <p>Create a chapter for each unit in your Biliki book to study its vocabulary and verbs.</p>
      </div>`;
    document.getElementById('new-chapter-btn').onclick = showNewChapterForm;
    return;
  }

  screen.innerHTML = `
    <div class="chapters-header">
      <div class="screen-title" style="margin:0">Chapters</div>
      <button class="btn btn-secondary" id="new-chapter-btn" style="width:auto;padding:8px 16px;font-size:13px">+ New</button>
    </div>
    <div class="chapters-list" id="chapters-list"></div>`;
  document.getElementById('new-chapter-btn').onclick = showNewChapterForm;

  const list = document.getElementById('chapters-list');
  for (const ch of chapters) {
    const vocabItems = await getVocabByChapter(ch.id);
    const verbCount = (ch.verbIds || []).length;

    let masteredVocab = 0;
    for (const item of vocabItems) {
      const card = await getCard(`vocab__${item.id}__g2e`);
      if (card && card.reps >= 3) masteredVocab++;
    }
    const vocabTotal = vocabItems.length;
    const vocabPct = vocabTotal > 0 ? Math.round((masteredVocab / vocabTotal) * 100) : 0;
    const allLearned = vocabTotal > 0 && masteredVocab === vocabTotal;

    const card = document.createElement('div');
    card.className = 'chapter-card';
    card.innerHTML = `
      <div class="chapter-card-number">${ch.number}</div>
      <div class="chapter-card-info">
        <div class="chapter-card-name">${ch.name || 'Chapter ' + ch.number}</div>
        <div class="chapter-card-meta">${vocabTotal} word${vocabTotal !== 1 ? 's' : ''}${verbCount > 0 ? `  ·  ${verbCount} verb${verbCount !== 1 ? 's' : ''}` : ''}</div>
      </div>
      <div class="chapter-mastery${allLearned ? ' learned' : ''}">${vocabTotal > 0 ? vocabPct + '%' : 'Empty'}</div>`;
    card.onclick = () => showChapterDetail(ch.id);
    list.appendChild(card);
  }
}

// ── CHAPTER DETAIL ─────────────────────────────────────────────────────────────
let _currentChapterVerbs = [];

function showChapterDetail(id) {
  _currentChapterId = id;
  document.getElementById('chapters-screen').style.display = 'none';
  const overlay = document.getElementById('chapter-detail');
  overlay.style.display = 'flex';
  renderChapterDetail(id);
}

function hideChapterDetail() {
  document.getElementById('chapter-detail').style.display = 'none';
  document.getElementById('chapters-screen').style.display = 'flex';
  renderChapters();
}

async function renderChapterDetail(chapterId) {
  const [chapter, vocabItems] = await Promise.all([
    getChapter(chapterId),
    getVocabByChapter(chapterId),
  ]);
  if (!chapter) return;

  document.getElementById('chapter-detail-name').textContent =
    chapter.name || 'Chapter ' + chapter.number;
  document.getElementById('chapter-detail-meta').textContent =
    'Chapter ' + chapter.number + (chapter.name ? ' · Biliki' : '');

  const body = document.getElementById('chapter-detail-body');

  // Split vocab into words and verbs
  const vocabWords = vocabItems.filter(i => i.type !== 'verb');
  const vocabVerbs = vocabItems.filter(i => i.type === 'verb');

  // Build verb rows for linked verbs (from verb library)
  const verbIds = chapter.verbIds || [];
  _currentChapterVerbs = verbIds.length > 0
    ? await Promise.all(verbIds.map(id => getVerb(id)))
    : [];
  const validVerbs = _currentChapterVerbs.filter(Boolean);

  // Mastery counts
  const vocabCardsData = await Promise.all(
    vocabItems.map(item => getCard(`vocab__${item.id}__g2e`))
  );

  const dueVocab = await Promise.all(
    vocabItems.map(async item => {
      const g2e = await getCard(`vocab__${item.id}__g2e`);
      const e2g = await getCard(`vocab__${item.id}__e2g`);
      const now = Date.now();
      return ((!g2e || g2e.reps === 0 || g2e.nextReview <= now) ||
              (!e2g || e2g.reps === 0 || e2g.nextReview <= now));
    })
  );
  const dueCount = dueVocab.filter(Boolean).length + verbIds.length;

  const vocabItemRow = (item) => {
    const mastered = vocabCardsData[vocabItems.indexOf(item)]?.reps >= 3;
    return `
      <div class="vocab-item">
        <div class="vocab-item-words">
          <div class="vocab-item-georgian">${item.georgian}</div>
          <div class="vocab-item-english">${item.english}</div>
        </div>
        <span class="vocab-type-badge">${VOCAB_TYPE_LABELS[item.type] || item.type}</span>
        ${mastered ? '<span class="mastery-dot">✓</span>' : ''}
        <button class="vocab-delete-btn" data-vocab-id="${item.id}">✕</button>
      </div>`;
  };

  const totalVerbCount = validVerbs.length + vocabVerbs.length;

  body.innerHTML = `
    <button class="btn btn-primary" id="study-chapter-btn" style="margin-bottom:20px">
      Study Chapter${dueCount > 0 ? '  ·  ' + dueCount + ' due' : ''}
    </button>

    <div class="section-header">
      <span class="section-title">Vocabulary (${vocabWords.length})</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary" id="scan-btn" style="width:auto;padding:6px 12px;font-size:13px">📷 Scan</button>
        <button class="btn btn-secondary" id="add-word-btn" style="width:auto;padding:6px 14px;font-size:13px">+ Add</button>
      </div>
    </div>
    <div class="vocab-list" id="vocab-list-detail">
      ${vocabWords.length === 0
        ? '<p style="color:var(--text2);font-size:14px;padding:8px 0">No words yet — scan a page or add manually.</p>'
        : vocabWords.map(vocabItemRow).join('')}
    </div>

    <div class="section-header" style="margin-top:20px">
      <span class="section-title">Verbs (${totalVerbCount})</span>
      <button class="btn btn-secondary" id="link-verb-btn" style="width:auto;padding:6px 14px;font-size:13px">+ Link</button>
    </div>
    <div class="vocab-list">
      ${totalVerbCount === 0
        ? '<p style="color:var(--text2);font-size:14px;padding:8px 0">No verbs yet.</p>'
        : [
            ...vocabVerbs.map(vocabItemRow),
            ...validVerbs.map(v => `
              <div class="vocab-item">
                <div class="vocab-item-words">
                  <div class="vocab-item-georgian">${v.conjugations?.present?.['3sg'] || v.infinitive}</div>
                  <div class="vocab-item-english">to ${v.english}</div>
                </div>
                <span class="vocab-type-badge" style="background:rgba(34,197,94,0.12);color:var(--green)">conjugated</span>
                <button class="vocab-delete-btn" data-unlink-verb="${v.id}">✕</button>
              </div>`)
          ].join('')}
    </div>

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--surface2)">
      <button class="btn btn-secondary" id="delete-chapter-btn" style="color:var(--red);opacity:0.7">Delete chapter</button>
    </div>`;

  document.getElementById('study-chapter-btn').onclick = () => initChapterStudy(chapterId);
  document.getElementById('chapter-edit-btn').onclick = () => startEditChapterName(chapterId, chapter);
  document.getElementById('scan-btn').onclick = () => showScanPage(chapterId);
  document.getElementById('add-word-btn').onclick = () => showAddVocabForm(chapterId);
  document.getElementById('link-verb-btn').onclick = () => showLinkVerbPanel(chapterId);
  document.getElementById('delete-chapter-btn').onclick = async () => {
    if (!confirm(`Delete chapter "${chapter.name || 'Chapter ' + chapter.number}" and all its vocabulary?`)) return;
    await deleteChapter(chapterId);
    hideChapterDetail();
  };

  // Vocab delete buttons
  body.querySelectorAll('[data-vocab-id]').forEach(btn => {
    btn.onclick = async () => {
      await deleteVocabItem(parseInt(btn.dataset.vocabId));
      renderChapterDetail(chapterId);
    };
  });

  // Verb unlink buttons
  body.querySelectorAll('[data-unlink-verb]').forEach(btn => {
    btn.onclick = async () => {
      const verbId = btn.dataset.unlinkVerb;
      const ch = await getChapter(chapterId);
      ch.verbIds = (ch.verbIds || []).filter(id => id !== verbId);
      await saveChapter(ch);
      renderChapterDetail(chapterId);
    };
  });
}

function startEditChapterName(chapterId, chapter) {
  const nameEl = document.getElementById('chapter-detail-name');
  const editBtn = document.getElementById('chapter-edit-btn');
  const current = chapter.name || '';

  // Replace h2 with an input
  const input = document.createElement('input');
  input.className = 'form-input';
  input.value = current;
  input.placeholder = 'Chapter name (optional)';
  input.style.fontSize = '18px';
  input.style.padding = '8px 12px';
  nameEl.replaceWith(input);
  editBtn.textContent = '✓';
  editBtn.title = 'Save';
  input.focus();
  input.select();

  const save = async () => {
    const newName = input.value.trim();
    chapter.name = newName;
    await saveChapter(chapter);
    // Restore h2
    const h2 = document.createElement('h2');
    h2.id = 'chapter-detail-name';
    h2.textContent = newName || 'Chapter ' + chapter.number;
    input.replaceWith(h2);
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit chapter name';
    editBtn.onclick = () => startEditChapterName(chapterId, chapter);
    // Update meta line
    document.getElementById('chapter-detail-meta').textContent =
      'Chapter ' + chapter.number + (newName ? ' · Biliki' : '');
    showToast('Chapter renamed');
  };

  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  editBtn.onclick = save;
}

// ── ADD VOCAB FORM ─────────────────────────────────────────────────────────────
function showAddVocabForm(chapterId) {
  _currentChapterId = chapterId;
  document.getElementById('chapter-detail').style.display = 'none';
  const overlay = document.getElementById('vocab-add');
  overlay.style.display = 'flex';

  // Populate type select
  const sel = document.getElementById('vocab-type');
  sel.innerHTML = Object.entries(VOCAB_TYPE_LABELS)
    .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  document.getElementById('vocab-georgian').value = '';
  document.getElementById('vocab-english').value = '';
  document.getElementById('vocab-georgian').focus();

  document.getElementById('vocab-save-btn').onclick = () => saveVocabWord(chapterId);
}

function hideAddVocabForm() {
  document.getElementById('vocab-add').style.display = 'none';
  document.getElementById('chapter-detail').style.display = 'flex';
  renderChapterDetail(_currentChapterId);
}

async function saveVocabWord(chapterId) {
  const georgian = document.getElementById('vocab-georgian').value.trim();
  const english = document.getElementById('vocab-english').value.trim();
  const type = document.getElementById('vocab-type').value;
  if (!georgian) { showToast('Enter the Georgian word'); return; }
  if (!english)  { showToast('Enter the English meaning'); return; }
  await saveVocabItem({ georgian, english, type, chapterId });
  showToast('Word saved!');
  document.getElementById('vocab-georgian').value = '';
  document.getElementById('vocab-english').value = '';
  document.getElementById('vocab-georgian').focus();
}

// ── LINK VERB PANEL ────────────────────────────────────────────────────────────
function showLinkVerbPanel(chapterId) {
  const body = document.getElementById('chapter-detail-body');
  const existing = document.getElementById('link-verb-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'link-verb-panel';
  panel.className = 'link-verb-panel';
  panel.innerHTML = `
    <input class="search-input" id="link-verb-search" placeholder="Search verbs…" style="margin-bottom:10px" />
    <div id="link-verb-results" class="verb-list" style="max-height:200px;overflow-y:auto"></div>`;
  body.insertBefore(panel, body.firstChild);

  const renderResults = async (query) => {
    const q = query.toLowerCase();
    const verbs = await getVerbs(500);
    const chapter = await getChapter(chapterId);
    const linkedIds = new Set(chapter.verbIds || []);
    const filtered = verbs.filter(v =>
      (v.english.toLowerCase().includes(q) || (v.conjugations?.present?.['3sg'] || '').includes(q)) &&
      !linkedIds.has(v.id)
    ).slice(0, 20);

    const results = document.getElementById('link-verb-results');
    if (!results) return;
    results.innerHTML = filtered.length === 0
      ? '<p style="color:var(--text2);font-size:13px;padding:8px">No results</p>'
      : filtered.map(v => `
          <div class="vocab-item link-verb-row" data-verb-id="${v.id}">
            <div class="vocab-item-words">
              <div class="vocab-item-georgian">${v.conjugations?.present?.['3sg'] || v.infinitive}</div>
              <div class="vocab-item-english">to ${v.english}</div>
            </div>
            <button class="btn btn-secondary" style="width:auto;padding:6px 12px;font-size:12px">Link</button>
          </div>`).join('');

    results.querySelectorAll('[data-verb-id]').forEach(row => {
      row.querySelector('button').onclick = async () => {
        const verbId = row.dataset.verbId;
        const ch = await getChapter(chapterId);
        const ids = new Set(ch.verbIds || []);
        ids.add(verbId);
        ch.verbIds = Array.from(ids);
        await saveChapter(ch);
        panel.remove();
        renderChapterDetail(chapterId);
      };
    });
  };

  document.getElementById('link-verb-search').addEventListener('input', e => renderResults(e.target.value));
  renderResults('');
  document.getElementById('link-verb-search').focus();
}

// ── NEW CHAPTER FORM ──────────────────────────────────────────────────────────
function showNewChapterForm() {
  document.getElementById('chapters-screen').style.display = 'none';
  const overlay = document.getElementById('chapter-new');
  overlay.style.display = 'flex';
  document.getElementById('chapter-new-number').value = '';
  document.getElementById('chapter-new-name').value = '';
  document.getElementById('chapter-new-number').focus();
}

function hideNewChapterForm() {
  document.getElementById('chapter-new').style.display = 'none';
  document.getElementById('chapters-screen').style.display = 'flex';
}

async function saveNewChapter() {
  const number = parseInt(document.getElementById('chapter-new-number').value, 10);
  const name = document.getElementById('chapter-new-name').value.trim();
  if (!number) { showToast('Enter a chapter number'); return; }
  const id = await saveChapter({ number, name, verbIds: [], createdAt: Date.now() });
  hideNewChapterForm();
  showChapterDetail(id);
}

// ── ADD VERB (custom) ───────────────────────────────────────────────────────────
function showAddVerbScreen() {
  document.getElementById('browse-screen').style.display = 'none';
  const screen = document.getElementById('add-verb-screen');
  screen.style.display = 'flex';
  renderAddVerbForm();
}

function hideAddVerbScreen() {
  document.getElementById('add-verb-screen').style.display = 'none';
  document.getElementById('browse-screen').style.display = 'flex';
}

function renderAddVerbForm() {
  const form = document.getElementById('add-verb-form');

  let html = `
    <div class="form-section">
      <div class="form-section-title">English meaning</div>
      <div class="form-field">
        <input class="form-input" id="av-english" placeholder="e.g. be written"
          type="text" autocomplete="off" autocorrect="off" spellcheck="false" />
      </div>
    </div>`;

  TENSE_ORDER.forEach(tense => {
    html += `
      <div class="form-section">
        <div class="form-section-title">${TENSE_LABELS[tense]}</div>
        ${PERSONS.map(person => `
          <div class="conj-row">
            <span class="pers-label">${PERSON_LABELS[person]}</span>
            <input class="conj-input" id="av-${tense}-${person}"
              placeholder="—" autocomplete="off" autocorrect="off" spellcheck="false" />
          </div>`).join('')}
      </div>`;
  });

  html += `<button class="btn btn-primary" id="av-save-btn">Save verb</button>`;
  form.innerHTML = html;
  document.getElementById('av-save-btn').onclick = saveCustomVerb;
  document.getElementById('av-english').focus();
}

async function saveCustomVerb() {
  const english = document.getElementById('av-english').value.trim();
  if (!english) { showToast('Enter an English meaning'); return; }

  const conjugations = {};
  let formCount = 0;
  TENSE_ORDER.forEach(tense => {
    conjugations[tense] = {};
    PERSONS.forEach(person => {
      const val = document.getElementById(`av-${tense}-${person}`)?.value.trim() || '';
      conjugations[tense][person] = val;
      if (val) formCount++;
    });
  });

  if (formCount === 0) { showToast('Enter at least one verb form'); return; }

  const displayForm = conjugations.present?.['3sg'] || english;
  const verb = {
    id: 'custom_' + Date.now(),
    infinitive: displayForm,
    english,
    frequency_rank: 9000 + Date.now() % 1000,
    custom: true,
    conjugations,
  };

  await getDB().verbs.put(verb);
  showToast('Verb added!');
  hideAddVerbScreen();
  renderBrowse();
}

// ── BROWSE ─────────────────────────────────────────────────────────────────────
let _selectedVerbs = new Set();
let _browseQuery = '';

async function renderBrowse() {
  _allVerbs = await getVerbs(1000);
  renderVerbList(_allVerbs);
  updateSelectionBar();
  document.getElementById('add-verb-btn').onclick = showAddVerbScreen;
  document.getElementById('study-selected-btn').onclick = initCustomStudy;
  document.getElementById('clear-selection-btn').onclick = () => {
    _selectedVerbs.clear();
    filterVerbs(_browseQuery);
    updateSelectionBar();
  };
}

function updateSelectionBar() {
  const bar = document.getElementById('selection-bar');
  if (!bar) return;
  const n = _selectedVerbs.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  const countEl = document.getElementById('selection-count');
  if (countEl) countEl.textContent = `${n} verb${n !== 1 ? 's' : ''} selected`;
}

async function initCustomStudy() {
  _sessionMistakes = [];
  const verbIds = Array.from(_selectedVerbs);
  _selectedVerbs.clear();
  updateSelectionBar();

  const screen = document.getElementById('study-screen');
  screen.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading session…</p></div>`;
  showScreen('study');

  const count = await startCustomSession(verbIds);
  if (count === 0) {
    screen.innerHTML = `
      <div class="empty-state">
        <div class="icon">🤔</div>
        <h2>Nothing to study</h2>
        <p>No cards found for selected verbs.</p>
        <button class="btn btn-secondary" id="back-from-empty">Back</button>
      </div>`;
    document.getElementById('back-from-empty').onclick = () => { showScreen('browse'); renderBrowse(); };
    return;
  }
  renderStudyCard();
}

function renderVerbList(verbs) {
  const list = document.getElementById('verb-list');
  if (!list) return;

  if (verbs.length === 0) {
    list.innerHTML = '<p style="color:var(--text2);text-align:center;padding:20px">No verbs found</p>';
    return;
  }

  list.innerHTML = '';
  verbs.slice(0, 150).forEach(v => {
    const row = document.createElement('div');
    row.className = 'verb-row' + (_selectedVerbs.has(v.id) ? ' selected' : '');

    const main = document.createElement('div');
    main.className = 'verb-row-main';
    main.innerHTML = `<div class="geo">${v.conjugations?.present?.['3sg'] || v.infinitive}${v.custom ? '<span class="custom-tag">custom</span>' : ''}</div><div class="eng">to ${v.english}</div>`;
    main.onclick = () => showVerbDetail(v.id);

    const mastery = document.createElement('div');
    mastery.className = 'mastery';
    mastery.id = 'mastery-' + v.id;
    mastery.textContent = '—';

    const circle = document.createElement('button');
    circle.className = 'select-circle' + (_selectedVerbs.has(v.id) ? ' active' : '');
    circle.textContent = _selectedVerbs.has(v.id) ? '✓' : '+';
    circle.onclick = (e) => {
      e.stopPropagation();
      if (_selectedVerbs.has(v.id)) _selectedVerbs.delete(v.id);
      else _selectedVerbs.add(v.id);
      const sel = _selectedVerbs.has(v.id);
      row.classList.toggle('selected', sel);
      circle.classList.toggle('active', sel);
      circle.textContent = sel ? '✓' : '+';
      updateSelectionBar();
    };

    row.appendChild(main);
    row.appendChild(mastery);
    row.appendChild(circle);
    list.appendChild(row);

    getVerbCards(v.id).then(cards => {
      if (!document.getElementById('mastery-' + v.id)) return;
      if (cards.length === 0) { mastery.textContent = 'New'; return; }
      const mastered = cards.filter(c => c.reps >= 3).length;
      mastery.textContent = `${mastered}/${cards.length}`;
      if (mastered === cards.length) mastery.classList.add('learned');
    });
  });
}

async function showVerbDetail(verbId) {
  const [verb, cards] = await Promise.all([getVerb(verbId), getVerbCards(verbId)]);
  if (!verb) return;

  const cardMap = {};
  cards.forEach(c => { cardMap[`${c.tense}__${c.person}`] = c; });

  document.getElementById('browse-screen').style.display = 'none';
  const detail = document.getElementById('verb-detail');
  detail.style.display = 'flex';

  document.getElementById('detail-infinitive').textContent = verb.conjugations?.present?.['3sg'] || verb.infinitive;
  document.getElementById('detail-english').textContent = 'to ' + verb.english;

  document.getElementById('tense-sections').innerHTML = TENSE_ORDER.map(tense => {
    const tenseCards = cards.filter(c => c.tense === tense);
    const unlocked = tenseCards.length > 0;
    return `
      <div class="tense-section">
        <h3>
          ${TENSE_LABELS[tense]}
          <span style="color:var(--text2);font-size:11px">${tense}</span>
          ${!unlocked ? '<span class="lock-icon">🔒</span>' : ''}
        </h3>
        <div class="conjugation-grid">
          ${PERSONS.map(person => {
            const form = verb.conjugations?.[tense]?.[person] || '—';
            const c = cardMap[`${tense}__${person}`];
            return `<div class="conj-cell ${c && c.reps >= 3 ? 'mastered' : ''}">
              <div class="pers">${PERSON_LABELS[person]}</div>
              <div class="form">${unlocked ? form : '—'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}

function hideVerbDetail() {
  document.getElementById('verb-detail').style.display = 'none';
  document.getElementById('browse-screen').style.display = 'flex';
}

function filterVerbs(query) {
  _browseQuery = query;
  const q = query.toLowerCase();
  const filtered = _allVerbs.filter(v =>
    v.english.toLowerCase().includes(q) || v.infinitive.includes(q)
  );
  renderVerbList(filtered);
}

// ── STATS ──────────────────────────────────────────────────────────────────────
async function renderStats() {
  const [streak, due, total, introduced] = await Promise.all([
    getStreak(), getDueCount(), getTotalCards(), countIntroducedVerbs()
  ]);

  document.getElementById('stats-streak').textContent = streak;
  document.getElementById('stats-total-cards').textContent = total;
  document.getElementById('stats-verbs-learning').textContent = introduced;
  document.getElementById('stats-due').textContent = due;

  document.getElementById('export-btn').onclick = async () => {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `georgian-verbs-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  document.getElementById('import-btn').onclick = () => document.getElementById('import-file').click();
  document.getElementById('import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await importData(await file.text());
    e.target.value = '';
    showToast('Progress imported!');
    renderStats();
  };

  const allCards = await getDB().cards.toArray();
  const verbCards = allCards.filter(c => !c.cardType);
  document.getElementById('tense-progress').innerHTML = TENSE_ORDER.map(tense => {
    const tc = verbCards.filter(c => c.tense === tense);
    const mastered = tc.filter(c => c.reps >= 3).length;
    const pct = tc.length > 0 ? Math.round((mastered / tc.length) * 100) : 0;
    return `
      <div class="tense-row">
        <span class="name">${TENSE_LABELS[tense]}</span>
        <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="pct">${pct}%</span>
      </div>`;
  }).join('');
}

// ── OCR / SCAN PAGE ───────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:image/jpeg;base64,XXXX" — strip the prefix
      const b64 = reader.result.split(',')[1];
      resolve({ b64, mediaType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showScanPage(chapterId) {
  const input = document.getElementById('ocr-file-input');
  input.value = '';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    await runOcr(file, chapterId);
  };
  input.click();
}

async function runOcr(file, chapterId) {
  // Show OCR review screen with a spinner while we call the API
  document.getElementById('chapter-detail').style.display = 'none';
  const overlay = document.getElementById('ocr-review');
  overlay.style.display = 'flex';
  document.getElementById('ocr-review-meta').textContent = 'Scanning…';
  document.getElementById('ocr-word-list').innerHTML =
    '<div class="loading" style="flex:1"><div class="spinner"></div><p>Scanning…</p></div>';
  document.getElementById('ocr-save-btn').disabled = true;
  document.getElementById('ocr-review-back').onclick = () => {
    overlay.style.display = 'none';
    document.getElementById('chapter-detail').style.display = 'flex';
  };

  try {
    const apiKey = localStorage.getItem('anthropic_api_key');
    if (!apiKey) throw new Error('No API key set — add it in Settings ⚙');

    const { b64, mediaType } = await fileToBase64(file);

    const OCR_PROMPT = `You are a Georgian language textbook OCR assistant.
Extract vocabulary words from the photo of a textbook page.
Return ONLY a JSON array — no markdown, no explanation, just the array.
Each element must have exactly these keys:
  "georgian"  — the Georgian word in Mkhedruli script
  "english"   — the English translation (lowercase, without "to" for verbs)
  "type"      — one of: noun, verb, adj, adv, phrase, other

Rules:
- Include every distinct word or phrase you can read.
- If the page shows conjugation tables, extract only the infinitive/dictionary form.
- If there are no vocabulary words, return [].
- Return raw JSON only, e.g. [{"georgian":"სახლი","english":"house","type":"noun"}]`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: OCR_PROMPT },
        ]}],
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || `API error ${res.status}`);

    let raw = json.content[0].text.trim();
    if (raw.startsWith('```')) {
      raw = raw.includes('\n') ? raw.slice(raw.indexOf('\n') + 1) : raw.slice(3);
      const end = raw.lastIndexOf('```');
      if (end !== -1) raw = raw.slice(0, end).trim();
    }

    const validTypes = new Set(['noun', 'verb', 'adj', 'adv', 'phrase', 'other']);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = []; }
    const words = (Array.isArray(parsed) ? parsed : [])
      .filter(w => w?.georgian && w?.english)
      .map(w => ({
        georgian: String(w.georgian).trim(),
        english: String(w.english).trim().toLowerCase(),
        type: validTypes.has(w.type) ? w.type : 'other',
      }));

    renderOcrReview(words, chapterId);
  } catch (e) {
    document.getElementById('ocr-review-meta').textContent = 'Error';
    document.getElementById('ocr-word-list').innerHTML = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <h2>Scan failed</h2>
        <p>${e.message}</p>
      </div>`;
  }
}

function renderOcrReview(words, chapterId) {
  const meta = document.getElementById('ocr-review-meta');
  const list = document.getElementById('ocr-word-list');
  const saveBtn = document.getElementById('ocr-save-btn');
  const selAllBtn = document.getElementById('ocr-select-all-btn');

  if (words.length === 0) {
    meta.textContent = 'No words found';
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <h2>Nothing recognised</h2>
        <p>Try a clearer photo of the vocabulary section.</p>
      </div>`;
    saveBtn.disabled = true;
    return;
  }

  meta.textContent = `${words.length} word${words.length !== 1 ? 's' : ''} found — tap to select`;
  saveBtn.disabled = false;

  // All words selected by default
  const selected = new Set(words.map((_, i) => i));

  const render = () => {
    list.innerHTML = '';
    words.forEach((w, i) => {
      const checked = selected.has(i);
      const item = document.createElement('div');
      item.className = 'ocr-word-item' + (checked ? ' selected' : '');
      item.innerHTML = `
        <div class="ocr-check">${checked ? '✓' : ''}</div>
        <div class="vocab-item-words" style="flex:1">
          <div class="vocab-item-georgian">${w.georgian}</div>
          <div class="vocab-item-english">${w.english}</div>
        </div>
        <span class="vocab-type-badge">${VOCAB_TYPE_LABELS[w.type] || w.type}</span>`;
      item.onclick = () => {
        if (selected.has(i)) selected.delete(i);
        else selected.add(i);
        render();
        saveBtn.disabled = selected.size === 0;
      };
      list.appendChild(item);
    });
  };

  render();

  selAllBtn.onclick = () => {
    if (selected.size === words.length) selected.clear();
    else words.forEach((_, i) => selected.add(i));
    render();
    saveBtn.disabled = selected.size === 0;
  };

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    for (const i of selected) {
      await saveVocabItem({ ...words[i], chapterId });
    }
    showToast(`${selected.size} word${selected.size !== 1 ? 's' : ''} saved!`);
    document.getElementById('ocr-review').style.display = 'none';
    document.getElementById('chapter-detail').style.display = 'flex';
    renderChapterDetail(chapterId);
  };
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
async function renderSettings() {
  const settings = await getSettings();
  const screen = document.getElementById('settings-screen');
  let chosenMode = settings.studyMode;

  screen.innerHTML = `
    <div class="verb-detail-header">
      <button class="back-btn" id="settings-back">&#8592;</button>
      <div><h2>Settings</h2></div>
    </div>
    <div class="settings-body">
      <div class="setting-group">
        <label class="setting-label">New verbs per day</label>
        <div class="setting-row">
          <input type="range" id="set-new-verbs" min="1" max="10" value="${settings.newVerbs}" class="setting-range">
          <span id="set-new-verbs-val" class="setting-val">${settings.newVerbs}</span>
        </div>
      </div>
      <div class="setting-group">
        <label class="setting-label">Default study mode</label>
        <div class="mode-toggle" style="margin:0">
          <button data-mode="choice" class="${chosenMode === 'choice' ? 'active' : ''}">Multiple choice</button>
          <button data-mode="type"   class="${chosenMode === 'type'   ? 'active' : ''}">Type it</button>
        </div>
      </div>
      <div class="setting-group">
        <label class="setting-label">Starting ease factor</label>
        <select id="set-ease" class="setting-select">
          <option value="1.5" ${settings.startEase == 1.5 ? 'selected' : ''}>1.5 — Hard start</option>
          <option value="2.0" ${settings.startEase == 2.0 ? 'selected' : ''}>2.0 — Moderate</option>
          <option value="2.5" ${settings.startEase == 2.5 ? 'selected' : ''}>2.5 — Default</option>
          <option value="3.0" ${settings.startEase == 3.0 ? 'selected' : ''}>3.0 — Easy start</option>
        </select>
        <p class="setting-hint">Higher = longer gaps between reviews for new cards</p>
      </div>
      <div class="setting-group">
        <label class="setting-label">Anthropic API key</label>
        <input type="password" id="set-api-key" class="form-input"
          placeholder="sk-ant-…"
          value="${localStorage.getItem('anthropic_api_key') || ''}"
          autocomplete="off" autocorrect="off" spellcheck="false" />
        <p class="setting-hint">Required for photo scanning (OCR). Get yours at console.anthropic.com</p>
      </div>
      <button class="btn btn-primary" id="save-settings-btn">Save</button>
    </div>`;

  document.getElementById('settings-back').onclick = () => { showScreen('home'); renderHome(); };

  const slider = document.getElementById('set-new-verbs');
  const sliderVal = document.getElementById('set-new-verbs-val');
  slider.oninput = () => { sliderVal.textContent = slider.value; };

  document.querySelectorAll('#settings-screen .mode-toggle button').forEach(btn => {
    btn.onclick = () => {
      chosenMode = btn.dataset.mode;
      document.querySelectorAll('#settings-screen .mode-toggle button').forEach(b =>
        b.classList.toggle('active', b === btn));
    };
  });

  document.getElementById('save-settings-btn').onclick = async () => {
    const newSettings = {
      newVerbs: parseInt(slider.value, 10),
      studyMode: chosenMode,
      startEase: parseFloat(document.getElementById('set-ease').value),
    };
    await saveSettings(newSettings);
    _studyMode = newSettings.studyMode;
    const apiKey = document.getElementById('set-api-key').value.trim();
    if (apiKey) localStorage.setItem('anthropic_api_key', apiKey);
    else localStorage.removeItem('anthropic_api_key');
    showToast('Settings saved');
    showScreen('home');
    renderHome();
  };
}
