#!/usr/bin/env node
//
// Verify that the live branch protection on `main` still matches what
// `.github/BRANCH-PROTECTION.md` claims.
//
// Why this exists: for most of this project's life the strongest control it had — a
// required status check that makes a red build unmergeable — was invisible to anyone
// reading the repository, and the proof that it worked lived in terminal scrollback. A
// document would have fixed the visibility and introduced a new problem: a document
// describing a control is a claim, and it goes stale the first time somebody adjusts a
// setting. This reads the live ruleset instead, so the claim is checkable.
//
// It is deliberately NOT part of `npm test`. It needs the network and `gh`
// authentication, and a gate that fails when the network is down is a gate people
// learn to ignore. `npm run check:protection`.

import { execFileSync } from 'node:child_process';

const REPO = 'STEMORG2026/scholarhub';

/** What the ruleset must say. Every field here is asserted, not read and reported. */
const EXPECTED = {
  enforcement: 'active',
  target: 'branch',
  // Nobody bypasses — not even the owner. This is the field that makes the gate real
  // rather than advisory for an admin.
  bypassActors: 0,
  requiredRuleTypes: ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'],
  // Every check that must pass before `main` moves. `verify` is the merge gate and the
  // canonical local command; the other three are the policy checks added in v0.48.0,
  // promoted to required in v0.51.0. Each one triggers on `pull_request`, which is the
  // property that matters — a required check that no workflow produces never reports, and
  // the pull request then waits for it forever.
  statusContexts: [
    'verify',
    'Branching Strategy',
    'Conventional Commits',
    'Every action is pinned to a commit SHA',
  ],
  strictStatusChecks: true,
  reviewThreadResolution: true,
};

const problems = [];
const notes = [];

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function fail(msg) {
  problems.push(msg);
}

let rulesets;
try {
  rulesets = JSON.parse(gh(['api', `repos/${REPO}/rulesets`]));
} catch (error) {
  console.error('Could not read the rulesets from GitHub.');
  console.error('This needs `gh` on PATH and authenticated (`gh auth status`).');
  console.error(String(error.stderr || error.message).trim());
  process.exit(2);
}

const branchRulesets = rulesets.filter((r) => r.target === 'branch');
if (branchRulesets.length === 0) {
  console.error('No branch ruleset exists. `main` is unprotected.');
  process.exit(1);
}
if (branchRulesets.length > 1) {
  // Not fatal, but worth saying: two rulesets on the same branch apply as a union, so
  // the effective rule is the sum of both and neither document describes it alone.
  notes.push(`${branchRulesets.length} branch rulesets exist; they apply as a union. This checks each.`);
}

for (const summary of branchRulesets) {
  const ruleset = JSON.parse(gh(['api', `repos/${REPO}/rulesets/${summary.id}`]));
  const label = `ruleset "${ruleset.name}" (${ruleset.id})`;

  if (ruleset.enforcement !== EXPECTED.enforcement) {
    fail(`${label}: enforcement is "${ruleset.enforcement}", expected "${EXPECTED.enforcement}" — a non-active ruleset does not gate anything`);
  }
  if ((ruleset.bypass_actors || []).length !== EXPECTED.bypassActors) {
    const who = (ruleset.bypass_actors || []).map((a) => `${a.actor_type}:${a.actor_id}`).join(', ');
    fail(`${label}: bypass_actors is not empty (${who}) — someone can merge past the gate`);
  }

  const byType = new Map((ruleset.rules || []).map((r) => [r.type, r]));

  for (const type of EXPECTED.requiredRuleTypes) {
    if (!byType.has(type)) fail(`${label}: missing the "${type}" rule`);
  }

  const checks = byType.get('required_status_checks');
  if (checks) {
    const contexts = (checks.parameters?.required_status_checks || []).map((c) => c.context);
    for (const want of EXPECTED.statusContexts) {
      if (!contexts.includes(want)) {
        fail(`${label}: required status checks are [${contexts.join(', ')}], expected to include "${want}" — CI can be red and a merge still succeed`);
      }
    }
    if (checks.parameters?.strict_required_status_checks_policy !== EXPECTED.strictStatusChecks) {
      fail(`${label}: strict_required_status_checks_policy is ${checks.parameters?.strict_required_status_checks_policy}, expected ${EXPECTED.strictStatusChecks}`);
    }
  }

  const pr = byType.get('pull_request');
  if (pr) {
    if (pr.parameters?.required_review_thread_resolution !== EXPECTED.reviewThreadResolution) {
      fail(`${label}: required_review_thread_resolution is ${pr.parameters?.required_review_thread_resolution}, expected ${EXPECTED.reviewThreadResolution}`);
    }
    // Reported rather than asserted: these are deliberate choices for a single-maintainer
    // repository, and the point of printing them is that a change is visible.
    notes.push(`${label}: required_approving_review_count=${pr.parameters?.required_approving_review_count}, require_code_owner_review=${pr.parameters?.require_code_owner_review}`);
  }

  if (byType.has('required_linear_history')) {
    // Not asserted either way, but it has bitten this project before: it forbids merge
    // commits, and the failure only surfaces at merge time, after CI is green.
    notes.push(`${label}: required_linear_history is ON — merge commits will be refused`);
  }
}

for (const note of notes) console.log('  note  ' + note);

if (problems.length > 0) {
  console.error('\nBranch protection does NOT match .github/BRANCH-PROTECTION.md:\n');
  for (const problem of problems) console.error('  FAIL  ' + problem);
  console.error('\nEither restore the setting or update the document — but not silently.');
  process.exit(1);
}

console.log('\nBranch protection matches .github/BRANCH-PROTECTION.md.');
console.log('To prove the gate rather than read it, push a dangling commit at main:');
console.log('  SHA=$(git commit-tree "$(git rev-parse origin/main^{tree})" -p "$(git rev-parse origin/main)" -m probe)');
console.log('  git push origin "$SHA:refs/heads/main"   # expect: push declined due to repository rule violations');
