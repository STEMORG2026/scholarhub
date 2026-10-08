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
function run(requirements, env) {
  const dir = mkdtempSync(join(tmpdir(), 'reqval-'));
  const reqPath = join(dir, 'requirements.json');
  const catPath = join(dir, 'scholarships.json');
  writeFileSync(reqPath, JSON.stringify(requirements));
  writeFileSync(catPath, JSON.stringify(CATALOG));
  try {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--requirements=' + reqPath, '--catalog=' + catPath],
      { encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env },
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
  //
  // The status is asserted as well as the silence. Without it this test passed
  // against a fixture the validator REJECTED — a non-zero exit still emits no
  // divergence warning, so the assertion held for entirely the wrong reason.
  const { status, output } = run(withRule({ kind: 'prose' }));
  assert.equal(status, 0, output);
  assert.doesNotMatch(output, /the two disagree/);
});

test('unstated does not warn either', () => {
  const { status, output } = run({ probe: { requirements: [{ kind: 'gpa', of: { kind: 'unstated' }, source: 'https://example.org/rule', last_verified: '2026-10-08' }] } });
  assert.equal(status, 0, output);
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

// --- a date is not an instant (v0.41.0) --------------------------------------

// Every fixture below is computed in UTC, and the validator is spawned with a TZ,
// because the first version of these tests had the very bug they exist to catch:
// it computed "tomorrow" in the *host's* timezone while the validator compared
// against UTC, so the test passed under UTC and failed in Nepal. A timezone test
// that is itself timezone-dependent is worse than no test.
const utcDate = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

test('a date one day ahead validates in EVERY timezone the validator might run in', () => {
  // `last_verified` is written in the author's timezone and checked in the
  // validator's, and two timezones differ by just under a day. A record dated
  // "tomorrow" by the validator's clock is a date written somewhere else, not a
  // future date. Spawning across the full range — UTC-12 to UTC+14 — asserts the
  // invariance rather than one lucky pairing.
  const tomorrow = utcDate(1);
  for (const TZ of ['UTC', 'Pacific/Kiritimati', 'Etc/GMT+12', 'Asia/Kathmandu']) {
    const { status, output } = run(withRule({ kind: 'numeric', minimum: 3, scale: 4 }, { last_verified: tomorrow }), { TZ });
    assert.equal(status, 0, `a date one day ahead must validate with TZ=${TZ}:\n` + output);
  }
});

test('a date two days ahead is rejected', () => {
  // The tolerance is exactly one day and no more: the widest two timezones can
  // diverge is one calendar day, so two days ahead cannot be a correct date.
  const { status, output } = run(withRule({ kind: 'numeric', minimum: 3, scale: 4 }, { last_verified: utcDate(2) }), { TZ: 'UTC' });
  assert.notEqual(status, 0);
  assert.match(output, /in the future/);
});

test('a genuinely future date is still rejected', () => {
  // The tolerance must not turn the check off. 2099 is future everywhere.
  const { status, output } = run(withRule({ kind: 'numeric', minimum: 3, scale: 4 }, { last_verified: '2099-01-01' }));
  assert.notEqual(status, 0);
  assert.match(output, /in the future/);
});

test("today's date validates everywhere too", () => {
  const today = utcDate(0);
  for (const TZ of ['UTC', 'Pacific/Kiritimati', 'Etc/GMT+12']) {
    const { status, output } = run(withRule({ kind: 'numeric', minimum: 3, scale: 4 }, { last_verified: today }), { TZ });
    assert.equal(status, 0, `today must validate with TZ=${TZ}:\n` + output);
  }
});

// --- a delegated bar is named, not inferred (v0.37.0) -----------------------

test('a prose rule may name who sets the bar', () => {
  const { status, output } = run(withRule({ kind: 'prose', delegated_to: 'the admitting university' }));
  assert.equal(status, 0, output);
});

test('delegated_to on a rule that carries a figure is rejected', () => {
  // A figure is not delegated — if a number is recorded, it is the answer.
  const { status, output } = run(withRule({ kind: 'numeric', minimum: 3, scale: 4, delegated_to: 'somebody' }));
  assert.notEqual(status, 0);
  assert.match(output, /only meaningful on a "prose" rule/);
});

test('an empty delegated_to is rejected', () => {
  const { status, output } = run(withRule({ kind: 'prose', delegated_to: '   ' }));
  assert.notEqual(status, 0);
  assert.match(output, /delegated_to must be a non-empty string/);
});

test('unstated may not name a delegate either', () => {
  // The message is asserted, not just the exit status. `delegated_to` on an
  // `unstated` rule trips TWO guards — the bare-rule check and the prose-only
  // check — so asserting only `status !== 0` left the bare-rule clause
  // uncovered: deleting it changed nothing and the test still passed. It did,
  // until this assertion was added.
  const { status, output } = run({
    probe: {
      requirements: [
        { kind: 'gpa', of: { kind: 'unstated', delegated_to: 'somebody' }, source: 'https://example.org/rule', last_verified: '2026-10-08' },
      ],
    },
  });
  assert.notEqual(status, 0);
  assert.match(output, /must be bare/);
});

// --- the wording has exactly one home (v0.35.0) -----------------------------

test('text on the rule is rejected — the wording lives on the requirement', () => {
  // 17 records carried the identical string in both fields and 7 carried it only
  // on the rule, so a consumer reading `text` rendered nothing for those 7.
  const { status, output } = run(withRule({ kind: 'prose', text: 'a second copy of the sentence' }));
  assert.notEqual(status, 0);
  assert.match(output, /rule.text is not allowed/);
});

test('a requirement with no text is rejected', () => {
  // Except `unstated`, where the absence is the finding.
  const { status, output } = run({
    probe: {
      requirements: [
        { kind: 'gpa', of: { kind: 'numeric', minimum: 3, scale: 4 }, source: 'https://example.org/rule', last_verified: '2026-10-08' },
      ],
    },
  });
  assert.notEqual(status, 0);
  assert.match(output, /text is required/);
});

test('an unstated rule carrying text is rejected', () => {
  const { status, output } = run({
    probe: {
      requirements: [
        { kind: 'gpa', of: { kind: 'unstated' }, text: 'nothing was recorded, but here is a sentence anyway', source: 'https://example.org/rule', last_verified: '2026-10-08' },
      ],
    },
  });
  assert.notEqual(status, 0);
  assert.match(output, /must carry no text/);
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
