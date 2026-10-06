# Changelog

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
