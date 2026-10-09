#!/usr/bin/env node
//
// The single definition of this repository's commit-message rule.
//
// WHY THIS IS A SCRIPT AND NOT TWO COPIES
// The rule is enforced in two places: the `commit-msg` git hook (before the commit exists)
// and the `Conventional Commits` CI job (before the merge). Writing the pattern out twice
// would let the local check and the remote check disagree — and the whole point of the local
// tier is that passing it predicts passing the remote one. One file, two callers.
//
// WHY THE TYPES ARE ENUMERATED RATHER THAN DELEGATED
// `data:` is this repository's most-used commit type (17 of the last 60 commits) and it is
// NOT in the conventional-commits default set. Handing this to a linter's default config
// would reject the repository's own history on day one.
//
// The logic is exported and the CLI is guarded, so the rule can be unit-tested in-process
// rather than by spawning this file — the same split the rest of the project uses.
//
// Usage:
//   node scripts/check-commit-msg.mjs <message-file>          # git hook: one message
//   node scripts/check-commit-msg.mjs --range <base>..<head>  # CI: every commit in a PR

import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** `<type>(<scope>)!: <description>` — scope and `!` are both optional. */
export const PATTERN = /^(feat|fix|data|docs|test|chore|ci|refactor|revert|perf)(\([^)]+\))?!?: .+/;

/** Git writes these itself; they are not contributions and must not be linted. */
export const GENERATED = /^(Merge |Revert "|fixup! |squash! )/;

export const TYPES = ['feat', 'fix', 'data', 'docs', 'test', 'chore', 'ci', 'refactor', 'revert', 'perf'];

export function isConventional(subject) {
  return PATTERN.test(subject);
}

/** Returns the offending subjects, so a caller can report all of them at once. */
export function checkSubjects(subjects) {
  return subjects
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !GENERATED.test(s) && !isConventional(s));
}

/** Prints the verdict. Returns the exit code rather than exiting, so it can be tested. */
export function report(bad) {
  if (bad.length === 0) {
    console.log('All commit messages are Conventional Commits.');
    return 0;
  }
  console.error('Not a Conventional Commit:');
  for (const s of bad) console.error('  ' + s);
  console.error('');
  console.error('Expected: <type>(<scope>): <description>');
  console.error('Types: ' + TYPES.join(' '));
  console.error('');
  console.error("`data:` is this repository's own type for a catalog or requirements change.");
  return 1;
}

/** The CLI. Returns an exit code. */
export function run(argv) {
  const [first, second] = argv;

  if (first === '--range') {
    if (!second) {
      console.error('--range needs <base>..<head>');
      return 2;
    }
    // --no-merges: merging `main` into a branch is not a contribution.
    const out = execFileSync('git', ['log', '--no-merges', '--format=%s', second], { encoding: 'utf8' });
    return report(checkSubjects(out.split('\n')));
  }

  if (!first) {
    console.error('Usage: check-commit-msg.mjs <message-file> | --range <base>..<head>');
    return 2;
  }

  // Hook mode: the first line is the subject; the rest is the body.
  return report(checkSubjects([readFileSync(first, 'utf8').split('\n')[0]]));
}

/** True only when this file is the process entry point, not when it is imported. */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exit(run(process.argv.slice(2)));
}
