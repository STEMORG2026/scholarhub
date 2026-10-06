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

### Short-course support (fourth pass, same day)
- Added a **`Non-degree`** value to the `degree_level` enum, in the validator and the UI. This is the schema change the third pass identified as the blocker: funded short courses and professional fellowships award a certificate, not a degree, and had no honest label before. The validator now rejects any `degree_level` outside the declared enum.
- Added **2 records**, taking the catalog from 22 to 24: the **Manaaki New Zealand Thematic Short Term Cohort Training Scholarships** (two-to-four-week cohort courses) and the **Manaaki New Zealand Vocational Short Term Training Scholarships** (one week to 12 months, course or work placement). Both are `Non-degree`, both carry `deadline_notes` instead of a `deadline` because applications run through the local New Zealand Embassy or High Commission with no single public date.
- **Grounded a field label that had been inferred.** The thematic record was first tagged `Renewable Energy` from the scheme's title alone. Reading the page showed eight courses, of which only *Renewable Energy Project Management* is engineering — the rest are public sector leadership, public health management, trade policy, good governance, diplomatic training, geothermal energy project management, and food and agribusiness value chains. The description now names the renewable-energy course explicitly so the tag is defensible.
- **Removed a double count.** `nz-scholarships` claimed the programme "covers undergraduate and postgraduate study plus thematic and vocational short-term training". Once the short-term schemes became records of their own, that sentence counted them twice; it is now narrowed to undergraduate and postgraduate study.
- **Derived the field and degree filters from the catalog**, fixing the same class of defect as the earlier hardcoded "5 regions" hero stat. The filter now offers only levels the catalog can return (`Bachelor`, `Master`, `PhD`, `Non-degree` — no `PostDoc` records exist yet), while the profile goal selector keeps the full enum, because a goal may legitimately exceed current coverage. A single `DEGREE_LEVELS` constant is the source of truth, mirrored by the validator's `VALID_DEGREE_LEVELS`.
- **Verified in a real browser, not assumed:** hero reads 24 opportunities and 12 destinations; the Non-degree filter returns exactly 2 records; the Renewable Energy filter returns 3; the profile form offers all five degree levels including PostDoc.
- **Verified negative results worth keeping:** Nepal is eligible for **none** of the three Manaaki short-term schemes — thematic training covers Pacific, ASEAN, African and Latin American and Caribbean countries, and the vocational scheme is Pacific-only. Both are recorded in `eligibility.nationality`, so the constraint is visible before any preparation.
- **English Language Training for Officials excluded** — a genuine Manaaki short-term scheme, but language training is not an engineering field and falls outside the declared scope.
- Link probe: **33 unique links, 0 dead.** Both new NZ sources return 200.
- **Pushed for the first time.** All four commits existed only on local disk: the GitHub repository was public but empty, and `gh` had an invalid token. SSH key auth works independently of that token, so the blocker was the diagnosis, not the machine. Pushing returned `remote: This repository moved. Please use the new location: git@github.com:STEMORG2026/scholarhub.git` — the repo now lives under the **STEMORG2026** organisation, and `Er-Sajan-PLG/scholarhub` is a redirect (the same pattern as STEMMA). `origin` was repointed to the canonical URL. Verified by SHA and by tree: `origin/main` and `main` are both `88422b8`, working tree clean.

### Dark-mode contrast (fifth pass, same day, v0.6.0)
- **Found a real accessibility failure while checking a roadmap claim rather than repeating it.** The roadmap said "chips and status badges use hardcoded light colours with no dark-mode override". Grepping `styles.css` confirmed it — and showed the same defect was worse elsewhere: the hero panel sets its own dark background in dark mode, but its text colours were only ever tuned for the light panel.
- **Measured, not eyeballed.** Read the real `getComputedStyle` values from the running page and computed the WCAG ratio. `.hero-stats strong` rendered `#394d3a` on `#27362b` — **1.39:1**, below the level at which text is legible at all. The stat numbers (`24`, `12`, `Free`) were effectively invisible.

  | Element | Before | After |
  |---|---|---|
  | Hero stat number | **1.39:1** | 10.75:1 |
  | Hero eyebrow | 2.82:1 | 7.25:1 |
  | Hero copy | 3.00:1 | 6.04:1 |
  | Hero stat label | 3.41:1 | 5.61:1 |
  | Chip / status badge / match ring | no dark override | 5.75–6.84:1 |

