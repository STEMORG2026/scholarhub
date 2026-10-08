# Branch protection — what is enforced on `main`, and how to check it

Checked into the repository in v0.42.0 because until then the strongest control in this
project was **invisible to anyone reading it**. The gate has been proved repeatedly by
attempting a direct push and reading the rejection, but that proof lived in terminal
scrollback, not in the repository.

## The rule

**Nothing reaches `main` except through a pull request whose `verify` check has passed.**

## Where it lives

A **ruleset** named `main-protection` (id `24695557`), not classic branch protection.
Both systems apply as a union when both exist, so having only one is deliberate: two
sources of truth for the same rule is two places for it to drift.

## What the ruleset enforces

| Rule | Setting | Why |
|---|---|---|
| `required_status_checks` | context **`verify`**, `strict_required_status_checks_policy: true` | CI can be red and a merge still succeed without this — the gate was advisory until v0.30.0. The context is the **job** name, not the workflow name. |
| `pull_request` | `required_review_thread_resolution: true` | An unresolved review comment blocks the merge. |
| `deletion` | — | `main` cannot be deleted. |
| `non_fast_forward` | — | History cannot be rewritten under anyone who has cloned. |
| `bypass_actors` | `[]` | Nobody bypasses, including the owner. |

Deliberately **not** set:

- **`required_approving_review_count`** is `0`, and **`require_code_owner_review`** is
  `false`. With one maintainer, requiring an approval would block every merge — GitHub
  does not allow an author to approve their own PR. See `.github/CODEOWNERS`.
- **`required_linear_history`** is absent. It forbids merge commits, and this repository
  merged with merge commits for its first 20 releases. Setting it without changing the
  merge method is a self-inflicted outage that only surfaces at merge time, after CI is
  green.

## How to verify it

```bash
npm run check:protection
```

That script reads the **live** ruleset from the GitHub API and fails if it does not match
the table above. A document describing a control is a claim; a script that reads the
control is evidence, and this file would otherwise go stale the first time someone
adjusted a setting.

It is not part of `npm test`, because it needs the network and `gh` authentication — a
gate that fails when the network is down is a gate people learn to ignore. Run it after
changing anything about the ruleset, and in the same breath as the direct-push probe:

```bash
SHA=$(git commit-tree "$(git rev-parse origin/main^{tree})" -p "$(git rev-parse origin/main)" -m "gate probe")
git push origin "$SHA:refs/heads/main"
# expect: ! [remote rejected] ... (push declined due to repository rule violations)
#         remote: - Required status check "verify" is expected.
```

The probe uses a **dangling commit object**, so nothing in the working tree or on any
branch moves. `git push origin main` with nothing to push prints `Everything up-to-date`
and proves nothing, and the usual alternative — commit and `git reset --hard` afterwards
— is a destructive operation on the branch being protected.

_Snapshot taken 2026-10-09; the script is the source of truth, not this file._
