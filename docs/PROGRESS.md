# Development Progress

Detailed log of development work on ScholarHub. For the high-level roadmap with checkboxes, see [ROADMAP.md](ROADMAP.md).

## 2026-10-07 — Verification pass and deadline support

### Completed
- Re-read all 14 records against their official pages and backfilled `source_url` + `last_verified` (2026-10-07) on every one. Catalog warnings fell 40 → 5.
- **Found and fixed two dead official links.** The Tsinghua financial-aid URL (`yz.tsinghua.edu.cn/en/Admissions/Financial_Aid.htm`) and the University of Canterbury first-year scholarship URL both returned `404`. Both replaced with the current pages. Neither was detectable by the existing checks, which only validated the `https://` prefix — the catalog passed validation while two links were broken.
- Added `npm run check:links`: a liveness probe over all 21 unique official links. Verified with negative controls — a deliberately dead URL and two integrity violations each produce exit code 1 (confirmed: `dead-link exit=1`, `bad-rules exit=1`, real catalog `exit=0`).
- Added the `deadline_notes` field, populated where the official cycle has no single date: NSF GRFP (field-split dates), Chevening (Aug–Oct 2026 window), Erasmus Mundus (Oct–Jan window), Eiffel (institution nomination), NL Scholarship (institution dates), Australia Awards (country dates), Melbourne (automatic consideration).
- Recorded the one unambiguous verified closing date found: **ETH Zurich ESOP, 2026-11-30** (window 1–30 Nov 2026, 23:59 MEZ, for an HS27 start).
- Refreshed verified amounts and benefits: NSF GRFP ($37,000 stipend + $16,000 education allowance), Eiffel (€1,200 master's / €2,100 doctorate per month from January 2026), NL Scholarship (€5,000), Melbourne (living allowance A$41,100 per year; up to $135,000), Australia Awards (full benefit list).
- Set `status` from verified pages where the cycle state is unambiguous: Chevening `open`, ETH ESOP and NSF GRFP `upcoming`, Melbourne `open`.
- UI: cards and the detail dialog now show a deadline when one exists, plus a "source last checked" row. The hardcoded "Check official source" is now only the fallback when no date is recorded.

### Fixed
- The offline assistant guide appended the user's question twice — two `setMessages` calls in `answer()` both pushed the `you` message.
- The hero stat claimed "5 regions" while the catalog holds 10 distinct destinations; it is now derived from the data.
- Removed the `mobile-menu` button and its CSS: it was `display:none` in every media query, so it could never be seen or clicked.
- The repository had **no commits** — the entire working tree was untracked. Created the initial commit.

### Data expansion (second pass, same day)
- Added 5 records, taking the catalog from 14 to 19 and destinations from 10 to 11: **RESCO** (renewable energy and sustainable construction), **TERRA** (earthen architecture and construction), **BIOPHAM** (bio and pharmaceutical materials science), **TFMASA** (transfers-fluids-materials for aeronautics) — all Erasmus Mundus joint masters — plus the **SI Scholarship for Global Professionals** (Sweden, which had no coverage despite being named in the Phase 1 scope).
- **Excluded on purpose:** Erasmus Mundus STEPS describes itself as "a highly specialized education in Electrical Engineering". Including it would have required mislabelling it as Civil Engineering or Materials Science, which the data rules forbid. Electrical Engineering belongs to the Phase 2 field expansion.
- **Verified a negative result worth keeping:** Nepal is *not* among the 34 eligible countries for the SI Scholarship for Global Professionals. The full country list sits in the record's `eligibility.nationality`, so the exclusion is visible immediately rather than discovered after preparation.
- Link probe re-run: 28 unique links, **0 dead**. `www.master-biopham.eu` is unreachable from this machine but was confirmed live through a different fetch path.
- Card chips now show "Dates in detail" when a record has `deadline_notes` but no single verified date, so window and field-split cycles are visible without implying one deadline.
- Added the Sweden flag to the destination icons.

### USA and China depth (third pass, same day)
- Added 3 records, taking the catalog from 19 to 22 and China to 4 entries — the joint-most with broader Europe:
  - **JJ/WBGSP** (Joint Japan/World Bank Graduate Scholarship Program) — open to developing-country nationals, with *infrastructure management* named as a key development area; study at 44 participating master's programmes across 24 universities in the U.S., Europe, Africa, Oceania and Japan. Two application windows for 2027: 18 January – 26 February, and 29 March – 21 May.
  - **Tongji University scholarships** — Chinese Government Scholarship streams (Bilateral, Silk Road, High Level Postgraduate), Shanghai Municipal Government Scholarship, and university awards.
  - **HIT International Students Scholarship** — Harbin Institute of Technology; a tuition-fee waiver only, awarded in tiers of 100/50/30/20 per cent with **no living stipend**. The 2026 window ran 1 October 2025 to 31 May 2026.
- **Two candidates excluded, both for honest reasons:**
  - **Hubert H. Humphrey Fellowship** is explicitly *non-degree* ("graduate-level study and professional experiences"), and the `degree_level` enum covers only Bachelor/Master/PhD/PostDoc. Adding it requires a schema change, not a data change.
  - **CAS-TWAS President's Fellowship**: the official UCAS page still shows the **2017** call (age limit "on 31 December 2017", deadline "31 MARCH 2017"). A nine-year-stale page is not a valid `source_url`, so no record was created even though the programme is real.
- **Recorded a structural limit rather than padding the catalog:** most US graduate funding is restricted to US citizens or permanent residents (NSF GRFP is explicit about this). USA depth is genuinely harder to grow than China or Europe; the realistic routes are programmes like JJ/WBGSP that place developing-country nationals at US universities.
- `country` gained the value **"Multiple countries"** for JJ/WBGSP, whose participating programmes span five continents. Labelling it "United States" would have implied study in the US, which the programme does not guarantee.
- Link probe: **31 unique links, 0 dead.**

### Known gaps
- 22 records. No region yet reaches the Phase 1 target of 15–25 verified records; these remain discovery leads, not confirmed open awards.
- Link liveness is opt-in, not part of `npm test`. It proves a URL resolves — never that the page still says what the record claims.
- 4 of 21 links could not be reached from this machine (`www.campuschina.org`, `www2.daad.de`, `www.dfat.gov.au`). All three were confirmed live through a different fetch path, but the probe reports them unreachable rather than OK.
- No accessibility audit, no screenshots, no AI provider adapter, and no slide-out drawer for small screens.

## 2026-09-25 — Bootstrap

### Completed
- Created project structure: Vite + React frontend, static JSON data layer
- Built responsive scholarship discovery UI with search, multi-faceted filtering (country, field, degree, funding type, status), and card layout
- Implemented localStorage-backed features: saved shortlist, user profile form, dark/light theme toggle
- Added profile-fit heuristic for sorting scholarships by relevance to user preferences
- Populated starter catalog with 14 scholarship records across 10 countries/regions (USA, China, Germany, Europe, UK, France, Netherlands, Switzerland, Australia, New Zealand) covering Civil Engineering and Materials Science
- Verified official source URLs via web fetch (NSF GRFP, Chevening, Campus France, DAAD database)
- Fixed broken NSF GRFP URL to current canonical path
- Wrote comprehensive documentation: README, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE (MIT), CHANGELOG, DATA-SCHEMA, ARCHITECTURE, API notes
- Created GitHub issue templates (data correction, bug report, feature request) and PR template
- Added `node --test` validation suite for catalog integrity (unique IDs, required fields, URL format, status enum, date format)
- Created standalone `scripts/validate-catalog.mjs` for CI or manual use
- Initialized git repository, configured SSH remote to `git@github.com:Er-Sajan-PLG/scholarhub.git`
- Created public GitHub repository via `gh repo create`
- Added AGENTS.md with repository governance, scope discipline, development commands, and data rules
- Added docs/ROADMAP.md with progress log, current focus, and phased milestones
- Added docs/PROGRESS.md (this file) for detailed development history

### Decisions made
- **No backend**: Static site deployable to Vercel/Netlify/GitHub Pages. All personalization is client-side.
- **No authentication**: Explicit constraint. Profile lives in localStorage only.
- **JSON flat files**: Easiest for community contribution; no database dependency.
- **`verify` status**: Used when current cycle dates/terms are unconfirmed rather than guessing.
- **AI as placeholder**: Settings panel exists but no provider integration yet. Keys must never leave browser.
- **npm over pnpm**: Simpler for a standalone project without workspace dependencies.

### Known gaps
- Only 14 records total; target is 15–25 per country/region
- No real deadlines populated (all `null`)
- AI assistant does not connect to any model
- No accessibility audit completed
- No screenshots in README
- Country subdirectories under `data/scholarships/` exist but are unused by the app

