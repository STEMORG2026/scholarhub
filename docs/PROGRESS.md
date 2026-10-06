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

### Single-entry countries (seventh pass, same day, v0.8.0)
- Targeted the destinations that held only one record each. 27 → **30 records**; Netherlands, Germany and the UK now hold 2 each, leaving France, Switzerland and Sweden on 1.
- **TU Delft Justus & Louise van Effen** is the notable one: its official page publishes a real deadline, **1 December 2026 (23:59 CET)**, for the 2027-2029 intake. That makes it the second record in the catalog with an actual closing date rather than a window — the other being ETH Zurich ESOP on 30 November 2026. Both fall within two months.
- **Gates Cambridge** — full-cost, around 70 awards a year, two-thirds to PhD students, any subject Cambridge offers, open to citizens of any country outside the UK. £23,152 maintenance allowance at the 2026-27 rate plus the full University Composition Fee. Its deadline is the course-specific Cambridge funding deadline, which it does not publish as one date.
- **DAAD EPOS** — development-related postgraduate courses at German universities, EUR 992/month for master's candidates plus insurance and travel, 12 to 42 months.
- **Nepal's eligibility was verified rather than assumed.** DAAD's own country-list PDF could not be retrieved (`static.daad.de` is unreachable from this machine, confirmed by both the link probe and a direct `curl`), so eligibility was checked against the **OECD DAC List of ODA Recipients** — the list DAAD draws on. Nepal appears there as a Least Developed Country, lower-middle income.
- **Two exclusions recorded rather than glossed over:** TU Delft excludes **International Joint Education Programmes**, so this scholarship cannot be combined with an Erasmus Mundus master's, and it forbids holding any other scholarship at the same time. Gates Cambridge funds one-year postgraduate courses and the PhD but **not two-year master's degrees**, and excludes MASt, part-time degrees other than the PhD, and professional degrees such as the MBA, EMBA and MFin.
- **An experience gate worth flagging for Sajan:** DAAD EPOS requires **two years** of professional experience after the bachelor's degree, and degrees should normally be no more than six years old. With 08/2024–11/2025 he has roughly 15 months, so he is short of this one as well as JJ/WBGSP's three years.
- Verified: `npm test` 0 errors / 5 warnings; build clean; link probe **47 unique links, 0 dead**; browser confirmed 30 opportunities, 12 destinations, Netherlands/Germany/UK each at 2, and the TU Delft card rendering a "Dec 1, 2026" deadline chip.

### Filling the last single-entry countries (eighth pass, same day, v0.9.0)
- Targeted the three destinations still holding one record each. 30 → **33 records**; France, Switzerland and Sweden now hold 2 each, so **every Phase 1 destination holds at least two records** and none is a single entry any more.
- **KTH Scholarship** (Sweden) — full tuition waiver for a one or two-year master's at KTH Royal Institute of Technology. **Carries a real verified deadline: 15 January 2027**, with applications opening 1 December 2026 and results on 1 April 2027. That is the **third** record with a single closing date rather than a window, alongside ETH Zurich ESOP (30 November 2026) and TU Delft Justus & Louise van Effen (1 December 2026) — so three live dates now fall within about ten weeks.
- **Swiss Government Excellence Scholarships** (Switzerland) — CHF 2,450/month for a 12-month research stay or a 36-month PhD, open to applicants from 183 countries. Two constraints recorded rather than left implicit: a **maximum age of 35** and a required **academic supervisor in Switzerland**. Deadlines are set by country of origin and published by the Swiss diplomatic representation, so the record carries `deadline_notes`, not a fabricated date.
- **Université Paris-Saclay International Master's Scholarship** (France) — EUR 10,000/year plus up to EUR 900 towards travel and visa costs, in any academic field. Under 30, first enrolment in France. **Cannot be combined with Eiffel, France Excellence Europa or an Erasmus Mundus scholarship**, and applicants with other funding above EUR 600/month are ineligible.
- **Two source URLs had moved and were re-found rather than trusted.** The first KTH URL tried (`kth.se/en/studies/master/tuition-fees-scholarships/scholarships`) and a Lund global-scholarship URL both returned 404; the live KTH page is `kth.se/en/studies/master/admissions/scholarships/kth-scholarship-1.72827`. A TU Delft 404 page also exposed its corrected path. Searching for the current official page, rather than trusting the first result, is what caught these.
- **EESIC was rechecked before this pass and its closing date is still unpublished** — the page says only that it "will be published on this section in October 2026". Its window is open, so it remains the highest-value record and the most valuable still-missing field.
- Verified: `npm test` 0 errors / 5 warnings (unchanged — no new warnings); build clean; link probe **50 links checked, 0 dead, 7 unreachable**; browser confirmed 33 opportunities, 12 destinations, Sweden/France/Switzerland each at 2, and the three new cards rendering.

