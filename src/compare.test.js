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
  parseClassRank,
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
  collect(compareGpa(record('a'), gpa(3.5, 4), { kind: 'criterion-only', text: 'x' })); // criterion-only
  collect(compareGpa(record('a'), gpa(3.5, 4), { kind: 'prose', text: 'x' }));          // unresolvable (catalog)
  collect(compareGpa(record('a'), gpa(3.5, 4), { kind: 'branches', branches: [{ value: 2, scale: 5 }, { value: 2, scale: 4.3 }] })); // unresolvable
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

test('a sourced prose finding is reported as a criterion, not as a broken scale', () => {
  const r = compareGpa(record('a'), gpa(3.5, 4), { kind: 'criterion-only', text: 'grades are one of four criteria' });
  assert.equal(r.reason, 'criterion-only');
  assert.equal(r.quote, 'grades are one of four criteria');
});

test('the criterion sentence never claims scales or branches', () => {
  // The regression this release exists for. 18 of 36 records were rendering
  // "states its requirement in a form that has more than one scale or branch",
  // a sentence written for the `branches` case — and not one of those 18 has a
  // scale or a branch. A negative control, because the defect was a claim that
  // was false about the record it was attached to, and only asserting the
  // absence of that claim catches it coming back.
  const r = compareGpa(record('a'), gpa(3.5, 4), { kind: 'criterion-only', text: 'x' });
  assert.doesNotMatch(r.sentence, /scale|branch/i);
  assert.match(r.sentence, /publishes no threshold/i);
});

test('the two prose cases do NOT share a sentence', () => {
  // Provenance, not phrasing: a sourced finding is a criterion; an unparsed
  // catalog string may list several scales. `src/ingest.test.js` caught this
  // being collapsed — it was the only test that noticed, and it was right.
  const fromFile = compareGpa(record('a'), gpa(3.5, 4), { kind: 'criterion-only', text: 'x' });
  const fromCatalog = compareGpa(record('a', 'a 2:1 or equivalent'), gpa(3.5, 4));
  assert.notEqual(fromFile.sentence, fromCatalog.sentence);
  assert.notEqual(fromFile.reason, fromCatalog.reason);
});

