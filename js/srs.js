// SM-2 spaced repetition algorithm

const TENSE_ORDER = ['present', 'imperfect', 'future', 'aorist', 'optative', 'perfect'];

const TENSE_LABELS = {
  present:   'აწმყო',
  imperfect: 'უწყვეტელი',
  future:    'მყოფადი',
  aorist:    'აორისტი',
  optative:  'კავშირებითი',
  perfect:   'პერფექტი'
};

const PERSONS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];

const PERSON_LABELS = {
  '1sg': 'I',        '2sg': 'you',      '3sg': 'he / she / it',
  '1pl': 'we',       '2pl': 'you (pl)', '3pl': 'they'
};

// SM-2: quality 0=Again, 1=Hard, 2=Good, 3=Easy
function sm2(card, quality) {
  let { ease, interval, reps } = card;
  if (quality < 1) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 3;
    else interval = Math.round(interval * ease);
    reps += 1;
    ease = Math.max(1.3, ease + 0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02));
  }
  const nextReview = Date.now() + interval * 86400000;
  return { ...card, ease, interval, reps, nextReview, lastReviewed: Date.now() };
}

function newCard(verbId, tense, person) {
  return {
    id: `${verbId}__${tense}__${person}`,
    verbId, tense, person,
    ease: 2.5, interval: 1, reps: 0,
    nextReview: Date.now(),
    lastReviewed: null,
    introduced: 1,
  };
}