### Accessibility audit (ninth pass, same day, v0.10.0)
- **Contrast was measured, not eyeballed.** A browser probe read the computed colour and the *effective* background — walking up the ancestor chain past transparent layers — for every text surface on all five views, in both themes, and computed the WCAG ratio. Both themes were wrong; the one nobody had ever measured was the worse:

  | Theme | Elements checked | Failing before |
  |---|---|---|
  | Light | 39 | **26** |
  | Dark | 39 | 8 |

- **Light mode was the real story.** Its worst elements were `.footer span` at **2.35:1**, `.disclaimer` at 2.56:1, `.workspace-label` at 2.68:1 and `.breadcrumbs` at 2.95:1. It had never been measured at all — and because the default theme *is* light, every screenshot in every earlier pass was taken in it while the failures sat in plain sight.
- **Dark mode still had 8 failures the 0.6.0 fix never reached.** The worst was `.detail-grid b` at **2.18:1** — the deadline, amount and degree values *inside the detail dialog*, the most important content there. Also `.outline-btn` at 2.39:1, `.details-link` at 2.77:1 and `.modal-close` at 2.89:1. Pass 6 fixed the hero panel and stopped; the audit had never been systematic.
- **The new colours were computed, not chosen.** A generator darkened each hue on light surfaces and lightened it on dark ones until the ratio cleared 4.6:1, preserving the palette's character. Result: **0 failures** on all 10 view × theme combinations, and 0 in the dialog (48 elements). `.deadline-chip` — the dated amber chip — already passed at 4.57:1 and is deliberately untouched; `.nav-item.active` keeps its green because the override is scoped `:not(.active)`.
- **Three surfaces kept a *light* background in dark mode** (`.welcome-spark`, `.coming-note`, `.detail-note`), so their text was fighting the wrong panel. They now get a dark surface.
- **There was no focus style anywhere, and several base rules set `outline:0`** — so a keyboard user had no visible indicator on any control (WCAG 2.4.7). A `:focus-visible` ring now covers links, buttons, inputs, selects and `[tabindex]`, verified as `solid 2px rgb(47,107,74)`.
- **The detail dialog had correct ARIA but broken behaviour.** `role="dialog"`, `aria-modal="true"` and the label were all right, yet focus stayed *behind* the dialog (it landed on a background `<select>`), 83 background controls remained tabbable, and **Escape did nothing**. Now: focus moves in on open, Tab and Shift+Tab are trapped, Escape closes, and focus returns to the triggering button — each verified separately (React renders asynchronously, so a single-eval test reports false negatives).
- **The `⌘ K` hint was decorative.** It has been rendered in the search box since the first commit with no listener behind it. It is now implemented (Cmd/Ctrl+K focuses search) and the hint renders `Ctrl K` on non-Mac platforms instead of always the Mac glyph.
- **One control had no accessible name** — the assistant view's settings icon button; a screen reader announced only "button". Fixed. Live regions added: toast `role="status"`, result count `aria-live="polite"`, chat transcript `role="log"`. Hero art, card flag tiles and the status dot are now `aria-hidden`.
- **Screenshots finally exist** — `docs/screenshots/discover-light.png` and `discover-dark.png`, captured from the running build and embedded in the README.
- Verified: `npm test` 0 errors / 5 warnings; build clean; every claim above re-measured after the fix rather than asserted.

