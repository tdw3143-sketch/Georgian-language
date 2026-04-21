// Main entry point — no ES modules, all globals

async function init() {
  // Register service worker (only works over HTTP, not file://)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Load verb data into IndexedDB
  try {
    const res = await fetch('data/verbs.json');
    const verbs = await res.json();
    if (verbs.length > 0) await loadVerbsIntoDB(verbs);
  } catch (e) {
    console.warn('Could not load verbs.json:', e);
  }

  // Load Tatoeba example sentences (fails silently if not yet downloaded)
  window._tatoeba = [];
  fetch('data/tatoeba.json')
    .then(r => r.ok ? r.json() : [])
    .then(data => { window._tatoeba = data; })
    .catch(() => {});

  // Load settings (study mode default)
  const _initSettings = await getSettings();
  _studyMode = _initSettings.studyMode;

  // Settings gear button
  document.getElementById('settings-btn').addEventListener('click', () => {
    showScreen('settings');
    renderSettings();
  });

  // Nav
  document.querySelectorAll('nav button[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.screen;
      showScreen(s);
      if (s === 'home')      renderHome();
      if (s === 'sentences') renderSentences();
      if (s === 'stats')     renderStats();
      if (s === 'chapters')  renderChapters();
    });
  });

  // Study shortcut button
  document.getElementById('nav-study').addEventListener('click', initStudy);

  // Start study button on home
  document.getElementById('start-study-btn').addEventListener('click', initStudy);

  // Browse search
  document.getElementById('browse-search').addEventListener('input', e => {
    filterVerbs(e.target.value);
  });

  // Verb detail back button
  document.getElementById('verb-detail-back').addEventListener('click', hideVerbDetail);

  // Add verb back button
  document.getElementById('add-verb-back').addEventListener('click', hideAddVerbScreen);

  // Chapter detail back button
  document.getElementById('chapter-detail-back').addEventListener('click', hideChapterDetail);

  // New chapter back button
  document.getElementById('chapter-new-back').addEventListener('click', () => {
    document.getElementById('chapter-new').style.display = 'none';
    document.getElementById('chapters-screen').style.display = 'flex';
  });

  // New chapter save button
  document.getElementById('chapter-new-save').addEventListener('click', saveNewChapter);
  document.getElementById('chapter-new-number').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('chapter-new-name').focus();
  });
  document.getElementById('chapter-new-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNewChapter();
  });

  // Vocab add back + done buttons
  document.getElementById('vocab-add-back').addEventListener('click', hideAddVocabForm);
  document.getElementById('vocab-done-btn').addEventListener('click', hideAddVocabForm);

  // Keyboard shortcuts for study screen
  document.addEventListener('keydown', e => {
    if (document.getElementById('study-screen')?.classList.contains('active')) {
      if (e.key === 'Enter' || e.key === ' ') {
        const checkBtn = document.getElementById('check-btn');
        if (checkBtn) { checkBtn.click(); return; }
        const nextBtn = document.querySelector('.next-btn');
        if (nextBtn) nextBtn.click();
      }
    }
  });

  showScreen('home');
  renderHome();
}

document.addEventListener('DOMContentLoaded', init);
