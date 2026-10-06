# Changelog

## [0.2.0] - 2026-10-07

### Added

- `deadline_notes` schema field, for cycles that have no single closing date (an application window, field-split deadlines, or a country-specific rule).
- `npm run check:links` — a link-liveness probe over every `official_url`, `application_url`, and `source_url`. It fails the run on a `404`/`410`; `401`/`403`/`405`/`429` are reported as **blocked** rather than dead, because many government and university sites refuse automated requests.
- Deadline and "source last checked" rendering in both the card and the detail dialog, with an explicit "not maintained" fallback when no date is recorded.
- `--catalog=<path>` option on the validator, so the checks can be exercised against fixtures.

### Changed

- All 14 catalog records now carry a `source_url` and a `last_verified` date. Catalog warnings fell from 40 to 5.
- Award amounts and benefit lists refreshed from the official pages (NSF GRFP, Eiffel, NL Scholarship, ETH ESOP, Australia Awards, Melbourne Graduate Research).
- Statuses set from verified pages where the cycle state is unambiguous (Chevening, ETH ESOP, Melbourne, NSF GRFP).
- The hero destination count is derived from the catalog instead of hardcoded.
- Validator now rejects a record whose `deadline` has no `last_verified`, or whose `deadline` sits behind `status: "verify"`.

### Fixed

- Two dead official links: the Tsinghua financial-aid page and the University of Canterbury first-year scholarship page both returned `404`. Both now point at the current pages.
- The offline assistant guide printed the user's question twice.
- Removed the mobile menu button, which was `display:none` in every media query and therefore did nothing.

## [0.1.0] - 2026-09-25

- Initial static ScholarHub app: discovery filters, details, local profile, shortlist, dark mode, and offline assistant guide.
- Added 14 starter scholarship discovery records with official program links.
- Added data/contribution and architecture documentation.
- Clearly documented incomplete country coverage and unimplemented AI/provider features.