### Europe depth: four EMJMs (tenth pass, same day, v0.11.0)
- Europe 8 → **12 records**, catalog 33 → **37**. Europe was the deepest region but also the shallowest in variety: all eight existing records were Master's-level Erasmus Mundus masters, and none covered structural engineering, infrastructure risk or water.
- **Found via the official EACEA catalogue, not an aggregator.** The catalogue page renders only 20 of its 218 projects and ignores its own search parameter, but it accepts `?page=N` — paging through it and parsing the cards yields 210 distinct programmes to screen. Two markup traps: the HTML breaks lines *inside* tags (`<span\n class="…"`), so a tag regex must tolerate whitespace, and a keyword screen on names returns 75 candidates of which most are irrelevant. Screening is only a first pass.
- **Flood Risk Management (FRM)** is the notable find: **a real verified deadline of 3 January 2027** for Partner Country applicants (Nepal's group), with programme-country applicants due 7 February 2027. Coordinated by IHE Delft with TU Dresden, UPC Catalunya and Ljubljana. **Civil engineering is an explicitly accepted first degree** — one of the few programmes where that is stated outright rather than implied.
- **NORISK** (civil infrastructure risk; Minho, UPC, Padova, La Rochelle) and **FRP++** (composite structural analysis; Minho, Girona, Naples, INSA Toulouse) share a funding structure: EUR 1,400/month with the EUR 9,000 participation cost fully covered, and **up to seven scholarships a year reserved for Partner Country students**. Nepal appears *explicitly* on FRP++'s Partner Country and NDICI lists — read off the page, not inferred.
- **MS²** (TU Dortmund, Trento, Centrale Nantes) awards a multiple degree from all three and sits squarely in the mechanics of sustainable materials and structures. Its funding page publishes the window 1 January – 15 March but writes the year as a placeholder ("20XY"), so no `deadline` was recorded.
- **Two candidates were rejected on verified grounds, not silently dropped.** **AMIR** (materials recycling) states plainly that "Erasmus Mundus full scholarships are not available for the next cohort" — only a EUR 15,000 EIT grant that leaves the first six months unfunded. **MBUILD** (built environment) returns an empty 89-byte page. The catalogue itself warns that some listed programmes no longer offer EMJM funding; AMIR is that warning made concrete.
- **A stale page was caught by cross-checking.** FRP++'s scholarships page still describes a "third edition in 2024/2025" while its applications page says fifth edition 2026/2027. The applications page was treated as authoritative. NORISK and FRP++ have both closed their 2026 calls, so both carry `deadline_notes` and `verify` rather than a fabricated date.
- The catalog now holds **four verified closing dates**, all within about four months: ETH Zurich ESOP (30 Nov 2026), TU Delft van Effen (1 Dec 2026), **Flood Risk Management (3 Jan 2027)** and KTH (15 Jan 2027).
- Verified: `npm test` 0 errors / 5 warnings (unchanged — no new warnings); build clean; link probe **59 checked, 0 dead**; browser confirmed 37 opportunities, 12 destinations, the Europe filter returning **12**, a "Jan 3, 2027" deadline chip on the FRM card, and all four new cards rendering.

### Europe to the target, and the PhD gap closed (eleventh pass, same day, v0.12.0)
- Catalog 37 → **40 records**, Europe 12 → **15**. **Broader Europe is the first region to reach the Phase 1 target of 15–25**, though only at its lower bound.
- **The gap this pass was aimed at was not breadth — it was depth.** The tenth pass ended with twelve Europe records, all of them Master's-level Erasmus Mundus masters, which meant the region had nothing at PhD level even though `degree_level` supports it. A thirteenth master's programme would not have fixed that.
- **MSCA Doctoral Networks closes it, and it is not a scholarship.** It is the European Union scheme that funds *salaried PhD positions* across international consortia, open to any nationality, with a living allowance, a mobility allowance and family allowances where applicable. **It has no deadline, and the record says so:** `deadline` is `null`, `status` is `open`, and `deadline_notes` explains that each funded project advertises its own vacancies continuously on EURAXESS, which is updated daily. The 24 November 2026 date on the page is the deadline for *consortia proposals*, not for candidates — recording that as an application deadline would have been a fabrication with a real date attached, which is the worst kind.
- **Its mobility rule is recorded rather than smoothed over:** candidates must not have lived or worked in the recruiting country for more than 12 months in the previous 36. That is a genuine constraint for someone applying from Nepal, and it is why the record links to the vacancy search rather than to a single application form.
- **Groundwater and Global Change (GroundwatCH)** is the second civil-engineering-first find: IHE Delft coordinates with TU Dresden and IST Lisbon, and **civil engineering is named explicitly** in the accepted-first-degree list, alongside geologic, hydraulic, environmental and agricultural engineering. **Real verified deadline: 3 January 2027** for Partner Country applicants (Nepal's group); programme-country applicants have until 7 February 2027, and an English test may be uploaded as late as 1 February 2027. EUR 1,400/month for 24 months plus all participation costs, about 15 scholarships a year over four intakes.
- **EMerald Master in Georesources Engineering** (Liège, Lorraine, Luleå, TU Bergakademie Freiberg) carries a **verified deadline of 28 February 2027** for the scholarship round that opened 3 November 2026, with outcomes on 16 April 2027 and a full grant of EUR 33,600. **Its fit is recorded honestly rather than assumed:** civil engineering is *not* on its accepted-degree list and qualifies only through the general engineering route, with basic geology and at least 22.5 ECTS of university mathematics. That constraint sits in `eligibility.other`, so the Erasmus Mundus label does not mislead.
- **i-MESC was examined and left out**, despite being the closest thematic match to the postgraduate goal on file (batteries, supercaps, fuel cells, energy-storage materials). Two independent reasons: its admission criteria require a bachelor in chemistry, physics, chemical engineering, materials science or material process engineering — a civil degree is not on the list — and its application page contradicts itself in consecutive paragraphs, one announcing applications open until 4 February and the next stating the form is closed. A self-contradicting page is not a source.
- **Both new EMJMs came out of the existing EACEA pagination method**, not a new source. `/tmp/parse_eacea.js` and the cached catalogue pages were still on disk, so the 210-programme list was re-screened rather than re-scraped — the method has become repeatable.
- The catalog now carries **six verified closing dates**, all within about five months: ETH Zurich ESOP (30 Nov 2026), TU Delft van Effen (1 Dec 2026), **Flood Risk Management (3 Jan 2027)**, **Groundwater and Global Change (3 Jan 2027)**, KTH (15 Jan 2027) and **EMerald (28 Feb 2027)**.
- Verified: `npm test` 0 errors / 5 warnings (unchanged — no new warnings); build clean (`✓ built in 235ms`); link probe **65 checked, 0 dead**, 7 unreachable (the same seven as before), with all six new URLs returning `OK [200]`; browser confirmed **40 opportunities**, 12 destinations, the Europe filter returning **15**, the PhD filter returning **14** with the MSCA-DN card among them, and deadline chips reading "Jan 3, 2027" twice and "Feb 28, 2027" once. Both README screenshots were re-captured, because the previous pair still showed 37 in the hero.

### Known gaps
- 40 records. **Broader Europe is the only region at the Phase 1 target (15, its lower bound)**; China and New Zealand hold 4 each and every other Phase 1 destination holds 2. These remain discovery leads, not confirmed open awards.
- Link liveness is opt-in, not part of `npm test`. It proves a URL resolves — never that the page still says what the record claims.
- 7 of 65 links could not be reached from this machine (`www.campuschina.org`, `www2.daad.de`, `www.dfat.gov.au`, `www.master-biopham.eu`). All were confirmed live through a different fetch path, but the probe reports them unreachable rather than OK. `static.daad.de` is blocked outright, which is why the DAAD EPOS country list had to be verified through the OECD DAC list instead.
- The `Non-degree` filter and profile option are wired through the data, validator and UI, but `docs/ROADMAP.md` Phase 1 still describes coverage in degree terms; the short-course track is not yet its own roadmap line.
- **Contrast and keyboard access are measured and fixed in both themes** (see the ninth pass). Still outstanding: a screen-reader pass with real assistive technology, and a reduced-motion check — the hero uses CSS animation and there is no `prefers-reduced-motion` guard. No slide-out drawer for small screens; below 850px the sidebar collapses to an icon-only rail.
- **The Europe PhD gap is closed by a single record, and that record is not a scholarship.** MSCA-DN is a salaried-position route with no deadline and a mobility rule. It is genuinely useful, but it does not make the region's doctoral coverage broad. A second, deadline-bearing doctoral funding route in Europe would be the honest next step.
- Only 6 of 40 records carry a single verified closing date. The rest use `deadline_notes` because their cycles are windows, field-split, country-specific, or not yet published for 2027. **EESIC's closing date remains the most valuable missing field** — its window opened in October 2026 and the date was still unpublished when rechecked.
- **Every Phase 1 destination holds at least 2 records** — no destination is a single entry any more — and broader Europe now reaches the 15–25 target at its lower bound.

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

