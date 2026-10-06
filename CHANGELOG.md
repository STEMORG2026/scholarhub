# Changelog

## [0.14.0] - 2026-10-07

### Added

Two United States records, catalog 40 → **42** and the USA 2 → **4**. This was the region the roadmap called structurally hard, because most US graduate funding is restricted to citizens and permanent residents — so the pass was aimed at awards that are explicitly open to Nepali applicants, and the first thing it did was confirm that the existing records were honest about the restriction.

- **Knight-Hennessy Scholars (Stanford University)** — the strongest find. The programme states it "encourage[s] citizens and residents of all countries to apply", sets **no quotas by discipline, programme or world region**, and requires no institutional endorsement. It funds up to three years of any full-time Stanford graduate degree, including a master's or PhD in civil and environmental engineering: tuition and fees, a living stipend, one annual economy-class round trip, and a one-time relocation stipend. **Verified deadline 6 October 2026** for the 2027 cohort, which has now closed; the 2028 cycle opens in summer 2027.
- **Hubert H. Humphrey Fellowship** — a non-degree Fulbright fellowship for mid-career professionals, ten to twelve months at a U.S. host university with a professional affiliation placement. **Nepal is confirmed on the eligible-country list**, under South and Central Asia, and the programme is administered there by the Binational Fulbright Commission. It requires five years of full-time professional experience, and the fields closest to engineering sit under the Sustainable Lands impact area — natural resources and environmental policy, and urban and regional planning.

### Notes

- **The two existing USA records were checked for the restriction and are correct.** NSF GRFP already carries `eligibility.nationality: "U.S. citizens, nationals, or permanent residents"` and Fulbright already routes applicants to their home-country commission. A catalog that lists a citizen-restricted award without saying so is worse than one that omits it, and this pass confirmed that was not the case here.
- **Knight-Hennessy carries a real constraint worth stating: the first bachelor's degree must have been earned in January 2020 or later** for the 2027 cohort, extended by two years for military service. That is a genuine filter, not a footnote, and it is recorded in `eligibility.other` along with the excluded Stanford programmes (Honors Cooperative Program, Master of Liberal Arts, JSD, MLS, coterminal degrees).
- **Its funding does not cover a whole doctorate, and the record says so.** The fellowship runs up to three years; for a PhD the department funds the remaining years. "Fully funded" would have been the easy phrase and the wrong one.
- **Aga Khan Foundation International Scholarship Programme was examined and left out.** Its country list names Afghanistan, Bangladesh, India, Pakistan and others but **not Nepal**, and the page presents the list as examples rather than exhaustive. Nepal's absence is therefore suggestive, not conclusive — and an eligibility question that cannot be settled is not a basis for a record.
- **The ANSO-CAS-TWAS/UNESCO PhD Scholarship is a lead, not a record.** It funds up to 40 PhD students a year from developing countries in China, at CNY 6,000–7,000 a month with tuition and insurance waived, and "Engineering Sciences" is one of its ten fields. But the page consulted **does not name Nepal**, eligibility is delegated to TWAS's developing-country list, and the call it describes is closed. Worth a dedicated check rather than a guess.
- **The `Non-degree` track now holds three records across two countries** (the two New Zealand short-term schemes and Humphrey), and `docs/ROADMAP.md` Phase 1 now names it as its own line rather than leaving it buried in the degree-level list.
- The catalog now carries **seven verified closing dates**. Knight-Hennessy's is in the past — it closed the day before this pass — which is the point: a verified date that has passed still documents the cycle for the next one.
- Link probe: **70 checked, 0 dead**, all five new URLs returning `OK [200]`.

## [0.13.0] - 2026-10-07

### Fixed

**A `prefers-reduced-motion` guard — and the false claim that had been justifying it for three passes.**

The guard is small. Why it needed adding is not: since the ninth pass this item was carried as "a reduced-motion check — **the hero uses CSS animation** and there is no `prefers-reduced-motion` guard". That premise is false, and it had been repeated in `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` without ever being measured. Measured now, in the running page:

| Claim | Measured |
|---|---|
| "the hero uses CSS animation" | **0 of 1,808 elements** report a computed `animation-name` other than `none` |
| `@keyframes` in the source | **0** — the string appears in neither `src/styles.css`, `src/main.jsx` nor `index.html` |
| `animation` property in the source | **0 occurrences** |
| The only motion present | a **0.2s `box-shadow, border` transition on 40 card surfaces** |

