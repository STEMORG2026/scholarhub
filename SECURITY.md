# Security Policy

## What this project is, and what that means for security

ScholarHub is a **static, client-side application**. There is no server, no database, no
account system, and no authentication. It is built to a static bundle and served as files.

That shapes the threat model in two directions:

- **There is no backend to attack**, no session to steal, and no password to hash. A finding
  about password hashing, session fixation, or server-side injection is not applicable here.
- **The reader's browser is the whole runtime.** Everything the app knows about a reader —
  their profile, shortlist, tracker, checklist, and the documents they attach — is held in
  `localStorage` on their own device and never transmitted. The only outbound network calls are
  to an AI provider, and only if the reader has configured one and supplied their own key.

The most valuable thing to report is therefore a way in which **data leaves the browser when it
should not**, or a way in which the app **claims something is true that is not**.

## Supported versions

Only the tip of `main` is supported. There are no maintained release branches and no backports.

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| any earlier commit | ❌ |

## Reporting a vulnerability

**Please use GitHub's private vulnerability reporting** rather than opening a public issue:

<https://github.com/STEMORG2026/scholarhub/security/advisories/new>

That channel keeps the report private until there is a fix. If you cannot use it, open a
minimal public issue asking for a private channel and **do not include the details**.

Please include: what you did, what happened, what you expected, and the browser and version.
A proof of concept is welcome; a working exploit against a real reader is not.

**Do not test against anyone else's data.** There is no server to test against — a useful
report is almost always reproducible by opening the app in your own browser.

## What to expect

This is an independent project with a single maintainer, so:

- **Acknowledgement** within about a week.
- **An honest assessment** of whether the report is a real defect, and if it is not, why not.
  A confident "this is not exploitable because…" is the goal, not a defensive one.
- **Credit** in the fix's commit and changelog if you would like it.

## Out of scope

- Missing HTTP security headers. There is no server; response headers belong to the host.
- Anything requiring physical access to an unlocked device.
- Findings from an automated scanner reported without a demonstrated consequence. Several have
  already been checked and disproved — see `USA-AUDIT-TRIAGE.md`.
- The `localStorage` persistence model itself. It is a deliberate design choice, documented in
  `AGENTS.md`; the risk it carries is that a reader on a shared machine can read the profile
  from the same browser profile. That is accepted, and the app says so on screen.
