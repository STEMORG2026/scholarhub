// Tests for the assistant's two rules: what it may send, and what it may claim.
//
// The profile-egress tests are written as *negative controls* where it matters.
// The bug this module fixes was an unconditional send, so a test that only
// asserts the happy path ("a fit question includes the profile") would have
// passed against the broken code as well. The tests that carry the weight are
// the ones asserting the profile is **absent** \u2014 those fail the moment someone
// returns a clause unconditionally, which is exactly how the hole appeared.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  needsProfile,
  hasAnyProfileFact,
  readerClause,
  egressDisclosure,
  offlineAnswer,
  ASSESSOR_GUARD,
} from './assistant.js';

const PROFILE = { field: 'Civil Engineering', degree: 'Master', nationality: 'Nepal' };

// --- the profile gate -------------------------------------------------------

test('a question about the reader carries the profile', () => {
  for (const question of [
    'Am I eligible for MEXT?',
    'Do I qualify for the KAUST fellowship?',
    'What are my chances at TU Delft?',
    'can i apply to this with my gpa',
    'Is there a waiver for my country?',
    'Which ones fit me best?',
  ]) {
    const decision = needsProfile(question, PROFILE);
    assert.equal(decision.ok, true, `"${question}" should have been read as a question about the reader`);
    assert.equal(decision.reason, 'asks-about-self');
  }
});

test('a question about a programme does not carry the profile', () => {
  // These are the questions that were previously leaking three profile facts.
  for (const question of [
    'What is the deadline for MEXT?',
    'Which scholarships are in Japan?',
    'Tell me about the DAAD programme.',
    'What documents does the Chevening scheme ask for?',
    'How much does the Fulbright award pay?',
  ]) {
    const decision = needsProfile(question, PROFILE);
    assert.equal(decision.ok, false, `"${question}" is about a programme and must not send the profile`);
    assert.equal(decision.reason, 'not-about-self');
  }
});

test('the gate does not fire on a profile word inside a longer word', () => {
  // The two-letter cues are the ones a substring test gets wrong. `\bi\b` must
  // not match "information", "India", or "main"; `\bmy\b` must not match "Myanmar".
  const decoys = [
    'Information about the MEXT scholarship',
    'Scholarships in India for engineering students',
    'What does the main requirement say?',
    'Details of the Myanmar programme',
  ];
  for (const question of decoys) {
    assert.equal(needsProfile(question, PROFILE).ok, false, `"${question}" should not be read as a question about the self`);
  }
});

test('a fit question with no profile set sends nothing rather than a hole', () => {
  for (const empty of [{}, null, undefined, { field: '', degree: '  ', nationality: null }]) {
    const decision = needsProfile('Am I eligible?', empty);
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, 'no-profile');
  }
});

test('a blank question never sends the profile', () => {
  assert.equal(needsProfile('', PROFILE).ok, false);
  assert.equal(needsProfile('   ', PROFILE).ok, false);
  assert.equal(needsProfile(null, PROFILE).ok, false);
  assert.equal(needsProfile(undefined, PROFILE).ok, false);
});

test('hasAnyProfileFact needs one real fact, not a whitespace string', () => {
  assert.equal(hasAnyProfileFact(PROFILE), true);
  assert.equal(hasAnyProfileFact({ field: 'Civil Engineering' }), true);
  assert.equal(hasAnyProfileFact({ nationality: 'Nepal' }), true);
  assert.equal(hasAnyProfileFact({ field: '   ', degree: '', nationality: null }), false);
  assert.equal(hasAnyProfileFact(null), false);
});

// --- the clause -------------------------------------------------------------

test('readerClause returns null when the profile may not be sent', () => {
  // Null, not an empty string. An interpolated null renders visibly broken; an
  // omitted sentence reads as "not given", which is a different and false claim.
  assert.equal(readerClause('What is the MEXT deadline?', PROFILE), null);
  assert.equal(readerClause('Am I eligible?', {}), null);
});

test('readerClause names the facts it is allowed to send', () => {
  const clause = readerClause('Am I eligible?', PROFILE);
  assert.match(clause, /Master in Civil Engineering/);
  assert.match(clause, /country of origin Nepal/);
});

test('readerClause omits nationality when there is none, without inventing one', () => {
  const clause = readerClause('Do I qualify?', { field: 'Civil Engineering', degree: 'Master', nationality: '' });
  assert.match(clause, /Master in Civil Engineering/);
  assert.doesNotMatch(clause, /country of origin/);
  assert.doesNotMatch(clause, /null|undefined|N\/A/);
});

// --- disclosure -------------------------------------------------------------

test('the disclosure says nothing was sent when the question is about programmes', () => {
  const disclosure = egressDisclosure('What is the MEXT deadline?', PROFILE);
  assert.equal(disclosure.included, false);
  assert.deepEqual(disclosure.fields, []);
  assert.match(disclosure.sentence, /nothing about you was sent/i);
});

test('the disclosure names the exact fields when the profile is sent', () => {
  const disclosure = egressDisclosure('Am I eligible?', PROFILE);
  assert.equal(disclosure.included, true);
  assert.deepEqual(disclosure.fields, ['field', 'degree', 'nationality']);
  assert.match(disclosure.sentence, /field, degree, nationality/);
});

test('the disclosure claims nothing about safety', () => {
  // Same rule egressSummary() is held to: say where it went, not that it is safe.
  for (const question of ['Am I eligible?', 'What is the MEXT deadline?', '']) {
    const { sentence } = egressDisclosure(question, PROFILE);
    assert.doesNotMatch(sentence, /\b(secure|private|safe|encrypted|protected)\b/i, sentence);
  }
});

test('the disclosure lists only the fields actually present', () => {
  const disclosure = egressDisclosure('Do I qualify?', { field: 'Civil Engineering', degree: 'Master' });
  assert.deepEqual(disclosure.fields, ['field', 'degree']);
});

// --- the assessor guard -----------------------------------------------------

test('the assessor guard forbids a verdict and names the GPA gap', () => {
  // Asserted on meaning, not phrasing: the prompt is a controlled string and its
  // wording may be tightened, but these three commitments may not be dropped.
  assert.match(ASSESSOR_GUARD, /not an assessor/i);
  assert.match(ASSESSOR_GUARD, /must not say or imply that someone qualifies or does not/i);
  // The specific, measured fact that makes this necessary.
  assert.match(ASSESSOR_GUARD, /no numeric GPA threshold for any programme/i);
});

// --- the offline answer -----------------------------------------------------

test('the offline answer names the picks and never claims eligibility', () => {
  const text = offlineAnswer({
    picks: [{ name: 'MEXT' }, { name: 'KAUST Fellowship' }],
    open: [{}],
    closed: [],
    profile: PROFILE,
  });
  assert.match(text, /MEXT, KAUST Fellowship/);
  assert.match(text, /not an eligibility decision/i);
});

test('the offline answer asks for a country rather than assuming one', () => {
  const text = offlineAnswer({ picks: [{ name: 'MEXT' }], open: [], closed: [], profile: { field: 'Civil Engineering', degree: 'Master' } });
  assert.match(text, /set your country of origin/i);
  assert.doesNotMatch(text, /open to applicants from/);
});

test('the offline answer survives an empty catalog without a broken sentence', () => {
  const text = offlineAnswer({ picks: [], open: [], closed: [], profile: {} });
  assert.match(text, /the catalog/);
  assert.doesNotMatch(text, /undefined|null|,\s*,/);
});