There was never an animation to suppress. What the guard actually does is cover the card hover transitions — real motion, worth respecting — and anything animated later. That is what the stylesheet now says, next to the measurement, so the next person does not inherit the same assumption.

### Added

- **A `prefers-reduced-motion: reduce` block**, using `.01ms` rather than `0s` so that `transitionend` still fires. **Verified by a reversible control rather than asserted:** with the media query emulated, perceptible transitions (duration > 50ms) fall from **40 to 0** and the maximum transition duration falls from **0.2s to 0.00001s**; resetting the emulation restores 40. The rule's presence in the CSSOM was confirmed *first*, because a guard that never made it into the stylesheet would pass the same test.

### Changed

- **Corrected the false animation claim** in `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`, and split the Phase 1 checkbox so the reduced-motion half is marked done. This is the second time this repository has carried a confident, unmeasured accessibility claim into its own documentation — the first was "dark mode is fixed" in 0.6.0, which survived four passes while light mode, the default, had never been measured at all. Both were written in exactly the same register as the claims that *had* been measured.
- **EESIC re-checked.** Its admission page still carries no closing date as of 2026-10-07; it says the 2027-2029 call "will be published on this section in **October 2026**", which is the current month. The record's `deadline_notes` now quotes that wording and records the recheck date, and the targeted-region list is transcribed with its region numbers (including Region 5 Asia) along with the caveat that the page does not enumerate the countries in each region.

### Notes

- **`agent-browser` media emulation is `set media`, not `media`** — `agent-browser set media reduced-motion`, and `set media light` resets it. **`set viewport <w> <h>` also works**, verified: 1280×577 → 1024×768. The ninth-pass note that the viewport command "is not actually available" was wrong about the *invocation*, not the capability — the same class of error as the animation claim.
- **The narrow-screen layout was checked while the viewport was open, and it holds.** At 390×844 there is no horizontal overflow (`scrollWidth` 390 = `innerWidth` 390), the sidebar collapses to a 64px icon rail, the filter selects stack, and cards render intact. The decorative `.hero-art` bleeds past the right edge as intended and is clipped by its panel. The roadmap's "no slide-out drawer below 850px" is a missing feature, not a broken layout.
- **The link probe's "unreachable" count is not reproducible, and the docs had quoted it as a fixed fact.** Sampled nine times, `npm run check:links` reported **6 unreachable in seven runs and 7 in two**; `HTTP 412` on `www.campuschina.org` appeared in every run and `HTTP 503` on `www.nzscholarships.govt.nz` in one. `65 checked, 0 dead` is the stable result and the only half worth quoting — the rest is network weather. This is the same error as the animation claim in miniature: a single measurement written up in the register of a fact.

## [0.12.0] - 2026-10-07

### Added

Three records, 37 → **40** and Europe 12 → **15**, which brings the region to the lower bound of the Phase 1 target of 15–25. One of the three closes the coverage gap flagged in 0.11.0: **Europe had no PhD-level entry at all, and now has one.**

- **Groundwater and Global Change — Impacts and Adaptation (GroundwatCH)** — IHE Delft (coordinator), TU Dresden and Instituto Superior Técnico, Universidade de Lisboa. **Civil engineering is named explicitly among the accepted first degrees**, alongside geologic, hydraulic, environmental and agricultural engineering. **Carries a real verified deadline: 3 January 2027** for Partner Country applicants, which includes Nepal. EUR 1,400 per month for 24 months plus all participation costs, about 15 scholarships a year across four intakes.
- **EMerald Master in Georesources Engineering** — Université de Liège (coordinator), Université de Lorraine, Luleå University of Technology and TU Bergakademie Freiberg. Erasmus Mundus and EIT RawMaterials labelled. **Verified deadline 28 February 2027** for the scholarship round, which opened 3 November 2026; outcomes 16 April 2027. The full grant is EUR 33,600.
- **Marie Skłodowska-Curie Actions Doctoral Networks (MSCA-DN)** — the European Union scheme that funds salaried PhD positions across international consortia. **This is the first Europe-located PhD record**, and it is the honest answer to "Europe offers nothing at doctorate level": the funding is real and open to any nationality, but it has no single deadline, because each funded project advertises its own vacancies continuously on EURAXESS.

### Notes

