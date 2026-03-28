// UI — screen routing, rendering, event handling
// All event listeners use data attributes instead of inline onclick with Georgian text

let _studyMode = 'choice';  // 'choice' | 'type'
let _allVerbs = [];
let _pendingCorrect = null;  // correct answer for current card

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
  const [due, streak, introduced, total] = await Promise.all([
    getDueCount(), getStreak(), countIntroducedVerbs(), getTotalCards()
  ]);
  document.getElementById('home-streak').textContent = streak;
  document.getElementById('home-streak-label').textContent =
    streak === 1 ? '1 day streak' : `${streak} day streak`;
  document.getElementById('home-due').textContent = due;
  document.getElementById('home-verbs').textContent = introduced;
  document.getElementById('home-cards').textContent = total;

  const btn = document.getElementById('start-study-btn');
  btn.disabled = false;
  btn.textContent = due > 0 ? `Study now  ·  ${due} due` : 'Start session';
}

// ── STUDY SESSION ──────────────────────────────────────────────────────────────
async function initStudy() {
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
    else renderTypeMode(correct);
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

  document.querySelectorAll('.choice-btn').forEach(b => {
    b.disabled = true;
    if (b.dataset.answer === correct) b.classList.add(isCorrect && b === btn ? 'correct' : 'reveal');
  });
  if (!isCorrect) btn.classList.remove('reveal');
  if (!isCorrect) btn.classList.add('wrong');

  showRatingButtons(isCorrect, correct);
}

function renderTypeMode(correct) {
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
    const isCorrect = typed === correct;
    input.disabled = true;
    checkBtn.remove();
    input.classList.add(isCorrect ? 'correct' : 'wrong');
    showRatingButtons(isCorrect, correct);
  };

  checkBtn.onclick = doCheck;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doCheck(); });

  wrap.appendChild(input);
  wrap.appendChild(checkBtn);
  area.appendChild(wrap);
  input.focus();
}

function showRatingButtons(wasCorrect, correct) {
  const area = document.getElementById('answer-area');
  if (!area) return;

  if (!wasCorrect) {
    const reveal = document.createElement('div');
    reveal.className = 'answer-reveal';
    reveal.innerHTML = `<div class="correct-answer">${correct}</div><div class="answer-note">Correct answer</div>`;
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
      <button class="btn btn-secondary" id="more-btn">Study more</button>
      <button class="btn btn-primary" id="done-btn">Done</button>
    </div>`;
  document.getElementById('more-btn').onclick = () => extendDailyLimit().then(initStudy);
  document.getElementById('done-btn').onclick = () => { showScreen('home'); renderHome(); };
}

// ── BROWSE ─────────────────────────────────────────────────────────────────────
async function renderBrowse() {
  _allVerbs = await getVerbs(500);
  renderVerbList(_allVerbs);
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
    row.className = 'verb-row';
    row.innerHTML = `
      <div>
        <div class="geo">${v.conjugations?.present?.['3sg'] || v.infinitive}</div>
        <div class="eng">to ${v.english}</div>
      </div>
      <div class="mastery" id="mastery-${v.id}">—</div>`;
    row.onclick = () => showVerbDetail(v.id);
    list.appendChild(row);

    getVerbCards(v.id).then(cards => {
      const el = document.getElementById('mastery-' + v.id);
      if (!el) return;
      if (cards.length === 0) { el.textContent = 'New'; return; }
      const mastered = cards.filter(c => c.reps >= 3).length;
      el.textContent = `${mastered}/${cards.length}`;
      if (mastered === cards.length) el.classList.add('learned');
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
