import test from 'node:test';
import assert from 'node:assert/strict';
import scholarships from './scholarships.json' with { type: 'json' };
import { flagFor, isCountry, COUNTRY_NAMES, DESTINATION_NAMES } from '../src/countries.js';

const ids = scholarships.map((entry) => entry.id);
const COUNTRY_SET = new Set(COUNTRY_NAMES);
const DESTINATION_SET = new Set(DESTINATION_NAMES);

test('catalog has stable unique IDs', () => {
  assert.ok(scholarships.length >= 10);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('records include core display and official source fields', () => {
  for (const entry of scholarships) {
    for (const key of ['name', 'provider', 'country', 'university', 'program_field', 'degree_level', 'eligibility', 'official_url']) {
      assert.ok(entry[key] !== undefined && entry[key] !== '', `${entry.id} missing ${key}`);
    }
    assert.ok(Array.isArray(entry.program_field));
    assert.ok(Array.isArray(entry.degree_level));
    assert.match(entry.official_url, /^https:\/\//);
    assert.ok(['open', 'closed', 'upcoming', 'verify'].includes(entry.status));
    if (entry.deadline !== null) assert.match(entry.deadline, /^\d{4}-\d{2}-\d{2}$/);
  }
});

// These three tests replace a check that used to read a hand-written FLAG table
// out of the component. The table is gone: a country now carries an ISO 3166-1
// alpha-2 code and the flag is derived from it, so the failure mode that table
// caused — a new country rendering a generic globe with every check still green
// — is impossible rather than merely detected. What remains worth testing is
// that the data the derivation reads is complete, and that the two name spaces
// (countries a person can hold, destinations the catalog can offer) stay apart.

test('every destination the catalog uses is one the app can render', () => {
  const missing = [...new Set(scholarships.map((entry) => entry.country))]
    .filter((name) => !DESTINATION_SET.has(name))
    .sort();
  assert.deepEqual(
    missing,
    [],
    'these catalog destinations have no entry in data/countries.json: ' +
      missing.join(', ') +
      ' — add the country (with its ISO 3166-1 alpha-2 code) or the grouping',
  );
});

test('every country derives a flag, with no hand-written table', () => {
  const noFlag = COUNTRY_NAMES.filter((name) => !flagFor(name));
  assert.deepEqual(noFlag, [], 'these countries have no derivable flag: ' + noFlag.join(', '));

  // Spot checks that the derivation yields a real flag rather than a fallback.
  assert.equal(flagFor('Nepal'), '\u{1F1F3}\u{1F1F5}');
  assert.equal(flagFor('Brazil'), '\u{1F1E7}\u{1F1F7}');
  assert.equal(flagFor('Saudi Arabia'), '\u{1F1F8}\u{1F1E6}');
  assert.equal(flagFor('Japan'), '\u{1F1EF}\u{1F1F5}');
  assert.equal(flagFor('an unknown place'), null, 'an unknown name must fall back to the globe');
});

test('a grouping is a destination but never a nationality', () => {
  assert.equal(isCountry('Europe'), false, 'Europe is a grouping, not a country');
  assert.equal(isCountry('Multiple countries'), false);
  assert.equal(isCountry('Nepal'), true);
  assert.equal(isCountry('Hong Kong, China'), true, 'a territory a person can hold is still a country of origin');
  assert.ok(!COUNTRY_SET.has('Europe'), 'a nationality list must never be able to name a grouping');
});

test('every country named by a nationality scope is a real country', () => {
  const bad = [];
  for (const entry of scholarships) {
    for (const name of entry.nationality_scope?.countries || []) {
      if (!COUNTRY_SET.has(name)) bad.push(entry.id + ': ' + name);
    }
  }
  assert.deepEqual(bad, [], 'nationality_scope names something that is not a country: ' + bad.join(', '));
});

test('the CSC block reason claims only what was measured', () => {
  // The note said "the host resolves only an IPv6 (AAAA) address". It does not.
  // An A record exists and answers 412 exactly as the AAAA does, so that line
  // described how this machine's resolver was read, written down as a property
  // of the host — the same class of mistake as recording a source as
  // "region-blocked" when the fetching tool was what failed. A negative control,
  // for the same reason as the criterion-only sentence: the defect was a claim
  // that was false about the record it was attached to, and only asserting the
  // absence of the claim catches it coming back.
  const csc = scholarships.find((entry) => entry.id === 'csc-government-scholarship');
  assert.ok(csc.deadline_notes, 'CSC carries a block reason');
  assert.doesNotMatch(csc.deadline_notes, /only an IPv6/i);
  assert.match(csc.deadline_notes, /IPv4/, 'the note records the address families that were tried');
  assert.match(csc.deadline_notes, /412/, 'the note names the status the source returns');
});