- **MSCA-DN does not fit the `deadline` field, and the record does not pretend it does.** Its `deadline` is `null` and the rolling-vacancy model is explained in `deadline_notes`, with `status: "open"` — the same treatment the three existing open-cycle records already use. Inventing a date would have been the easier and worse choice.
- **A mobility rule is recorded, not glossed over.** MSCA-DN candidates must not have lived or worked in the country of the recruiting organisation for more than 12 months in the previous 36 — a real constraint on the route, and the reason the record points at EURAXESS rather than at a single application page.
- **i-MESC was examined and left out.** It is a genuine energy-materials EMJM (batteries, supercaps, fuel cells) and a good thematic match for the catalog, but its admission criteria require a bachelor in chemistry, physics, chemical engineering, materials science or material process engineering, and its application page contradicts itself — one line says applications are open until 4 February, the next says the form is closed. Neither is a basis for a record.
- **EMerald's fit is recorded honestly rather than assumed.** Civil engineering is *not* on its list of accepted degrees; it qualifies only through the general "bachelor degree in engineering" route, and then only with basic knowledge of geology and at least 22.5 ECTS of university mathematics. That constraint is written into `eligibility.other`, so a civil-engineering applicant is not misled by the Erasmus Mundus label.
- **Groundwater and EMerald came out of the same EACEA catalogue pagination technique recorded in 0.11.0**, not from a new source. The method is now repeatable rather than lucky.
- The catalog now carries **six verified closing dates**: ETH Zurich ESOP (30 November 2026), TU Delft Justus & Louise van Effen (1 December 2026), **Flood Risk Management (3 January 2027)**, **Groundwater and Global Change (3 January 2027)**, KTH (15 January 2027) and **EMerald (28 February 2027)**.
- **Broader Europe reaches 15, the lower bound of the Phase 1 target**, and is the first region to do so. The remaining Phase 1 destinations still hold 2–4 each.
- Link probe: **65 links checked, 0 dead**, 7 unreachable from this machine — unchanged, and still a documented sandbox limitation rather than broken links. All six new URLs returned `OK [200]`.
- README screenshots were re-captured, because the previous pair showed the old count of 37 in the hero.

## [0.11.0] - 2026-10-07

### Added

Four Erasmus Mundus Joint Masters, 33 → **37 records** and Europe 8 → **12**. All four sit in civil, structural or materials engineering, and all were found through the official EACEA catalogue rather than an aggregator.

- **Flood Risk Management (FRM)** — IHE Delft (coordinator), TU Dresden, Universitat Politècnica de Catalunya and the University of Ljubljana. **Carries a real verified deadline: 3 January 2027** for applicants from Partner Countries, which includes Nepal; programme-country applicants are due 7 February 2027. EUR 1,400 per month for up to 24 months plus all participation costs. **Civil engineering is an explicitly accepted first degree.**
- **Risk Assessment and Management of Civil Infrastructures (NORISK)** — University of Minho, Universitat Politècnica de Catalunya, University of Padova and La Rochelle Université. EUR 1,400 per month with the EUR 9,000 participation cost fully covered, and up to seven scholarships a year reserved for Partner Country students.
- **Advanced Structural Analysis and Design using Composite Materials (FRP++)** — University of Minho, University of Girona, University of Naples Federico II and INSA Toulouse. Same funding structure; **Nepal appears explicitly on the programme's Partner Country and NDICI lists**, so the quota is read off the page rather than inferred.
- **Mechanics of Sustainable Materials and Structures (MS²)** — TU Dortmund, University of Trento and École Centrale de Nantes, awarding a multiple degree from all three.

### Notes

- **The catalogue holds 218 projects; these four came from a parsed list of 210.** The EACEA catalogue page renders 20 entries at a time and ignores its own search parameter, but it accepts `?page=N`, so paging through it yields the full set to screen by keyword. Two markup traps: the HTML breaks lines *inside* tags (`<span\n class="…"`), so any regex for a tag must tolerate whitespace, and a keyword screen over programme names returns 75 candidates, most of them irrelevant — it is only a first pass.
- **Scholarship availability was verified per programme, not inferred from catalogue membership.** The catalogue itself warns that some listed programmes no longer offer Erasmus Mundus scholarships, and one of them proved the point.
- **AMIR (Advanced Materials Innovative Recycling) was rejected on a verified ground.** Its fees page states plainly that "Erasmus Mundus full scholarships are not available for the next cohort" — only a EUR 15,000 EIT partial grant, which leaves the first six months unfunded. It is a strong programme, but it does not belong in a scholarship catalog on the strength of its EMJM label.
- **MBUILD was rejected** because its site returns an empty 89-byte page. **FRP++'s scholarships page is stale** — it still describes a "third edition in 2024/2025" while its applications page says fifth edition 2026/2027; the applications page was treated as authoritative.
- **NORISK and FRP++ have both closed their 2026 calls**, so neither carries a `deadline`; both use `deadline_notes` and are marked `verify`. Only Flood Risk Management has a live future date.
- The catalog now carries **four verified closing dates**, all within the next four months: ETH Zurich ESOP (30 November 2026), TU Delft Justus & Louise van Effen (1 December 2026), **Flood Risk Management (3 January 2027)** and KTH (15 January 2027).
- Link probe: **59 links checked, 0 dead**, 7 unreachable from this machine — a documented sandbox limitation, not broken links.