test('a branch mismatch DOES talk about scales, and keeps the old reason', () => {
  // The sentence was correct here, and only here. It must not be removed along
  // with the misuse of it.
  const r = compareGpa(record('a'), gpa(3.5, 4.3), { kind: 'branches', branches: [{ value: 2.64, scale: 4 }, { value: 3.23, scale: 5 }] });
  assert.equal(r.reason, 'unresolvable');
  assert.match(r.sentence, /scale/i);
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

test('a rank is a POSITION, so a better position meets a looser bar', () => {
  // The comparison runs the opposite way from every other kind: "top 8%" is better
  // than "top 10%". Getting this backwards would tell a stronger applicant they fail.
  const req = { kind: 'rank', value: 10, of: 100 };
  assert.equal(compareGpa(record('a'), gpa(3.5, 4), req, 8).verdict, 'meets', 'top 8% meets a top-10% bar');
  assert.equal(compareGpa(record('a'), gpa(3.5, 4), req, 10).verdict, 'meets', 'exactly on the bar meets it');
  assert.equal(compareGpa(record('a'), gpa(3.5, 4), req, 11).verdict, 'fails', 'top 11% misses a top-10% bar');
});

test('a recorded position produces a real answer, with the numbers in it', () => {
  const req = { kind: 'rank', value: 35, of: 100, applies_to: 'the best 35% of students' };
  const met = compareGpa(record('a'), gpa(3.5, 4), req, 20);
  assert.equal(met.verdict, 'meets');
  assert.equal(met.reason, null);
  assert.match(met.sentence, /top 20%/);
  assert.match(met.sentence, /top 35%/);

  const missed = compareGpa(record('a'), gpa(3.5, 4), req, 40);
  assert.equal(missed.verdict, 'fails');
  assert.match(missed.sentence, /outside the top 35%/);
});

test('with no recorded position, a rank says what would be needed', () => {
  // The old behaviour, kept: a rank is answerable only if the reader has recorded a
  // position, and the sentence has to say so rather than implying we failed.
  const req = { kind: 'rank', value: 10, of: 100, applies_to: 'top 10% of graduates' };
  const r = compareGpa(record('a'), gpa(3.5, 4), req);
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.reason, 'unresolvable');
  assert.match(r.sentence, /Add your class position/);
});

test('a rank does not borrow the GPA scale, and the GPA does not satisfy it', () => {
  // A perfect GPA is not a class rank. Passing no classRank must leave it unresolved
  // however good the GPA is — the two are different facts about a reader.
  const req = { kind: 'rank', value: 10, of: 100 };
  assert.equal(compareGpa(record('a'), gpa(4.0, 4), req).verdict, 'unknown');
});

test('a percentile does NOT use the rank comparison', () => {
  // GKS asks for "a score percentile of 80% or above" — larger is better, the ordinary
  // direction. Sharing the rank branch would invert it and pass the wrong readers.
  const req = { kind: 'percentile', value: 80, of: 100 };
  const r = compareGpa(record('a'), gpa(3.5, 4), req, 5);
  assert.equal(r.verdict, 'unknown');
  assert.match(r.sentence, /percentile/);
  assert.match(r.sentence, /or above/);
});

test('compareAllGpa threads the class rank through to every record', () => {
  const index = indexRequirements({
    a: { requirements: [{ kind: 'gpa', of: { kind: 'rank', minimum: 10, of: 100 }, text: 'x' }] },
    b: { requirements: [{ kind: 'gpa', of: { kind: 'rank', minimum: 5, of: 100 }, text: 'x' }] },
  });
  const out = compareAllGpa([record('a'), record('b')], gpa(3.62, 4), index, 8);
  assert.equal(out.a.verdict, 'meets', 'top 8% is within the top 10%');
  assert.equal(out.b.verdict, 'fails', 'top 8% is outside the top 5%');
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

// --- parseClassRank ---------------------------------------------------------

test('a class position is read from the forms a reader actually types', () => {
  for (const [input, expected] of [
    ['8', 8],
    ['8%', 8],
    ['top 8%', 8],
    ['Top 8 %', 8],
    ['8.5', 8.5],
    ['  12  ', 12],
    [8, 8],
    [100, 100],
    [1, 1],
  ]) {
    assert.equal(parseClassRank(input), expected, 'parseClassRank(' + JSON.stringify(input) + ')');
  }
});

test('a rank within a cohort is converted to a percentage', () => {
  // 8th of 120 is top 6.67%, not top 8%. Reading the bare "8" as a percentage
  // would flatter the reader — and on a comparison that runs backwards,
  // flattering means telling them they meet bars they do not.
  assert.equal(parseClassRank('8 of 120'), 6.67);
  assert.equal(parseClassRank('8th of 120'), 6.67);
  assert.equal(parseClassRank('8 out of 120'), 6.67);
  assert.equal(parseClassRank('1 of 100'), 1);
  assert.equal(parseClassRank('120 of 120'), 100);
});

test('an incoherent cohort is rejected rather than divided', () => {
  // "of 0" has no meaning, and a rank cannot exceed the cohort. These are typos
  // or a misunderstanding of the field, and the answer is to ask again.
  for (const input of ['0 of 120', '8 of 0', '130 of 120', '8 of -120']) {
    assert.equal(parseClassRank(input), null, 'parseClassRank(' + JSON.stringify(input) + ')');
  }
});

test('an unreadable class position is null, never a guess', () => {
  // null leaves rank rules `unresolvable`, which says "add this". A
  // half-understood number would say "you do not qualify".
  for (const input of ['', '   ', 'top of my class', 'first', null, undefined, {}, [], 'abc']) {
    assert.equal(parseClassRank(input), null, 'parseClassRank(' + JSON.stringify(input) + ')');
  }
});

test('an out-of-range class position is rejected, not clamped', () => {
  for (const input of ['0', '0%', '150', '101', '-5', 0, 101, -5]) {
    assert.equal(parseClassRank(input), null, 'parseClassRank(' + JSON.stringify(input) + ')');
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
