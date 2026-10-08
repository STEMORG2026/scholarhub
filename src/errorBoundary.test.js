// Tests for the error boundary's copy and its pure logic.
//
// These exist because the *words* are the part that can be confidently wrong. The
// layout cannot be tested here at all — Node's test runner refuses `.jsx` outright — and
// `renderToStaticMarkup` does not route errors to a boundary, so whether React catches
// is verified in a browser by hand. What is left, and what matters, is what the reader
// is told when the app breaks.

import test from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK, FORBIDDEN_CLAIMS, LOG_PREFIX, errorText } from './errorBoundary.js';

// --- the claims -------------------------------------------------------------

test('the fallback never claims the error was reported anywhere', () => {
  // There is no server and no error tracker, so "we've been notified" would be false —
  // and worse than no reassurance, because it stops the reader reporting it themselves.
  const all = Object.values(FALLBACK).join(' ');
  for (const claim of FORBIDDEN_CLAIMS) {
    assert.doesNotMatch(all, claim, 'the fallback makes the claim ' + claim);
  }
});

test('the fallback tells the reader their saved work is intact', () => {
  // The most useful sentence the component can produce, and it is true: the profile,
  // shortlist, tracker and checklist live in localStorage and a render error does not
  // touch them.
  assert.match(FALLBACK.reassurance, /stored in this browser/i);
  assert.match(FALLBACK.reassurance, /not touched/i);
});

test('the fallback says the fault is the app, not the reader', () => {
  assert.match(FALLBACK.lede, /not in anything you did/i);
});

test('every piece of fallback copy is non-empty', () => {
  for (const [key, value] of Object.entries(FALLBACK)) {
    assert.equal(typeof value, 'string', key + ' must be a string');
    assert.ok(value.trim().length > 0, key + ' must not be empty');
  }
});

test('the log prefix is distinctive enough to grep for', () => {
  assert.match(LOG_PREFIX, /render error/i);
});

// --- errorText --------------------------------------------------------------

test('an Error yields its message', () => {
  assert.equal(errorText(new Error('boom')), 'boom');
});

test('a thrown string yields itself', () => {
  assert.equal(errorText('a string'), 'a string');
});

test('a thrown object with no message is still printable', () => {
  // `throw { code: 'E_ODD' }` is legal, and a reader reporting it needs something to
  // quote. `String({})` gives "[object Object]", which is worse than useless.
  assert.equal(errorText({ code: 'E_ODD' }), '{"code":"E_ODD"}');
});

test('a thrown number, null and undefined all yield something', () => {
  for (const thrown of [42, null, undefined, false]) {
    const text = errorText(thrown);
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0, 'errorText returned nothing for ' + String(thrown));
  }
});

test('errorText never throws, even on a hostile object', () => {
  // A getter that throws, and a circular structure: String and JSON.stringify can both
  // fail. Throwing while handling a throw would replace the fallback with the blank
  // screen the boundary exists to prevent.
  const hostile = { get message() { throw new Error('getter exploded'); } };
  const circular = {}; circular.self = circular;
  for (const thrown of [hostile, circular]) {
    assert.doesNotThrow(() => errorText(thrown));
    assert.ok(errorText(thrown).trim().length > 0);
  }
});

test('a whitespace-only message falls through to the next representation', () => {
  assert.equal(errorText(new Error('   ')), 'Error');
});
