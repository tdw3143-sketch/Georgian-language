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

// English phrase building for study card prompts
const _IRR_3SG  = { be:'is', do:'does', go:'goes', have:'has' };
const _IRR_PAST = {
  be:'was', do:'did', go:'went', have:'had', say:'said', come:'came',
  know:'knew', get:'got', see:'saw', give:'gave', think:'thought',
  take:'took', find:'found', tell:'told', feel:'felt', leave:'left',
  keep:'kept', begin:'began', hear:'heard', run:'ran', put:'put',
  mean:'meant', stand:'stood', lose:'lost', pay:'paid', meet:'met',
  sit:'sat', speak:'spoke', read:'read', spend:'spent', grow:'grew',
  write:'wrote', fall:'fell', drive:'drove', hold:'held', let:'let',
  win:'won', bring:'brought', buy:'bought', lead:'led', send:'sent',
  build:'built', teach:'taught', cut:'cut', set:'set', hit:'hit',
  sing:'sang', eat:'ate', drink:'drank', fly:'flew', ride:'rode',
  understand:'understood', stand:'stood', make:'made',
};

function _get3sg(v) {
  if (_IRR_3SG[v]) return _IRR_3SG[v];
  if (/[sxz]$|ch$|sh$|o$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  return v + 's';
}
function _getPast(v) {
  if (_IRR_PAST[v]) return _IRR_PAST[v];
  if (v.endsWith('e')) return v + 'd';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied';
  return v + 'ed';
}
function _getGerund(v) {
  if (v.endsWith('ie')) return v.slice(0, -2) + 'ying';
  if (v.endsWith('e') && !v.endsWith('ee')) return v.slice(0, -1) + 'ing';
  return v + 'ing';
}
const _PRONOUNS = { '1sg':'I', '2sg':'you', '3sg':'he', '1pl':'we', '2pl':'you all', '3pl':'they' };

function buildEnglishPhrase(person, tense, verbEnglish) {
  const pr = _PRONOUNS[person];
  const v  = verbEnglish;
  switch (tense) {
    case 'present':
      return `${pr} ${person === '3sg' ? _get3sg(v) : v}`;
    case 'imperfect': {
      const aux = (person === '1sg' || person === '3sg') ? 'was' : 'were';
      return `${pr} ${aux} ${_getGerund(v)}`;
    }
    case 'future':
      return `${pr} will ${v}`;
    case 'aorist':
      return `${pr} ${_getPast(v)}`;
    case 'optative':
      return `${pr} would ${v}`;
    case 'perfect': {
      const aux = person === '3sg' ? 'has' : 'have';
      return `${pr} ${aux} ${_getPast(v)}`;
    }
    default:
      return `${pr} ${v}`;
  }
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
