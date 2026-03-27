// Cloud sync — Georgian Verbs backend on Railway
// After deploying the backend, replace the placeholder below with your Railway URL.
const SYNC_URL = 'https://YOUR-APP.up.railway.app';

// ── TOKEN STORAGE ──────────────────────────────────────────────────────────────
function syncGetToken()  { return localStorage.getItem('gv_token'); }
function syncGetEmail()  { return localStorage.getItem('gv_email'); }
function syncLoggedIn()  { return !!syncGetToken(); }

function _syncSaveAuth(token, email) {
  localStorage.setItem('gv_token', token);
  localStorage.setItem('gv_email', email);
}

function syncLogout() {
  localStorage.removeItem('gv_token');
  localStorage.removeItem('gv_email');
}


// ── HTTP HELPER ────────────────────────────────────────────────────────────────
async function _syncReq(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = syncGetToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(SYNC_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || 'Sync failed (' + res.status + ')');
  return json;
}


// ── AUTH ───────────────────────────────────────────────────────────────────────
async function syncRegister(email, password) {
  const data = await _syncReq('POST', '/register', { email, password });
  _syncSaveAuth(data.token, email);
}

async function syncLogin(email, password) {
  const data = await _syncReq('POST', '/login', { email, password });
  _syncSaveAuth(data.token, email);
}


// ── PUSH (local → server) ──────────────────────────────────────────────────────
async function syncPush() {
  if (!syncLoggedIn()) return;
  const db       = getDB();
  const cards    = await db.cards.toArray();
  const metaRows = await db.meta.toArray();

  await _syncReq('POST', '/sync', {
    cards: cards.map(c => ({ data: c, updatedAt: c.updatedAt || 0 })),
    meta:  metaRows.map(m => ({
      key:       m.key,
      value:     JSON.stringify(m.value),
      updatedAt: m.updatedAt || 0,
    })),
  });
}


// ── PULL (server → local, last-write-wins) ─────────────────────────────────────
async function syncPull() {
  if (!syncLoggedIn()) return;
  const data = await _syncReq('GET', '/sync');
  const db   = getDB();

  for (const item of (data.cards || [])) {
    const serverCard = { ...item.data, updatedAt: item.updatedAt };
    const local = await db.cards.get(serverCard.id);
    if (!local || (local.updatedAt || 0) < item.updatedAt) {
      await db.cards.put(serverCard);
    }
  }

  for (const item of (data.meta || [])) {
    const local = await db.meta.get(item.key);
    if (!local || (local.updatedAt || 0) < item.updatedAt) {
      let val;
      try { val = JSON.parse(item.value); } catch { val = item.value; }
      await db.meta.put({ key: item.key, value: val, updatedAt: item.updatedAt });
    }
  }
}


// ── FULL SYNC (push then pull) ─────────────────────────────────────────────────
async function doFullSync() {
  if (!syncLoggedIn()) return;
  try {
    await syncPush();
    await syncPull();
    return true;
  } catch (e) {
    console.warn('Sync error:', e.message);
    return false;
  }
}
