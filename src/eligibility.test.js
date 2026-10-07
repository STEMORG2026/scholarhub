import test from 'node:test';
import assert from 'node:assert/strict';
import { VERDICT, eligibilityFor } from './eligibility.js';
import scholarships from '../data/scholarships.json' with { type: 'json' };

// The six modes the catalog may use. Kept here as a literal list rather than
// imported from the validator, so that a mode added on one side without the
// other shows up as a test failure rather than passing silently.
const MODES = ['all', 'listed', 'listed_elsewhere', 'regional', 'agreement', 'unstated'];

test('every mode has a label, so no badge can render undefined', () => {
  for (const mode of MODES) {
    const { verdict } = eligibilityFor({ mode }, 'Nepal');
    assert.ok(VERDICT[verdict], `mode ${mode} produced verdict "${verdict}" which has no label`);
  }
});

test('only "all" and "listed" can ever answer yes or no', () => {
  // The four unanswerable modes must never claim a decision. This is the
  // invariant that stops a visitor being told they are eligible when the source
  // simply does not say.
  for (const mode of ['listed_elsewhere', 'regional', 'agreement', 'unstated']) {
    for (const country of ['Nepal', 'Brazil', 'Germany', '']) {
      const { verdict } = eligibilityFor({ mode, regions: ['Pacific'], list_url: 'https://example.org' }, country);
      assert.equal(verdict, 'check', `mode ${mode} must say "check", got "${verdict}"`);
    }
  }
});

test('mode "all" is a yes, and carries the note as its reason', () => {
  const { verdict, reason } = eligibilityFor({ mode: 'all', note: 'KAUST reports 120 nationalities.' }, 'Nepal');
  assert.equal(verdict, 'open');
  assert.equal(reason, 'KAUST reports 120 nationalities.');

  const fallback = eligibilityFor({ mode: 'all' }, 'Nepal');
  assert.equal(fallback.verdict, 'open');
  assert.ok(fallback.reason.length > 0, 'a reason is always shown');
});

test('mode "listed" answers from membership, and only when a country is chosen', () => {
  const scope = { mode: 'listed', countries: ['India', 'Bangladesh', 'China'] };
  assert.equal(eligibilityFor(scope, 'India').verdict, 'open');
  assert.equal(eligibilityFor(scope, 'Nepal').verdict, 'closed');

  // No country chosen yet: the honest answer is "choose one", never "open".
  const unset = eligibilityFor(scope, '');
  assert.equal(unset.verdict, 'unknown');
  assert.ok(unset.reason.includes('3'), 'the reason names how many countries are on the list');
});

test('an exclusion list is honoured in the shape the source publishes it', () => {
  // "Your nationality is non-EEA" is published as an exclusion. Carrying the
  // excluded set — rather than expanding it into a 172-country complement —
  // keeps the rule reviewable, so the verdict logic has to read it directly.
  const scope = { mode: 'listed', excluded_countries: ['Netherlands', 'Norway', 'Iceland'] };

  assert.equal(eligibilityFor(scope, 'Nepal').verdict, 'open', 'a country outside the exclusion is eligible');
  assert.equal(eligibilityFor(scope, 'India').verdict, 'open');
  assert.equal(eligibilityFor(scope, 'Netherlands').verdict, 'closed', 'an excluded country is not');

  const unset = eligibilityFor(scope, '');
  assert.equal(unset.verdict, 'unknown', 'no country chosen still says "choose one", never "open"');
  assert.ok(unset.reason.includes('3'), 'the reason names how many countries are excluded');
});

test('an exclusion list is never read as a list of eligible countries', () => {
  // The dangerous inversion: treating excluded_countries as if it named who
  // may apply would tell an excluded reader they are eligible.
  const scope = { mode: 'listed', excluded_countries: ['Nepal'] };
  assert.equal(eligibilityFor(scope, 'Nepal').verdict, 'closed');
  assert.equal(eligibilityFor(scope, 'Brazil').verdict, 'open');
});

test('an empty or missing list is never treated as open to everyone', () => {
  for (const scope of [{ mode: 'listed', countries: [] }, { mode: 'listed' }]) {
    assert.equal(eligibilityFor(scope, 'Nepal').verdict, 'closed');
    assert.equal(eligibilityFor(scope, '').verdict, 'unknown');
  }
});

test('the unanswerable modes explain themselves', () => {
  const regional = eligibilityFor({ mode: 'regional', regions: ['Pacific', 'ASEAN'] }, 'Nepal');
  assert.equal(regional.verdict, 'check');
  assert.ok(regional.reason.includes('Pacific') && regional.reason.includes('ASEAN'), 'the regions are named');

  const elsewhere = eligibilityFor({ mode: 'listed_elsewhere', list_url: 'https://example.org/list' }, 'Nepal');
  assert.equal(elsewhere.verdict, 'check');
  assert.equal(elsewhere.listUrl, 'https://example.org/list', 'the provider list is passed through to be linked');

  assert.equal(eligibilityFor({ mode: 'agreement' }, 'Nepal').verdict, 'check');
  assert.equal(eligibilityFor({ mode: 'unstated' }, 'Nepal').verdict, 'check');
});

test('a missing or unrecognised scope is a check, not a pass', () => {
  for (const scope of [undefined, null, {}, { mode: 'nonsense' }]) {
    const { verdict, reason } = eligibilityFor(scope, 'Nepal');
    assert.equal(verdict, 'check');
    assert.ok(reason.length > 0);
  }
});

// --- against the real catalog ---------------------------------------------
// These pin the answers a reader actually sees, so a data edit that flips one
// of them has to be deliberate.

test('real records give the expected answer for a reader from Nepal', () => {
  const byId = Object.fromEntries(scholarships.map((e) => [e.id, e]));
  const forNepal = (id) => eligibilityFor(byId[id].nationality_scope, 'Nepal').verdict;

  assert.equal(forNepal('kaust-fellowship'), 'open', 'KAUST is open to any nationality');
  assert.equal(forNepal('nz-scholarships'), 'open', 'Nepal is on the NZ Asian list');
  assert.equal(forNepal('mext-research-students'), 'open', 'the recorded MEXT call is the Nepal one');
  assert.equal(forNepal('pec-pg-brazil'), 'closed', 'Nepal is not among the 74 PEC-PG countries');
  assert.equal(forNepal('cgrs-doctoral'), 'closed', 'CGRS lists Canada only');
});

test('a different country gets a different answer from the same record', () => {
  const byId = Object.fromEntries(scholarships.map((e) => [e.id, e]));
  const pec = byId['pec-pg-brazil'].nationality_scope;

  assert.equal(eligibilityFor(pec, 'Nepal').verdict, 'closed');
  assert.equal(eligibilityFor(pec, 'India').verdict, 'open', 'India is on the PEC-PG list');
  assert.equal(eligibilityFor(pec, 'Bangladesh').verdict, 'open');
  // Same record, same code path — the answer is a property of the country.
  assert.notEqual(eligibilityFor(pec, 'Nepal').reason, eligibilityFor(pec, 'India').reason);
});

test('every record in the catalog produces a labelled verdict for a real country', () => {
  const unlabelled = [];
  for (const entry of scholarships) {
    for (const country of ['Nepal', 'India', 'Brazil', 'Germany', '']) {
      const { verdict, reason } = eligibilityFor(entry.nationality_scope, country);
      if (!VERDICT[verdict]) unlabelled.push(entry.id + ' -> ' + verdict);
      if (typeof reason !== 'string' || !reason.length) unlabelled.push(entry.id + ' -> empty reason');
    }
  }
  assert.deepEqual(unlabelled, []);
});
