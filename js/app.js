// Main entry point — no ES modules, all globals

async function init() {
  // Register service worker (only works over HTTP, not file://)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Load verb data into IndexedDB
  if (location.protocol === 'file:') {
    // file:// blocks fetch — show a clear instruction
    document.getElementById('home-screen').innerHTML = `
      <div class="empty-state" style="flex:1">
        <div class="icon">⚠️</div>
        <h2>One more step</h2>
        <p>Open the app via the server so it can load verb data:</p>
        <p style="margin-top:8px;background:var(--surface2);padding:12px 16px;border-radius:12px;font-family:monospace;font-size:13px">
          python serve.py
        </p>
        <p>Then open <strong>http://localhost:8000</strong> in your browser.</p>
      </div>`;
    document.querySelector('nav').style.display = 'none';
    return;
  }

  try {
    const res = await fetch('data/verbs.json');
    const verbs = await res.json();
    if (verbs.length > 0) await loadVerbsIntoDB(verbs);
  } catch (e) {
    console.warn('Could not load verbs.json:', e);
  }

  // Nav
  document.querySelectorAll('nav button[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.screen;
      showScreen(s);
      if (s === 'home')   renderHome();
      if (s === 'browse') renderBrowse();
      if (s === 'stats')  renderStats();
    });
  });

  // Study shortcut button (no data-screen, triggers session directly)
  document.getElementById('nav-study').addEventListener('click', initStudy);

  // Start study button on home
  document.getElementById('start-study-btn').addEventListener('click', initStudy);

  // Browse search
  document.getElementById('browse-search').addEventListener('input', e => {
    filterVerbs(e.target.value);
  });

  // Verb detail back button
  document.getElementById('verb-detail-back').addEventListener('click', hideVerbDetail);

  // Keyboard shortcuts for rating (1=Again, 2=Hard, 3=Good, 4=Easy)
  document.addEventListener('keydown', e => {
    if (document.getElementById('study-screen')?.classList.contains('active')) {
      const map = { '1': 0, '2': 1, '3': 2, '4': 3 };
      if (map[e.key] !== undefined) {
        const btns = document.querySelectorAll('.rating-btn');
        if (btns.length === 4) btns[map[e.key]].click();
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const checkBtn = document.getElementById('check-btn');
        if (checkBtn) checkBtn.click();
      }
    }
  });

  showScreen('home');
  renderHome();
}

document.addEventListener('DOMContentLoaded', init);