## [0.10.0] - 2026-10-07

### Fixed

**Accessibility — contrast, in both themes.** Every colour was measured by reading the real computed style in a running browser and computing the WCAG ratio against the *effective* background (walking up the ancestor chain past transparent layers), across all five views. Both themes were wrong, and the one nobody had ever measured was the worse of the two:

| Theme | Elements checked | Failing before |
|---|---|---|
| Light | 39 | **26** |
| Dark | 39 | 8 |

Light mode's worst offenders were `.footer span` at **2.35:1**, `.disclaimer` at 2.56:1 and `.workspace-label` at 2.68:1. Dark mode still had eight failures the 0.6.0 dark-mode fix never reached — `.details-link` at 2.77:1, `.outline-btn` at 2.39:1 and, most seriously, `.detail-grid b` at **2.18:1**, which is the deadline and amount text inside the detail dialog.

The replacements were computed, not chosen by eye: the hue is darkened on light surfaces and lightened on dark ones until the ratio clears 4.6:1. All 39 elements now pass in both themes, plus the dialog (48 elements). Three surfaces — `.welcome-spark`, `.coming-note`, `.detail-note` — kept a *light* background in dark mode and now get a dark one. `.deadline-chip`, the dated amber chip, already passed at 4.57:1 and was deliberately left alone.

### Added

- **Visible keyboard focus.** There was no focus style anywhere, and several base rules set `outline:0`, so a keyboard user had **no visible indicator on any control** (WCAG 2.4.7). A `:focus-visible` ring now covers links, buttons, inputs, selects and anything with a tabindex, with a lighter ring in dark mode.
- **A working `Ctrl`/`⌘ K` shortcut.** The search box has rendered a `⌘ K` hint since the first commit with nothing listening for it — a decorative control. It now focuses the search field, and the hint shows the correct key for the platform rather than always the Mac glyph.
- **A properly behaved dialog.** `role="dialog"`, `aria-modal` and the label were already correct, but focus stayed *behind* the dialog, 83 background controls remained tabbable, and **Escape did nothing**. Focus now moves into the dialog on open, Tab and Shift+Tab are trapped inside it, Escape closes it, and focus returns to the button that opened it.
- **Live regions**, so the app is no longer silent to a screen reader: the toast is `role="status"`, the result count is `aria-live="polite"`, and the assistant transcript is `role="log"`.
- **README screenshots**, in both themes.

### Notes

- **An accessible name was missing** on the assistant view's settings icon button — a screen reader announced only "button". Every other icon-only control already had one.
- **Decorative graphics are now hidden from assistive tech**: the hero illustration, the card flag tiles (the country is already in text) and the status dot.
- **Two surfaces that looked fine were not.** The light-mode sweep also caught `.deadline-chip.notes` (3.94:1) and the empty-state text (3.36:1), neither of which had ever been measured.
- **Why this survived every earlier pass:** the default theme is light, so every screenshot in every prior pass was light mode — and light mode had never been measured at all. The 0.6.0 dark-mode fix then created the impression that the theme work was finished.
- Still outstanding: a screen-reader pass with real assistive technology, and a reduced-motion check.

## [0.9.0] - 2026-10-07

### Added

Three records, 30 → **33**, filling the last destinations that held only a single entry each. **Every Phase 1 destination now holds at least two records.**

