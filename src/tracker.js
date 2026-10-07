// Application tracking and the document checklist.
//
// Two things a reader does *after* they have found a scholarship: decide which
// ones they are actually going for, and work out what paperwork is still
// missing. Both are pure functions here rather than logic inside the component,
// for the same reason `eligibility.js` is separate — so they can be unit-tested
// against the awkward cases, which here are dates.
//
// The honesty rules this module keeps, carried over from the rest of the app:
//
//   * A date is only ever a date when the catalog recorded one. Eleven of the
//     fifty records carry a single verified closing date; the rest carry
//     `deadline_notes` describing a window, a field split or a country rule.
//     A record without a `deadline` is reported as "no published date" — it is
//     never given an invented one, and it never silently disappears from the
//     tracker, because a programme whose window is unstated is exactly the one
//     that needs a human to go and look.
//
//   * A passed deadline is reported as passed. It is not quietly hidden or
//     re-labelled as "open" because the scheme recurs annually; whether the
//     next cycle is open is the provider's statement to make, not this app's.

/** The stages a reader can put a tracked application through. */
export const TRACK_STATUSES = [
  { id: 'planning', label: 'Planning to apply' },
  { id: 'preparing', label: 'Preparing documents' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'awarded', label: 'Awarded' },
  { id: 'rejected', label: 'Not selected' },
];

export const DEFAULT_TRACK_STATUS = 'planning';

/** The statuses that still need work. Used for the "still open" count. */
const OPEN_STATUSES = ['planning', 'preparing'];

/** A deadline inside this many days is called "due soon". */
export const DUE_SOON_DAYS = 30;

/** A deadline inside this many days is called "urgent". */
export const URGENT_DAYS = 7;

/** True when `id` names a status the tracker may store. */
export function isValidStatus(id) {
  return TRACK_STATUSES.some((status) => status.id === id);
}

/**
 * True when an application still needs work from the reader.
 *
 * This is the predicate the alert badge is built on, so it lives here rather
 * than in the component: an unknown stored value counts as the default
 * (`planning`), which is the safe direction — it asks for attention rather
 * than silently hiding a record from the alert.
 */
export function isOpenStatus(id) {
  return OPEN_STATUSES.includes(isValidStatus(id) ? id : DEFAULT_TRACK_STATUS);
}

/** The label for a status id, falling back to the default rather than throwing. */
export function statusLabel(id) {
  const found = TRACK_STATUSES.find((status) => status.id === id);
  return (found || TRACK_STATUSES[0]).label;
}

/** The set of status ids, for callers that need to reject a stored value. */
export const STATUS_IDS = TRACK_STATUSES.map((status) => status.id);

// --- dates -----------------------------------------------------------------
//
// Dates are compared as calendar days, not as instants. `new Date('2026-11-30')
// - new Date('2026-11-29')` is 24 hours in UTC but 23 or 25 hours in a zone
// with a DST shift, which would round a one-day difference to 0. Everything
// here goes through `Date.UTC` on the parsed parts so the arithmetic is exact
// and the reader's timezone cannot change an answer.

/** Parse `YYYY-MM-DD` to a UTC-midnight timestamp, or null if it is not one. */
function toUtcDay(iso) {
  if (typeof iso !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  if (Number.isNaN(ms)) return null;

  // `Date.UTC` silently rolls an impossible date over — 2026-02-30 becomes
  // 2 March — so a typo would become a plausible-looking countdown. Read the
  // parts back and reject anything that did not survive the round trip.
  const readBack = new Date(ms);
  if (readBack.getUTCFullYear() !== year || readBack.getUTCMonth() !== month - 1 || readBack.getUTCDate() !== day) {
    return null;
  }
  return ms;
}

/** Today, as `YYYY-MM-DD` in the reader's own timezone. */
export function todayIso(now) {
  const d = now instanceof Date ? now : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Whole days from `fromIso` to `toIso`. Positive means `toIso` is in the
 * future. Returns null when either date is unusable, so a caller can never
 * mistake "unparseable" for "today".
 */
export function daysUntil(toIso, fromIso) {
  const to = toUtcDay(toIso);
  const from = toUtcDay(fromIso);
  if (to === null || from === null) return null;
  return Math.round((to - from) / 86400000);
}

/**
 * The countdown for one record's deadline.
 *
 * `level` is the machine-readable state; `label` is what a reader sees.
 * Levels: `overdue` | `today` | `urgent` | `soon` | `later` | `nodate`.
 */
export function deadlineInfo(record, fromIso) {
  const days = record && record.deadline ? daysUntil(record.deadline, fromIso) : null;

  if (days === null) {
    return {
      hasDate: false,
      days: null,
      level: 'nodate',
      // A record with no date but a note is not "unknown" — the provider
      // describes a window, it just does not reduce to one closing date.
      label: record && record.deadline_notes ? 'No single closing date' : 'No date published',
    };
  }

  if (days < 0) {
    const past = -days;
    return { hasDate: true, days, level: 'overdue', label: past === 1 ? 'Passed yesterday' : `Passed ${past} days ago` };
  }
  if (days === 0) return { hasDate: true, days, level: 'today', label: 'Due today' };
  if (days <= URGENT_DAYS) {
    return { hasDate: true, days, level: 'urgent', label: days === 1 ? 'Due tomorrow' : `Due in ${days} days` };
  }
  if (days <= DUE_SOON_DAYS) return { hasDate: true, days, level: 'soon', label: `Due in ${days} days` };
  return { hasDate: true, days, level: 'later', label: `Due in ${days} days` };
}

/**
 * Counts across the tracked set, for the summary strip and the alert badge.
 *
 * The four deadline buckets describe the dates and count every tracked record,
 * whatever its stage — "3 deadlines have passed" is a fact about the list.
 *
 * `needsAction` is the narrower, noisier-adjacent figure: records that are
 * *still open* and whose date is near or gone. A submitted application whose
 * date has passed is history, not a task, so it is deliberately excluded —
 * an alert that fires on finished work is one a reader learns to ignore.
 */
export function trackerSummary(entries, fromIso) {
  const summary = {
    total: entries.length,
    passed: 0,
    dueSoon: 0,
    later: 0,
    noDate: 0,
    stillOpen: 0,
    needsAction: 0,
    byStatus: Object.fromEntries(STATUS_IDS.map((id) => [id, 0])),
  };

  for (const entry of entries) {
    const info = deadlineInfo(entry.record, fromIso);
    if (info.level === 'nodate') summary.noDate += 1;
    else if (info.level === 'overdue') summary.passed += 1;
    else if (info.level === 'later') summary.later += 1;
    else summary.dueSoon += 1;

    const status = isValidStatus(entry.status) ? entry.status : DEFAULT_TRACK_STATUS;
    summary.byStatus[status] += 1;

    if (OPEN_STATUSES.includes(status)) {
      summary.stillOpen += 1;
      if (info.level !== 'nodate' && info.level !== 'later') summary.needsAction += 1;
    }
  }

  summary.settled = summary.total - summary.stillOpen;
  return summary;
}

/**
 * Sort order for a tracker list: the most urgent first.
 *
 * Overdue leads, then today, then the nearest future date, then records with no
 * published date, then anything already submitted or decided. Ties fall back to
 * the name so the order is stable and a re-render never shuffles the list.
 */
export function sortTracked(entries, fromIso) {
  const rank = (entry) => {
    const status = isValidStatus(entry.status) ? entry.status : DEFAULT_TRACK_STATUS;
    // A decided or submitted application is no longer competing for attention.
    const settled = !OPEN_STATUSES.includes(status);
    const info = deadlineInfo(entry.record, fromIso);
    const bucket = info.level === 'nodate' ? 2 : 1;
    return { settled: settled ? 1 : 0, bucket, days: info.days === null ? Infinity : info.days };
  };

  return [...entries].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra.settled !== rb.settled) return ra.settled - rb.settled;
    if (ra.bucket !== rb.bucket) return ra.bucket - rb.bucket;
    if (ra.days !== rb.days) return ra.days - rb.days;
    return (a.record.name || '').localeCompare(b.record.name || '');
  });
}

