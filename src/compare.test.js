// Tests for `compare.js` — the module that decides whether a reader qualifies.
//
// It had none until v0.37.0, which is the wrong way round: it is the highest-
// stakes pure module in the app, and it is the one place where a silent default
// tells an applicant they meet a bar nobody checked. The tests below are written
// as **negative controls** wherever it matters — they assert the *reason*, not
// just `unknown`, because `unknown` is the answer five different facts produce
// and collapsing them is the failure this module exists to prevent.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VERDICTS,
  UNKNOWN_REASONS,
  gpaRequirement,
  compareGpa,
  compareAllGpa,
  VERDICT_LABEL,
} from './compare.js';
import { indexRequirements } from './requirements.js';

/** A catalog record with a scalar `gpa_minimum`, as `data/scholarships.json` holds it. */
const record = (id, gpa_minimum = null, gpa_scale = undefined) => ({
  id,
  eligibility: { gpa_minimum, ...(gpa_scale === undefined ? {} : { gpa_scale }) },
});

const gpa = (value, scale) => ({ value, scale });

// --- the vocabulary ---------------------------------------------------------

test('there are exactly three verdicts and every one has a label', () => {
  assert.deepEqual(VERDICTS, ['meets', 'fails', 'unknown']);
  for (const v of VERDICTS) assert.equal(typeof VERDICT_LABEL[v], 'string');
});

test('every reason compare.js can emit is in the declared vocabulary', () => {
  // A reason code that is emitted but not declared is invisible to a caller
  // switching on the list — the same class of defect as an undocumented field.
  const emitted = new Set();
  const collect = (r) => { if (r.verdict === 'unknown') emitted.add(r.reason); };

  collect(compareGpa(record('a'), gpa(3.5, 4)));                                  // not-recorded
  collect(compareGpa(record('a'), gpa(3.5, 4), { kind: 'absent', checked: true })); // not-published
  collect(compareGpa(record('a'), gpa(3.5, 4), { kind: 'none-stated', text: 'x' })); // no-requirement
  collect(compareGpa(record('a'), gpa(3.5, 4), { kind: 'delegated', to: 'them' }));  // delegated
  collect(compareGpa(record('a'), gpa(3.5, 4), { kind: 'prose', text: 'x' }));       // unresolvable
  collect(compareGpa(record('a'), null, { kind: 'numeric', value: 3, scale: 4 }));   // no-value
  collect(compareGpa(record('a'), gpa(3.5), { kind: 'numeric', value: 3, scale: 4 })); // no-scale

  // Equality, both directions, rather than a count. A count catches an
  // undeclared reason but not a declared one that nothing can ever produce —
  // and a reason code in the vocabulary that no path emits is a documented
  // answer the app cannot give. (The first version of this test asserted `6`
  // from memory; the real number is 7, and the assertion was the thing that
  // was wrong, not the code.)
  assert.deepEqual([...emitted].sort(), [...UNKNOWN_REASONS].sort());
});

// --- the five facts that all surface as `unknown` ---------------------------

test('nothing recorded reads as "not recorded"', () => {
  const r = compareGpa(record('a'), gpa(3.5, 4));
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.reason, 'not-recorded');
});

test('a checked provider with no threshold does NOT read as "not recorded"', () => {
  // The distinction the whole file exists for. Same verdict, different fact.
  const r = compareGpa(record('a'), gpa(3.5, 4), { kind: 'absent', checked: true });
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.reason, 'not-published');
  assert.doesNotMatch(r.sentence, /does not record/i);
  assert.match(r.sentence, /publishes no GPA threshold/i);
});

test('the provider stating there is no threshold is its own reason', () => {
  const r = compareGpa(record('a'), gpa(3.5, 4), { kind: 'none-stated', text: 'no formula' });
  assert.equal(r.reason, 'no-requirement');
  assert.equal(r.quote, 'no formula');
});

test('prose with no scalar form reads as unresolvable', () => {
  const r = compareGpa(record('a'), gpa(3.5, 4), { kind: 'prose', text: 'grades are one of four criteria' });
  assert.equal(r.reason, 'unresolvable');
});

// --- delegated: a definite answer, not a failure ----------------------------

test('a delegated bar names who sets it', () => {
  const r = compareGpa(record('a'), gpa(3.5, 4), { kind: 'delegated', to: 'the admitting university' });
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.reason, 'delegated');
  assert.match(r.sentence, /the admitting university/);
  // It must not claim we failed to find out — we did find out.
  assert.doesNotMatch(r.sentence, /could not|unable|do not know/i);
});

// --- rank and percentile ----------------------------------------------------

test('a rank bar says what would be needed, and does not pretend to check it', () => {
  const r = compareGpa(record('a'), gpa(3.5, 4), { kind: 'rank', value: 35, of: 100, applies_to: 'the best 35%' });
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.reason, 'unresolvable');
  assert.match(r.sentence, /class rank/);
  assert.match(r.sentence, /35/);
  assert.match(r.sentence, /best 35%/);
});

test('a percentile bar names the percentile', () => {
  const r = compareGpa(record('a'), gpa(3.5, 4), { kind: 'percentile', value: 80, of: 100 });
  assert.equal(r.reason, 'unresolvable');
  assert.match(r.sentence, /percentile/);
});

// --- branches ---------------------------------------------------------------

test('a branch matching the reader scale is compared', () => {
  const req = { kind: 'branches', branches: [{ value: 2.64, scale: 4 }, { value: 3.23, scale: 5 }] };
  assert.equal(compareGpa(record('a'), gpa(3.5, 4), req).verdict, 'meets');
  assert.equal(compareGpa(record('a'), gpa(2.5, 4), req).verdict, 'fails');
});

