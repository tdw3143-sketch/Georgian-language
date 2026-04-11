// IndexedDB layer — Dexie loaded globally from CDN

function getDB() {
  if (window._db) return window._db;
  const db = new Dexie('GeorgianVerbs');
  db.version(1).stores({
    cards: 'id, verbId, tense, person, nextReview, introduced',
    verbs: 'id, frequency_rank',
    meta:  'key'
  });
  window._db = db;
  return db;
}

async function loadVerbsIntoDB(verbs) {
  const db = getDB();
  const count = await db.verbs.count();
  // Always sync if JSON has more verbs than DB (handles scraper updates)
  if (count >= verbs.length) return;
  await db.verbs.bulkPut(verbs);
}

async function getVerbs(limit = 500) {
  return getDB().verbs.orderBy('frequency_rank').limit(limit).toArray();
}

async function getVerb(id) {
  return getDB().verbs.get(id);
}

async function getCard(id) {
  return getDB().cards.get(id);
}

async function saveCard(card) {
  return getDB().cards.put(card);
}

async function getDueCards(now = Date.now()) {
  return getDB().cards.where('nextReview').belowOrEqual(now).toArray();
}

async function getVerbCards(verbId) {
  return getDB().cards.where('verbId').equals(verbId).toArray();
}

async function getMeta(key) {
  const row = await getDB().meta.get(key);
  return row ? row.value : null;
}

async function setMeta(key, value) {
  return getDB().meta.put({ key, value });
}

async function updateStreak() {
  const today = new Date().toDateString();
  const lastDay = await getMeta('lastStudyDay');
  let streak = (await getMeta('streak')) || 0;
  if (lastDay === today) return streak;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  streak = (lastDay === yesterday) ? streak + 1 : 1;
  await setMeta('lastStudyDay', today);
  await setMeta('streak', streak);
  return streak;
}

async function getStreak() {
  return (await getMeta('streak')) || 0;
}

async function countIntroducedVerbs() {
  const cards = await getDB().cards.where('introduced').equals(1).toArray();
  return new Set(cards.map(c => c.verbId)).size;
}

async function getTotalCards() {
  return getDB().cards.count();
}

async function getDueCount() {
  return getDB().cards.where('nextReview').belowOrEqual(Date.now()).count();
}

async function exportData() {
  const db = getDB();
  const [cards, meta] = await Promise.all([db.cards.toArray(), db.meta.toArray()]);
  return JSON.stringify({ cards, meta, exportedAt: Date.now() }, null, 2);
}

async function importData(jsonString) {
  const { cards, meta } = JSON.parse(jsonString);
  const db = getDB();
  if (cards?.length) await db.cards.bulkPut(cards);
  if (meta?.length)  await db.meta.bulkPut(meta);
}

async function getSettings() {
  const s = await getMeta('settings');
  return { newVerbs: 2, studyMode: 'choice', startEase: 2.5, ...(s || {}) };
}

async function saveSettings(settings) {
  return setMeta('settings', settings);
}
