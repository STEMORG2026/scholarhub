import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_STATUSES,
  STATUS_IDS,
  DEFAULT_TRACK_STATUS,
  DUE_SOON_DAYS,
  URGENT_DAYS,
  DOCUMENTS,
  isValidStatus,
  isOpenStatus,
  statusLabel,
  todayIso,
  daysUntil,
  deadlineInfo,
  trackerSummary,
  sortTracked,
  documentChecklist,
} from './tracker.js';
import scholarships from '../data/scholarships.json' with { type: 'json' };

// --- dates -----------------------------------------------------------------

test('a day difference is counted in calendar days, not elapsed hours', () => {
  assert.equal(daysUntil('2026-11-30', '2026-11-30'), 0);
  assert.equal(daysUntil('2026-12-01', '2026-11-30'), 1);
  assert.equal(daysUntil('2026-11-29', '2026-11-30'), -1);
  assert.equal(daysUntil('2027-01-01', '2026-11-30'), 32);
});

test('a one-day gap is exactly one day across a daylight-saving shift', () => {
  // These two pairs straddle a DST change in most northern-hemisphere zones.
  // Subtracting Date objects would give 23 or 25 hours and could round to 0.
  // Comparing UTC calendar days cannot.
  assert.equal(daysUntil('2026-03-30', '2026-03-29'), 1, 'spring forward');
  assert.equal(daysUntil('2026-10-26', '2026-10-25'), 1, 'fall back');
  assert.equal(daysUntil('2026-03-29', '2026-03-29'), 0);
});

test('an unusable date is null, never zero', () => {
  // The dangerous confusion is "could not parse" reading as "due today".
  for (const bad of [undefined, null, '', 'tomorrow', '2026-1-1', '2026/01/01', 20260101, {}]) {
    assert.equal(daysUntil(bad, '2026-11-30'), null, `${String(bad)} should not parse`);
    assert.equal(daysUntil('2026-11-30', bad), null, `${String(bad)} should not parse as today`);
  }
  assert.equal(daysUntil('2026-02-30', '2026-11-30'), null, 'an impossible calendar date is not a date');
});

test('today is produced in the reader\'s own timezone as YYYY-MM-DD', () => {
  const iso = todayIso();
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayIso(new Date(2026, 0, 5)), '2026-01-05', 'single digits are padded');
  assert.equal(todayIso(new Date(2026, 11, 31)), '2026-12-31');
});

// --- the countdown a reader sees -------------------------------------------

test('every countdown level is reachable and labelled', () => {
  const at = (iso) => deadlineInfo({ deadline: iso }, '2026-11-30');

  assert.deepEqual(
    [at('2026-11-28').level, at('2026-11-30').level, at('2026-12-01').level, at('2026-12-07').level, at('2026-12-20').level, at('2027-03-01').level],
    ['overdue', 'today', 'urgent', 'urgent', 'soon', 'later'],
  );

  assert.equal(at('2026-11-29').label, 'Passed yesterday');
  assert.equal(at('2026-11-28').label, 'Passed 2 days ago');
  assert.equal(at('2026-11-30').label, 'Due today');
  assert.equal(at('2026-12-01').label, 'Due tomorrow');
  assert.equal(at('2026-12-02').label, 'Due in 2 days');
});

test('the urgent and due-soon windows sit on their stated boundaries', () => {
  const at = (iso) => deadlineInfo({ deadline: iso }, '2026-11-30');
  const plus = (n) => todayIso(new Date(2026, 10, 30 + n));

  assert.equal(at(plus(URGENT_DAYS)).level, 'urgent', `exactly ${URGENT_DAYS} days is urgent`);
  assert.equal(at(plus(URGENT_DAYS + 1)).level, 'soon');
  assert.equal(at(plus(DUE_SOON_DAYS)).level, 'soon', `exactly ${DUE_SOON_DAYS} days is still due soon`);
  assert.equal(at(plus(DUE_SOON_DAYS + 1)).level, 'later');
});

test('a record with no published date says so, and keeps its note distinct', () => {
  const windowed = deadlineInfo({ deadline: null, deadline_notes: 'Opens 15 November, closes 15 December.' }, '2026-11-30');
  assert.equal(windowed.hasDate, false);
  assert.equal(windowed.level, 'nodate');
  assert.equal(windowed.days, null);
  assert.equal(windowed.label, 'No single closing date');

  const silent = deadlineInfo({ deadline: null, deadline_notes: null }, '2026-11-30');
  assert.equal(silent.label, 'No date published');

  // A missing record must not throw.
  assert.equal(deadlineInfo(undefined, '2026-11-30').level, 'nodate');
});

