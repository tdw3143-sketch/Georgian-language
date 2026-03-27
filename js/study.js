// Study session engine

const NEW_VERBS_PER_DAY = 5;

async function buildQueue() {
  const db = getDB();
  const now = Date.now();
  const due = await getDueCards(now);

  // Introduce new verbs today
  const todayKey = new Date().toDateString();
  const newTodayCount = (await getMeta('newVerbsToday_' + todayKey)) || 0;
  const newCards = [];

  if (newTodayCount < NEW_VERBS_PER_DAY) {
    const slotsLeft = NEW_VERBS_PER_DAY - newTodayCount;
    const verbs = await getVerbs(500);
    let introduced = 0;

    for (const verb of verbs) {
      if (introduced >= slotsLeft) break;
      const existing = await db.cards.where('verbId').equals(verb.id).toArray();
      if (existing.length > 0) continue; // already started

      for (const person of PERSONS) {
        const card = newCard(verb.id, 'present', person);
        await saveCard(card);
        newCards.push(card);
      }
      introduced++;
    }

    if (introduced > 0) {
      await setMeta('newVerbsToday_' + todayKey, newTodayCount + introduced);
    }
  }

  // Unlock next tenses for mastered tenses
  await checkTenseUnlocks();

  const seen = new Set(due.map(c => c.id));
  const fresh = newCards.filter(c => !seen.has(c.id));
  return shuffle([...due, ...fresh]);
}

async function checkTenseUnlocks() {
  const db = getDB();
  const allCards = await db.cards.toArray();
  const byVerb = {};
  for (const c of allCards) {
    (byVerb[c.verbId] = byVerb[c.verbId] || []).push(c);
  }

  for (const [verbId, cards] of Object.entries(byVerb)) {
    for (let ti = 0; ti < TENSE_ORDER.length - 1; ti++) {
      const tense = TENSE_ORDER[ti];
      const nextTense = TENSE_ORDER[ti + 1];
      const tenseCards = cards.filter(c => c.tense === tense);
      if (tenseCards.length < PERSONS.length) break;
      if (!tenseCards.every(c => c.reps >= 1)) break;
      if (cards.some(c => c.tense === nextTense)) continue;

      for (const person of PERSONS) {
        await saveCard(newCard(verbId, nextTense, person));
      }
    }
  }
}

// Session state
let _queue = [], _index = 0, _correct = 0, _reviewed = 0;

async function startSession() {
  _queue = await buildQueue();
  _index = 0; _correct = 0; _reviewed = 0;
  await updateStreak();
  return _queue.length;
}

function currentCard() { return _queue[_index] || null; }

function sessionProgress() {
  return { index: _index, total: _queue.length, correct: _correct, reviewed: _reviewed };
}

async function submitRating(quality) {
  const card = currentCard();
  if (!card) return null;
  if (quality >= 2) _correct++;
  _reviewed++;
  const updated = sm2(card, quality);
  await saveCard(updated);
  if (quality === 0) _queue.push({ ...updated });
  _index++;
  return currentCard();
}

function isSessionDone() { return _index >= _queue.length; }
function sessionStats() { return { correct: _correct, reviewed: _reviewed }; }

async function getDistractors(card, verbData) {
  const db = getDB();
  const correct = verbData.conjugations?.[card.tense]?.[card.person];
  const distractors = new Set();

  const others = await db.cards
    .where('tense').equals(card.tense)
    .filter(c => c.verbId !== card.verbId)
    .limit(30)
    .toArray();

  for (const c of shuffle(others)) {
    const verb = await db.verbs.get(c.verbId);
    if (!verb) continue;
    const form = verb.conjugations?.[c.tense]?.[c.person];
    if (form && form !== correct) {
      distractors.add(form);
      if (distractors.size >= 3) break;
    }
  }

  // Pad with same-verb other persons
  if (distractors.size < 3) {
    for (const person of shuffle(PERSONS)) {
      if (person === card.person) continue;
      const form = verbData.conjugations?.[card.tense]?.[person];
      if (form && form !== correct) {
        distractors.add(form);
        if (distractors.size >= 3) break;
      }
    }
  }

  return shuffle([correct, ...Array.from(distractors).slice(0, 3)]);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
