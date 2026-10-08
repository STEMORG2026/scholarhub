// Tests for the mapper that feeds `compare.js` from `data/requirements.json`.
//
// This file exists because the wiring made `requirements.js` load-bearing for 36
// records, and because the failure mode of a mapper is silent: a rule it does not
// understand must fall to `absent` ("not recorded") rather than to anything that
// could read as a pass. Every test below that could be satisfied by a *wrong*
// mapping asserts the mapped shape, not merely that something was returned.

import test from 'node:test';
import assert from 'node:assert/strict';

import { requirementFor, indexRequirements, summarise } from './requirements.js';

/** One requirement on a record, shaped by the caller. */
const entry = (of) => ({ requirements: [{ kind: 'gpa', of, text: "the provider's own wording" }] });

// --- the figures ------------------------------------------------------------

test('a numeric rule maps to a comparable value and scale', () => {
  const r = requirementFor(entry({ kind: 'numeric', minimum: 3, scale: 4 }));
  assert.equal(r.kind, 'numeric');
  assert.equal(r.value, 3);
  assert.equal(r.scale, 4);
});

test('a numeric rule with no scale maps to a null scale, never to 4.0', () => {
  // The single most dangerous default in this module: assuming the reader's
  // scale. `compare.js` turns a null scale into `unknown`/`no-scale`.
  const r = requirementFor(entry({ kind: 'numeric', minimum: 3 }));
  assert.equal(r.scale, null);
});

test('branches keep one figure per scale, with their labels', () => {
  const r = requirementFor(entry({
    kind: 'branches',
    branches: [
      { minimum: 2.64, scale: 4.0 },
      { minimum: 3.23, scale: 5.0, applies_to: 'Nepali 5-point scale' },
    ],
  }));
  assert.equal(r.kind, 'branches');
  assert.equal(r.branches.length, 2);
  assert.deepEqual(r.branches[0], { value: 2.64, scale: 4, applies_to: undefined });
  assert.equal(r.branches[1].applies_to, 'Nepali 5-point scale');
});

test('rank and percentile carry what they are a portion of', () => {
  const rank = requirementFor(entry({ kind: 'rank', minimum: 35, of: 100, applies_to: 'the best 35%' }));
  assert.equal(rank.kind, 'rank');
  assert.equal(rank.of, 100);
  assert.equal(rank.applies_to, 'the best 35%');

  const pct = requirementFor(entry({ kind: 'percentile', minimum: 80, of: 100 }));
  assert.equal(pct.kind, 'percentile');
});

// --- the three "no figure" facts, kept apart --------------------------------

test('none-stated maps to its own kind, carrying the quote', () => {
  const r = requirementFor(entry({ kind: 'none-stated', quote: 'There is no formula for admission.' }));
  assert.equal(r.kind, 'none-stated');
  assert.match(r.text, /no formula/);
});

test('unstated maps to an absent requirement that says it was CHECKED', () => {
  // The whole reason the file exists. `checked: true` is what lets `compare.js`
  // say "this provider publishes no threshold" instead of "we have not looked".
  const r = requirementFor(entry({ kind: 'unstated' }));
  assert.equal(r.kind, 'absent');
  assert.equal(r.checked, true);
});

test('a delegated prose rule maps to `delegated`, not to plain prose', () => {
  const r = requirementFor(entry({ kind: 'prose', delegated_to: 'the admitting university' }));
  assert.equal(r.kind, 'delegated');
  assert.equal(r.to, 'the admitting university');
});

test('a sourced prose finding maps to `criterion-only`, not to catalog prose', () => {
  // The mapper knows the provenance, so it must say which case this is: the two
  // render different sentences and `src/ingest.test.js` proved they are not
  // interchangeable.
  const r = requirementFor(entry({ kind: 'prose' }));
  assert.equal(r.kind, 'criterion-only');
});

test('an unrecognised rule kind maps to absent, never to a pass', () => {
  const r = requirementFor(entry({ kind: 'something-new' }));
  assert.equal(r.kind, 'absent');
  assert.notEqual(r.checked, true);
});

// --- the shapes that are not a grade rule -----------------------------------

test('an entry with no gpa requirement maps to null, not to "no requirement"', () => {
  const r = requirementFor({ requirements: [{ kind: 'credits', of: { kind: 'count', minimum: 240, unit: 'ECTS' } }] });
  assert.equal(r, null);
});

test('a malformed entry maps to null rather than throwing', () => {
  for (const bad of [null, undefined, {}, { requirements: null }, { requirements: 'nope' }]) {
    assert.equal(requirementFor(bad), null);
  }
});

// --- the index --------------------------------------------------------------

test('the index is a Map, and a missing record is undefined', () => {
  const index = indexRequirements({ a: { requirements: [] } });
  assert.ok(index instanceof Map);
  assert.ok(index.has('a'));
  // A Map, not an object, so a record named `toString` cannot resolve to a method.
  assert.equal(index.get('toString'), undefined);
});

test('a malformed root yields an empty index rather than throwing', () => {
  for (const bad of [null, undefined, [], 'nope']) {
    assert.equal(indexRequirements(bad).size, 0);
  }
});

// --- the summary ------------------------------------------------------------

test('summarise counts verdicts and groups the unknown reasons', () => {
  const s = summarise({
    a: { verdict: 'meets', reason: null },
    b: { verdict: 'fails', reason: null },
    c: { verdict: 'unknown', reason: 'delegated' },
    d: { verdict: 'unknown', reason: 'delegated' },
    e: { verdict: 'unknown', reason: 'not-published' },
  });
  assert.equal(s.meets, 1);
  assert.equal(s.fails, 1);
  assert.equal(s.unknown, 3);
  assert.equal(s.byReason.delegated, 2);
  assert.equal(s.byReason['not-published'], 1);
});

test('summarise tolerates an empty comparison', () => {
  const s = summarise(null);
  assert.deepEqual(s, { meets: 0, fails: 0, unknown: 0, byReason: {} });
});
