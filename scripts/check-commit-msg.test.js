// Tests for the commit-message rule.
//
// These are **negative controls** where it matters: the interesting question is not whether a
// well-formed message passes — it is whether a malformed one is actually refused. A check that
// accepts everything looks identical to a check that works until you watch it fail.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isConventional, checkSubjects, report, run, TYPES } from './check-commit-msg.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-commit-msg.mjs');

// ── the rule ─────────────────────────────────────────────────────────────────

test('every type this repository documents is accepted', () => {
  // `data:` is the reason this list is enumerated rather than delegated to a linter's
  // default. It is this repository's most-used type and is NOT in the conventional-commits
  // default set, so a default config would reject the repository's own history.
  for (const type of TYPES) {
    assert.equal(isConventional(`${type}: a description`), true, `${type}: should be accepted`);
  }
  assert.ok(TYPES.includes('data'), 'data: must stay in the list — the repository depends on it');
});

test('a scope and a breaking-change marker are both optional and both allowed', () => {
  assert.equal(isConventional('feat(ci): scoped'), true);
  assert.equal(isConventional('feat!: breaking'), true);
  assert.equal(isConventional('feat(ci)!: both'), true);
});

test('a message that is not a Conventional Commit is refused', () => {
  for (const bad of [
    'fixed the parser',
    'update stuff',
    'feat add thing',
    'Feat: capitalised type',
    'feat:no space after colon',
    'wip',
    ': no type',
  ]) {
    assert.equal(isConventional(bad), false, `${JSON.stringify(bad)} should be refused`);
  }
});

test('git-generated messages are skipped, not linted', () => {
  // A merge of `main` into a branch is not a contribution, and its subject is not a
  // Conventional Commit. Linting it would make every rebase look like a violation.
  assert.deepEqual(checkSubjects(['Merge branch main into feature']), []);
  assert.deepEqual(checkSubjects(['fixup! feat: x']), []);
  assert.deepEqual(checkSubjects(['squash! feat: x']), []);
  assert.deepEqual(checkSubjects(['Revert "feat: x"']), []);
});

test('checkSubjects reports only the offending messages', () => {
  assert.deepEqual(checkSubjects(['feat: good', 'not a conventional commit', '', 'data: also good', '   ']), [
    'not a conventional commit',
  ]);
});

test('a blank or whitespace-only message is not reported as malformed', () => {
  // An empty subject means git is asking about something else; reporting it as a violation
  // would produce a failure with nothing to fix.
  assert.deepEqual(checkSubjects(['']), []);
  assert.deepEqual(checkSubjects(['   ']), []);
});

test('report returns the exit code instead of exiting', () => {
  assert.equal(report([]), 0);
  assert.equal(report(['nope']), 1);
});

// ── the CLI contract ─────────────────────────────────────────────────────────
// The git hook and the CI job both invoke this as a process, so the exit codes are the
// interface. These spawn it for real, because that is how it is used.

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('CLI: a message file is checked, and a bad one exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cmsg-'));
  try {
    const good = join(dir, 'good');
    const bad = join(dir, 'bad');
    writeFileSync(good, 'feat: a good one\n\nbody\n');
    writeFileSync(bad, 'fixed the parser\n');

    const ok = runCli([good]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Conventional Commits/);

    const nope = runCli([bad]);
    assert.equal(nope.status, 1);
    assert.match(nope.stderr, /fixed the parser/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: no arguments is a usage error, not a pass', () => {
  // A check that exits 0 when it was asked to do nothing is a check that silently stops
  // working the first time it is wired up wrong.
  const r = runCli([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage/);
});

test('CLI: --range without a range is a usage error', () => {
  const r = runCli(['--range']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--range needs/);
});

test('CLI: an empty range passes without inspecting history', () => {
  // `HEAD..HEAD` is empty, so this exercises the range path without coupling the test to
  // whatever happens to be in the log — which, in this repository, includes one
  // non-conventional subject from before the rule was enforced.
  const r = runCli(['--range', 'HEAD..HEAD']);
  assert.equal(r.status, 0, r.stderr);
});

test('run() is callable in-process, which is why the CLI is guarded', () => {
  // If the module executed on import, this file could not import it at all.
  assert.equal(typeof run, 'function');
  assert.equal(run(['--range', 'HEAD..HEAD']), 0);
});