- **KTH Scholarship** (Sweden) — full tuition waiver for a one or two-year master's at KTH Royal Institute of Technology, covering both years subject to satisfactory first-year results. **Carries a real verified deadline: 15 January 2027** (applications open 1 December 2026), which makes it the third record with an actual closing date rather than a window.
- **Swiss Government Excellence Scholarships** (Switzerland) — CHF 2,450 per month for a 12-month research stay or a 36-month PhD, open to applicants from 183 countries. Maximum age 35, and the application must be backed by a supervisor in Switzerland.
- **Université Paris-Saclay International Master's Scholarship** (France) — EUR 10,000 per year plus up to EUR 900 towards travel and visa costs, in any academic field. Applicants must be under 30 and enrolling in France for the first time.

France, Switzerland and Sweden now hold 2 records each, so no Phase 1 destination is a single entry any more.

### Notes

- **The KTH deadline is the most concrete addition.** Its 2027 window (1 December 2026 to 15 January 2027) is the third real closing date in the catalog, alongside ETH Zurich ESOP (30 November 2026) and TU Delft Justus & Louise van Effen (1 December 2026). KTH excludes the Erasmus+ and EIT joint programmes and Computer Simulations for Science and Engineering — those fall under the separate KTH Joint Programme Scholarship — and applicants must list KTH as their first priority.
- **The Swiss scheme's deadline is set by country of origin**, published by the Swiss diplomatic representation handling the application, so the record carries `deadline_notes` and no single date. It also carries an age limit of 35 and requires a named Swiss supervisor; both are recorded as constraints rather than left implicit.
- **Paris-Saclay cannot be combined with Eiffel, France Excellence Europa or an Erasmus Mundus scholarship**, and applicants receiving other funding above EUR 600 per month are ineligible. Its published dates are for the 2026 cycle (applications closed 31 March 2026); equivalent 2027 dates were not yet published, so the record is `verify` with `deadline_notes`.
- **Two source URLs had moved and were re-found rather than trusted.** The first KTH URL tried and a Lund global-scholarship URL both returned 404; the live KTH page is `kth.se/en/studies/master/admissions/scholarships/kth-scholarship-1.72827`.
- Link probe: **50 links checked, 0 dead, 7 unreachable** from this machine — the unreachable set is a documented sandbox limitation, not broken links.

## [0.8.0] - 2026-10-07

### Added

Three records, 27 → **30**, filling out the destinations that had only a single entry each:

- **Justus & Louise van Effen Excellence Scholarship** (TU Delft, Netherlands) — full first-year tuition at the statutory or institutional rate plus a contribution to living expenses; two awards per faculty. **Carries a real verified deadline: 1 December 2026, 23:59 CET**, which makes it the second record in the catalog with an actual closing date rather than a window.
- **Gates Cambridge Scholarship** (United Kingdom) — full-cost, around 70 awards a year, roughly two-thirds to PhD students, in any subject Cambridge offers. Open to citizens of any country outside the UK.
- **DAAD EPOS** (Germany) — DAAD's development-related postgraduate courses, EUR 992 per month for master's candidates plus health, accident and liability insurance and a travel allowance.

Netherlands, Germany and the United Kingdom now hold 2 records each.

### Notes

- **DAAD EPOS requires two years of professional experience** after the bachelor's degree, and degrees should normally be no more than six years old. It joins JJ/WBGSP (three years) as a programme with an experience gate, so the constraint is recorded in the catalog rather than discovered after preparing an application.
- **Nepal's eligibility was verified, not assumed.** The DAAD country-list PDF could not be retrieved — `static.daad.de` is unreachable from this machine — so eligibility was confirmed against the OECD DAC List of ODA Recipients, the list DAAD draws on. Nepal appears there as a Least Developed Country (lower-middle income).
- **TU Delft excludes International Joint Education Programmes**, so the Justus & Louise van Effen scholarship cannot be combined with an Erasmus Mundus master's. It also forbids holding any other partial or full scholarship at the same time.
- **Gates Cambridge funds one-year postgraduate courses and the PhD, not two-year master's degrees**, and excludes MASt courses, part-time degrees other than the PhD, and professional degrees such as the MBA, EMBA and MFin. Its deadline is the course-specific Cambridge funding deadline, which it does not publish as a single date.
- Link probe: **47 unique links, 0 dead.** Three DAAD URLs are unreachable from this machine — a documented sandbox limitation, not a broken link — and were confirmed live through a different fetch path.

## [0.7.0] - 2026-10-07

### Added

Three Erasmus Mundus Joint Masters, taking the catalog from 24 to **27 records** and Europe to **8** — now the deepest destination, ahead of China and New Zealand on 4.

