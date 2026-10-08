// Tests for scripts/validate-requirements.mjs.
//
// The validator is a standalone script that exits non-zero, so these tests run it
// against fixtures in a temp directory rather than importing it. That is slower
// than a unit test and it is worth it: the rules below were corrected in v0.32.0
// after the sourcing pass exposed them, and a rule that lives only in a comment
// is a rule that drifts.
//
// Every test here is a **negative control** where it matters — it asserts the
// validator *rejects* something. A test that only asserts a good file passes
// would still pass if the guard were deleted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', 'scripts', 'validate-requirements.mjs');

// A one-record catalog, so a fixture can be built without touching the real one.
// The root is an array, as data/scholarships.json is. `eligibility.gpa_minimum`
// is null so the catalog-divergence warning has something to fire against.
const CATALOG = [{ id: 'probe', name: 'Probe', eligibility: { gpa_minimum: null } }];

/**
 * Run the validator against a requirements fixture. Returns {status, output}.
 *
 * Both streams are captured. Warnings go to `console.warn` and errors to
 * `console.error`, so a run that *passes* with warnings would show nothing at all
 * if only stdout were read — which is exactly the case the divergence test below
 * asserts on.
 */
function run(requirements) {
  const dir = mkdtempSync(join(tmpdir(), 'reqval-'));
  const reqPath = join(dir, 'requirements.json');
  const catPath = join(dir, 'scholarships.json');
  writeFileSync(reqPath, JSON.stringify(requirements));
  writeFileSync(catPath, JSON.stringify(CATALOG));
  try {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--requirements=' + reqPath, '--catalog=' + catPath],
      { encoding: 'utf8' },
    );
    return { status: result.status ?? 1, output: (result.stdout || '') + (result.stderr || '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** One requirement on `probe`, shaped by the caller. */
const withRule = (of, extra = {}) => ({
  probe: {
    requirements: [
      {
        kind: 'gpa',
        of,
        text: 'the provider\u2019s own wording, so the reader can check it',
        source: 'https://example.org/rule',
        last_verified: '2026-10-08',
        ...extra,
      },
    ],
  },
});

// --- the denominator follows the kind (v0.32.0) -----------------------------

test('a rank is legal at the top level when it carries "of"', () => {
  const { status, output } = run(withRule({ kind: 'rank', minimum: 10, of: 100 }));
  assert.equal(status, 0, output);
});

test('a rank with no "of" is rejected', () => {
  // The v0.32.0 bug: this demanded `scale`, which a rank does not have.
  const { status, output } = run(withRule({ kind: 'rank', minimum: 10 }));
  assert.notEqual(status, 0);
  assert.match(output, /needs a numeric of/);
});

test('a rank carrying "scale" instead of "of" is rejected', () => {
  // Not silently ignored — a leftover scale is the symptom of the bug above.
  const { status, output } = run(withRule({ kind: 'rank', minimum: 10, of: 100, scale: 100 }));
  assert.notEqual(status, 0);
  assert.match(output, /must not carry "scale"/);
});

test('a percentile follows the same rule as a rank', () => {
  assert.equal(run(withRule({ kind: 'percentile', minimum: 80, of: 100 })).status, 0);
  assert.notEqual(run(withRule({ kind: 'percentile', minimum: 80 })).status, 0);
});

test('numeric still needs "scale" — the correction did not weaken it', () => {
  assert.equal(run(withRule({ kind: 'numeric', minimum: 3.0, scale: 4.0 })).status, 0);
  const missing = run(withRule({ kind: 'numeric', minimum: 3.0 }));
  assert.notEqual(missing.status, 0);
  assert.match(missing.output, /needs a numeric scale/);
});

test('a numeric rule with "of" but no scale is still rejected', () => {
  // `of` must not become a back door past the scale requirement.
  const { status } = run(withRule({ kind: 'numeric', minimum: 3.0, of: 100 }));
  assert.notEqual(status, 0);
});

// --- credits: a quantity is not a reading on a scale (v0.33.0) --------------

const withCredits = (of, kind = 'credits') => ({
  probe: {
    requirements: [
      {
        kind,
        of,
        text: 'a minimum of 240 ECTS-credit points',
        source: 'https://example.org/rule',
        last_verified: '2026-10-08',
      },
    ],
  },
});

test('a count with a unit is legal', () => {
  const { status, output } = run(withCredits({ kind: 'count', minimum: 240, unit: 'ECTS' }));
  assert.equal(status, 0, output);
});

test('a count with no unit is rejected', () => {
  // 240 means four different things in ECTS, US credit hours and the Nepali system.
  const { status, output } = run(withCredits({ kind: 'count', minimum: 240 }));
  assert.notEqual(status, 0);
  assert.match(output, /needs a unit/);
});

test('a count carrying a scale is rejected', () => {
  // 240 is not 240 of anything and not 240 on a 4.0 scale; a graduate can hold 300.
  const { status, output } = run(withCredits({ kind: 'count', minimum: 240, unit: 'ECTS', scale: 240 }));
  assert.notEqual(status, 0);
  assert.match(output, /must not carry "scale"/);
});

test('a count carrying "of" is rejected', () => {
  const { status, output } = run(withCredits({ kind: 'count', minimum: 240, unit: 'ECTS', of: 240 }));
  assert.notEqual(status, 0);
  assert.match(output, /must not carry "of"/);
});

test('a count with no minimum is rejected', () => {
  const { status } = run(withCredits({ kind: 'count', unit: 'ECTS' }));
  assert.notEqual(status, 0);
});

test('a count may narrow what it counts with applies_to', () => {
  // EMerald needs 22.5 ECTS *in university-level mathematics*, not 22.5 ECTS.
  const { status, output } = run(withCredits({ kind: 'count', minimum: 22.5, unit: 'ECTS', applies_to: 'university-level mathematics' }));
  assert.equal(status, 0, output);
});

test('an empty applies_to is rejected, not silently ignored', () => {
  // A qualifier that does nothing is worse than no qualifier: the record looks
  // narrowed and is not.
  const { status, output } = run(withCredits({ kind: 'count', minimum: 240, unit: 'ECTS', applies_to: '   ' }));
  assert.notEqual(status, 0);
  assert.match(output, /applies_to must be a non-empty string/);
});

test('a non-string applies_to is rejected', () => {
  const { status } = run(withCredits({ kind: 'count', minimum: 240, unit: 'ECTS', applies_to: 5 }));
  assert.notEqual(status, 0);
});

test('a ninth requirement kind is rejected', () => {
  // The requirement kind is a closed set: adding one changes what the comparison
  // engine has to handle, so it is a code change rather than a data edit.
  const { status, output } = run(withCredits({ kind: 'count', minimum: 240, unit: 'ECTS' }, 'vibes'));
  assert.notEqual(status, 0);
  assert.match(output, /kind must be one of/);
});

// --- the divergence warning stays sharp -------------------------------------

test('a comparable figure with a null catalog gpa_minimum warns', () => {
  const { output } = run(withRule({ kind: 'numeric', minimum: 3.0, scale: 4.0 }));
  assert.match(output, /the two disagree/);
});

test('a prose finding with a null catalog gpa_minimum does not warn', () => {
  // The sourcing pass produces dozens of these; warning on all of them would
  // bury the few a reader can act on.
  const { output } = run(withRule({ kind: 'prose', text: 'grades are one of four criteria' }));
  assert.doesNotMatch(output, /the two disagree/);
});

test('unstated does not warn either', () => {
  const { output } = run({ probe: { requirements: [{ kind: 'gpa', of: { kind: 'unstated' }, source: 'https://example.org/rule', last_verified: '2026-10-08' }] } });
  assert.doesNotMatch(output, /the two disagree/);
});

// --- the rules that came before still hold ----------------------------------

test('unstated must be bare', () => {
  const { status, output } = run({
    probe: {
      requirements: [
        { kind: 'gpa', of: { kind: 'unstated', text: 'a finding' }, source: 'https://example.org/rule', last_verified: '2026-10-08' },
      ],
    },
  });
  assert.notEqual(status, 0);
  assert.match(output, /must be bare/);
});

test('none-stated needs a quote', () => {
  const { status, output } = run({
    probe: {
      requirements: [
        { kind: 'gpa', of: { kind: 'none-stated', text: 'no threshold' }, source: 'https://example.org/rule', last_verified: '2026-10-08' },
      ],
    },
  });
  assert.notEqual(status, 0);
  assert.match(output, /needs a quote/);
});

test('a requirement for a record the catalog does not have is rejected', () => {
  const { status, output } = run({
    'no-such-record': {
      requirements: [
        { kind: 'gpa', of: { kind: 'numeric', minimum: 3, scale: 4 }, source: 'https://example.org/rule', last_verified: '2026-10-08' },
      ],
    },
  });
  assert.notEqual(status, 0);
  assert.match(output, /no-such-record/);
});

test('a future last_verified is rejected', () => {
  const { status, output } = run({
    probe: {
      requirements: [
        { kind: 'gpa', of: { kind: 'numeric', minimum: 3, scale: 4 }, source: 'https://example.org/rule', last_verified: '2099-01-01' },
      ],
    },
  });
  assert.notEqual(status, 0);
  assert.match(output, /last_verified/);
});

test('an eighth rule kind is rejected', () => {
  const { status, output } = run({
    probe: {
      requirements: [
        { kind: 'gpa', of: { kind: 'vibes', minimum: 3, scale: 4 }, source: 'https://example.org/rule', last_verified: '2026-10-08' },
      ],
    },
  });
  assert.notEqual(status, 0);
  assert.match(output, /must be one of/);
});