test('a countdown is never invented for a record that has no date', () => {
  const undated = scholarships.filter((entry) => !entry.deadline);
  assert.ok(undated.length > 0, 'the catalog is expected to hold records without a single closing date');
  for (const entry of undated) {
    const info = deadlineInfo(entry, '2026-11-30');
    assert.equal(info.hasDate, false, `${entry.id} must not report a date it does not have`);
    assert.equal(info.days, null, `${entry.id} must not report a day count`);
    assert.equal(info.level, 'nodate');
  }
});

// --- summary and ordering --------------------------------------------------

const entry = (id, name, deadline, status = DEFAULT_TRACK_STATUS) => ({
  record: { id, name, deadline, deadline_notes: deadline ? null : 'window' },
  status,
});

test('the summary counts each state separately', () => {
  const entries = [
    entry('a', 'Passed', '2026-11-20'),
    entry('b', 'Today', '2026-11-30'),
    entry('c', 'Soon', '2026-12-10'),
    entry('d', 'Later', '2027-06-01'),
    entry('e', 'Undated', null),
    entry('f', 'Done', '2026-12-01', 'submitted'),
  ];
  const summary = trackerSummary(entries, '2026-11-30');

  assert.equal(summary.total, 6);
  assert.equal(summary.passed, 1);
  assert.equal(summary.dueSoon, 3, 'the buckets describe the dates and count every record');
  assert.equal(summary.later, 1);
  assert.equal(summary.noDate, 1);
  assert.equal(summary.stillOpen, 5, 'only the submitted one has left the queue');
  assert.equal(summary.settled, 1);
  assert.equal(summary.byStatus.submitted, 1);
  assert.equal(summary.byStatus.planning, 5);

  // The alarm figure excludes work that is already done, even when its date is
  // imminent: "Today", "Soon" and "Passed" are open, "Done" is not.
  assert.equal(summary.needsAction, 3);
});

test('a settled application does not raise an alarm even when its date has passed', () => {
  const entries = [
    entry('a', 'Sent it', '2026-11-01', 'submitted'),
    entry('b', 'Won it', '2026-11-01', 'awarded'),
    entry('c', 'Missed it', '2026-11-01', 'rejected'),
  ];
  const summary = trackerSummary(entries, '2026-11-30');
  assert.equal(summary.passed, 3, 'the dates are still reported as passed');
  assert.equal(summary.needsAction, 0, 'but nothing is asking the reader to act');
  assert.equal(summary.stillOpen, 0);
});

test('an unknown stored status is counted as the default rather than dropped', () => {
  const summary = trackerSummary([entry('a', 'Odd', '2027-01-01', 'nonsense')], '2026-11-30');
  assert.equal(summary.total, 1);
  assert.equal(summary.byStatus[DEFAULT_TRACK_STATUS], 1);
  assert.equal(summary.stillOpen, 1);
});

test('tracked applications sort by urgency, with settled ones last', () => {
  const entries = [
    entry('a', 'Later', '2027-06-01'),
    entry('b', 'Undated', null),
    entry('c', 'Submitted', '2026-12-01', 'submitted'),
    entry('d', 'Passed', '2026-11-20'),
    entry('e', 'Today', '2026-11-30'),
    entry('f', 'Soon', '2026-12-10'),
  ];
  const order = sortTracked(entries, '2026-11-30').map((item) => item.record.name);
  assert.deepEqual(order, ['Passed', 'Today', 'Soon', 'Later', 'Undated', 'Submitted']);
});

test('sorting is stable, so a re-render never shuffles equal rows', () => {
  const entries = [entry('a', 'Alpha', null), entry('b', 'Beta', null)];
  assert.deepEqual(sortTracked(entries, '2026-11-30').map((i) => i.record.name), ['Alpha', 'Beta']);
  assert.deepEqual(sortTracked([...entries].reverse(), '2026-11-30').map((i) => i.record.name), ['Alpha', 'Beta']);
});

test('every status the tracker stores has a label', () => {
  for (const id of STATUS_IDS) {
    assert.equal(isValidStatus(id), true);
    assert.ok(statusLabel(id).length > 0, `status ${id} has no label`);
  }
  assert.equal(isValidStatus('nonsense'), false);
  assert.equal(isValidStatus(undefined), false);
  assert.equal(statusLabel('nonsense'), TRACK_STATUSES[0].label, 'an unknown status falls back rather than rendering undefined');
});