- **EESIC** — Engineering for Environmental Sustainability and International Cooperation. Instituto Superior Técnico (Lisbon), Universitat Politècnica de València, University of Trento: one semester at each, then a fourth semester of project work and thesis with an associated partner. **The call for the 2027-2029 cohort opens in October 2026** — the only record in the catalog whose next application window is opening now.
- **REM+ 2** — Renewable Energy in the Marine Environment, covering wave, tidal and gradient energy systems. University of the Basque Country, University College Cork, Politecnico di Torino, École Centrale de Nantes.
- **MaMaSELF+** — Materials Science, across six universities in France, Germany, Italy and Poland.

### Notes

- **MaMaSELF excludes civil engineering.** Its admission page states that bachelor's degrees in Mechanical Engineering and Mechatronics "are not adapted to the Mamaself program", and that applicants from civil engineering, medicine or pharmacy "will not be accepted unless they have a good background in Chemistry or Physics". This is recorded in `eligibility.other` rather than glossed over: the record is in scope for materials-science students, but a civil engineer needs chemistry or physics at bachelor's level.
- **EESIC reserves some scholarships for targeted regions, including Asia.** Its admission page lists nine targeted regions; the EU's "Region 5 Asia" grouping covers South Asia, so an applicant from Nepal may fall inside a reserved quota. The country list was not published on the pages checked, so this is recorded as a possibility, not a promise.
- **REM+ 2's admission page is a placeholder.** It was replaced by a notice dated 16 September 2026 stating that the selection and admission procedure is "under review by the Joint Programme Board". The record is `verify`, and its `eligibility.other` says plainly that the accepted fields could not be verified — the alternative was to guess them.
- **None of the three publishes a 2027 deadline yet**, so all three use `deadline_notes` instead of a fabricated `deadline`. MaMaSELF's most recent dates were 13 February, 20 March and 15 May 2026; REM+ 2's 2026 edition is closed with news of the 2027 edition pending.
- Link probe: **41 unique links, 0 dead.** All eight new URLs return 200.

## [0.6.0] - 2026-10-07

### Fixed

**Dark-mode contrast.** Several elements set hardcoded light surfaces with no dark counterpart, so they rendered as bright patches on a dark card — and the hero's stat numbers were effectively invisible. Measured by reading the real computed styles in a running browser and computing the WCAG ratio, not by eye:

| Element | Before | After |
|---|---|---|
| Hero stat number (`24`, `12`, `Free`) | **1.39:1** | 10.75:1 |
| Hero eyebrow | 2.82:1 | 7.25:1 |
| Hero copy | 3.00:1 | 6.04:1 |
| Hero stat label | 3.41:1 | 5.61:1 |
| Chip / field chip | — | 5.94:1 |
| Status badge | — | 5.75:1 |
| Match ring | — | 6.84:1 |

Everything now meets WCAG AA (4.5:1). The affected elements were `.hero-stats strong`, `.hero-stats span`, `.hero-copy`, `.eyebrow`, `.welcome h1 em`, `.stat-divider`, `.chip`, `.field-chip`, `.status-badge`, `.status-open/closed/upcoming`, `.match-ring` and `.card-icon`. `.deadline-chip` was the only one that already had a dark override.

### Notes

- The roadmap's own known issue — "chips and status badges use hardcoded light colours with no dark-mode override" — was accurate but incomplete. The hero panel had the same defect and it was the worst instance, at 1.39:1, which is below the threshold at which text is legible at all.
- Only dark mode was wrong. Light mode was never affected, which is why this survived a build, a test run and several browser passes: the default theme is light.

## [0.5.0] - 2026-10-07

### Added

- **`Non-degree` value in the `degree_level` enum.** Funded short courses, cohort training and professional fellowships award a certificate rather than a degree, and previously had no honest way to be recorded. The enum is declared once in `scripts/validate-catalog.mjs` and mirrored in `src/main.jsx`; the validator now rejects any `degree_level` value outside it.
- **Manaaki New Zealand Thematic Short Term Cohort Training Scholarships** — two-to-four-week cohort courses, in New Zealand or online. The funded *Climate Change and Resilience* theme includes Renewable Energy Project Management.
- **Manaaki New Zealand Vocational Short Term Training Scholarships** — one week to 12 months, as a training course, a work placement, or an online or in-country course, with renewable energy among the funded themes.

The catalog now holds **24 records** across 12 destinations.

### Changed