test('branches with no matching scale refuse to pick one', () => {
  // The reader's transcript decides the branch. Choosing for them is the silent
  // default this module exists to stop.
  const req = { kind: 'branches', branches: [{ value: 2.64, scale: 4 }, { value: 3.23, scale: 5 }] };
  const r = compareGpa(record('a'), gpa(3.5, 4.3), req);
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.reason, 'unresolvable');
  assert.match(r.sentence, /4, 5/);
});

test('branches with no confirmed value ask for one', () => {
  const req = { kind: 'branches', branches: [{ value: 2.64, scale: 4 }, { value: 3.23, scale: 5 }] };
  const r = compareGpa(record('a'), null, req);
  assert.equal(r.reason, 'no-value');
});

// --- numeric ----------------------------------------------------------------

test('a numeric rule on the reader scale is a real comparison', () => {
  const req = { kind: 'numeric', value: 3, scale: 4 };
  assert.equal(compareGpa(record('a'), gpa(3.62, 4), req).verdict, 'meets');
  assert.equal(compareGpa(record('a'), gpa(2.9, 4), req).verdict, 'fails');
  assert.equal(compareGpa(record('a'), gpa(3, 4), req).verdict, 'meets', 'equal meets');
});

test('a scale mismatch is never silently converted', () => {
  const r = compareGpa(record('a'), gpa(3.62, 4), { kind: 'numeric', value: 3, scale: 5 });
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.reason, 'unresolvable');
});

test('a requirement with no scale is not assumed to match the reader', () => {
  const r = compareGpa(record('a'), gpa(3.62, 4), { kind: 'numeric', value: 3, scale: null });
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.reason, 'no-scale');
});

test('an unconfirmed value yields no-value, not a pass', () => {
  for (const empty of [null, undefined, {}]) {
    const r = compareGpa(record('a'), empty, { kind: 'numeric', value: 3, scale: 4 });
    assert.equal(r.verdict, 'unknown');
    assert.equal(r.reason, 'no-value');
  }
});

// --- the catalog fallback ---------------------------------------------------

test('gpaRequirement reads the catalog scalar without changing it', () => {
  assert.equal(gpaRequirement(record('a')).kind, 'absent');
  assert.equal(gpaRequirement(record('a', 3, 4)).kind, 'numeric');
  assert.equal(gpaRequirement(record('a', 3, 4)).scale, 4);
  assert.equal(gpaRequirement(record('a', 3)).scale, null, 'no scale recorded means null, not 4.0');
  assert.equal(gpaRequirement(record('a', 'no minimum GPA is stated')).kind, 'none-stated');
  assert.equal(gpaRequirement(record('a', 'a 2:1 or equivalent')).kind, 'prose');
});

// --- compareAllGpa: the file wins, the catalog is the fallback --------------

test('the sourced file wins over the catalog scalar', () => {
  const index = indexRequirements({
    a: { requirements: [{ kind: 'gpa', of: { kind: 'numeric', minimum: 3.5, scale: 4 }, text: 'x' }] },
  });
  const out = compareAllGpa([record('a', null)], gpa(3.62, 4), index);
  assert.equal(out.a.verdict, 'meets');
  assert.equal(out.a.reason, null);
});

test('a record the file does not cover falls back to the catalog', () => {
  const index = indexRequirements({ other: { requirements: [] } });
  const out = compareAllGpa([record('a', 3, 4)], gpa(3.62, 4), index);
  assert.equal(out.a.verdict, 'meets');
});

test('an unstated record does not inherit the catalog sentence', () => {
  // The regression that matters most: before the wiring, every one of these
  // rendered "the catalog does not record a GPA requirement".
  const index = indexRequirements({ a: { requirements: [{ kind: 'gpa', of: { kind: 'unstated' }, text: undefined }] } });
  const out = compareAllGpa([record('a', null)], gpa(3.62, 4), index);
  assert.equal(out.a.reason, 'not-published');
  assert.doesNotMatch(out.a.sentence, /does not record/i);
});

test('a delegated record is reported as delegated end to end', () => {
  const index = indexRequirements({
    a: { requirements: [{ kind: 'gpa', of: { kind: 'prose', delegated_to: 'each of 34 institutions' }, text: 'x' }] },
  });
  const out = compareAllGpa([record('a', null)], gpa(3.62, 4), index);
  assert.equal(out.a.reason, 'delegated');
  assert.match(out.a.sentence, /34 institutions/);
});

test('an entry with no gpa rule falls back rather than inventing one', () => {
  const index = indexRequirements({
    a: { requirements: [{ kind: 'credits', of: { kind: 'count', minimum: 240, unit: 'ECTS' }, text: 'x' }] },
  });
  const out = compareAllGpa([record('a', null)], gpa(3.62, 4), index);
  assert.equal(out.a.reason, 'not-recorded');
});

test('compareAllGpa returns a lookup keyed by record id, one entry per record', () => {
  const out = compareAllGpa([record('a', null), record('b', 3, 4)], gpa(3.62, 4));
  assert.deepEqual(Object.keys(out).sort(), ['a', 'b']);
});

test('compareAllGpa tolerates an empty catalog', () => {
  assert.deepEqual(compareAllGpa([], gpa(3.62, 4)), {});
  assert.deepEqual(compareAllGpa(null, gpa(3.62, 4)), {});
});
