// IndexedDB layer — Dexie loaded globally from CDN

function getDB() {
  if (window._db) return window._db;
  const db = new Dexie('GeorgianVerbs');
  db.version(1).stores({
    cards: 'id, verbId, tense, person, nextReview, introduced',
    verbs: 'id, frequency_rank',
    meta:  'key'
  });
  db.version(2).stores({
    cards:    'id, verbId, vocabId, tense, person, nextReview, introduced',
    verbs:    'id, frequency_rank',
    meta:     'key',
    chapters: '++id, number',
    vocab:    '++id, chapterId',
  });
  db.version(3).stores({
    cards:            'id, verbId, vocabId, tense, person, nextReview, introduced',
    verbs:            'id, frequency_rank',
    meta:             'key',
    chapters:         '++id, number',
    vocab:            '++id, chapterId',
    sentenceProgress: 'ka',
  });
  window._db = db;
  return db;
}

async function markSentenceStudied(ka) {
  await getDB().sentenceProgress.put({ ka });
}

async function getStudiedKas() {
  const rows = await getDB().sentenceProgress.toArray();
  return new Set(rows.map(r => r.ka));
}

async function resetSentenceProgress() {
  await getDB().sentenceProgress.clear();
}

async function loadVerbsIntoDB(verbs) {
  const db = getDB();
  const count = await db.verbs.count();
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

async function getVocabCards(vocabId) {
  return getDB().cards.where('vocabId').equals(vocabId).toArray();
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
  return new Set(cards.filter(c => !c.cardType).map(c => c.verbId)).size;
}

async function getTotalCards() {
  return getDB().cards.count();
}

async function getDueCount() {
  return getDB().cards.where('nextReview').belowOrEqual(Date.now()).count();
}

async function exportData() {
  const db = getDB();
  const [cards, meta, chapters, vocab] = await Promise.all([
    db.cards.toArray(), db.meta.toArray(),
    db.chapters.toArray(), db.vocab.toArray(),
  ]);
  return JSON.stringify({ cards, meta, chapters, vocab, exportedAt: Date.now() }, null, 2);
}

async function importData(jsonString) {
  const { cards, meta, chapters, vocab } = JSON.parse(jsonString);
  const db = getDB();
  if (cards?.length)    await db.cards.bulkPut(cards);
  if (meta?.length)     await db.meta.bulkPut(meta);
  if (chapters?.length) await db.chapters.bulkPut(chapters);
  if (vocab?.length)    await db.vocab.bulkPut(vocab);
}

async function getSettings() {
  const s = await getMeta('settings');
  return { newVerbs: 2, studyMode: 'choice', startEase: 2.5, ...(s || {}) };
}

async function saveSettings(settings) {
  return setMeta('settings', settings);
}

// ── CHAPTERS ──────────────────────────────────────────────────────────────────

async function getChapters() {
  return getDB().chapters.orderBy('number').toArray();
}

async function getChapter(id) {
  return getDB().chapters.get(id);
}

async function saveChapter(chapter) {
  return getDB().chapters.put(chapter);
}

async function deleteChapter(id) {
  const db = getDB();
  const vocabItems = await db.vocab.where('chapterId').equals(id).toArray();
  for (const v of vocabItems) {
    await db.cards.where('vocabId').equals(v.id).delete();
    await db.vocab.delete(v.id);
  }
  await db.chapters.delete(id);
}

// ── VOCAB ─────────────────────────────────────────────────────────────────────

async function getVocabByChapter(chapterId) {
  return getDB().vocab.where('chapterId').equals(chapterId).toArray();
}

async function getVocabItem(id) {
  return getDB().vocab.get(id);
}

async function saveVocabItem(item) {
  return getDB().vocab.put(item);
}

async function deleteVocabItem(id) {
  const db = getDB();
  await db.cards.where('vocabId').equals(id).delete();
  await db.vocab.delete(id);
}

async function syncToServer() {}
async function syncFromServer() { return false; }