- **The field and degree filters are now derived from the catalog** instead of hardcoded, fixing the same class of defect as the earlier "5 regions" hero stat. The filter offers only the levels the catalog can actually return; the profile goal selector deliberately keeps the full enum, because a goal may legitimately exceed current coverage (`PostDoc` has no record yet).
- `nz-scholarships` description narrowed to undergraduate and postgraduate study. It previously claimed the programme "covers undergraduate and postgraduate study plus thematic and vocational short-term training", which now double-counted the two short-term schemes recorded separately.
- The thematic short-term description now names Renewable Energy Project Management explicitly, so the `Renewable Energy` field label is grounded in the source rather than inferred from the scheme's title. Seven of that scheme's eight courses are governance, public health, trade, diplomacy or agribusiness.

### Notes

- **Nepal is not eligible for any of the three Manaaki short-term schemes.** Thematic training is open to Pacific, ASEAN, African and Latin American and Caribbean countries; the vocational scheme is open to Pacific countries and territories only. Both exclusions are recorded in the relevant `eligibility.nationality` field, so the constraint is visible before any preparation begins.
- **English Language Training for Officials excluded** — a real Manaaki short-term scheme, but language training rather than an engineering field, so it falls outside the catalog's declared scope.
- Link probe: **33 unique links, 0 dead.** Five remain unreachable from this machine (sandbox DNS and connect timeouts) and are reported as unverified rather than broken.

## [0.4.0] - 2026-10-07

### Added

Three records, taking the catalog from 19 to 22 and giving China four entries, the joint-most with broader Europe:

- **JJ/WBGSP** — Joint Japan/World Bank Graduate Scholarship Program. Open to developing-country nationals, with infrastructure management named as one of its key development areas. Study is at 44 participating master's programmes across 24 universities in the U.S., Europe, Africa, Oceania and Japan.
- **Tongji University scholarships for international students** — Chinese Government Scholarship streams (Bilateral, Silk Road, High Level Postgraduate), the Shanghai Municipal Government Scholarship, and university-specific awards.
- **HIT International Students Scholarship** — Harbin Institute of Technology; a tuition-fee waiver only, awarded in tiers of 100%, 50%, 30% or 20%, with no living stipend.

### Changed

- `country` now accepts **"Multiple countries"**, used by JJ/WBGSP because its participating programmes span five continents. Labelling it "United States" would have implied study in the US, which the programme does not guarantee.

### Notes

- **Hubert H. Humphrey Fellowship excluded:** it is explicitly a *non-degree* programme, and the `degree_level` enum covers only Bachelor/Master/PhD/PostDoc. Adding it needs a schema change, not a data change.
- **CAS-TWAS President's Fellowship excluded:** the official UCAS page still displays the **2017** call (age limit "on 31 December 2017", deadline "31 MARCH 2017"). A nine-year-stale page is not a valid `source_url`.
- USA coverage grows more slowly than China or Europe because most US graduate funding is restricted to US citizens or permanent residents. JJ/WBGSP is one of the few routes that sends developing-country nationals to US universities.

## [0.3.0] - 2026-10-07

### Added

Five records, taking the catalog from 14 to 19 and adding Sweden, which had no coverage despite being named in the Phase 1 scope:

- **RESCO** — Erasmus Mundus Joint Master in Renewable Energy and Sustainable Construction (Hungary, Spain, Portugal, France).
- **TERRA** — European Master in Earthen Architecture and Construction (Portugal, Spain, France, Italy); first edition in the 2026/2027 academic year.
- **BIOPHAM** — Erasmus Mundus Joint Master in Bio & Pharmaceutical Materials Science.
- **TFMASA** — International Master in Transfers-Fluids-Materials for Aeronautics Sustainable Applications (France, Belgium, Germany).
- **SI Scholarship for Global Professionals** — Swedish Institute; fully funded, restricted to 34 listed countries.

Each carries a `source_url` and a `last_verified` date, plus `deadline_notes` where the cycle has no single closing date.

### Changed

- Card chips now distinguish a verified closing date from "Dates in detail", so a record with window or field-split dates is visible without implying one deadline.
- Added the Sweden flag to the destination icons.

### Notes

- One candidate was deliberately **excluded**: Erasmus Mundus STEPS (Sustainable Transportation and Electric Power Systems) describes itself as "a highly specialized education in Electrical Engineering". Adding it would have meant mislabelling it as Civil Engineering or Materials Science, which the data rules forbid.

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