// --- documents -------------------------------------------------------------
//
// A checklist, not a requirement list. No scheme's document set is knowable
// from this catalog, so these are the items an applicant is ordinarily asked
// for; the copy says so, and the reader is the one who decides what is present.
//
// `levels` decides when an item becomes *required* for the reader. `all` means
// every applicant; a degree level means only readers aiming at that level. The
// distinction matters because "you are missing a research proposal" is wrong
// for a Master's applicant, and a checklist that cries wolf gets ignored.

export const DOCUMENTS = [
  { id: 'passport', label: 'Passport', hint: 'Most providers want it valid for well beyond your study start date.', levels: ['all'] },
  { id: 'transcript', label: 'Academic transcripts', hint: 'Official, sealed or certified copies are commonly required.', levels: ['all'] },
  { id: 'degree', label: 'Degree / graduation certificate', hint: 'Your completed bachelor\u2019s certificate, or a provisional one.', levels: ['all'] },
  { id: 'cv', label: 'CV or r\u00e9sum\u00e9', hint: 'Usually one to two pages; some schemes publish their own template.', levels: ['all'] },
  { id: 'sop', label: 'Statement of purpose', hint: 'Also called a motivation or personal statement. Prompts are scheme-specific.', levels: ['all'] },
  { id: 'recommendation', label: 'Recommendation letters', hint: 'Two or three referees; several schemes require sealed originals.', levels: ['all'] },
  { id: 'english', label: 'English test score', hint: 'IELTS or TOEFL. Check the exact minimum before you book a test.', levels: ['all'] },
  { id: 'photo', label: 'Passport-size photograph', hint: 'Usually taken within the last six months.', levels: ['all'] },
  { id: 'financial', label: 'Financial or sponsorship proof', hint: 'Only some schemes ask; a bank statement or an employer letter.', levels: ['all'] },
  { id: 'medical', label: 'Medical certificate', hint: 'Often requested after selection rather than at application.', levels: ['all'] },
  { id: 'research', label: 'Research proposal', hint: 'Required by most doctoral and research-master routes.', levels: ['PhD', 'PostDoc'] },
  { id: 'publications', label: 'Publication list', hint: 'Doctoral routes frequently ask for a list with DOIs.', levels: ['PhD', 'PostDoc'] },
];

/** True when the item is needed for a reader aiming at `degreeLevel`. */
function neededFor(document, degreeLevel) {
  return document.levels.includes('all') || (!!degreeLevel && document.levels.includes(degreeLevel));
}

/**
 * Split the checklist into what is ready and what is not, for one reader.
 *
 * `presentIds` is whatever the reader has ticked; anything unrecognised in it
 * is ignored rather than trusted, so a stale or hand-edited localStorage value
 * cannot invent an item.
 */
export function documentChecklist(presentIds, degreeLevel) {
  const present = new Set(Array.isArray(presentIds) ? presentIds : []);
  const required = DOCUMENTS.filter((document) => neededFor(document, degreeLevel));
  const missing = required.filter((document) => !present.has(document.id));
  const optional = DOCUMENTS.filter((document) => !neededFor(document, degreeLevel));

  return {
    required,
    missing,
    optional,
    total: required.length,
    presentCount: required.length - missing.length,
    complete: missing.length === 0,
  };
}