test('only planning and preparing count as still needing work', () => {
  assert.equal(isOpenStatus('planning'), true);
  assert.equal(isOpenStatus('preparing'), true);
  for (const settled of ['submitted', 'awarded', 'rejected']) {
    assert.equal(isOpenStatus(settled), false, `${settled} is not waiting on the reader`);
  }
  // An unrecognised stored value must fall on the side of asking for attention.
  assert.equal(isOpenStatus('nonsense'), true);
  assert.equal(isOpenStatus(undefined), true);
});

test('the alert count and the "still open" split agree with each other', () => {
  // needsAction is defined as the open records that are not merely distant, so
  // it must never exceed stillOpen and must never count a settled record.
  const entries = [
    entry('a', 'Overdue', '2026-11-01'),
    entry('b', 'Soon', '2026-12-05'),
    entry('c', 'Distant', '2027-09-01'),
    entry('d', 'Undated', null),
    entry('e', 'Sent', '2026-11-01', 'submitted'),
  ];
  const summary = trackerSummary(entries, '2026-11-30');
  assert.equal(summary.stillOpen, 4);
  assert.equal(summary.needsAction, 2, 'overdue and soon, but not distant or undated');
  assert.ok(summary.needsAction <= summary.stillOpen);
});

// --- documents -------------------------------------------------------------

test('the checklist is degree-aware: a research proposal is not demanded of a Master\'s applicant', () => {
  const master = documentChecklist([], 'Master');
  assert.equal(master.required.some((d) => d.id === 'research'), false);
  assert.equal(master.required.some((d) => d.id === 'publications'), false);

  const phd = documentChecklist([], 'PhD');
  assert.equal(phd.required.some((d) => d.id === 'research'), true);
  assert.equal(phd.required.some((d) => d.id === 'publications'), true);
  assert.ok(phd.required.length > master.required.length);
  assert.equal(phd.optional.some((d) => d.id === 'research'), false, 'a required item is never also optional');
});

test('the checklist names exactly what is not present', () => {
  const master = documentChecklist([], 'Master');
  assert.equal(master.presentCount, 0);
  assert.equal(master.missing.length, master.total);
  assert.equal(master.complete, false);

  const all = documentChecklist(master.required.map((d) => d.id), 'Master');
  assert.equal(all.missing.length, 0);
  assert.equal(all.presentCount, all.total);
  assert.equal(all.complete, true);
});

test('an unrecognised stored value cannot invent a document', () => {
  const state = documentChecklist(['passport', 'not-a-real-document', 42, null], 'Master');
  assert.equal(state.presentCount, 1);
  assert.equal(state.missing.some((d) => d.id === 'not-a-real-document'), false);
  assert.equal(state.total, state.required.length);
});

test('a non-array or missing stored value is an empty checklist, not a crash', () => {
  for (const bad of [undefined, null, 'passport', 7, {}]) {
    const state = documentChecklist(bad, 'Master');
    assert.equal(state.presentCount, 0);
    assert.equal(state.missing.length, state.total);
  }
});

test('every document entry is complete and uniquely identified', () => {
  const ids = DOCUMENTS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'document ids must be unique');
  const levels = new Set(['all', 'Bachelor', 'Master', 'PhD', 'PostDoc', 'Non-degree']);
  for (const document of DOCUMENTS) {
    assert.ok(document.label && document.label.length, `${document.id} has no label`);
    assert.ok(document.hint && document.hint.length, `${document.id} has no hint`);
    assert.ok(document.levels.length, `${document.id} is required of nobody, so it can never be listed`);
    for (const level of document.levels) assert.ok(levels.has(level), `${document.id} names an unknown level: ${level}`);
  }
});

// --- against the real catalog ----------------------------------------------

test('every tracked real record produces a renderable countdown and status', () => {
  const entries = scholarships.slice(0, 20).map((record) => ({ record, status: DEFAULT_TRACK_STATUS }));
  for (const { record } of entries) {
    const info = deadlineInfo(record, '2026-11-30');
    assert.ok(info.label && info.label.length, `${record.id} has no countdown label`);
    assert.ok(['overdue', 'today', 'urgent', 'soon', 'later', 'nodate'].includes(info.level), `${record.id} -> ${info.level}`);
  }
  const summary = trackerSummary(entries, '2026-11-30');
  assert.equal(summary.total, entries.length);
  assert.equal(
    summary.passed + summary.dueSoon + summary.later + summary.noDate,
    entries.length,
    'every tracked record lands in exactly one bucket',
  );
});
