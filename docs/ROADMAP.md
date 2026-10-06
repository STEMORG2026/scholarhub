# ScholarHub Roadmap

Living document tracking project progress, current development focus, and planned milestones. Update this file as work completes or priorities shift.

## Progress log

| Date | Milestone | Status | Notes |
|------|-----------|--------|-------|
| 2026-09-25 | Project bootstrap | ✅ Done | Vite + React app, static JSON catalog, responsive UI, localStorage profile/shortlist, dark mode, docs, GitHub repo created |
| 2026-09-25 | Starter data seeded | ✅ Done | 14 records across USA, China, Germany, Europe, UK, France, Netherlands, Switzerland, Australia, NZ with official links |
| 2026-09-25 | Repository governance | ✅ Done | AGENTS.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue/PR templates, data schema docs |
| 2026-09-25 | Catalog validation | ✅ Done | `npm test` (node --test) + standalone `scripts/validate-catalog.mjs` |
| 2026-10-07 | Source provenance | ✅ Done | All 14 records carry a dated `source_url` and `last_verified`; warnings 40 → 5 |
| 2026-10-07 | Link liveness gate | ✅ Done | `npm run check:links`; found and fixed 2 dead official links (Tsinghua, Canterbury) |
| 2026-10-07 | Deadline support | ✅ Done | `deadline_notes` field + provenance-aware deadline display; ETH ESOP 2026-11-30 verified |

## Current development focus (NOW)

- **Data expansion**: Reach 15–25 verified scholarship records per country/region for Phase 1 targets (USA, China, Europe, Australia, New Zealand) in Civil Engineering and Materials Science. This is now the largest remaining gap — provenance is done, breadth is not.
- **Deadline coverage**: Schema and display support landed on 2026-10-07, but only one record carries a single verified closing date. Add real dates as official cycles publish them, and use `deadline_notes` where a cycle has no single date.
- **Accessibility audit**: Verify keyboard navigation, ARIA labels, screen reader compatibility, and color contrast. Known issue: chips and status badges use hardcoded light colours with no dark-mode override.
- **AI provider seam**: Define the adapter interface contract (SEAM) so future provider integrations have a stable boundary.

## Phase 1 — Foundation (in progress)

**Scope:** USA, China, Europe (UK, Germany, France, Netherlands, Sweden, Switzerland), Australia, New Zealand. Fields: Civil Engineering, Materials Science.

- [x] Static client-side app with search, filters, saved list, profile storage
- [x] Responsive layout with dark/light mode
- [x] Initial sourced scholarship discovery leads (14 records)
- [x] Data schema documentation and contribution guide
- [x] GitHub repository with issue/PR templates
- [x] Agent instructions (AGENTS.md) and roadmap tracking
- [x] Catalog validation tests
- [x] Source provenance and link-liveness gate (2026-10-07)
- [x] Deadline display with provenance, plus `deadline_notes` (2026-10-07)
- [ ] Expand to 15–25 individually verified entries per country/region
- [ ] Add verified program/field coverage with regular human review
- [ ] Accessibility testing and screenshots for README
- [ ] AI provider adapter interface definition (SEAM)
- [ ] Offline preparation roadmap generator (template-based, no LLM required)

## Phase 2 — Expansion (planned)

- [ ] Add Canada, Japan, South Korea, India, Middle East, Africa, South America
- [ ] Add more academic fields (CS, Mechanical, Electrical, Business, Medicine)
- [ ] AI chat assistant with user-selectable providers (browser-only keys)
- [ ] Profile-based scholarship ranking with match percentage
- [ ] Preparation roadmap export (PDF/markdown)
- [ ] Deadline reminder notifications (localStorage-based)

## Phase 3 — Community (planned)

- [ ] Community-driven scholarship verification workflow
- [ ] Automated data freshness checks (human-reviewed, never auto-published)
- [ ] Applicant experience sharing (no accounts; local or voluntary submission)
- [ ] Multilingual UI support
- [ ] Optional country-file split loader for large catalogs

## Principles

1. **No authentication.** The app is fully public. Personalization stays in the browser.
2. **No paid services required.** AI features are optional enhancements using user-provided keys.
3. **Official sources are authoritative.** This catalog is a discovery aid, not a replacement for provider pages.
4. **Build small.** Verified increments over speculative infrastructure.
5. **AI output is not canonical.** Generated content requires human review before commit.

