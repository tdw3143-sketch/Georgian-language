// UI — screen routing, rendering, event handling

let _studyMode = 'choice';  // 'choice' | 'type' — initialised from settings
let _allVerbs = [];
let _pendingCorrect = null;
let _pendingCard = null;
let _pendingVerb = null;
let _sessionMistakes = [];  // {card, verb, typed, correct}

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
    document.getElementById('back-from-empty').onclick = () => {
      showScreen('home'); renderHome();
    };
    return;
  }

  renderStudyCard();
}

function renderStudyCard() {
  const card = currentCard();
  if (!card || isSessionDone()) { renderSessionDone(); return; }

  const { index, total } = sessionProgress();
  const pct = Math.round((index / total) * 100);

  getVerb(card.verbId).then(verb => {
    if (!verb) { submitRating(0).then(renderStudyCard); return; }

    const correct = verb.conjugations?.[card.tense]?.[card.person] || '—';
    _pendingCorrect = correct;
    _pendingCard = card;
    _pendingVerb = verb;

    const screen = document.getElementById('study-screen');
    screen.innerHTML = `
      <div class="session-header">
        <button class="exit-btn" id="exit-study">✕</button>
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
        <span class="session-count">${index}/${total}</span>
      </div>
      <div class="card-area">
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
        <div id="answer-area" class="answer-area"></div>
      </div>`;

    document.getElementById('exit-study').onclick = () => { showScreen('home'); renderHome(); };
    document.querySelectorAll('.mode-toggle button').forEach(btn => {
      btn.onclick = () => { _studyMode = btn.dataset.mode; renderStudyCard(); };
    });

    if (_studyMode === 'choice') renderChoiceMode(card, verb, correct);
    else renderTypeMode(card, verb, correct);
  });
}

function renderChoiceMode(card, verb, correct) {
  getDistractors(card, verb).then(options => {
    const area = document.getElementById('answer-area');
    if (!area) return;

    const grid = document.createElement('div');
    grid.className = 'choice-grid';
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

  if (!isCorrect && _pendingCard && _pendingVerb) {
    _sessionMistakes.push({ card: _pendingCard, verb: _pendingVerb, typed: chosen, correct });
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
        e.preventDefault(); // prevent input losing focus
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

function renderTypeMode(card, verb, correct) {
  const area = document.getElementById('answer-area');
  if (!area) return;

  const wrap = document.createElement('div');
  wrap.className = 'type-wrap';

  const input = document.createElement('input');
  input.id = 'type-input';
  input.className = 'type-input';
  input.type = 'text';
  input.placeholder = 'type the form…';
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
      _sessionMistakes.push({ card, verb, typed, correct });
    }
    if (isFuzzy) showToast('Almost! Accepted');

    showRatingButtons(isCorrect, correct, isFuzzy);
  };

  checkBtn.onclick = doCheck;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doCheck(); });

  wrap.appendChild(input);
  wrap.appendChild(checkBtn);
  wrap.appendChild(buildGeoKeyboard(input));
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
    const phrase = buildEnglishPhrase(m.card.person, m.card.tense, m.verb.english);
    const verbDisplay = m.verb.conjugations?.present?.['3sg'] || m.verb.infinitive;
    return `
      <div class="mistake-card">
        <div class="mistake-meta">
          <span class="mistake-tense">${TENSE_LABELS[m.card.tense]}</span>
          <span class="mistake-phrase">${phrase}</span>
        </div>
        <div class="mistake-verb">${verbDisplay}</div>
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

// ── ADD VERB ───────────────────────────────────────────────────────────────────
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
  document.getElementById('tense-progress').innerHTML = TENSE_ORDER.map(tense => {
    const tc = allCards.filter(c => c.tense === tense);
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
    showToast('Settings saved');
    showScreen('home');
    renderHome();
  };
}
