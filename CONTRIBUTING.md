# Contributing to ScholarHub

Thank you for helping students find funding. Contributions should improve accuracy, clarity, accessibility, or usability. This project has no account system; do not propose storing applicant profiles on a server.

## Development setup

1. Install Node.js 20+ and npm.
2. Fork the repository and create a branch: `feat/short-description`, `fix/short-description`, `data/country-program`, or `docs/short-description`.
3. Run `npm install`, then `npm run dev`.
4. Before opening a pull request, run `npm test` and `npm run build`.

## Add or update a scholarship

1. Find the official scholarship or university page. Prefer the awarding body, government, or university over aggregators.
2. Create or edit a JSON record in `data/scholarships/{country-slug}/` (e.g. `data/scholarships/germany/`) using [`docs/scholarship.template.json`](docs/scholarship.template.json). The app currently reads `data/scholarships.json`; keep that catalog synchronized until country files are wired into the data loader.
3. Use a stable unique `id` in kebab-case. Include all known fields, but do not guess missing values. Use `null` for unknown deadlines and `[]` for unknown lists.
4. Add official URLs for both `official_url` and `application_url` when they point to different pages; otherwise both may use the official page.
5. Add/update `source_url` and `last_verified` before merging. Describe the specific page checked. Do not mark a record open unless the current application cycle is confirmed.
6. Run tests/build and review the rendered detail. A data-only pull request should identify fields that changed.

**Current compatibility note:** the starter records are in one root JSON array; per-country files are a contribution target, not yet loaded by the app. Avoid duplicating a record into the running dataset until the loader is migrated.

## Adding countries

- Use an ISO 3166-1 alpha-2 country slug when practical (e.g. `japan/`); broader regions may use a documented region slug such as `europe/`.
- Add the country display name to `country`. Flags are rendered using Unicode emoji; no flag assets are currently required. Add the flag mapping in `src/main.jsx`.
- Add at least one official country scholarship or government portal and a country overview in a future docs page. Never imply country-wide completeness from one award.

## Adding academic fields

- Use a readable, stable field label in `program_field` (e.g. `Materials Science`).
- Match official program names when possible; do not add synonyms as separate taxonomy entries without a reason.
- Update filters, profile selector, and tests if adding a field to the UI. Use consistent tags: `international`, `research`, `merit-based`, `need-based`, `tuition`, `stipend`, and specific program attributes.

## Code standards

- Keep the app static/client-side, accessible, and dependency-light.
- Use semantic HTML, visible labels, keyboard-accessible controls, and descriptive accessible names for icon buttons.
- Keep user profile/shortlist state local. Never add auth, a backend profile store, analytics, or secrets.
- AI text is informational; clearly distinguish suggestions from verified facts. Do not make eligibility promises.
- Avoid unsupported assertions and document known limitations.

## Data verification and reporting

Use the **Data correction** issue template for expired deadlines, broken URLs, eligibility changes, or amount corrections. Include the record ID, official URL, date checked, and an excerpt or summary of the authoritative change. Maintainers should revisit the source before changing canonical data. A report from a third-party page is a lead, not sufficient verification.

## Pull request process

1. Keep one focused change per PR; explain the user impact and any data sources.
2. Link related issues; include screenshots for visible UI changes when practical.
3. Confirm tests/build pass and that no keys, personal data, or generated `dist/` files are included.
4. Maintainers review correctness, scope, privacy, accessibility, and source quality. Changes to data may be held for verification.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be kind, assume good intent, and report harmful conduct privately to the maintainers.
