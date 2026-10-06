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
| 2026-10-07 | Catalog expansion | ✅ Done | 14 → 19 records, 10 → 11 destinations; added RESCO, TERRA, BIOPHAM, TFMASA and the SI Scholarship (Sweden); 28 links probed, 0 dead |
| 2026-10-07 | USA and China depth | ✅ Done | 19 → 22 records; added JJ/WBGSP, Tongji University and the HIT Scholarship; China now at 4 records. Humphrey (non-degree) and CAS-TWAS (9-year-stale source) excluded |
| 2026-10-07 | Short-course support | ✅ Done | `Non-degree` added to the `degree_level` enum; 22 → 24 records with the two Manaaki short-term schemes; field/degree filters derived from the catalog; 33 links probed, 0 dead |
| 2026-10-07 | Dark-mode contrast | ✅ Done | Hero stats measured 1.39:1 and were effectively invisible; chips, badges, match ring and card icons had no dark override. All now ≥ 5.6:1 (WCAG AA) |
| 2026-10-07 | EMJM depth | ✅ Done | 24 → 27 records; Europe now 8, the deepest destination. Added EESIC (2027-2029 call opens October 2026), REM+ 2 and MaMaSELF+; 41 links probed, 0 dead |
| 2026-10-07 | Single-entry countries | ✅ Done | 27 → 30 records; added TU Delft (real deadline 2026-12-01), Gates Cambridge and DAAD EPOS. Netherlands, Germany and UK now hold 2 each; 47 links probed, 0 dead |
| 2026-10-07 | Last single-entry countries | ✅ Done | 30 → 33 records; added KTH (real deadline 2027-01-15), Swiss Government Excellence and Paris-Saclay. France, Switzerland and Sweden now hold 2 each — **every Phase 1 destination has ≥2**; 50 links probed, 0 dead |
| 2026-10-07 | Accessibility audit | ✅ Done | Contrast measured across 5 views × 2 themes: **34 failing elements fixed** (light mode 26/39 failed, worst 2.35:1). Added focus rings (there were none), dialog focus trap + Escape + focus restore, a labelled icon button, live regions, and a working Ctrl/⌘ K shortcut. README screenshots added |
| 2026-10-07 | Europe depth | ✅ Done | 33 → 37 records, Europe 8 → **12**. Added four civil/structural/materials EMJMs found via the official EACEA catalogue: Flood Risk Management (**real deadline 2027-01-03**), NORISK, FRP++ and MS². AMIR and MBUILD rejected on verified grounds; 59 links probed, 0 dead |

## Current development focus (NOW)

- **Data expansion**: 37 records now; no region yet reaches the Phase 1 target of 15–25 verified entries, but **broader Europe is close at 12** after adding four civil, structural and materials EMJMs. China and New Zealand hold 4 each, and every other Phase 1 destination holds 2. USA growth is structurally slower, because most US graduate funding is restricted to US citizens or permanent residents — JJ/WBGSP is one of the few routes open to developing-country nationals. This remains the largest gap: provenance is done, breadth is not.
- **Live application windows**: most records sit between cycles, so most carry `deadline_notes` instead of a `deadline`. **Four** now have a single verified closing date, all within about four months: **ETH Zurich ESOP, 30 November 2026**, **TU Delft Justus & Louise van Effen, 1 December 2026**, **Erasmus Mundus Flood Risk Management, 3 January 2027** (Partner Country applicants) and **KTH Scholarship, 15 January 2027**. **EESIC's 2027-2029 call opened in October 2026** and its closing date is still unpublished — the most valuable missing field.
- **Short-course track**: `Non-degree` landed on 2026-10-07 and currently holds two New Zealand schemes. The Hubert H. Humphrey Fellowship is now unblocked by the schema change but its eligibility and programme pages returned "Page not found" when checked, so no record was created; re-check before adding it.
- **Accessibility audit**: Contrast is now measured and fixed in **both** themes (2026-10-07) — dark mode had 8 failures the earlier fix never reached, and light mode had 26 of 39 elements failing, the worst at 2.35:1. Focus rings, the dialog focus trap, Escape-to-close, live regions and the Ctrl/⌘ K shortcut all landed in the same pass, and README screenshots now exist. Still outstanding: a full screen-reader pass with real assistive technology, and a reduced-motion check.
- **AI provider seam**: Define the adapter interface contract (SEAM) so future provider integrations have a stable boundary.

## Phase 1 — Foundation (in progress)

**Scope:** USA, China, Europe (UK, Germany, France, Netherlands, Sweden, Switzerland), Australia, New Zealand. Fields: Civil Engineering, Materials Science, plus Renewable Energy where a programme funds it explicitly. Degree levels: Bachelor, Master, PhD, and — since 2026-10-07 — `Non-degree` for funded short courses and professional fellowships.

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
- [x] Dark-mode colour contrast measured and fixed — hero panel, chips, badges, match ring, card icons (2026-10-07)
- [x] Accessibility tested — contrast measured in both themes, visible focus, focus-trapped dialog with Escape, labelled controls and live regions; screenshots added (2026-10-07)
- [ ] Screen-reader pass with real assistive technology, and a reduced-motion check
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