- Fixed by adding dark overrides for `.hero-stats strong`, `.hero-stats span`, `.hero-copy`, `.eyebrow`, `.welcome h1 em`, `.stat-divider`, `.chip`, `.field-chip`, `.status-badge`, `.status-open/closed/upcoming`, `.match-ring` and `.card-icon` (five hardcoded tints). `.deadline-chip` was the only element that already had one.
- **Why this survived four earlier passes:** the default theme is light, so every previous screenshot was taken in light mode. Light mode was never wrong. It took deliberately switching theme and reading computed styles to see it.
- Verified in a dark-mode browser session: `app dark` confirmed on the root, chip `rgb(44,54,48)` on card `rgb(32,41,35)`, card icon `rgb(43,52,46)`, plus screenshots of both the hero and the card grid.

### EMJM depth (sixth pass, same day, v0.7.0)
- Added 3 Erasmus Mundus Joint Masters, 24 → **27 records**; Europe 5 → **8**, now the deepest destination.
- **Discovery method:** the official EACEA catalogue (218 projects) plus its RSS feed, screened by keyword for civil/structural/construction/materials/energy. Aggregator sites were used only to *find* candidate names and never cited — every record's `source_url` is the programme's own page.
- **EESIC** is the notable find because of timing: its admission page states the call for the **2027-2029 cohort opens in October 2026**. It is the only record in the catalog with a window opening now. €1,400/month for up to 24 months, tuition waived for scholarship holders; non-scholarship places are €8,000/year with a 75% reduction to €2,000/year for the highest-ranked candidates. It also reserves some scholarships for nine **targeted regions including "Region 5 Asia"** — which may cover Nepal, though the country list was not published, so the record says "may" rather than claiming it.
- **REM+ 2** (marine renewable energy: wave, tidal, gradient systems) — four universities in Spain, Ireland, Italy and France. Its admission page has been **replaced by a placeholder** dated 16 September 2026: "the selection and admission procedure … is currently under review by the Joint Programme Board". Rather than infer the accepted fields, the record is `verify` and `eligibility.other` states that they could not be verified.
- **MaMaSELF+** (materials science) — **and a finding worth keeping: it excludes civil engineering.** The admission page says bachelor's degrees in Mechanical Engineering and Mechatronics "are not adapted to the Mamaself program", and that civil engineering, medicine or pharmacy applicants "will not be accepted unless they have a good background in Chemistry or Physics". Recorded in `eligibility.other`. The record stays in scope for materials-science readers; a civil engineer now learns the prerequisite instead of the exclusion.
- **No 2027 deadline exists for any of the three yet**, so all three carry `deadline_notes` rather than an invented `deadline`. MaMaSELF's most recent were 13 Feb / 20 Mar / 15 May 2026; REM+ 2's 2026 edition is closed pending 2027 news.
- Verified: `npm test` 0 errors / 5 warnings (no new warnings — all three records carry `deadline_notes`); build clean; link probe **41 unique links, 0 dead**, all eight new URLs returning 200; browser confirmed 27 opportunities, 12 destinations, the Europe filter at 8, and all three new cards rendering.

### Known gaps
- 27 records. No region yet reaches the Phase 1 target of 15–25 verified records; these remain discovery leads, not confirmed open awards. Broader Europe (8) is closest.
- Link liveness is opt-in, not part of `npm test`. It proves a URL resolves — never that the page still says what the record claims.
- 4 of 41 links could not be reached from this machine (`www.campuschina.org`, `www2.daad.de`, `www.dfat.gov.au`, `www.master-biopham.eu`). All were confirmed live through a different fetch path, but the probe reports them unreachable rather than OK.
- The `Non-degree` filter and profile option are wired through the data, validator and UI, but `docs/ROADMAP.md` Phase 1 still describes coverage in degree terms; the short-course track is not yet its own roadmap line.
- Dark-mode colour contrast is fixed and measured (see above), but there is still **no accessibility audit**: keyboard navigation, ARIA labels and screen-reader compatibility are untested, and light-mode contrast has never been measured at all. No screenshots in the README, no AI provider adapter, and no slide-out drawer for small screens.
- The 2027 application windows for EESIC, REM+ 2 and MaMaSELF are all unpublished. EESIC's opens in October 2026 and its closing date needs capturing once it appears.

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

